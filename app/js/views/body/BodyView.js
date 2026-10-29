/**
 * Vista «Cuerpo»: el robot es la interfaz.
 *
 * El Go2 (o el G1) se dibuja en grande y cada dato vive donde ocurre: la
 * temperatura en la articulación, el apoyo en el pie, la batería en el cuerpo,
 * la inclinación en el dibujo mismo y el rumbo en el anillo. Los cuatro
 * paneles de la consigna siguen ahí, con su título:
 *
 *   Motores           → tarjetas sobre el dibujo + tabla completa a la derecha
 *   Inclinación (IMU) → roll/pitch/yaw bajo el robot + histórico en la línea de tiempo
 *   Batería (BMS)     → el cuerpo se llena + panel con corriente, temperatura y celdas
 *   Patas             → pies que se rellenan + estado en cada grupo + diagrama de apoyos
 *
 * El dibujo puede cambiarse por el modelo 3D real de Unitree («Esquema | 3D
 * real», tecla G): FigureSwitch lo monta en la misma caja, encima del esquema.
 *
 * Esta clase solo orquesta: cada zona es un módulo de esta carpeta con su
 * propio `build` (una vez por robot) y `update` (cada muestra, sin crear DOM).
 */
import { h, setText, cssVar } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { RobotFigure, TILT_GAIN } from "./robotFigure.js";
import { Callouts } from "./callouts.js";
import { MotorTable } from "./motorTable.js";
import { DetailPanel } from "./detailPanel.js";
import { BatteryPanel } from "./batteryPanel.js";
import { Timeline, WINDOW_MS } from "./timeline.js";
import { describe, yawRate } from "./sentence.js";
import { cardinal, wrap360, degrees } from "./format.js";
import { LEG_LABELS } from "../../core/telemetryModel.js";
import { FigureSwitch, figureToggle } from "../../ui/FigureSwitch.js";

/** Muestras que se leen del historial para la línea de tiempo (≈ 60 s a 10 Hz; se recorta a 30 s). */
const HISTORY_READ = 600;
/** Tiempo que hay que mantener el obturador para empezar a grabar (celular). */
const HOLD_TO_RECORD_MS = 500;

export default class BodyView {
  static id = "body";
  static shortcuts = [
    ["← →", "Articulación anterior / siguiente"],
    ["O", "Ordenar la tabla por temperatura / por grupo"],
  ];

  /** @param {object} ctx contexto del gestor de vistas (ver views/README.md) */
  constructor(ctx) {
    this.ctx = ctx;
    this.selected = null;
    this.userPicked = false;
    this.cleanup = [];
  }

  /* ------------------------------------------------------------------ */
  /* Ciclo de vida                                                       */
  /* ------------------------------------------------------------------ */

