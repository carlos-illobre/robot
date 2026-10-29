/**
 * Vista 4 · Gemelo 3D.
 *
 * El robot en 3D, armado con el modelo oficial de Unitree (el mismo que abre
 * el simulador MuJoCo de la cátedra) y movido por los ángulos REALES de sus
 * motores que llegan por telemetría. Funciona igual con el demo, el
 * simulador y el robot real, porque solo usa el contrato de la API.
 *
 *   update(frame) ──► guarda el "objetivo" (ángulos, IMU, patas) y refresca textos
 *   bucle propio (rAF, 60 Hz) ──► interpola hacia el objetivo y dibuja
 *
 * Así el robot se mueve suave aunque los datos lleguen a 10 Hz, y la vista
 * respeta el contrato: `update()` no dibuja, solo anota.
 */
import { h, setText, fmt, clamp } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { tempLevel, jointLabel, motorGroup, LEG_LABELS } from "../../core/telemetryModel.js";
import { profileFor, mappingMode } from "./robotProfiles.js";

const DEG = Math.PI / 180;
/** Constante de tiempo del suavizado (s): ~3 cuadros de 60 Hz, menos que el período de 100 ms. */
const SMOOTH_TAU = 0.075;
const PRESETS = [
  ["perspectiva", "Perspectiva"],
  ["arriba", "Arriba"],
  ["lateral", "Lateral"],
  ["frente", "Frente"],
];
const LEVEL_TEXT = { ok: "normal (< 40 °C)", warn: "tibio (40–60 °C)", crit: "caliente (> 60 °C)", unknown: "sin dato" };

/** Íconos propios de la vista (trazo estilo Lucide, como ui/icons.js). */
const svg = (d) =>
  `<svg class="icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  perspectiva: icon("cube", { size: 17 }),
  arriba: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="2.5"/>'),
  lateral: svg('<path d="M3 11h13l4 3v2H3z"/><path d="M6 16v3M15 16v3"/>'),
  frente: svg('<rect x="6" y="5" width="12" height="11" rx="3"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="10" r="1"/><path d="M8 16v3M16 16v3"/>'),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  follow: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  joints: svg('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
};

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`tp05:twin:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`tp05:twin:${key}`, JSON.stringify(value));
    } catch {
      /* sin almacenamiento: solo no se recuerda */
    }
  },
};

export default class TwinView {
  static id = "twin";
  static shortcuts = [
    ["V", "Cambiar vista de cámara"],
    ["0", "Restablecer cámara"],
    ["F", "Seguir al robot (on/off)"],
    ["J", "Mostrar u ocultar articulaciones"],
    ["M", "Panel de motores"],
    ["Esc", "Cerrar la etiqueta del motor"],
  ];

  constructor(ctx) {
    this.ctx = ctx;
    this.info = null;
    this.profile = null;
    this.rig = null;
    this.three = null; // { THREE, TwinScene, RobotRig } cargados a demanda
    this.scene3d = null;
    this.frame = null;
    this.follow = storage.get("follow", true);
    this.showJoints = storage.get("joints", true);
    this.panelOpen = storage.get("panel", window.matchMedia?.("(min-width: 900px)").matches ?? true);
    this.presetIndex = 0;
    this.mapping = mappingMode();
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Estado "objetivo" (último dato) y "mostrado" (interpolado)
    this.target = { q: [], roll: 0, pitch: 0, yaw: 0, fuerzas: {}, speed: 0 };
    this.shown = { q: [], roll: 0, pitch: 0, yaw: 0, speed: 0, ready: false };
    this.levels = [];
    this.hover = null;
    this.pinned = null;
    this._pointer = { x: 0, y: 0, dirty: false, inside: false };
    this._loadToken = 0;
    this._cleanups = [];
  }

  /* ================================================================ */
  /* Ciclo de vida                                                     */
  /* ================================================================ */

