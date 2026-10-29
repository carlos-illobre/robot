/**
 * Vista 4 · Gemelo 3D.
 *
 * El robot en 3D, armado con el modelo oficial de Unitree (el mismo que abre
 * el simulador MuJoCo de la cátedra) y movido por los ángulos REALES de sus
 * motores que llegan por telemetría. Funciona igual con el demo, el
 * simulador y el robot real, porque solo usa el contrato de la API.
 *
 * Esta clase es solo el "tablero" alrededor del robot (HUD, panel de
 * motores, barra de cámara y de datos). El robot 3D en sí es el componente
 * reutilizable `RobotScene`, que se carga a demanda (three.js pesa ~700 kB):
 * así el HUD aparece al instante y, si no hay WebGL, igual se actualiza.
 */
import { h, setText, fmt, clamp } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { tempLevel, jointLabel, motorGroup, LEG_LABELS } from "../../core/telemetryModel.js";

const PRESETS = [
  ["perspectiva", "Perspectiva"],
  ["arriba", "Arriba"],
  ["lateral", "Lateral"],
  ["frente", "Frente"],
];

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

/** Preferencias de esta vista por navegador (si no hay almacenamiento, simplemente no se recuerdan). */
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
      /* sin almacenamiento */
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
    this.frame = null;
    this.r3d = null; // RobotScene
    this.follow = storage.get("follow", true);
    this.showJoints = storage.get("joints", true);
    this.panelOpen = storage.get("panel", window.matchMedia?.("(min-width: 900px)").matches ?? true);
    this.presetIndex = 0;
    this.motorChips = [];
    this._cleanups = [];
    this._alive = true;
  }

  /* ================================================================ */
  /* Ciclo de vida                                                     */
  /* ================================================================ */

  mount(container) {
    this.el = h("section", { class: "tw", "aria-label": "Gemelo 3D del robot" });
    this.stage = h("div", { class: "tw-stage" });
    this.el.append(this.stage, this.#buildHud(), this.#buildStatus(), this.#buildPanel(), this.#buildDock());
    container.append(this.el);

    const unsub = this.ctx.captures.subscribe?.(() => this.#paintCaptures());
    if (typeof unsub === "function") this._cleanups.push(unsub);
    this.#paintCaptures();
    this.#syncToggles();
    this.onPause(this.ctx.state.paused);
    this.onConnection(this.ctx.state.connection);
    this.#createScene();
  }

  setInfo(info) {
    this.info = info;
    this.#buildMotorList();
    setText(this.hudName, info.nombre ?? info.modelo);
    this.#buildFeetPips();
    this.r3d?.setInfo(info);
  }

  update(frame) {
    if (!this.info || frame.modelo !== this.info.modelo) return;
    this.frame = frame;
    this.r3d?.update(frame);
    this.levels = frame.motores.map((m) => tempLevel(m.temperatura));
    this.#paintHud(frame);
    this.#paintMotorList(frame);
  }

  destroy() {
    this._alive = false;
    for (const fn of this._cleanups.splice(0)) fn();
    this.r3d?.destroy();
    this.r3d = null;
    this.el?.remove();
  }

  onPause(paused) {
    this.statusPaused.hidden = !paused;
    this.r3d?.setPaused(paused);
  }

  onConnection(conn) {
    this.statusConn.hidden = !conn || conn.state === "live" || conn.state === "connecting";
  }

  onRecording(on) {
    this.recBtn.setAttribute("aria-pressed", String(on));
    setText(this.recBtn.querySelector("span"), on ? "Detener" : "Grabar");
  }

  onTheme() {
    this.r3d?.applyTheme();
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "v") return this.#preset(PRESETS[(this.presetIndex + 1) % PRESETS.length][0]), true;
    if (k === "0") return this.#preset("perspectiva"), true;
    if (k === "f") return this.#toggleFollow(), true;
    if (k === "j") return this.#toggleJoints(), true;
    if (k === "m") return this.#togglePanel(), true;
    if (k === "Escape" && this.r3d?.activeMotor !== null && this.r3d) return this.r3d.pinMotor(null), true;
    return false;
  }

  /* ================================================================ */
  /* Robot 3D (componente RobotScene)                                  */
  /* ================================================================ */

  async #createScene() {
    let RobotScene;
    try {
      ({ RobotScene } = await import("./RobotScene.js"));
    } catch (err) {
      console.error(err);
      this.stage.append(h("p", { class: "tw-error" }, "No se pudo cargar el motor 3D (three.js). Los datos siguen llegando en el panel."));
      return;
    }
    if (!this._alive) return; // se cambió de vista mientras bajaba el módulo
    this.r3d = new RobotScene(this.stage, {
      interactive: true,
      labels: true,
      markers: this.showJoints,
      follow: this.follow,
      preset: PRESETS[this.presetIndex][0],
      torqueAlarm: () => this.ctx.state.torqueAlarm ?? Infinity,
      focusOffset: () => this.#focusOffset(),
      onHover: (i) => this.#highlightChip(i),
      onStatus: (s) => this.#onSceneStatus(s),
    });
    this.r3d.setPaused(this.ctx.state.paused);
    if (this.info) this.r3d.setInfo(this.info);
    if (this.frame) this.r3d.update(this.frame);
  }

  #onSceneStatus(s) {
    if (s.kind === "mapped") {
      s.motors.forEach((m, i) => this.motorChips[i]?.btn.toggleAttribute("data-unmapped", !m.joint));
      this.statusMap.hidden = s.mapping !== "indice";
    }
  }

  /**
   * Cuánto correr el centro de la imagen para que el robot quede en el área
   * que no tapan los paneles: entre el HUD (si ocupa todo el ancho, como en
   * el celular) y la barra inferior.
   */
  #focusOffset() {
    const s = this.stage.getBoundingClientRect();
    if (!s.height) return { x: 0, y: 0 };
    const hud = this.hud.getBoundingClientRect();
    const dock = this.dock.getBoundingClientRect();
    const top = hud.width > s.width * 0.6 ? hud.bottom - s.top : 0;
    const bottom = dock.top - s.top;
    return { x: 0, y: Math.round((top + bottom) / 2 - s.height / 2) };
  }

  #highlightChip(index) {
    this.motorChips.forEach((c, i) => c.btn.toggleAttribute("data-active", i === index));
  }

  /* ================================================================ */
  /* Cámara y toggles                                                  */
  /* ================================================================ */

  #preset(name) {
    this.presetIndex = Math.max(0, PRESETS.findIndex(([id]) => id === name));
    for (const b of this.presetBtns) b.setAttribute("aria-pressed", String(b.dataset.preset === name));
    this.r3d?.setPreset(name);
  }

  #toggleFollow(force) {
    this.follow = force ?? !this.follow;
    storage.set("follow", this.follow);
    this.r3d?.setFollow(this.follow);
    this.#syncToggles();
  }

  #toggleJoints(force) {
    this.showJoints = force ?? !this.showJoints;
    storage.set("joints", this.showJoints);
    this.r3d?.setMarkers(this.showJoints);
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
    for (const b of this.presetBtns ?? []) b.setAttribute("aria-pressed", String(b.dataset.preset === PRESETS[this.presetIndex][0]));
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

    this.hud = h(
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
    return this.hud;
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
      const show = () => this.r3d?.pinMotor(i);
      btn.addEventListener("focus", show);
      btn.addEventListener("mouseenter", show);
      btn.addEventListener("click", show);
      btn.addEventListener("mouseleave", () => document.activeElement !== btn && this.r3d?.pinMotor(null));
      btn.addEventListener("blur", () => this.r3d?.activeMotor === i && this.r3d.pinMotor(null));
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

    this.dock = h(
      "div",
      { class: "tw-dock" },
      h("div", { class: "tw-dock__group tw-glass", role: "toolbar", "aria-label": "Cámara" }, ...this.presetBtns, h("span", { class: "tw-sep", "aria-hidden": "true" }), resetBtn, this.followBtn, this.jointsBtn),
      h("div", { class: "tw-dock__group tw-glass", role: "toolbar", "aria-label": "Datos" }, capBtn, this.recBtn, expBtn, this.panelBtn),
    );
    return this.dock;
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
}