  mount(container) {
    this.root = container;
    const select = (name) => this.select(name, { fromUser: true });

    this.figure = new RobotFigure({ onSelect: select });
    this.callouts = new Callouts({
      figure: this.figure,
      onSelect: select,
      // La barra de torque se llena al 100 % un poco por encima del umbral de alarma.
      torqueScale: () => Math.max(10, (this.ctx.state.torqueAlarm ?? 18) * 1.25),
    });
    this.table = new MotorTable({ onSelect: select });
    this.detail = new DetailPanel();
    this.battery = new BatteryPanel();

    container.append(
      this.#buildStatus(),
      this.#buildStage(),
      h("aside", { class: "bd-side", "aria-label": "Detalle, motores y batería" }, this.detail.el, this.table.el, this.battery.el),
      this.#buildTimeline(),
      this.#buildShutterBar(),
      (this.flash = h("div", { class: "bd-flash", "aria-hidden": "true" })),
    );

    // Movimiento reducido: sin inclinación exagerada ni ondas.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reducedMotion = mq.matches;
    const onMotion = (e) => { this.reducedMotion = e.matches; this.#updateImuNote(); };
    mq.addEventListener("change", onMotion);
    this.cleanup.push(() => mq.removeEventListener("change", onMotion));

    // Las capturas (de esta vista, del teclado o de otra vista) se reflejan acá.
    this.captureCount = this.ctx.captures.size;
    this.cleanup.push(this.ctx.captures.subscribe((store) => this.#onCaptures(store)));
    this.#renderCount(false);
    this.#syncExcel();

    // El layout (no cada muestra) decide dónde van las líneas de las tarjetas.
    this.resizeObs = new ResizeObserver(() => this.#relayout());
    this.resizeObs.observe(this.stage);
    this.resizeObs.observe(this.canvas);
    document.fonts?.ready.then(() => this.root && this.#relayout());

    // Esquema | 3D real: el 3D va en la caja del dibujo y oculta el esquema (no las tarjetas).
    this.figToggle = figureToggle(this.ctx);
    this.figToggle.classList.add("bd-figtoggle");
    this.figure.el.append(this.figToggle);
    this.figureMode = this.ctx.state.figure ?? "esquema";
    this.#buildFigureSwitch("arriba");

    this.palette = this.#readPalette();
    this.#updateImuNote();
  }

  /**
   * Crea el FigureSwitch con la cámara que coincide con el esquema: desde
   * arriba para el Go2, de frente para el G1. Como el preset se fija al
   * crearlo, se recrea solo si cambia el tipo de robot.
   */
  #buildFigureSwitch(preset) {
    if (this.fig && this.figPreset === preset) return;
    this.fig?.destroy();
    this.figPreset = preset;
    this.fig = new FigureSwitch(this.ctx, { host: this.figure.el, schematic: this.figure.tilt, preset });
    if (this.info) this.fig.setInfo(this.info);
    this.fig.setMode(this.figureMode);
  }

  setInfo(info) {
    this.info = info;
    this.figure.build(info);
    this.#buildFigureSwitch(this.figure.kind === "humanoid" ? "frente" : "arriba");
    this.fig.setInfo(info);
    this.callouts.build(info, this.figure.kind);
    this.table.build(info);
    this.#buildLegChips(info);
    this.index = new Map((info.motores_nombres ?? []).map((n, i) => [n, i]));
    if (!this.index.has(this.selected)) {
      this.selected = null;
      this.userPicked = false;
    }
    this.select(this.selected ?? info.motores_nombres?.[0] ?? null);
    this.stage.dataset.kind = this.figure.kind;
    requestAnimationFrame(() => this.root && this.#relayout());
  }

  update(frame) {
    if (!this.info) return;
    this.latest = frame;
    // Al llegar la primera muestra se elige el motor más caliente: es el que interesa mirar.
    if (!this.userPicked && frame.derived.tempMax && !this.autoPicked) {
      this.autoPicked = true;
      this.select(frame.derived.tempMax.motor);
    }
    const history = this.ctx.history.tail(HISTORY_READ);

    this.figure.update(frame, { reducedMotion: this.reducedMotion });
    this.fig.update(frame);
    this.callouts.update(frame);
    this.table.update(frame);
    this.detail.update(frame, history, this.palette);
    this.battery.update(frame);
    this.#updateImu(frame);
    this.#updateLegChips(frame);
    this.#updateSentence(frame, history);
    this.#drawTimeline(history, frame);
  }

  destroy() {
    this.resizeObs?.disconnect();
    this.fig?.destroy();
    this.fig = null;
    clearTimeout(this.holdTimer);
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.root = null;
  }

  /* ------------------------------------------------------------------ */
  /* Hooks opcionales                                                    */
  /* ------------------------------------------------------------------ */

  onConnection(conn) {
    // Sin enlace: lo último que llegó queda a la vista, pero desaturado, para no confundirlo con datos vivos.
    const stale = conn.state !== "live" && conn.state !== "connecting";
    this.root?.classList.toggle("is-stale", stale && Boolean(this.latest));
    this.connState = conn.state;
    if (this.latest) this.#updateSentence(this.latest);
    else this.#waitingSentence(conn.state);
  }

  onPause(paused) {
    this.pauseBtn.setAttribute("aria-pressed", String(paused));
    this.pauseBtn.querySelector(".bd-btn__icon").innerHTML = icon(paused ? "play" : "pause", { size: 16 });
    setText(this.pauseBtn.querySelector(".bd-btn__label"), paused ? "Seguir" : "Pausar");
    this.chipPaused.hidden = !paused;
    this.fig?.setPaused(paused);
  }

  /** Esquema | 3D real (preferencia global; también se llama al montar). */
  onFigureMode(mode) {
    this.figureMode = mode;
    this.fig?.setMode(mode);
    this.figToggle.set(mode);
    // En 3D las líneas guía ya no apuntan a las articulaciones: se ocultan y quedan las tarjetas.
    this.stage.dataset.figure = mode;
    this.#updateImuNote();
  }

  onRecording(on) {
    for (const b of [this.recBtn, this.recBtnPhone]) b.setAttribute("aria-pressed", String(on));
    setText(this.recBtnPhone.querySelector("span"), on ? "Detener" : "Grabar");
    this.shutter.classList.toggle("is-recording", on);
    this.shutter.setAttribute("aria-label", on ? "Detener la grabación" : "Capturar muestra (mantené apretado para grabar)");
    this.chipRec.hidden = !on;
  }

  onTheme() {
    this.palette = this.#readPalette();
    this.fig?.applyTheme();
    if (this.latest) {
      const history = this.ctx.history.tail(HISTORY_READ);
      this.detail.update(this.latest, history, this.palette);
      this.#drawTimeline(history, this.latest);
    }
  }

  onKey(e) {
    const names = this.info?.motores_nombres ?? [];
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && names.length) {
      // Si el foco está en un control que usa las flechas, no las robamos.
      if (e.target.closest?.("input, select, [role=slider]")) return false;
      const i = names.indexOf(this.selected);
      const next = names[(i + (e.key === "ArrowRight" ? 1 : -1) + names.length) % names.length];
      this.select(next, { fromUser: true, reveal: true });
      return true;
    }
    if (e.key === "o" || e.key === "O") {
      this.table.toggleSort();
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Selección de articulación                                           */
  /* ------------------------------------------------------------------ */

  /** Elegir un motor desde el dibujo, una tarjeta, la tabla o el teclado. */
  select(name, { fromUser = false, reveal = false } = {}) {
    if (fromUser) this.userPicked = true;
    this.selected = name;
    this.figure.setSelected(name);
    this.callouts.setSelected(name);
    this.table.setSelected(name);
    this.detail.select(name, this.index?.get(name) ?? -1);
    if (reveal || fromUser) this.table.reveal(name);
    if (this.latest && name) this.detail.update(this.latest, this.ctx.history.tail(HISTORY_READ), this.palette);
  }

  /* ------------------------------------------------------------------ */
  /* Construcción del DOM (una sola vez)                                 */
  /* ------------------------------------------------------------------ */

  /** Frase de estado: cuatro tramos fijos que `update` reescribe. */
  #buildStatus() {
    this.sAction = h("b", {}, "Conectando con el robot…");
    this.sContacts = h("span", {});
    this.sHeat = h("span", { class: "bd-status__heat" });
    this.sBattery = h("span", {});
    this.chipRec = h("span", { class: "bd-chip bd-chip--rec", hidden: true }, h("i", { "aria-hidden": "true" }), "Grabando");
    this.chipPaused = h("span", { class: "bd-chip", hidden: true }, "En pausa");
    return h(
      "header",
      { class: "bd-status", "aria-label": "Resumen del estado del robot" },
      h("p", { class: "bd-status__text" }, this.sAction, this.sContacts, this.sHeat, this.sBattery),
      this.chipRec,
      this.chipPaused,
    );
  }

  #buildStage() {
    this.imuRoll = h("b", { class: "bd-num" }, "—");
    this.imuPitch = h("b", { class: "bd-num" }, "—");
    this.imuYaw = h("b", { class: "bd-num" }, "—");
    this.imuDir = h("small", { class: "bd-imu__dir" }, "");
    this.imuNote = h("span", { class: "bd-imu__note" }, "");
    const item = (k, v, title, extra) => h("div", { title }, h("dt", {}, k), h("dd", {}, v, extra));
    const imu = h(
      "section",
      { class: "bd-imu", "aria-labelledby": "bd-imu-title" },
      h("h2", { class: "bd-eyebrow", id: "bd-imu-title", html: `${icon("tilt", { size: 14 })}<span>Inclinación (IMU)</span>` }),
      h("dl", {},
        item("Roll", this.imuRoll, "Alabeo: positivo = baja el lado derecho"),
        item("Pitch", this.imuPitch, "Cabeceo: positivo = baja la nariz"),
        item("Yaw", this.imuYaw, "Guiñada: positivo = giró a la izquierda. El anillo gira con este valor", this.imuDir)),
      this.imuNote,
    );
    this.legChips = h("ul", { class: "bd-legchips", "aria-label": "Contacto de patas" });
    this.stage = h(
      "section",
      { class: "bd-stage", "aria-label": "El robot: motores, patas, batería e inclinación" },
      ...this.callouts.nodes,
      this.figure.el,
      imu,
      this.legChips,
    );
    return this.stage;
  }

  /** Chips de contacto (FR, FL, RR, RL): en el celular no hay tarjetas, pero las patas se nombran igual. */
  #buildLegChips(info) {
    this.legChipEls = new Map();
    this.legChips.replaceChildren(...(info.patas ?? []).map((leg) => {
      const state = h("span", { class: "sr-only" }, "");
      const el = h("li", { class: "bd-legchip", title: LEG_LABELS[leg] ?? leg }, h("i", { "aria-hidden": "true" }), leg.endsWith("_foot") ? `Pie ${leg[0] === "R" ? "der." : "izq."}` : leg, state);
      this.legChipEls.set(leg, { el, state, down: null });
      return el;
    }));
  }

  #buildTimeline() {
    const btn = (cls, iconName, label, key, onclick, { children = [], ...attrs } = {}) => h(
      "button",
      { type: "button", class: `bd-btn ${cls}`, onclick, ...attrs },
      h("span", { class: "bd-btn__icon", html: iconName ? icon(iconName, { size: 16 }) : "" }),
      h("span", { class: "bd-btn__label" }, label),
      ...children,
      key ? h("kbd", { "aria-hidden": "true" }, key) : null,
    );
    const { actions } = this.ctx;
    this.count = h("span", { class: "bd-count bd-num", "aria-label": "muestras capturadas" }, "0");
    this.pauseBtn = btn("bd-btn--pause", "pause", "Pausar", "Espacio", () => actions.togglePause(), { "aria-pressed": "false", title: "Congelar la vista (los datos se siguen recibiendo)" });
    this.recBtn = btn("bd-btn--rec bd-desk", null, "Grabar", "R", () => actions.toggleRecording(), { "aria-pressed": "false", title: "Grabar cada muestra que llega" });
    this.recBtn.querySelector(".bd-btn__icon").append(h("i", { class: "bd-recdot" }));
    const capBtn = btn("bd-btn--primary bd-desk", "camera", "Capturar", "C", () => actions.capture(), { title: "Guardar la muestra actual", children: [this.count] });
    const expBtn = btn("bd-desk", "download", "Exportar CSV", "E", () => actions.exportCsv({ excel: this.ctx.state.excel }), { title: "Descargar las muestras capturadas" });
    this.excelBtn = h("button", {
      type: "button", class: "bd-toggle", "aria-pressed": "false",
      title: "Formato Excel en castellano: separador «;» y coma decimal",
      onclick: () => { actions.setExcel(!this.ctx.state.excel); this.#syncExcel(); },
    }, h("i", { "aria-hidden": "true" }), "Excel");

    this.canvas = h("canvas", { class: "bd-timeline__canvas", role: "img" });
    this.timeline = new Timeline(this.canvas);
    this.tlSub = h("span", { class: "bd-sub" }, "últimos 30 s");
    return h(
      "section",
      { class: "bd-timeline", "aria-labelledby": "bd-tl-title" },
      h("header", { class: "bd-timeline__head" },
        h("div", { class: "bd-timeline__title" }, h("h2", { class: "bd-eyebrow", id: "bd-tl-title" }, "Línea de tiempo"), this.tlSub),
        h("span", { class: "bd-spacer" }),
        h("div", { class: "bd-actions", role: "group", "aria-label": "Captura y exportación" }, this.pauseBtn, this.recBtn, capBtn, expBtn, this.excelBtn)),
      this.canvas,
    );
  }

  /** Barra del celular: obturador grande bajo el pulgar (tocar = capturar, mantener = grabar). */
  #buildShutterBar() {
    const { actions } = this.ctx;
    this.countPhone = h("span", { class: "bd-count bd-num" }, "0");
    const csv = h("button", { type: "button", class: "bd-shutterbar__side", onclick: () => actions.exportCsv({ excel: this.ctx.state.excel }), html: icon("download", { size: 22 }) },
      h("span", {}, "CSV ", this.countPhone));
    this.recBtnPhone = h("button", { type: "button", class: "bd-shutterbar__side", "aria-pressed": "false", onclick: () => actions.toggleRecording(), html: icon("record", { size: 22 }) },
      h("span", {}, "Grabar"));
    this.shutter = h("button", { type: "button", class: "bd-shutter", "aria-label": "Capturar muestra (mantené apretado para grabar)" }, h("i", { "aria-hidden": "true" }));

    // Tocar captura; mantener medio segundo empieza a grabar; tocar mientras graba la detiene.
    this.shutter.addEventListener("pointerdown", () => {
      clearTimeout(this.holdTimer);
      this.held = false;
      if (this.ctx.state.recording) return;
      this.holdTimer = setTimeout(() => { this.held = true; actions.toggleRecording(true); }, HOLD_TO_RECORD_MS);
    });
    const cancel = () => clearTimeout(this.holdTimer);
    this.shutter.addEventListener("pointerleave", cancel);
    this.shutter.addEventListener("pointercancel", cancel);
    this.shutter.addEventListener("click", () => {
      clearTimeout(this.holdTimer);
      if (this.held) { this.held = false; return; }
      if (this.ctx.state.recording) actions.toggleRecording(false);
      else actions.capture();
    });
    return h("nav", { class: "bd-shutterbar", "aria-label": "Captura" }, csv, this.shutter, this.recBtnPhone);
  }

  /* ------------------------------------------------------------------ */
  /* Actualización por muestra                                           */
  /* ------------------------------------------------------------------ */

  #updateImu(frame) {
    const { roll, pitch, yaw } = frame.imu;
    setText(this.imuRoll, degrees(roll));
    setText(this.imuPitch, degrees(pitch));
    setText(this.imuYaw, degrees(yaw));
    // yaw > 0 es giro a la izquierda: el rumbo de brújula (horario) es −yaw.
    setText(this.imuDir, cardinal(wrap360(-yaw)));
  }

  #updateImuNote() {
    if (this.figureMode === "3d") return setText(this.imuNote, "Modelo 3D real · arrastrá para girar");
    const where = this.figure?.kind === "humanoid" ? "Vista de frente" : "Vista desde arriba";
    setText(this.imuNote, this.reducedMotion ? `${where} · sin inclinación (movimiento reducido)` : `${where} · inclinación ×${TILT_GAIN}`);
  }

