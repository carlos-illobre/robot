/**
 * RobotScene · el robot 3D como COMPONENTE embebible.
 *
 * Encapsula todo lo necesario para mostrar el gemelo 3D en cualquier
 * contenedor del dashboard: escenario (Stage3D), modelo con su cinemática
 * (RobotRig), interpolación de la telemetría, selección con mouse/toque,
 * etiqueta flotante y pantalla de carga. La vista Gemelo 3D lo usa a
 * pantalla completa; otras vistas pueden usarlo chico (botón "Esquema | 3D").
 *
 *   const r3d = new RobotScene(contenedor, { interactive: true, labels: true });
 *   r3d.setInfo(info);      // al conectar o si cambia el robot
 *   r3d.update(frame);      // en cada muestra (solo anota el objetivo)
 *   r3d.destroy();          // libera GPU, rAF, listeners: inmediato
 *
 * Respeta el contrato de vistas: `update()` no dibuja; el componente tiene
 * su propio bucle (rAF, adaptativo, pausado si la pestaña está oculta) que
 * interpola a la frecuencia de la pantalla los datos que llegan a 10 Hz.
 */
import { h, s as svg, setText, fmt, clamp } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { tempLevel, jointLabel, motorGroup } from "../../core/telemetryModel.js";
import { Stage3D, probeWebGL } from "./Stage3D.js";
import { RobotRig } from "./RobotRig.js";
import { profileFor, mappingMode } from "./robotProfiles.js";

const DEG = Math.PI / 180;
/** Constante de tiempo del suavizado (s): ~5 cuadros de 60 Hz, menos que el período de 100 ms. */
const SMOOTH_TAU = 0.075;
export const PRESETS = ["perspectiva", "arriba", "lateral", "frente"];
const LEVEL_TEXT = { ok: "normal (< 40 °C)", warn: "tibio (40–60 °C)", crit: "caliente (> 60 °C)", unknown: "sin dato" };
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Calidad forzada por URL (`?calidad=alta|media|baja|mínima`), útil para capturas o PCs lentas. */
function qualityFromUrl() {
  try {
    const q = new URLSearchParams(location.search).get("calidad");
    return q === "minima" ? "mínima" : q ?? "auto";
  } catch {
    return "auto";
  }
}

export class RobotScene {
  /** ¿Se puede mostrar 3D en este navegador? (para decidir si ofrecer el botón "3D"). */
  static isSupported() {
    return probeWebGL().ok;
  }

  /**
   * @param {HTMLElement} container dónde se dibuja (el componente ocupa todo su tamaño)
   * @param {object} [opts]
   * @param {boolean} [opts.interactive=true] cámara orbitable y selección de motores con el puntero
   * @param {"theme"|"transparent"} [opts.background="theme"] fondo con piso y grilla, o transparente (solo sombra)
   * @param {boolean} [opts.labels=true] etiqueta flotante del motor bajo el puntero
   * @param {boolean} [opts.markers=true] anillos de semáforo en las articulaciones
   * @param {boolean} [opts.follow=true] la cámara gira con el rumbo del robot
   * @param {string}  [opts.preset="perspectiva"] vista de cámara inicial
   * @param {string}  [opts.quality] "auto" (por defecto) o un escalón fijo de Stage3D.QUALITY
   * @param {() => number} [opts.torqueAlarm] umbral de torque para marcar la etiqueta
   * @param {() => {x:number,y:number}} [opts.focusOffset] corre el centro de la imagen (px)
   * @param {(motorIndex: number|null) => void} [opts.onHover] cambió el motor señalado
   * @param {(s: {kind: string, progress?: number, motors?: object[], error?: Error}) => void} [opts.onStatus]
   */
  constructor(container, opts = {}) {
    this.opts = {
      interactive: true,
      background: "theme",
      labels: true,
      markers: true,
      follow: true,
      preset: "perspectiva",
      quality: qualityFromUrl(),
      torqueAlarm: () => Infinity,
      ...opts,
    };
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.mapping = mappingMode();
    this.info = null;
    this.profile = null;
    this.rig = null;
    this.stage = null;
    this.frame = null;
    this.paused = false;
    this.preset = this.opts.preset;
    this.follow = this.opts.follow;
    this.showMarkers = this.opts.markers;
    this.target = { q: [], roll: 0, pitch: 0, yaw: 0, fuerzas: {}, speed: 0 };
    this.shown = { q: [], roll: 0, pitch: 0, yaw: 0, speed: 0, ready: false };
    this.levels = [];
    this.hover = null;
    this.pinned = null;
    this.jointByMotor = [];
    this._pointer = { x: 0, y: 0, dirty: false, inside: false };
    this._token = 0;
    this._cleanups = [];
    this._lastData = 0;

    this.el = h("div", { class: "r3d", "data-bg": this.opts.background });
    this.#buildOverlay();
    if (this.opts.labels) this.#buildTip();
    container.append(this.el);
    this.#initStage();
  }

