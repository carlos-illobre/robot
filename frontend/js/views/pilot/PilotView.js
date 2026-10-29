/**
 * Vista Piloto: instrumental de cabina a pantalla completa.
 *
 * No hay paneles: la pantalla entera es un horizonte artificial que se
 * inclina con el robot (×4). Arriba, la cinta de rumbo; a la izquierda, la
 * batería; a la derecha, una escala térmica con un trazo por motor; en el
 * centro, la silueta rodeada por el anillo de motores; abajo, el
 * osciloscopio de roll y pitch. La tabla completa vive detrás de la tecla M.
 *
 * Esta clase solo compone y reparte: cada instrumento es un objeto con su
 * propio DOM (instruments.js, MotorRing.js, Oscilloscope.js, MotorSheet.js)
 * y el sonido está aislado en CockpitSound.js. Ver el contrato en
 * views/README.md.
 */
import { h, setText, fmt } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { TEMP_THRESHOLDS } from "../../core/telemetryModel.js";
import { Horizon, HeadingTape, BatteryTape, ThermalScale } from "./instruments.js";
import { MotorRing } from "./MotorRing.js";
import { Oscilloscope, OSC_SAMPLES } from "./Oscilloscope.js";
import { MotorSheet } from "./MotorSheet.js";
import { CockpitSound } from "./CockpitSound.js";

/** Íconos de volumen (Lucide, ISC): no están en ui/icons.js. */
const VOLUME = {
  off: '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
  on: '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
};