  #updateLegChips(frame) {
    for (const [leg, c] of this.legChipEls ?? []) {
      const down = frame.fuerzas[leg] === 1;
      if (down === c.down) continue;
      c.down = down;
      c.el.dataset.down = String(down);
      setText(c.state, down ? ": apoyada" : ": en el aire");
    }
  }

  #updateSentence(frame, history = this.ctx.history.tail(12)) {
    const stale = this.connState && this.connState !== "live" && this.connState !== "connecting";
    if (stale) {
      setText(this.sAction, "Sin conexión con el robot");
      setText(this.sContacts, " · lo que ves quedó congelado");
      setText(this.sHeat, " · reintentando…");
      setText(this.sBattery, "");
      this.sHeat.dataset.level = "ok";
      return;
    }
    const d = describe(frame, yawRate(history.slice(-12)));
    setText(this.sAction, d.action);
    setText(this.sContacts, `, ${d.contacts}`);
    setText(this.sHeat, d.heat ? ` · ${d.heat}` : "");
    setText(this.sBattery, ` · ${d.battery}`);
    this.sHeat.dataset.level = d.heatLevel;
  }

  #waitingSentence(state) {
    setText(this.sAction, state === "offline" ? "Sin conexión con el servidor" : "Conectando con el robot…");
    for (const el of [this.sContacts, this.sHeat, this.sBattery]) setText(el, "");
  }

  #drawTimeline(history, frame) {
    this.timeline.draw({
      frames: history,
      captures: this.ctx.captures.samples,
      now: frame.receivedAt,
      legs: this.info?.patas ?? Object.keys(frame.fuerzas),
      palette: this.palette,
    });
    setText(this.tlSub, `últimos ${WINDOW_MS / 1000} s · ${this.timeline.count} muestras`);
  }

  /* ------------------------------------------------------------------ */
  /* Capturas y exportación                                              */
  /* ------------------------------------------------------------------ */

  #onCaptures(store) {
    const grew = store.size > this.captureCount;
    const last = store.samples.at(-1);
    this.captureCount = store.size;
    this.#renderCount(grew);
    // Destello de obturador solo en las capturas manuales (en la grabación sería un parpadeo constante).
    if (grew && last?.tipo === "manual") {
      if (!this.reducedMotion) this.flash.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 350, easing: "ease-out" });
      if (this.latest) this.#drawTimeline(this.ctx.history.tail(HISTORY_READ), this.latest);
    }
    this.#describeCanvas();
  }

  #renderCount(bump) {
    const n = String(this.captureCount);
    for (const el of [this.count, this.countPhone]) {
      setText(el, n);
      if (bump && !this.reducedMotion && !this.ctx.state.recording) {
        el.animate([{ transform: "scale(1)" }, { transform: "scale(1.4)" }, { transform: "scale(1)" }], { duration: 350 });
      }
    }
    this.#describeCanvas();
  }

  #syncExcel() {
    this.excelBtn.setAttribute("aria-pressed", String(Boolean(this.ctx.state.excel)));
  }

  /** Texto alternativo del canvas: qué muestra y cuántas capturas tiene. */
  #describeCanvas() {
    const manual = this.ctx.captures.samples.filter((s) => s.tipo === "manual").length;
    this.canvas.setAttribute("aria-label",
      `Línea de tiempo de los últimos ${WINDOW_MS / 1000} segundos: roll y pitch en grados, yaw en grados, ` +
      `apoyo de cada pata y temperatura del motor más caliente. ${this.captureCount} muestras capturadas` +
      (manual ? `, ${manual} marcadas como alfileres numerados.` : "."));
  }

  /* ------------------------------------------------------------------ */
  /* Layout y tema                                                       */
  /* ------------------------------------------------------------------ */

  #relayout() {
    this.figure.resize(this.figure.el.clientWidth);
    this.callouts.measure(this.stage);
    this.#updateImuNote();
    if (this.latest) this.#drawTimeline(this.ctx.history.tail(HISTORY_READ), this.latest);
  }

  /** Colores del tema resueltos una vez (leer estilos 10 veces por segundo es caro). */
  #readPalette() {
    const v = (name) => cssVar(name, this.root);
    return {
      ink: v("--ink"), ink2: v("--ink-2"), muted: v("--ink-3"),
      rule: v("--rule"), rule2: v("--rule-2"), track: v("--track"),
      s1: v("--series-roll"), s2: v("--series-pitch"),
      ok: v("--sem-ok"), warn: v("--sem-warn"), crit: v("--sem-crit"),
      accent: v("--accent"), onAccent: v("--on-accent"),
      sans: v("--bd-font") || "sans-serif", mono: v("--bd-mono") || "monospace",
    };
  }
}