  /* ================================================================ */
  /* API pública                                                       */
  /* ================================================================ */

  setInfo(info) {
    const changed = info?.modelo !== this.info?.modelo;
    this.info = info;
    if (changed || !this.rig) this.#loadRobot();
    else this.#mapMotors();
  }

  /** Guarda el "objetivo" de la muestra; el bucle interpola hacia él. Barato: se puede llamar a 10 Hz. */
  update(frame) {
    if (!this.info || frame.modelo !== this.info.modelo) return;
    this.frame = frame;
    const t = this.target;
    const n = frame.motores.length;
    for (let i = 0; i < n; i++) t.q[i] = frame.motores[i].angulo * DEG;
    t.q.length = n;
    t.roll = frame.imu.roll * DEG;
    t.pitch = frame.imu.pitch * DEG;
    t.yaw = frame.imu.yaw * DEG;
    t.fuerzas = frame.fuerzas;
    const d = frame.derived;
    // Velocidad visual del piso: la API no trae la velocidad del robot, se estima de la marcha.
    t.speed = d?.isMoving ? clamp(d.meanSpeed * (this.profile?.floorSpeed ?? 0.4), 0, 1.6) : 0;
    if (!this.shown.ready) this.#snapToTarget();
    this._lastData = performance.now();
    this.levels = frame.motores.map((m) => tempLevel(m.temperatura));
    this.#applyLevels();
    this.#paintTip();
  }

  /** Congela el robot (la cámara se sigue pudiendo mover). */
  setPaused(paused) {
    this.paused = Boolean(paused);
  }

  /** Vuelve a leer los colores del CSS (llamar desde onTheme de la vista). */
  applyTheme() {
    if (!this.stage) return;
    const css = getComputedStyle(this.el);
    const v = (name, fb) => css.getPropertyValue(name).trim() || fb;
    this.stage.applyTheme({
      bg: v("--r3d-scene-bg", "#0b0e14"),
      floor: v("--r3d-scene-floor", "#10141b"),
      minor: v("--r3d-scene-grid", "#1a2029"),
      major: v("--r3d-scene-grid-major", "#2a3342"),
      sky: v("--r3d-scene-sky", "#dfe9ff"),
      ground: v("--r3d-scene-ground", "#1a1e26"),
      light: document.documentElement.dataset.theme === "light",
    });
  }

  /** @param {"perspectiva"|"arriba"|"lateral"|"frente"} name */
  setPreset(name, { instant = false } = {}) {
    this.preset = PRESETS.includes(name) ? name : "perspectiva";
    if (this.stage?.cam) this.stage.goTo(this.stage.presetPose(this.preset, this.shown.yaw), instant);
  }

  setFollow(on) {
    this.follow = Boolean(on);
  }

  setMarkers(on) {
    this.showMarkers = Boolean(on);
    this.rig?.setMarkersVisible(this.showMarkers);
    this.stage?.invalidate();
  }

  /** Fija la etiqueta en un motor (desde una lista, con teclado o toque). null la cierra. */
  pinMotor(index) {
    this.#setPinned(index === null || index === undefined ? null : this.jointByMotor[index] ?? null);
  }