  mount(container) {
    this.container = container;
    this.el = h("section", { class: "tw", "aria-label": "Gemelo 3D del robot" });
    this.stage = h("div", { class: "tw-stage" });
    this.el.append(this.stage, this.#buildHud(), this.#buildStatus(), this.#buildPanel(), this.#buildDock(), this.#buildTip(), this.#buildOverlay());
    container.append(this.el);

    const unsub = this.ctx.captures.subscribe?.(() => this.#paintCaptures());
    if (typeof unsub === "function") this._cleanups.push(unsub);
    this.#paintCaptures();
    this.#syncToggles();
    this.onPause(this.ctx.state.paused);
    this.onConnection(this.ctx.state.connection);
    this.#initScene();
  }

  setInfo(info) {
    const prevModel = this.info?.modelo;
    this.info = info;
    this.#buildMotorList();
    setText(this.hudName, info.nombre ?? info.modelo);
    this.#buildFeetPips();
    if (prevModel !== info.modelo || !this.rig) this.#loadRobot();
    else this.#mapMotors();
  }

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
    t.speed = d.isMoving ? clamp(d.meanSpeed * (this.profile?.floorSpeed ?? 0.4), 0, 1.6) : 0;
    if (!this.shown.ready) this.#snapToTarget();

    this.levels = frame.motores.map((m) => tempLevel(m.temperatura));
    this.#applyLevels();
    this.#paintHud(frame);
    this.#paintMotorList(frame);
    this.#paintTip();
  }

  destroy() {
    this._loadToken++; // invalida cualquier carga en curso
    for (const fn of this._cleanups.splice(0)) fn();
    this.rig?.dispose();
    this.rig = null;
    this.scene3d?.dispose();
    this.scene3d = null;
    this.el?.remove();
  }

  onPause(paused) {
    this.paused = paused;
    this.statusPaused.hidden = !paused;
  }

  onConnection(conn) {
    this.statusConn.hidden = !conn || conn.state === "live" || conn.state === "connecting";
  }

  onRecording(on) {
    this.recBtn.setAttribute("aria-pressed", String(on));
    setText(this.recBtn.querySelector("span"), on ? "Detener" : "Grabar");
  }

  onTheme() {
    this.#applyTheme();
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "v") return this.#preset(PRESETS[(this.presetIndex + 1) % PRESETS.length][0]), true;
    if (k === "0") return this.#preset("perspectiva"), true;
    if (k === "f") return this.#toggleFollow(), true;
    if (k === "j") return this.#toggleJoints(), true;
    if (k === "m") return this.#togglePanel(), true;
    if (k === "Escape" && this.pinned) return this.#setPinned(null), true;
    return false;
  }

  /* ================================================================ */
  /* Escena 3D                                                         */
  /* ================================================================ */

