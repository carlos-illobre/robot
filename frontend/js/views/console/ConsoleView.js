/**
 * Vista "Consola": los cuatro paneles de la consigna, densos y ordenados,
 * como una consola de monitoreo (Grafana, Linear).
 *
 *   ┌ franja de estado / alarma ─────────────────── Pausar · Grabar · Capturar · CSV ┐
 *   │ Motores (tabla agrupada por pata)  │ Inclinación (horizonte + gráfico)         │
 *   │                                    ├─────────────────────┬─────────────────────┤
 *   │ gráfico de los motores elegidos    │ Batería             │ Patas               │
 *   └ endpoint · ts · capturas ───────────────────────────────────────────── atajos ┘
 *
 * Esta clase solo orquesta: cada panel vive en su módulo y sigue la misma
 * regla que la vista (DOM armado una vez, `update` solo cambia textos,
 * atributos y `transform`). Las acciones (capturar, grabar, exportar,
 * pausar) se piden a `ctx.actions`: la vista no sabe cómo se hacen.
 */
import { h, setText, fmt, clock } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { TEMP_THRESHOLDS } from "../../core/telemetryModel.js";
import { ApiClient } from "../../services/ApiClient.js";
import { MotorTable } from "./MotorTable.js";
import { MotorChart, MAX_SELECTED } from "./MotorChart.js";
import { ImuPanel } from "./ImuPanel.js";
import { BatteryPanel } from "./BatteryPanel.js";
import { FeetPanel, spatialOrder } from "./FeetPanel.js";
import { setAttr, reducedMotion } from "./util.js";

/** Motores que se grafican al entrar (si existen en el robot conectado). */
const DEFAULT_PICKS = {
  go2: ["RL_calf", "FR_calf", "FL_thigh"],
  g1: ["L_knee", "R_knee", "L_hip_pitch"],
};

/** Velocidad de giro (°/s) a partir de la cual se dice que el robot está doblando. */
const TURN_RATE = 8;

/** Estados de conexión en los que lo que se ve ya no es dato vivo. */
const STALE_STATES = new Set(["reconnecting", "stale", "offline"]);

const MODEL_NAME = { go2: "Go2", g1: "G1" };

/** Chevron chico para el menú de exportación (no está en ui/icons.js). */
const CHEVRON = '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

const FOOTER_KEYS = [
  ["C", "capturar"], ["R", "grabar"], ["E", "exportar"], ["Espacio", "pausar"],
  ["W", "transporte"], ["S", "ordenar"], ["T", "tema"], ["?", "ayuda"],
];

export default class ConsoleView {
  static id = "console";
  static shortcuts = [
    ["S", "Ordenar los motores por pata o por temperatura"],
    ["Clic en una fila", "Sumar o quitar ese motor del gráfico (hasta 3)"],
  ];

  #unsubscribe = [];
  #lastCaptures = 0;

  constructor(ctx) {
    this.ctx = ctx;
    this.info = null;
    this.selected = [];
    this.lastFrame = null;
  }

  /* ------------------------------------------------------------------ */
  /* Ciclo de vida                                                       */
  /* ------------------------------------------------------------------ */