  /** Índice del motor señalado (fijado o bajo el puntero), o null. */
  get activeMotor() {
    return this.#active?.motor?.index ?? null;
  }

  /** Recalcula el tamaño (p. ej. si cambió el layout sin cambiar el contenedor). */
  resize() {
    this.stage?.resize();
  }

  /** Calidad de dibujo actual ("alta", "media", "baja" o "mínima"). */
  get quality() {
    return this.stage?.quality ?? null;
  }

  /** Libera TODO en el acto: GPU, contexto WebGL, rAF, listeners y cargas pendientes. */
  destroy() {
    this._token++;
    for (const fn of this._cleanups.splice(0)) fn();
    this.rig?.dispose();
    this.rig = null;
    this.stage?.dispose();
    this.stage = null;
    this.portal?.remove();
    this.el.remove();
  }

  /* ================================================================ */
  /* Escenario y modelo                                                */
  /* ================================================================ */

  #initStage() {
    const probe = probeWebGL();
    if (!probe.ok) return this.#showMessage("webgl");
    try {
      this.stage = new Stage3D(this.el, {
        interactive: this.opts.interactive,
        transparent: this.opts.background === "transparent",
        reducedMotion: this.reducedMotion,
        quality: this.opts.quality,
        software: probe.software,
      });
    } catch (err) {
      console.error(err);
      return this.#showMessage("error", err);
    }
    const canvas = this.stage.renderer.domElement;
    const lost = (e) => {
      e.preventDefault();
      if (this.stage) this.#showMessage("lost");
    };
    canvas.addEventListener("webglcontextlost", lost);
    this._cleanups.push(() => canvas.removeEventListener("webglcontextlost", lost));
    if (this.opts.interactive) this.#bindPointer(canvas);
    if (this.opts.focusOffset) {
      this.stage.getFocusOffset = this.opts.focusOffset;
      this.stage.resize();
    }
    this.applyTheme();
    this.stage.onTick = (dt) => this.#tick(dt);
    this.stage.start();
  }

  async #loadRobot() {
    if (!this.stage || !this.info) return;
    const token = ++this._token;
    this.rig?.dispose();
    this.rig = null;
    this.hover = this.pinned = null;
    this.#paintTip();
    const profile = profileFor(this.info.modelo);
    this.profile = profile;
    if (!profile) return this.#showMessage("missing");
    this.#showLoading(0);
    try {
      const rig = new RobotRig(profile);
      await rig.load((p) => token === this._token && this.#showLoading(p));
      if (token !== this._token) return rig.dispose(); // se cambió de robot o se destruyó mientras bajaba
      this.rig = rig;
      this.stage.scene.add(rig.root);
      this.stage.frameRobot(profile.camera);
      this.#mapMotors();
      rig.setMarkersVisible(this.showMarkers);
      rig.ground(1);
      this.shown.ready = false;
      if (this.frame) this.#snapToTarget();
      this.setPreset(this.preset, { instant: true });
      this.#hideOverlay();
      this.opts.onStatus?.({ kind: "ready", motors: rig.motors, quality: this.stage.quality });
    } catch (err) {
      if (token !== this._token) return;
      console.error(err);
      this.#showMessage("error", err);
    }
  }

  #mapMotors() {
    if (!this.rig || !this.info) return;
    const motors = this.rig.setMotors(this.info.motores_nombres ?? [], this.mapping);
    this.jointByMotor = motors.map((m) => (m.joint ? this.rig.joints.get(m.joint) : null));
    const missing = motors.filter((m) => !m.joint).map((m) => m.nombre);
    if (missing.length) console.warn(`[Gemelo 3D] Motores sin articulación en el modelo: ${missing.join(", ")}`);
    this.#applyLevels();
    this.opts.onStatus?.({ kind: "mapped", motors, mapping: this.mapping });
  }

  /** Primer dato (o robot recién cargado): saltar a la pose sin animar desde cero. */
  #snapToTarget() {
    const { target: t, shown: s } = this;
    s.q = t.q.slice();
    Object.assign(s, { roll: t.roll, pitch: t.pitch, yaw: t.yaw, speed: t.speed, ready: this.frame !== null });
  }

  /**
   * Un cuadro: interpola hacia el último dato y acomoda el robot.
   * Devuelve true si algo se movió (si no, Stage3D no redibuja).
   */
  #tick(dt) {
    const rig = this.rig;
    if (!rig) return false;
    let moved = false;
    const { target: t, shown: s } = this;
    // Tras ~0,6 s sin datos nuevos ya convergió: no hace falta seguir dibujando.
    const settling = performance.now() - this._lastData < 600;
    if (!this.paused && s.ready && settling) {
      const prevYaw = s.yaw;
      const k = 1 - Math.exp(-dt / SMOOTH_TAU);
      for (let i = 0; i < t.q.length; i++) {
        const cur = s.q[i] ?? t.q[i];
        s.q[i] = cur + (t.q[i] - cur) * k;
      }
      s.roll += (t.roll - s.roll) * k;
      s.pitch += (t.pitch - s.pitch) * k;
      s.yaw = wrapPi(s.yaw + wrapPi(t.yaw - s.yaw) * k); // por el camino corto (−180° ↔ 180°)
      s.speed += (t.speed - s.speed) * (1 - Math.exp(-dt / 0.6));

      const joints = this.jointByMotor;
      for (let i = 0; i < joints.length; i++) if (joints[i] && Number.isFinite(s.q[i])) rig.setJoint(joints[i], s.q[i]);
      rig.setAttitude(s.roll, s.pitch, s.yaw);
      rig.ground(1 - Math.exp(-dt / 0.12));
      rig.updateFeet(t.fuerzas, dt);
      if (s.speed > 0.01) {
        const d = s.speed * dt;
        this.stage.scrollFloor(Math.cos(s.yaw) * d, -Math.sin(s.yaw) * d);
      }
      if (this.follow) this.stage.orbitBy(wrapPi(s.yaw - prevYaw));
      moved = true;
    }
    this.#pickIfNeeded();
    this.#placeTip();
    return moved;
  }

  /* ================================================================ */
  /* Selección (mouse y toque)                                         */
  /* ================================================================ */

  #bindPointer(canvas) {
    const p = this._pointer;
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      p.x = e.clientX - r.left;
      p.y = e.clientY - r.top;
    };
    const move = (e) => {
      if (e.pointerType !== "mouse") return;
      local(e);
      p.inside = p.dirty = true;
    };
    const leave = () => {
      p.inside = false;
      this.#setHover(null);
    };
    let down = null;
    const pdown = (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const pup = (e) => {
      if (!down) return;
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 450;
      down = null;
      if (!tap) return;
      local(e);
      const j = this.#pickAt(p.x, p.y);
      this.#setPinned(j && j === this.pinned ? null : j);
    };
    const evs = { pointermove: move, pointerleave: leave, pointerdown: pdown, pointerup: pup };
    for (const [ev, fn] of Object.entries(evs)) canvas.addEventListener(ev, fn);
    this._cleanups.push(() => Object.entries(evs).forEach(([ev, fn]) => canvas.removeEventListener(ev, fn)));
  }

  /** El raycast se hace a lo sumo una vez por cuadro, no en cada evento del mouse. */
  #pickIfNeeded() {
    const p = this._pointer;
    if (!p.dirty || !p.inside) return;
    p.dirty = false;
    this.#setHover(this.#pickAt(p.x, p.y));
  }

  #pickAt(x, y) {
    if (!this.rig || !this.stage) return null;
    this._raycaster ??= RobotRig.makeRaycaster();
    const el = this.stage.renderer.domElement;
    this._raycaster.setFromCamera({ x: (x / el.clientWidth) * 2 - 1, y: -(y / el.clientHeight) * 2 + 1 }, this.stage.camera);
    return this.rig.pick(this._raycaster);
  }

  #setHover(j) {
    if (j === this.hover) return;
    this.hover = j;
    this.el.style.cursor = j ? "pointer" : "";
    this.#activeChanged();
  }

  #setPinned(j) {
    if (j === this.pinned) return;
    this.pinned = j;
    this.#activeChanged();
  }

  #activeChanged() {
    this.#applyLevels();
    this.#paintTip();
    this.stage?.invalidate();
    this.opts.onHover?.(this.activeMotor);
  }

  /** Joint que muestra la etiqueta: el fijado (toque/lista) gana sobre el del mouse. */
  get #active() {
    return this.pinned ?? this.hover;
  }

  #applyLevels() {
    if (!this.rig) return;
    const active = this.#active;
    for (const j of this.rig.joints.values()) {
      const i = j.motor?.index;
      this.rig.setJointLevel(j, i === undefined ? "unknown" : this.levels[i] ?? "unknown", j === active);
    }
    this.stage?.invalidate();
  }

  /* ================================================================ */
  /* Etiqueta flotante                                                 */
  /* ================================================================ */

  #buildTip() {
    this.tipTitle = h("strong", {});
    this.tipSub = h("span", { class: "r3d-tip__sub" });
    this.tipRows = h("dl", {});
    this.tip = h("div", { class: "r3d-tip", role: "tooltip", hidden: true }, this.tipTitle, this.tipSub, this.tipRows);
    // Línea guía: une la articulación con la etiqueta, que va al costado del robot.
    this.leadLine = svg("line", { class: "r3d-lead__line" });
    this.leadDot = svg("circle", { class: "r3d-lead__dot", r: 4.5 });
    this.lead = svg("svg", { class: "r3d-lead", "aria-hidden": "true" }, this.leadLine, this.leadDot);
    this.lead.style.display = "none";
    if (this.opts.background === "transparent") {
      // Incrustado en otra vista (botón "Esquema | 3D"): el recuadro es chico, así que
      // la etiqueta va en una capa sobre toda la página para poder salir AL COSTADO del robot.
      this.portal = h("div", { class: "r3d r3d-portal", "aria-hidden": "false" }, this.lead, this.tip);
      document.body.append(this.portal);
    } else {
      this.el.append(this.lead, this.tip);
    }
  }

  /**
   * Rectángulo que ocupa el robot en pantalla (px), a partir de sus
   * articulaciones y apoyos proyectados, con un margen. Sirve para ubicar la
   * etiqueta AL COSTADO del robot y no encima.
   */
  #robotScreenBox(W, H) {
    const cam = this.stage.camera;
    const v = (this._boxV ??= cam.position.clone());
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const add = () => {
      v.project(cam);
      const x = ((v.x + 1) / 2) * W;
      const y = ((1 - v.y) / 2) * H;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    };
    for (const jt of this.rig?.joints.values() ?? []) {
      jt.body.getWorldPosition(v);
      add();
    }
    for (const c of this.rig?.allContacts ?? []) {
      v.copy(c.local).applyMatrix4(c.body.matrixWorld);
      add();
    }
    if (!Number.isFinite(minX)) return null;
    const pad = Math.max(24, (maxX - minX) * 0.12); // las piezas sobresalen de las articulaciones
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }

  #paintTip() {
    if (!this.tip) return;
    const j = this.#active;
    if (!j || !this.frame) {
      this.tip.hidden = true;
      this.lead.style.display = "none";
      return;
    }
    const rows = [];
    if (j.base) {
      const { imu } = this.frame;
      setText(this.tipTitle, "Base del robot");
      setText(this.tipSub, "sin motor · orientación de la IMU");
      rows.push(["Roll", `${fmt(imu.roll, 1, { sign: true })}°`], ["Pitch", `${fmt(imu.pitch, 1, { sign: true })}°`], ["Yaw", `${fmt(imu.yaw, 1, { sign: true })}°`]);
    } else if (!j.motor) {
      setText(this.tipTitle, j.name);
      setText(this.tipSub, "articulación sin motor en la telemetría");
    } else {
      const m = this.frame.motores[j.motor.index];
      if (!m) return;
      const lvl = tempLevel(m.temperatura);
      const alarm = Math.abs(m.torque) > this.opts.torqueAlarm();
      setText(this.tipTitle, `${motorGroup(m.nombre).label.replace(/^\w+ · /, "")} · ${jointLabel(m.nombre)}`);
      setText(this.tipSub, `${m.nombre} → ${j.name}`);
      rows.push(
        ["Temperatura", `${fmt(m.temperatura, 1)} °C · ${LEVEL_TEXT[lvl]}`, lvl],
        ["Ángulo", `${fmt(m.angulo, 1, { sign: true })}°`],
        ["Torque", `${fmt(m.torque, 2, { sign: true })} N·m${alarm ? " · sobre la alarma" : ""}`, alarm ? "crit" : null],
        ["Velocidad", `${fmt(m.velocidad, 2, { sign: true })} rad/s`],
      );
    }
    // Se reconstruye solo si cambió la cantidad de filas; si no, se actualizan los textos.
    if (this.tipRows.childElementCount !== rows.length * 2) this.tipRows.replaceChildren(...rows.flatMap(() => [h("dt"), h("dd")]));
    rows.forEach(([k, v, lvl], i) => {
      setText(this.tipRows.children[i * 2], k);
      const dd = this.tipRows.children[i * 2 + 1];
      setText(dd, v);
      if (lvl) dd.dataset.level = lvl;
      else delete dd.dataset.level;
    });
    this.tip.hidden = false;
    this.lead.dataset.level = j.motor && this.frame.motores[j.motor.index] ? tempLevel(this.frame.motores[j.motor.index].temperatura) : "base";
  }

  /**
   * Ubica la etiqueta AL COSTADO del robot (del lado de la articulación), con
   * una línea guía hasta ella. Si a los costados no entra (contenedores chicos,
   * como el centro del anillo del Piloto), va arriba o abajo del robot; y si
   * tampoco, lo más cerca posible. Se recalcula en cada cuadro.
   */
  #placeTip() {
    const j = this.#active;
    if (!j || !this.tip || this.tip.hidden || !this.stage) return;
    this._tmpV ??= this.stage.camera.position.clone();
    const v = j.body.getWorldPosition(this._tmpV).project(this.stage.camera);
    let W = this.el.clientWidth;
    let H = this.el.clientHeight;
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    // Coordenadas del componente → coordenadas de la capa de la etiqueta (la ventana
    // entera si está incrustado; el propio componente en el Gemelo 3D).
    const r = this.portal ? this.el.getBoundingClientRect() : { left: 0, top: 0 };
    const ox = r.left;
    const oy = r.top;
    const jx = ((v.x + 1) / 2) * W + ox;
    const jy = ((1 - v.y) / 2) * H + oy;
    const b0 = this.#robotScreenBox(W, H);
    const box = b0 ? { minX: b0.minX + ox, maxX: b0.maxX + ox, minY: b0.minY + oy, maxY: b0.maxY + oy } : { minX: jx, maxX: jx, minY: jy, maxY: jy };
    if (this.portal) {
      W = window.innerWidth;
      H = window.innerHeight;
    }
    const M = 8;  // margen con el borde
    const G = 28; // separación entre el robot y la etiqueta
    const midX = (box.minX + box.maxX) / 2;

    const fitsRight = box.maxX + G + tw <= W - M;
    const fitsLeft = box.minX - G - tw >= M;
    const preferRight = jx >= midX;
    let x, y, side;
    if ((preferRight && fitsRight) || (!fitsLeft && fitsRight)) {
      side = "right"; x = box.maxX + G;
    } else if (fitsLeft) {
      side = "left"; x = box.minX - G - tw;
    } else if (box.minY - G - th >= M) {
      side = "top"; y = box.minY - G - th;
    } else if (box.maxY + G + th <= H - M) {
      side = "bottom"; y = box.maxY + G;
    } else {
      side = jx >= W / 2 ? "left" : "right"; // no entra en ningún lado: lo mejor posible
      x = side === "right" ? jx + G : jx - G - tw;
    }
    if (side === "left" || side === "right") y = jy - th / 2;
    else x = jx - tw / 2;
    x = clamp(x, M, Math.max(M, W - tw - M));
    y = clamp(y, M, Math.max(M, H - th - M));
    this.tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;

    // Punto de la etiqueta donde llega la línea: el borde que mira al robot.
    const ex = side === "right" ? x : side === "left" ? x + tw : clamp(jx, x + 12, x + tw - 12);
    const ey = side === "top" ? y + th : side === "bottom" ? y : clamp(jy, y + 14, y + th - 14);
    this.lead.style.display = "";
    this.lead.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.leadLine.setAttribute("x1", jx.toFixed(1));
    this.leadLine.setAttribute("y1", jy.toFixed(1));
    this.leadLine.setAttribute("x2", ex.toFixed(1));
    this.leadLine.setAttribute("y2", ey.toFixed(1));
    this.leadDot.setAttribute("cx", jx.toFixed(1));
    this.leadDot.setAttribute("cy", jy.toFixed(1));
  }

  /* ================================================================ */
  /* Carga y mensajes                                                  */
  /* ================================================================ */

  #buildOverlay() {
    this.ovTitle = h("p", { class: "r3d-overlay__title" });
    this.ovText = h("p", { class: "r3d-overlay__text" });
    this.ovFill = h("i", {});
    this.ovBar = h("div", { class: "r3d-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0", "aria-label": "Descarga del modelo 3D" }, this.ovFill);
    this.ovRetry = h("button", { type: "button", class: "r3d-btn", hidden: true, onclick: () => this.#loadRobot() }, "Reintentar");
    this.overlay = h(
      "div",
      { class: "r3d-overlay", role: "status", "data-kind": "boot" },
      h("div", { class: "r3d-overlay__card" }, h("span", { class: "r3d-overlay__icon", html: icon("cube", { size: 28 }) }), this.ovTitle, this.ovBar, this.ovText, this.ovRetry),
    );
    setText(this.ovTitle, "Preparando el robot 3D…");
    setText(this.ovText, "Esperando los datos del robot.");
    this.el.append(this.overlay);
  }

  #showLoading(progress) {
    const pct = Math.round(progress * 100);
    this.overlay.hidden = false;
    this.overlay.dataset.kind = "loading";
    this.overlay.classList.remove("is-out");
    this.ovBar.hidden = false;
    this.ovRetry.hidden = true;
    this.ovBar.setAttribute("aria-valuenow", String(pct));
    this.ovFill.style.transform = `scaleX(${progress})`;
    setText(this.ovTitle, `Cargando el modelo 3D del ${this.profile?.label ?? "robot"}…`);
    setText(this.ovText, `${pct} % · modelo oficial de Unitree, simplificado para la web`);
    this.opts.onStatus?.({ kind: "loading", progress });
  }

  #hideOverlay() {
    this.overlay.classList.add("is-out");
    const t = setTimeout(() => this.overlay.classList.contains("is-out") && (this.overlay.hidden = true), this.reducedMotion ? 0 : 350);
    this._cleanups.push(() => clearTimeout(t));
  }

  #showMessage(kind, err) {
    const msg = {
      webgl: ["Este navegador no puede mostrar gráficos 3D", "WebGL está desactivado o no es compatible. Activá la aceleración por hardware del navegador. Los datos siguen llegando: las otras vistas funcionan igual."],
      lost: ["Se perdió el contexto 3D", "La placa de video reinició el dibujo. Cambiá de vista y volvé."],
      missing: [`No hay modelo 3D para «${this.info?.modelo}»`, "Los datos siguen llegando: usá las otras vistas."],
      error: ["No se pudo cargar el modelo 3D", err?.message ?? "Error desconocido. Probá de nuevo."],
    }[kind];
    this.overlay.hidden = false;
    this.overlay.dataset.kind = "error";
    this.overlay.classList.remove("is-out");
    this.ovBar.hidden = true;
    this.ovRetry.hidden = kind !== "error";
    setText(this.ovTitle, msg[0]);
    setText(this.ovText, msg[1]);
    this.opts.onStatus?.({ kind, error: err });
  }
}