  async #initScene() {
    const token = this._loadToken;
    try {
      const [{ TwinScene, webglAvailable }, { RobotRig }] = await Promise.all([import("./TwinScene.js"), import("./RobotRig.js")]);
      if (token !== this._loadToken) return;
      this.three = { RobotRig };
      if (!webglAvailable()) throw Object.assign(new Error("webgl"), { webgl: true });
      this.scene3d = new TwinScene(this.stage, { reducedMotion: this.reducedMotion });
    } catch (err) {
      if (token !== this._loadToken) return;
      console.error(err);
      this.#showFallback(err.webgl ? "webgl" : "error", err);
      return;
    }
    const canvas = this.scene3d.renderer.domElement;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.#showFallback("lost");
    });
    canvas.addEventListener("webglcontextrestored", () => (this.overlay.hidden = true));
    this.#bindPointer(canvas);
    this.scene3d.getFocusOffset = () => this.#focusOffset();
    this.scene3d.resize();
    this.#applyTheme();
    this.scene3d.onTick = (dt) => this.#tick(dt);
    this.scene3d.start();
    if (this.info) this.#loadRobot();
  }

  async #loadRobot() {
    if (!this.scene3d || !this.three || !this.info) return;
    const token = ++this._loadToken;
    this.rig?.dispose();
    this.rig = null;
    this.hover = this.pinned = null;
    this.#paintTip();
    const profile = profileFor(this.info.modelo);
    this.profile = profile;
    if (!profile) {
      this.#showOverlay("missing");
      return;
    }
    this.#showOverlay("loading", 0);
    try {
      const rig = new this.three.RobotRig(profile);
      await rig.load((p) => token === this._loadToken && this.#showOverlay("loading", p));
      if (token !== this._loadToken) return rig.dispose();
      this.rig = rig;
      this.scene3d.scene.add(rig.root);
      this.scene3d.frameRobot(profile.camera);
      this.#mapMotors();
      rig.setMarkersVisible(this.showJoints);
      rig.ground(1);
      this.shown.ready = false;
      if (this.frame) this.#snapToTarget();
      this.#preset("perspectiva", { instant: true });
      this.#hideOverlay();
    } catch (err) {
      if (token !== this._loadToken) return;
      console.error(err);
      this.#showOverlay("error", 0, err);
    }
  }

  #mapMotors() {
    if (!this.rig || !this.info) return;
    const motors = this.rig.setMotors(this.info.motores_nombres ?? [], this.mapping);
    this.jointByMotor = motors.map((m) => (m.joint ? this.rig.joints.get(m.joint) : null));
    const missing = motors.filter((m) => !m.joint).map((m) => m.nombre);
    if (missing.length) console.warn(`[Gemelo 3D] Motores sin articulación en el modelo: ${missing.join(", ")}`);
    for (const [i, chip] of (this.motorChips ?? []).entries()) chip.btn.toggleAttribute("data-unmapped", !this.jointByMotor[i]);
    this.statusMap.hidden = this.mapping !== "indice";
    this.#applyLevels();
  }

  /** Primer dato (o robot recién cargado): saltar a la pose sin animar desde cero. */
  #snapToTarget() {
    const { target: t, shown: s } = this;
    s.q = t.q.slice();
    s.roll = t.roll;
    s.pitch = t.pitch;
    s.yaw = t.yaw;
    s.speed = t.speed;
    s.ready = this.frame !== null;
  }

  /** Un cuadro (60 Hz): interpola hacia el último dato y acomoda el robot. */
  #tick(dt) {
    const rig = this.rig;
    if (!rig) return;
    const { target: t, shown: s } = this;
    const prevYaw = s.yaw;
    if (!this.paused && s.ready) {
      const k = 1 - Math.exp(-dt / SMOOTH_TAU);
      for (let i = 0; i < t.q.length; i++) s.q[i] = (s.q[i] ?? t.q[i]) + (t.q[i] - (s.q[i] ?? t.q[i])) * k;
      s.roll += (t.roll - s.roll) * k;
      s.pitch += (t.pitch - s.pitch) * k;
      s.yaw = wrapPi(s.yaw + wrapPi(t.yaw - s.yaw) * k); // por el camino corto (−180° ↔ 180°)
      s.speed += (t.speed - s.speed) * (1 - Math.exp(-dt / 0.6));

      const joints = this.jointByMotor ?? [];
      for (let i = 0; i < joints.length; i++) if (joints[i] && Number.isFinite(s.q[i])) rig.setJoint(joints[i], s.q[i]);
      rig.setAttitude(s.roll, s.pitch, s.yaw);
      rig.ground(1 - Math.exp(-dt / 0.12));
      rig.updateFeet(t.fuerzas, dt);
      if (s.speed > 0.01) {
        const d = s.speed * dt;
        this.scene3d.scrollFloor(Math.cos(s.yaw) * d, -Math.sin(s.yaw) * d);
      }
      if (this.follow) this.scene3d.orbitBy(wrapPi(s.yaw - prevYaw));
    }
    this.#pickIfNeeded();
    this.#placeTip();
  }

  /**
   * Cuánto correr el centro de la imagen para que el robot quede en el área
   * que no tapan los paneles: entre el HUD (si ocupa todo el ancho, como en
   * el celular) y la barra inferior.
   */
  #focusOffset() {
    const s = this.stage.getBoundingClientRect();
    if (!s.height) return { x: 0, y: 0 };
    const hud = this.el.querySelector(".tw-hud").getBoundingClientRect();
    const dock = this.el.querySelector(".tw-dock").getBoundingClientRect();
    const top = hud.width > s.width * 0.6 ? hud.bottom - s.top : 0;
    const bottom = dock.top - s.top;
    return { x: 0, y: Math.round((top + bottom) / 2 - s.height / 2) };
  }

  #applyTheme() {
    if (!this.scene3d || !this.el) return;
    const css = getComputedStyle(this.el);
    const v = (name) => css.getPropertyValue(name).trim();
    this.scene3d.applyTheme({
      bg: v("--tw-scene-bg") || "#0b0d12",
      floor: v("--tw-scene-floor") || "#11141a",
      minor: v("--tw-scene-grid") || "#1b2029",
      major: v("--tw-scene-grid-major") || "#2a3140",
      sky: v("--tw-scene-sky") || "#dfe9ff",
      ground: v("--tw-scene-ground") || "#1a1e26",
      light: document.documentElement.dataset.theme === "light",
    });
  }

  /* ================================================================ */
  /* Cámara                                                            */
  /* ================================================================ */

  #preset(name, { instant = false } = {}) {
    this.presetIndex = Math.max(0, PRESETS.findIndex(([id]) => id === name));
    for (const b of this.presetBtns) b.setAttribute("aria-pressed", String(b.dataset.preset === name));
    if (!this.scene3d?.cam) return;
    this.scene3d.goTo(this.scene3d.presetPose(name, this.shown.yaw), instant);
  }

  #toggleFollow(force) {
    this.follow = force ?? !this.follow;
    storage.set("follow", this.follow);
    this.#syncToggles();
  }

  #toggleJoints(force) {
    this.showJoints = force ?? !this.showJoints;
    storage.set("joints", this.showJoints);
    this.rig?.setMarkersVisible(this.showJoints);
    this.#syncToggles();
  }

  #togglePanel(force) {
    this.panelOpen = force ?? !this.panelOpen;
    storage.set("panel", this.panelOpen);
    this.#syncToggles();
  }

  #syncToggles() {
    this.followBtn?.setAttribute("aria-pressed", String(this.follow));
    this.jointsBtn?.setAttribute("aria-pressed", String(this.showJoints));
    this.panelBtn?.setAttribute("aria-expanded", String(this.panelOpen));
    if (this.panel) this.panel.dataset.open = String(this.panelOpen);
  }

  /* ================================================================ */
  /* Selección de motores (mouse, toque y teclado)                     */
  /* ================================================================ */

  #bindPointer(canvas) {
    const p = this._pointer;
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      p.x = e.clientX - r.left;
      p.y = e.clientY - r.top;
      p.w = r.width;
      p.h = r.height;
    };
    const move = (e) => {
      if (e.pointerType !== "mouse") return;
      local(e);
      p.inside = true;
      p.dirty = true;
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
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", pdown);
    canvas.addEventListener("pointerup", pup);
    this._cleanups.push(() => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointerdown", pdown);
      canvas.removeEventListener("pointerup", pup);
    });
  }

  /** El raycast se hace a lo sumo una vez por cuadro, no en cada evento del mouse. */
  #pickIfNeeded() {
    const p = this._pointer;
    if (!p.dirty || !p.inside) return;
    p.dirty = false;
    this.#setHover(this.#pickAt(p.x, p.y));
  }

  #pickAt(x, y) {
    if (!this.rig || !this.scene3d) return null;
    const { RobotRig } = this.three;
    this._raycaster ??= RobotRig.makeRaycaster();
    const el = this.scene3d.renderer.domElement;
    this._raycaster.setFromCamera({ x: (x / el.clientWidth) * 2 - 1, y: -(y / el.clientHeight) * 2 + 1 }, this.scene3d.camera);
    return this.rig.pick(this._raycaster);
  }

  #setHover(j) {
    if (j === this.hover) return;
    this.hover = j;
    this.stage.style.cursor = j ? "pointer" : "";
    this.#applyLevels();
    this.#paintTip();
  }

  #setPinned(j) {
    this.pinned = j;
    this.#applyLevels();
    this.#paintTip();
  }

  /** Joint que muestra la etiqueta: el fijado (toque/teclado) gana sobre el del mouse. */
  get #active() {
    return this.pinned ?? this.hover;
  }

  #applyLevels() {
    if (!this.rig || !this.jointByMotor) return;
    const active = this.#active;
    for (const j of this.rig.joints.values()) {
      const i = j.motor?.index;
      this.rig.setJointLevel(j, i === undefined ? "unknown" : this.levels[i] ?? "unknown", j === active);
    }
    for (const [i, chip] of (this.motorChips ?? []).entries()) {
      chip.btn.toggleAttribute("data-active", Boolean(active && this.jointByMotor[i] === active));
    }
  }

  /* ================================================================ */
  /* DOM                                                               */
  /* ================================================================ */

  #buildHud() {
    this.hudName = h("span", { class: "tw-hud__name" }, "Robot");
    this.hudMoving = h("span", { class: "tw-chip", "data-on": "false" }, "Quieto");
    const att = (key, label, hint) => {
      const value = h("b", { class: "tw-att__value" }, "—");
      const marker = h("i", { class: "tw-att__marker" });
      const cell = h(
        "div",
        { class: "tw-att__cell", title: hint },
        h("span", { class: "tw-att__label" }, label),
        value,
        key === "yaw"
          ? h("span", { class: "tw-compass", "aria-hidden": "true", html: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-opacity=".35"/><path class="tw-compass__needle" d="M12 4l3 9h-6z" fill="currentColor"/></svg>' })
          : h("span", { class: "tw-att__track", "aria-hidden": "true" }, marker),
      );
      return { cell, value, marker };
    };
    this.attRoll = att("roll", "Roll", "Alabeo: inclinación lateral de la base (imu.roll). + = hacia la derecha");
    this.attPitch = att("pitch", "Pitch", "Cabeceo: inclinación adelante/atrás (imu.pitch)");
    this.attYaw = att("yaw", "Yaw", "Guiñada: rumbo del robot (imu.yaw)");
    this.compassNeedle = this.attYaw.cell.querySelector(".tw-compass svg");

    this.hotDot = h("i", { class: "tw-dot", "data-level": "unknown" });
    this.hotName = h("span", { class: "tw-hot__name" }, "—");
    this.hotValue = h("b", { class: "tw-hot__value" }, "—");
    this.feetCount = h("b", {}, "—");
    this.feetPips = h("span", { class: "tw-feet__pips" });
    this.semCounts = { ok: h("b", {}, "0"), warn: h("b", {}, "0"), crit: h("b", {}, "0") };

    return h(
      "header",
      { class: "tw-hud tw-glass", "aria-label": "Estado del robot" },
      h("div", { class: "tw-hud__head" }, this.hudName, this.hudMoving),
      h("div", { class: "tw-att" }, this.attRoll.cell, this.attPitch.cell, this.attYaw.cell),
      h(
        "div",
        { class: "tw-hud__row", title: "Motor con la temperatura más alta (derived.tempMax)" },
        h("span", { class: "tw-hud__label" }, "Más caliente"),
        h("span", { class: "tw-hot" }, this.hotDot, this.hotName, this.hotValue),
      ),
      h(
        "div",
        { class: "tw-hud__row", title: "Patas apoyadas en el piso (fuerzas: 1 = apoyada)" },
        h("span", { class: "tw-hud__label" }, "Patas apoyadas"),
        h("span", { class: "tw-feet" }, this.feetPips, this.feetCount),
      ),
      h(
        "div",
        { class: "tw-hud__row tw-sem", title: "Motores por nivel del semáforo de temperatura" },
        h("span", { class: "tw-hud__label" }, "Semáforo"),
        h(
          "span",
          { class: "tw-sem__counts" },
          h("span", { "data-level": "ok", title: "< 40 °C" }, h("i", { class: "tw-dot", "data-level": "ok" }), this.semCounts.ok),
          h("span", { "data-level": "warn", title: "40–60 °C" }, h("i", { class: "tw-dot", "data-level": "warn" }), this.semCounts.warn),
          h("span", { "data-level": "crit", title: "> 60 °C" }, h("i", { class: "tw-dot", "data-level": "crit" }), this.semCounts.crit),
        ),
      ),
    );
  }

  #buildFeetPips() {
    const patas = this.info?.patas ?? [];
    this.feetPipEls = patas.map((p) =>
      h("span", { class: "tw-pip", "data-on": "false", title: LEG_LABELS[p] ?? p }, p.replace("_foot", "").replace(/^R$/, "Der").replace(/^L$/, "Izq")),
    );
    this.feetPips.replaceChildren(...this.feetPipEls);
  }

  #buildStatus() {
    this.statusPaused = h("span", { class: "tw-status__chip", "data-kind": "pause", hidden: true }, "Congelado · Espacio para seguir");
    this.statusConn = h("span", { class: "tw-status__chip", "data-kind": "warn", hidden: true }, "Sin datos en vivo · última pose");
    this.statusMap = h(
      "span",
      { class: "tw-status__chip", "data-kind": "info", hidden: true, title: "Los motores se asignan por posición (orden del SDK / MJCF), no por nombre. Quitá ?mapeo=indice de la URL para volver." },
      "Mapeo por índice (SDK)",
    );
    return h("div", { class: "tw-status", role: "status" }, this.statusPaused, this.statusConn, this.statusMap);
  }

  #buildPanel() {
    this.motorList = h("div", { class: "tw-panel__list" });
    this.panelCount = h("span", { class: "tw-panel__count" }, "");
    this.panel = h(
      "aside",
      { class: "tw-panel tw-glass", id: "tw-motors", "aria-label": "Motores", "data-open": "false" },
      h(
        "div",
        { class: "tw-panel__head" },
        h("h2", {}, "Motores ", this.panelCount),
        h("button", { type: "button", class: "tw-icon-btn", "aria-label": "Cerrar panel de motores", title: "Cerrar (M)", onclick: () => this.#togglePanel(false), html: icon("x", { size: 16 }) }),
      ),
      h("p", { class: "tw-panel__hint" }, "Pasá el mouse o tocá un motor para verlo en el robot."),
      this.motorList,
    );
    return this.panel;
  }

  #buildMotorList() {
    const nombres = this.info?.motores_nombres ?? [];
    setText(this.panelCount, `(${nombres.length})`);
    const groups = new Map();
    this.motorChips = nombres.map((nombre, i) => {
      const g = motorGroup(nombre);
      if (!groups.has(g.key)) groups.set(g.key, { label: g.label, items: [] });
      const dot = h("i", { class: "tw-dot", "data-level": "unknown" });
      const ang = h("span", { class: "tw-m__ang" }, "—");
      const temp = h("span", { class: "tw-m__temp" }, "—");
      const btn = h(
        "button",
        { type: "button", class: "tw-m", "aria-label": `${nombre}: ${jointLabel(nombre)}` },
        dot,
        h("span", { class: "tw-m__name" }, nombre),
        ang,
        temp,
      );
      const show = () => this.jointByMotor?.[i] && this.#setPinned(this.jointByMotor[i]);
      btn.addEventListener("focus", show);
      btn.addEventListener("mouseenter", show);
      btn.addEventListener("click", show);
      btn.addEventListener("mouseleave", () => document.activeElement !== btn && this.#setPinned(null));
      btn.addEventListener("blur", () => this.pinned === this.jointByMotor?.[i] && this.#setPinned(null));
      groups.get(g.key).items.push(btn);
      return { btn, dot, ang, temp };
    });
    this.motorList.replaceChildren(
      ...[...groups.values()].map((g) => h("div", { class: "tw-group", role: "group", "aria-label": g.label }, h("h3", {}, g.label), ...g.items)),
    );
  }

  #buildDock() {
    this.presetBtns = PRESETS.map(([id, label]) =>
      h("button", {
        type: "button",
        class: "tw-btn",
        "aria-pressed": "false",
        dataset: { preset: id },
        title: `Vista ${label.toLowerCase()} (V cambia de vista)`,
        onclick: () => this.#preset(id),
        html: `${ICONS[id]}<span>${label}</span>`,
      }),
    );
    const resetBtn = h("button", { type: "button", class: "tw-btn", title: "Restablecer cámara: vuelve a la perspectiva inicial (0)", "aria-label": "Restablecer cámara", onclick: () => this.#preset("perspectiva"), html: ICONS.reset });
    this.followBtn = h("button", { type: "button", class: "tw-btn tw-btn--toggle", "aria-pressed": "true", title: "La cámara gira con el robot (F)", onclick: () => this.#toggleFollow(), html: `${ICONS.follow}<span>Seguir</span>` });
    this.jointsBtn = h("button", { type: "button", class: "tw-btn tw-btn--toggle", "aria-pressed": "true", title: "Anillos de color en cada articulación (J)", onclick: () => this.#toggleJoints(), html: `${ICONS.joints}<span>Articulaciones</span>` });

    const { actions } = this.ctx;
    const capBtn = h("button", { type: "button", class: "tw-btn", title: "Capturar la muestra actual (C)", onclick: () => actions.capture(), html: `${icon("camera", { size: 17 })}<span>Capturar</span>` });
    this.recBtn = h("button", { type: "button", class: "tw-btn tw-btn--rec", "aria-pressed": "false", title: "Grabar todas las muestras (R)", onclick: () => actions.toggleRecording(), html: `${icon("record", { size: 17 })}<span>Grabar</span>` });
    this.capCount = h("span", { class: "tw-badge", title: "Muestras capturadas" }, "0");
    const expBtn = h("button", { type: "button", class: "tw-btn tw-btn--primary", title: "Exportar las capturas a CSV (E)", onclick: () => actions.exportCsv(), html: `${icon("download", { size: 17 })}<span>Exportar CSV</span>` });
    expBtn.append(this.capCount);
    this.panelBtn = h("button", { type: "button", class: "tw-btn tw-btn--toggle tw-btn--panel", "aria-controls": "tw-motors", "aria-expanded": "false", title: "Panel de motores (M)", onclick: () => this.#togglePanel(), html: `${icon("list", { size: 17 })}<span>Motores</span>` });

    return h(
      "div",
      { class: "tw-dock" },
      h("div", { class: "tw-dock__group tw-glass", role: "toolbar", "aria-label": "Cámara" }, ...this.presetBtns, h("span", { class: "tw-sep", "aria-hidden": "true" }), resetBtn, this.followBtn, this.jointsBtn),
      h("div", { class: "tw-dock__group tw-glass", role: "toolbar", "aria-label": "Datos" }, capBtn, this.recBtn, expBtn, this.panelBtn),
    );
  }

  #buildTip() {
    this.tipTitle = h("strong", {});
    this.tipSub = h("span", { class: "tw-tip__sub" });
    this.tipRows = h("dl", {});
    this.tip = h("div", { class: "tw-tip", role: "tooltip", hidden: true, "aria-live": "polite" }, this.tipTitle, this.tipSub, this.tipRows);
    return this.tip;
  }

  #buildOverlay() {
    this.overlayTitle = h("p", { class: "tw-overlay__title" });
    this.overlayText = h("p", { class: "tw-overlay__text" });
    this.progressFill = h("i", {});
    this.progress = h("div", { class: "tw-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0", "aria-label": "Descarga del modelo 3D" }, this.progressFill);
    this.retryBtn = h("button", { type: "button", class: "tw-btn tw-btn--primary", hidden: true, onclick: () => this.#loadRobot() }, "Reintentar");
    this.overlay = h(
      "div",
      { class: "tw-overlay", role: "status" },
      h("div", { class: "tw-overlay__card tw-glass" }, h("span", { class: "tw-overlay__icon", html: icon("cube", { size: 28 }) }), this.overlayTitle, this.progress, this.overlayText, this.retryBtn),
    );
    this.#showOverlay("boot");
    return this.overlay;
  }

  #showOverlay(kind, progress = 0, err) {
    const name = this.profile?.label ?? this.info?.nombre ?? "robot";
    this.overlay.hidden = false;
    this.overlay.dataset.kind = kind;
    this.overlay.classList.remove("is-out");
    this.progress.hidden = kind !== "loading" && kind !== "boot";
    this.retryBtn.hidden = kind !== "error";
    const pct = Math.round(progress * 100);
    this.progress.setAttribute("aria-valuenow", String(pct));
    this.progressFill.style.transform = `scaleX(${progress})`;
    const texts = {
      boot: ["Preparando el Gemelo 3D…", "Esperando los datos del robot."],
      loading: [`Cargando el modelo 3D del ${name}…`, `${pct} % · modelo oficial de Unitree, simplificado para la web`],
      error: ["No se pudo cargar el modelo 3D", err?.message ?? "Error desconocido. Probá de nuevo."],
      missing: [`No hay modelo 3D para «${this.info?.modelo}»`, "Los datos siguen llegando: usá las vistas 1 a 3."],
    };
    setText(this.overlayTitle, texts[kind][0]);
    setText(this.overlayText, texts[kind][1]);
  }

  #hideOverlay() {
    this.overlay.classList.add("is-out");
    setTimeout(() => {
      if (this.overlay.classList.contains("is-out")) this.overlay.hidden = true;
    }, this.reducedMotion ? 0 : 350);
  }

  #showFallback(kind, err) {
    this.overlay.hidden = false;
    this.overlay.dataset.kind = "error";
    this.overlay.classList.remove("is-out");
    this.progress.hidden = true;
    this.retryBtn.hidden = true;
    const msg = {
      webgl: ["Tu navegador no puede mostrar gráficos 3D", "WebGL está desactivado o no es compatible. Activá la aceleración por hardware, o usá las vistas 1 a 3: los datos siguen llegando y el panel de la izquierda se sigue actualizando."],
      lost: ["Se perdió el contexto 3D", "La placa de video reinició el dibujo. Cambiá de vista y volvé con la tecla 4."],
      error: ["No se pudo iniciar el Gemelo 3D", err?.message ?? "Error desconocido."],
    }[kind];
    setText(this.overlayTitle, msg[0]);
    setText(this.overlayText, msg[1]);
  }

  /* ================================================================ */
  /* Pintado de datos (10 Hz)                                          */
  /* ================================================================ */

  #paintHud(frame) {
    const { imu, derived: d } = frame;
    setText(this.attRoll.value, `${fmt(imu.roll, 1, { sign: true })}°`);
    setText(this.attPitch.value, `${fmt(imu.pitch, 1, { sign: true })}°`);
    setText(this.attYaw.value, `${fmt(imu.yaw, 0, { sign: true })}°`);
    // Marcador sobre una escala de ±20°: más allá ya es una inclinación peligrosa.
    this.attRoll.marker.style.transform = `translateX(${clamp(imu.roll / 20, -1, 1) * 50}cqw)`;
    this.attPitch.marker.style.transform = `translateX(${clamp(imu.pitch / 20, -1, 1) * 50}cqw)`;
    this.attRoll.cell.dataset.level = Math.abs(imu.roll) > 15 ? "crit" : Math.abs(imu.roll) > 8 ? "warn" : "ok";
    this.attPitch.cell.dataset.level = Math.abs(imu.pitch) > 15 ? "crit" : Math.abs(imu.pitch) > 8 ? "warn" : "ok";
    this.compassNeedle.style.transform = `rotate(${-imu.yaw}deg)`;

    this.hudMoving.dataset.on = String(d.isMoving);
    setText(this.hudMoving, d.isMoving ? "En marcha" : "Quieto");

    if (d.tempMax) {
      const lvl = tempLevel(d.tempMax.value);
      this.hotDot.dataset.level = lvl;
      setText(this.hotName, d.tempMax.motor);
      setText(this.hotValue, `${fmt(d.tempMax.value, 0)} °C`);
      this.hotValue.dataset.level = lvl;
    }
    setText(this.feetCount, `${d.contacts}/${d.legs}`);
    (this.info?.patas ?? []).forEach((p, i) => this.feetPipEls?.[i] && (this.feetPipEls[i].dataset.on = String(Boolean(frame.fuerzas[p]))));
    for (const k of ["ok", "warn", "crit"]) setText(this.semCounts[k], d.tempLevels[k]);
  }

  #paintMotorList(frame) {
    if (!this.motorChips) return;
    frame.motores.forEach((m, i) => {
      const chip = this.motorChips[i];
      if (!chip) return;
      chip.dot.dataset.level = this.levels[i];
      setText(chip.ang, `${fmt(m.angulo, 0, { sign: true })}°`);
      setText(chip.temp, `${fmt(m.temperatura, 0)}°C`);
    });
  }

  #paintCaptures() {
    setText(this.capCount, this.ctx.captures.size ?? 0);
  }

  /** Contenido de la etiqueta flotante del motor activo. */
  #paintTip() {
    const j = this.#active;
    if (!j || !this.frame) {
      this.tip.hidden = true;
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
      const alarm = Math.abs(m.torque) > (this.ctx.state.torqueAlarm ?? Infinity);
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
    if (this.tipRows.childElementCount !== rows.length * 2) {
      this.tipRows.replaceChildren(...rows.flatMap(() => [h("dt"), h("dd")]));
    }
    rows.forEach(([k, v, lvl], i) => {
      setText(this.tipRows.children[i * 2], k);
      const dd = this.tipRows.children[i * 2 + 1];
      setText(dd, v);
      if (lvl) dd.dataset.level = lvl;
      else delete dd.dataset.level;
    });
    this.tip.hidden = false;
  }

  /** Ubica la etiqueta junto a la articulación (proyección 3D → pantalla), cada cuadro. */
  #placeTip() {
    const j = this.#active;
    if (!j || this.tip.hidden || !this.scene3d) return;
    this._tmpV ??= this.scene3d.camera.position.clone();
    const v = j.body.getWorldPosition(this._tmpV).project(this.scene3d.camera);
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = ((v.x + 1) / 2) * W + 16;
    let y = ((1 - v.y) / 2) * H - th / 2;
    if (x + tw > W - 8) x = x - tw - 32;
    x = clamp(x, 8, Math.max(8, W - tw - 8));
    y = clamp(y, 8, Math.max(8, H - th - 8));
    this.tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }
}