  mount(container) {
    this.root = container;
    this.table = new MotorTable({ onToggle: (nombre) => this.#toggleMotor(nombre) });
    this.motorChart = new MotorChart({ root: container, onMetric: (m) => this.#setMetric(m) });
    this.imu = new ImuPanel({ root: container });
    this.battery = new BatteryPanel();
    this.feet = new FeetPanel();

    this.grid = h(
      "div",
      { class: "cv-grid" },
      this.#buildMotorsPanel(),
      this.imu.el,
      h("div", { class: "cv-right2" }, this.battery.el, this.feet.el),
    );
    this.flash = h("div", { class: "cv-flash", "aria-hidden": "true" });
    container.append(this.#buildBar(), this.grid, this.#buildFooter(), this.flash);

    // Chart.js mide el canvas al crearse: recién ahora que está en el documento.
    this.motorChart.init();
    this.imu.init();

    this.#unsubscribe.push(this.ctx.captures.subscribe((store) => this.#onCaptures(store)));
    this.#onCaptures(this.ctx.captures);
    this.#setEndpoint(this.ctx.state.connection);
  }

  setInfo(info) {
    this.info = info;
    this.table.build(info);
    this.feet.build(info);
    const names = info.motores_nombres ?? [];
    setText(this.motorsSub, `${info.n_motores ?? names.length} · ${MODEL_NAME[info.modelo] ?? info.nombre ?? info.modelo}`);
    const picks = (DEFAULT_PICKS[info.modelo] ?? []).filter((n) => names.includes(n));
    this.#setSelection(picks.length ? picks : names.slice(0, MAX_SELECTED));
    this.table.setSort(this.table.sort, this.lastFrame?.modelo === info.modelo ? this.lastFrame : null);
  }

  update(frame) {
    this.lastFrame = frame;
    const { history, state } = this.ctx;
    this.table.update(frame, state.torqueAlarm);
    this.motorChart.update(history, state.torqueAlarm);
    this.imu.update(frame, history);
    this.battery.update(frame);
    this.feet.update(frame, history);
    this.#renderGait(frame);
    this.#renderStrip(frame);
    setText(this.tsEl, `ts ${fmt(frame.ts, 2)} s`);
  }

  destroy() {
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
    document.removeEventListener("pointerdown", this.#onOutsideClick);
    this.motorChart?.destroy();
    this.imu?.destroy();
  }

  onConnection(conn) {
    setAttr(this.root, "data-stale", STALE_STATES.has(conn.state) && Boolean(this.lastFrame));
    this.#setEndpoint(conn);
    if (this.lastFrame) this.#renderStrip(this.lastFrame);
    else this.#setStrip("lost", conn.state === "connecting" ? "Conectando con el servidor…" : "Sin conexión", ` — ${conn.detail || "esperando datos"}`);
  }

  onPause(paused) {
    setAttr(this.root, "data-paused", paused);
    setAttr(this.pauseBtn, "aria-pressed", paused);
    this.pauseBtn.querySelector(".cv-btn__icon").innerHTML = icon(paused ? "play" : "pause", { size: 16 });
    setText(this.pauseLabel, paused ? "Seguir" : "Pausar");
    this.#renderFooterState();
  }

  onRecording(recording) {
    setAttr(this.recBtn, "aria-pressed", recording);
    setText(this.recLabel, recording ? "Detener" : "Grabar");
    this.#renderFooterState();
  }

  onKey(e) {
    if (e.key === "Escape" && !this.menu.hidden) {
      this.#closeMenu();
      return true;
    }
    if (e.key.toLowerCase() === "s") {
      this.#setSort(this.table.sort === "body" ? "heat" : "body");
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Construcción                                                        */
  /* ------------------------------------------------------------------ */

  /** Franja de estado (izquierda) y botones de acción (derecha; en el celular, abajo). */
  #buildBar() {
    const { actions } = this.ctx;

    this.gaitCells = [0, 1, 2, 3].map(() => h("i", { "data-on": "false" }));
    this.gaitLabel = h("b", {}, "—");
    this.gaitSub = h("span", { class: "cv-hide-phone" }, "");
    const gait = h(
      "div",
      { class: "cv-gait", title: "Deducido de las velocidades de los motores y del giro de la IMU" },
      h("span", { class: "cv-gait__icon", "aria-hidden": "true" }, ...this.gaitCells),
      this.gaitLabel,
      this.gaitSub,
    );

    this.stripStrong = h("b", {}, "");
    this.stripRest = h("span", {}, "");
    this.stripGo = h("button", { type: "button", class: "cv-link", hidden: true, onclick: () => this.table.reveal(this.stripTarget) }, "Ver en la tabla");
    this.strip = h(
      "div",
      { class: "cv-strip", "data-kind": "ok" },
      h("span", { class: "cv-strip__icon", "aria-hidden": "true", html: icon("activity", { size: 16, cls: "is-ok" }) + icon("alert", { size: 16, cls: "is-alarm" }) + icon("plug", { size: 16, cls: "is-lost" }) }),
      // El enlace va fuera del texto: si el mensaje no entra, se recorta el texto y no el enlace.
      h("p", { class: "cv-strip__text" }, this.stripStrong, this.stripRest),
      this.stripGo,
    );

    const btn = (cls, iconName, label, kbd, onclick, extra = {}) => {
      const labelEl = h("span", { class: "cv-btn__label" }, label);
      const el = h(
        "button",
        { type: "button", class: `cv-btn ${cls}`, onclick, ...extra },
        h("span", { class: "cv-btn__icon", html: icon(iconName, { size: 16 }) }),
        labelEl,
        kbd ? h("kbd", { class: "cv-hide-phone" }, kbd) : null,
      );
      return { el, labelEl };
    };

    const pause = btn("cv-btn--pause", "pause", "Pausar", null, () => actions.togglePause(), { "aria-pressed": "false", title: "Pausar o seguir la vista (Espacio). Los datos se siguen recibiendo." });
    this.pauseBtn = pause.el;
    this.pauseLabel = pause.labelEl;

    const rec = btn("cv-btn--rec", "record", "Grabar", "R", () => actions.toggleRecording(), { "aria-pressed": "false", title: "Grabar todas las muestras que llegan (R)" });
    this.recBtn = rec.el;
    this.recLabel = rec.labelEl;

    this.countEl = h("span", { class: "cv-count num", "aria-label": "muestras capturadas" }, "0");
    const capture = btn("cv-btn--primary", "camera", "Capturar", "C", () => actions.capture(), { title: "Guardar la muestra actual (C)" });
    capture.el.insertBefore(this.countEl, capture.el.querySelector("kbd"));

    const exportBtn = btn("cv-btn--export", "download", "CSV", "E", () => actions.exportCsv(), { title: "Descargar todas las capturas en CSV (E)" });
    exportBtn.labelEl.prepend(h("span", { class: "cv-hide-phone" }, "Exportar "));

    this.menuBtn = h("button", { type: "button", class: "cv-btn cv-btn--menu", "aria-haspopup": "true", "aria-expanded": "false", "aria-label": "Opciones de exportación", html: CHEVRON, onclick: () => this.#toggleMenu() });
    this.excelBox = h("input", { type: "checkbox", checked: this.ctx.state.excel, onchange: (e) => actions.setExcel(e.target.checked) });
    this.clearBtn = h("button", { type: "button", class: "cv-menu__item", onclick: () => { actions.clearCaptures(); this.#toggleMenu(false); } });
    this.menu = h(
      "div",
      {
        class: "cv-menu", hidden: true, role: "group", "aria-label": "Opciones de exportación",
        // main.js ignora las teclas que se escriben en un <input>: el Escape de la casilla se atiende acá.
        onkeydown: (e) => { if (e.key === "Escape") { e.preventDefault(); this.#closeMenu(); } },
      },
      h("label", { class: "cv-menu__check" }, this.excelBox, h("span", {}, h("b", {}, "Formato Excel"), h("small", {}, "separador ; y coma decimal"))),
      h("button", { type: "button", class: "cv-menu__item", onclick: () => { actions.exportJson(); this.#toggleMenu(false); }, html: `${icon("braces", { size: 15 })}<span>Exportar JSON</span>` }),
      this.clearBtn,
    );
    document.addEventListener("pointerdown", this.#onOutsideClick);

    const actionsEl = h(
      "div",
      { class: "cv-actions", role: "toolbar", "aria-label": "Captura y exportación" },
      this.pauseBtn,
      this.recBtn,
      capture.el,
      h("div", { class: "cv-split" }, exportBtn.el, this.menuBtn, this.menu),
    );
    return h("div", { class: "cv-bar" }, gait, this.strip, actionsEl);
  }

  #buildMotorsPanel() {
    const { state, actions } = this.ctx;
    this.motorsSub = h("span", { class: "cv-sub" }, "");
    this.sortButtons = [["body", "Por pata"], ["heat", "Por calor"]].map(([mode, label]) =>
      h("button", { type: "button", role: "radio", "aria-checked": String(mode === "body"), dataset: { sort: mode }, onclick: () => this.#setSort(mode) }, label),
    );
    const legendItem = (level, text) => h("span", {}, h("i", { class: "cv-sw", "data-level": level, "aria-hidden": "true" }), text);
    this.alarmInput = h("input", {
      type: "number", class: "cv-input num", id: "cv-torque-alarm", min: "1", max: "100", step: "0.5", value: String(state.torqueAlarm),
      "aria-describedby": "cv-torque-hint",
      onchange: (e) => {
        const nm = Number.parseFloat(e.target.value);
        if (Number.isFinite(nm) && nm > 0) actions.setTorqueAlarm(nm);
        e.target.value = String(this.ctx.state.torqueAlarm);
        if (this.lastFrame) this.update(this.lastFrame);
      },
    });

    return h(
      "section",
      { class: "cv-panel cv-motors", "aria-labelledby": "cv-motors-title" },
      h(
        "header",
        { class: "cv-ph" },
        h("span", { class: "cv-ph__icon", html: icon("cpu", { size: 16 }) }),
        h("h2", { id: "cv-motors-title" }, "Motores"),
        this.motorsSub,
        h("div", { class: "cv-seg", role: "radiogroup", "aria-label": "Orden de la tabla (tecla S)" }, ...this.sortButtons),
      ),
      h(
        "div",
        { class: "cv-tools" },
        h("div", { class: "cv-legend", "aria-label": "Semáforo de temperatura" }, legendItem("ok", "< 40"), legendItem("warn", "40–60"), legendItem("crit", "> 60 °C")),
        h(
          "label",
          { class: "cv-alarm", for: "cv-torque-alarm" },
          h("span", { class: "cv-alarm__icon", html: icon("bolt", { size: 14 }) }),
          h("span", { id: "cv-torque-hint" }, "Alarma de torque >"),
          this.alarmInput,
          h("span", {}, "N·m"),
        ),
      ),
      this.table.el,
      this.motorChart.el,
    );
  }

  #buildFooter() {
    this.endpointEl = h("span", { class: "num cv-endpoint" }, "");
    this.tsEl = h("span", { class: "num" }, "ts —");
    this.captureInfo = h("span", {}, "Sin muestras capturadas");
    this.stateInfo = h("span", { class: "cv-footer__state" }, "");
    return h(
      "footer",
      { class: "cv-footer" },
      this.endpointEl,
      this.tsEl,
      this.captureInfo,
      this.stateInfo,
      h("div", { class: "cv-footer__keys", "aria-label": "Atajos de teclado" }, ...FOOTER_KEYS.map(([k, t]) => h("span", {}, h("kbd", {}, k), t))),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Interacción                                                         */
  /* ------------------------------------------------------------------ */

  /** Tocar una fila suma su motor al gráfico; con 3 elegidos, sale el más viejo. */
  #toggleMotor(nombre) {
    const next = this.selected.filter((n) => n !== nombre);
    if (next.length === this.selected.length) {
      next.push(nombre);
      if (next.length > MAX_SELECTED) next.shift();
    }
    this.#setSelection(next);
  }

  #setSelection(names) {
    this.selected = names;
    this.table.setSelection(names);
    this.motorChart.setSelection(names);
    this.motorChart.update(this.ctx.history, this.ctx.state.torqueAlarm);
  }

  #setMetric(metric) {
    this.motorChart.setMetric(metric);
    this.motorChart.update(this.ctx.history, this.ctx.state.torqueAlarm);
  }

  #setSort(mode) {
    for (const b of this.sortButtons) b.setAttribute("aria-checked", String(b.dataset.sort === mode));
    this.table.setSort(mode, this.lastFrame);
  }

  #toggleMenu(force) {
    const open = force ?? this.menu.hidden;
    this.menu.hidden = !open;
    this.menuBtn.setAttribute("aria-expanded", String(open));
    if (open) this.excelBox.checked = this.ctx.state.excel;
  }

  /** Cierra el menú y devuelve el foco a su botón, para que los atajos vuelvan a andar. */
  #closeMenu() {
    this.#toggleMenu(false);
    this.menuBtn.focus();
  }

  /** Cierra el menú de exportación al tocar afuera (función flecha: se registra y se quita tal cual). */
  #onOutsideClick = (e) => {
    if (!this.menu.hidden && !this.menu.contains(e.target) && !this.menuBtn.contains(e.target)) this.#toggleMenu(false);
  };

  /** Contador, barra inferior y, si fue una captura manual, el destello de "foto". */
  #onCaptures(store) {
    const n = store.size;
    setText(this.countEl, String(n));
    setText(this.clearBtn, n ? `Borrar las ${n} capturas` : "No hay capturas para borrar");
    this.clearBtn.disabled = n === 0;
    const last = store.samples.at(-1);
    setText(
      this.captureInfo,
      n ? `${n} ${n === 1 ? "muestra capturada" : "muestras capturadas"} · última ${clock(last.capturedAt).slice(0, 8)} (ts ${fmt(last.frame.ts, 2)} s)` : "Sin muestras capturadas",
    );
    if (n > this.#lastCaptures && last?.tipo === "manual" && !reducedMotion()) {
      this.flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "ease-out" });
      this.countEl.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 350, easing: "ease-out" });
    }
    this.#lastCaptures = n;
  }

  /* ------------------------------------------------------------------ */
  /* Pintado                                                             */
  /* ------------------------------------------------------------------ */

  /** «Caminando · girando a la izquierda» y el ícono de marcha que late con las patas. */
  #renderGait(frame) {
    const legs = spatialOrder(this.info?.patas ?? Object.keys(frame.fuerzas));
    this.gaitCells.forEach((cell, i) => setAttr(cell, "data-on", frame.fuerzas[legs[i]] === 1));
    setAttr(this.gaitCells[0].parentElement, "data-legs", legs.length);

    let sub = "en reposo";
    if (frame.derived.isMoving) {
      const rate = this.#yawRate();
      sub = Math.abs(rate) < TURN_RATE ? "en línea recta" : rate > 0 ? "doblando a la izquierda" : "doblando a la derecha";
    }
    setText(this.gaitLabel, frame.derived.isMoving ? "Caminando" : "Quieto");
    setText(this.gaitSub, sub);
  }

  /** Velocidad de giro en °/s del último segundo, a partir del yaw del historial. */
  #yawRate() {
    const samples = this.ctx.history.tail(11);
    if (samples.length < 2) return 0;
    const a = samples[0];
    const b = samples.at(-1);
    const dt = b.ts - a.ts;
    if (dt <= 0) return 0;
    const dyaw = ((b.imu.yaw - a.imu.yaw + 540) % 360) - 180; // diferencia angular en (−180, 180]
    return dyaw / dt;
  }

  /**
   * Franja superior: en calma resume el estado; con una alarma se tiñe y
   * ofrece ir a la fila del motor; sin conexión avisa que los datos son viejos.
   */
  #renderStrip(frame) {
    const { state } = this.ctx;
    if (STALE_STATES.has(state.connection.state)) {
      this.#setStrip("lost", "Conexión perdida", " — los datos que ves están congelados. Reintentando…");
      return;
    }

    const hot = frame.motores.filter((m) => m.temperatura > TEMP_THRESHOLDS.crit).sort((a, b) => b.temperatura - a.temperatura);
    const over = frame.motores.filter((m) => Math.abs(m.torque) > state.torqueAlarm).sort((a, b) => Math.abs(b.torque) - Math.abs(a.torque));
    const lowBattery = state.alerts.some((a) => a.key === "soc");
    const extra = (n) => (n > 0 ? ` · y ${n} ${n === 1 ? "alarma más" : "alarmas más"}` : "");

    if (hot.length) {
      const names = hot.slice(0, 2).map((m) => `${m.nombre} a ${fmt(m.temperatura, 1)} °C`).join(" · ");
      this.#setStrip("hot", names, ` — supera ${TEMP_THRESHOLDS.crit} °C. Conviene frenar el robot para que enfríe${extra(Math.max(0, hot.length - 2) + over.length + Number(lowBattery))}.`, hot[0].nombre);
    } else if (lowBattery) {
      this.#setStrip("hot", `Batería baja: ${fmt(frame.bms.soc, 0)} %`, ` — conviene cargarla pronto${extra(over.length)}.`);
    } else if (over.length) {
      const m = over[0];
      this.#setStrip("warn", `Torque de ${m.nombre}: ${fmt(Math.abs(m.torque), 1)} N·m`, ` — supera el umbral de ${fmt(state.torqueAlarm, 1)} N·m${extra(over.length - 1)}.`, m.nombre);
    } else {
      const t = frame.derived.tempMax;
      this.#setStrip("ok", "Todo en rango", t ? ` · el motor más caliente es ${t.motor} a ${fmt(t.value, 1)} °C · batería ${fmt(frame.bms.soc, 0)} %` : "");
    }
  }

  #setStrip(kind, strong, rest, target = null) {
    setAttr(this.strip, "data-kind", kind);
    setText(this.stripStrong, strong);
    setText(this.stripRest, rest);
    this.stripTarget = target;
    this.stripGo.hidden = !target;
  }

  /** Barra inferior: qué endpoint se está usando, para que se vea si es WebSocket o polling. */
  #setEndpoint(conn) {
    const { state } = this.ctx;
    let text = state.baseUrl;
    try {
      text = (conn.transport ?? state.transport) === "polling"
        ? `GET ${ApiClient.normalizeBaseUrl(state.baseUrl)}/telemetria · cada ${state.intervalMs} ms`
        : ApiClient.toWebSocketUrl(state.baseUrl);
    } catch { /* dirección inválida: se muestra tal cual */ }
    setText(this.endpointEl, text);
  }

  #renderFooterState() {
    const { paused, recording } = this.ctx.state;
    setText(this.stateInfo, [recording && "● Grabando", paused && "En pausa"].filter(Boolean).join(" · "));
    setAttr(this.stateInfo, "data-rec", Boolean(recording));
  }
}