/** Rótulo grande cuando no hay datos frescos: lo que se ve es viejo y tiene que notarse. */
const LINK_LABEL = { connecting: "Conectando", reconnecting: "Reconectando", stale: "Sin enlace", offline: "Sin enlace" };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default class PilotView {
  static id = "pilot";
  static shortcuts = [
    ["M", "Tabla de motores y batería"],
    ["S", "Sonido: pisada por pata y alarma sobre 60 °C"],
    ["Esc", "Cerrar la tabla"],
  ];

  constructor(ctx) {
    this.ctx = ctx;
    this.selected = null;
    this.prevContacts = {};
    this.captureCount = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Ciclo de vida                                                    */
  /* ---------------------------------------------------------------- */

  mount(container) {
    const { actions } = this.ctx;
    const select = (name) => this.#select(name);

    this.horizon = new Horizon();
    this.heading = new HeadingTape();
    this.battery = new BatteryTape();
    this.thermo = new ThermalScale();
    this.ring = new MotorRing({ onSelect: select });
    this.osc = new Oscilloscope();
    this.sound = new CockpitSound();
    this.sheet = new MotorSheet({
      onSelect: select,
      onToggle: (open) => this.tableButtons.forEach((b) => b.setAttribute("aria-expanded", String(open))),
    });

    this.status = h("p", { class: "pv-status" }, "Esperando datos…");
    this.ts = h("span", { class: "pv-ts" }, "ts —");
    this.recChip = h("span", { class: "pv-chip pv-chip--rec", hidden: true }, h("i"), "Grabando");
    this.pauseChip = h("span", { class: "pv-chip", hidden: true }, "En pausa");
    this.counts = [h("b", { class: "pv-count" }, "0"), h("b", { class: "pv-count" }, "0"), h("b", { class: "pv-count" }, "0")];

    // Botones propios. Las teclas C, R, E y Espacio son globales (main.js):
    // acá solo se muestran y se llaman las mismas acciones.
    const key = (k) => h("kbd", {}, k);
    const btn = (cls, attrs, ...children) => h("button", { type: "button", class: cls, ...attrs }, ...children);
    this.soundBtn = btn("pv-btn", { "aria-pressed": "false", title: "Sonido: pisadas y alarma (S)", onclick: () => this.#toggleSound() }, h("span", { class: "pv-btn__icon", html: VOLUME.off }), h("span", { class: "pv-desk" }, "Sonido"), key("S"));
    this.soundBtn.setAttribute("aria-label", "Sonido");
    const tableTop = btn("pv-btn", { "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": "Tabla de motores", title: "Tabla de motores y batería (M)", onclick: () => this.sheet.toggle() }, h("span", { class: "pv-btn__icon", html: icon("list") }), h("span", { class: "pv-desk" }, "Tabla"), key("M"));
    this.tableButtons = [tableTop];

    this.recButtons = [
      btn("pv-key", { "aria-pressed": "false", onclick: () => actions.toggleRecording() }, key("R"), "Grabar"),
      btn("pv-sb", { "aria-pressed": "false", onclick: () => actions.toggleRecording() }, h("span", { html: icon("record", { size: 22 }) }), "Grabar"),
    ];
    this.pauseBtn = btn("pv-key", { "aria-pressed": "false", onclick: () => actions.togglePause() }, key("Espacio"), "Pausa");

    const controls = h(
      "nav",
      { class: "pv-controls", "aria-label": "Captura y exportación" },
      btn("pv-key pv-key--main", { onclick: () => actions.capture() }, key("C"), h("span", { html: icon("camera", { size: 15 }) }), "Capturar"),
      this.recButtons[0],
      btn("pv-key pv-key--main", { onclick: () => actions.exportCsv() }, key("E"), "Exportar CSV", this.counts[1]),
      this.pauseBtn,
    );
    const phonebar = h(
      "nav",
      { class: "pv-phonebar", "aria-label": "Captura y exportación" },
      this.recButtons[1],
      btn("pv-shutter-btn", { onclick: () => actions.capture() }, h("i", { "aria-hidden": "true" }, h("b")), "Capturar"),
      btn("pv-sb", { onclick: () => actions.exportCsv() }, h("span", { html: icon("download", { size: 22 }) }), h("span", {}, "CSV ", this.counts[2])),
    );

    const hud = h(
      "div",
      { class: "pv-hud" },
      h("div", { class: "pv-corner pv-corner--l" }, this.recChip, this.pauseChip, this.ts),
      h("div", { class: "pv-corner pv-corner--r" }, h("span", { class: "pv-desk" }, "Muestras ", this.counts[0]), this.soundBtn, tableTop),
      this.heading.el,
      this.battery.el,
      this.thermo.el,
      h("div", { class: "pv-ring" }, this.ring.svg),
      this.status,
      this.osc.el,
      controls,
      phonebar,
    );

    this.linkText = h("p", { class: "pv-offline", role: "status" }, "");
    this.shutter = h("div", { class: "pv-shutter", "aria-hidden": "true" });
    this.root = h(
      "div",
      { class: "pv", "data-link": "connecting" },
      this.horizon.el,
      hud,
      h("div", { class: "pv-alarm", "aria-hidden": "true" }),
      this.shutter,
      this.linkText,
      this.sheet.dialog,
    );
    container.append(this.root);
    // Los colores del canvas salen de variables CSS: recién se pueden leer con el DOM montado.
    this.osc.readColors();

    this.captureCount = this.ctx.captures.size;
    this.#paintCounts();
    this.unsubscribe = this.ctx.captures.subscribe((store) => this.#onCaptures(store));
  }

  /** Reconstruye lo que depende de los motores y las patas (Go2 ↔ G1). */
  setInfo(info) {
    const signature = `${info?.modelo}|${info?.motores_nombres?.join()}|${info?.patas?.join()}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.info = info;
    this.prevContacts = {};
    if (this.selected && !info?.motores_nombres?.includes(this.selected)) this.selected = null;
    this.ring.build(info);
    this.thermo.build(info);
    this.sheet.build(info);
    this.#select(this.selected, { force: true });
    this.root.dataset.robot = info?.tipo ?? "";
  }

  update(frame) {
    const { state, history, captures } = this.ctx;
    this.horizon.update(frame.imu);
    this.heading.update(frame.imu.yaw);
    this.battery.update(frame.bms, frame.derived);
    this.thermo.update(frame);
    this.ring.update(frame, { torqueRef: state.torqueAlarm });
    this.osc.draw(history.tail(OSC_SAMPLES), captures.samples);
    this.sheet.update(frame);

    setText(this.ts, `ts ${fmt(frame.ts, 2)} s`);
    this.#updateStatus(frame);

    // El marco respira en rojo mientras haya una alarma crítica (motor > 60 °C o batería baja).
    const crit = state.alerts.some((a) => a.level === "crit");
    this.root.toggleAttribute("data-alarm", crit);
    this.#playSounds(frame);
  }

  destroy() {
    this.unsubscribe?.();
    this.osc?.destroy();
    this.sound?.destroy();
    if (this.sheet?.open) this.sheet.dialog.close();
    this.root?.remove();
  }

  /* ---------------------------------------------------------------- */
  /* Hooks opcionales                                                 */
  /* ---------------------------------------------------------------- */

  onKey(e) {
    const k = e.key.toLowerCase();
    if (k === "m") {
      this.sheet.toggle();
      return true;
    }
    if (k === "s") {
      this.#toggleSound();
      return true;
    }
    return false;
  }

  onConnection(conn) {
    this.root.dataset.link = conn.state;
    setText(this.linkText, LINK_LABEL[conn.state] ?? "");
  }

  onRecording(on) {
    this.recChip.hidden = !on;
    for (const b of this.recButtons) b.setAttribute("aria-pressed", String(on));
  }

  onPause(paused) {
    this.pauseChip.hidden = !paused;
    this.pauseBtn.setAttribute("aria-pressed", String(paused));
  }

  onTheme() {
    this.osc.readColors();
  }

  /* ---------------------------------------------------------------- */
  /* Internos                                                         */
  /* ---------------------------------------------------------------- */

  /** Marca un motor en el anillo, la escala y la tabla. Tocar el mismo lo desmarca. */
  #select(name, { force = false } = {}) {
    this.selected = !force && name === this.selected ? null : name;
    this.ring.setSelected(this.selected);
    this.thermo.setSelected(this.selected);
    this.sheet.setSelected(this.selected);
    if (!force && this.ctx.state.latest) this.ring.update(this.ctx.state.latest, { torqueRef: this.ctx.state.torqueAlarm });
  }

  /** Línea de estado bajo el anillo: la alarma si la hay; si no, qué está haciendo el robot. */
  #updateStatus(frame) {
    const { derived } = frame;
    const hot = derived.tempLevels.crit;
    const quad = this.info?.tipo !== "humanoide";
    let text;
    let level = "ok";
    if (hot) {
      level = "crit";
      const worst = derived.tempMax;
      const limit = `sobre ${TEMP_THRESHOLDS.crit} °C`;
      text = hot === 1 ? `${worst.motor} ${fmt(worst.value, 1)} °C · ${limit}` : `${hot} motores ${limit} · ${worst.motor} ${fmt(worst.value, 1)} °C`;
    } else if (derived.legs) {
      const what = quad ? (derived.contacts === 1 ? "pata apoyada" : "patas apoyadas") : derived.contacts === 1 ? "pie apoyado" : "pies apoyados";
      const doing = derived.isMoving ? (quad ? "Trote" : "Marcha") : "En reposo";
      const temps = derived.tempLevels.warn ? `${derived.tempLevels.warn} tibios` : "todo en rango";
      text = `${doing} · ${derived.contacts} ${what} · ${temps}`;
    } else {
      text = derived.isMoving ? "Marcha" : "En reposo";
    }
    setText(this.status, text);
    if (this.status.dataset.level !== level) this.status.dataset.level = level;
  }

  /** Pisada al pasar una pata de "en el aire" a "apoyada"; alarma mientras haya un motor > 60 °C. */
  #playSounds(frame) {
    for (const [leg, v] of Object.entries(frame.fuerzas)) {
      if (v === 1 && this.prevContacts[leg] === 0) this.sound.step(leg);
      this.prevContacts[leg] = v;
    }
    if (frame.derived.tempLevels.crit > 0) this.sound.alarm();
  }

  #toggleSound() {
    const on = this.sound.toggle();
    this.soundBtn.setAttribute("aria-pressed", String(on));
    this.soundBtn.querySelector(".pv-btn__icon").innerHTML = on ? VOLUME.on : VOLUME.off;
    toast(on ? "Sonido prendido: cada pata suena al apoyar y hay alarma doble sobre 60 °C" : "Sonido apagado", { kind: "info", timeout: 2200 });
  }

  /** Cambió el almacén de capturas: contador, y si fue una captura manual, el obturador. */
  #onCaptures(store) {
    const grew = store.size > this.captureCount;
    this.captureCount = store.size;
    this.#paintCounts();
    if (grew && store.samples.at(-1)?.tipo === "manual") {
      this.sound.shutter();
      if (!reducedMotion()) {
        this.shutter.animate([{ opacity: 1, transform: "scale(1.02)" }, { opacity: 0, transform: "scale(1)" }], { duration: 500, easing: "ease-out" });
      }
      // La marca de la captura aparece en el osciloscopio aunque la vista esté en pausa.
      this.osc.draw(this.ctx.history.tail(OSC_SAMPLES), store.samples);
    }
  }

  #paintCounts() {
    for (const el of this.counts) setText(el, String(this.captureCount));
  }
}
