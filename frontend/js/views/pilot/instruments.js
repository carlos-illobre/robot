/**
 * Instrumentos de la cabina hechos con DOM: horizonte artificial, cinta de
 * rumbo, cinta de batería y escala térmica.
 *
 * Cada uno crea sus elementos una sola vez y en `update` solo cambia
 * `transform`, atributos o textos: a 10 Hz con 29 motores no se crea nada.
 * Los movimientos se suavizan con transiciones CSS de 200 ms sobre
 * `transform`, que las resuelve la GPU sin recalcular el diseño.
 */
import { h, setText, fmt, clamp } from "../../ui/dom.js";
import { tempLevel, socLevel, TEMP_THRESHOLDS } from "../../core/telemetryModel.js";
import { wrap360, heading, milliamps, currentSense } from "./format.js";

/** Exageración del horizonte: 1–2° de balanceo real se vuelven visibles. Está rotulada. */
export const HORIZON_GAIN = 4;
/** Píxeles por grado REAL de cabeceo (6 px × la exageración), como en la maqueta. */
const PITCH_PX = 6 * HORIZON_GAIN;

/* ------------------------------------------------------------------ */
/* Horizonte artificial                                                */
/* ------------------------------------------------------------------ */

export class Horizon {
  constructor() {
    const rungs = [-10, -5, 5, 10].map((p) =>
      h(
        "div",
        { class: "pv-ladder", "data-major": Math.abs(p) === 10 ? "" : null, style: { top: `calc(50% - ${p * PITCH_PX}px)` } },
        h("span", { class: "pv-ladder__l" }, h("b", {}, String(Math.abs(p)))),
        h("span", { class: "pv-ladder__r" }, h("b", {}, String(Math.abs(p)))),
      ),
    );
    this.plane = h("div", { class: "pv-horizon__plane" }, h("div", { class: "pv-horizon__line" }), ...rungs);
    this.el = h("div", { class: "pv-horizon", "aria-hidden": "true" }, this.plane);
  }

  /** El cielo y la tierra giran con el roll y se desplazan con el pitch (×4). */
  update({ roll, pitch }) {
    const r = (-roll * HORIZON_GAIN).toFixed(2);
    const y = (pitch * PITCH_PX).toFixed(1);
    this.plane.style.transform = `rotate(${r}deg) translateY(${y}px)`;
  }
}

/* ------------------------------------------------------------------ */
/* Cinta de rumbo (yaw)                                                */
/* ------------------------------------------------------------------ */

const CARDINAL = { 0: "N", 90: "E", 180: "S", 270: "O" };

export class HeadingTape {
  constructor() {
    // La cinta cubre de −180° a 540°: alrededor de cualquier rumbo hay siempre ±180° dibujados.
    const ticks = [];
    for (let a = -180; a <= 540; a += 5) {
      const n = wrap360(a);
      const major = n % 30 === 0;
      const label = major ? h("span", { class: "pv-heading__label", "data-cardinal": n in CARDINAL ? "" : null }, CARDINAL[n] ?? String(n)) : null;
      ticks.push(h("i", { class: "pv-heading__tick", "data-major": major ? "" : null, style: { left: `calc(${a} * var(--ppd))` } }, label));
    }
    this.strip = h("div", { class: "pv-heading__strip" }, ...ticks);
    this.value = h("output", { class: "pv-heading__value" }, "—");
    this.el = h(
      "section",
      { class: "pv-heading", "aria-label": "Rumbo (yaw)" },
      h("div", { class: "pv-heading__tape", "aria-hidden": "true" }, this.strip),
      h("div", { class: "pv-heading__readout" }, h("span", { class: "pv-label" }, "Rumbo · yaw"), this.value),
    );
    this.pos = null;
  }

  update(yaw) {
    const pos = wrap360(yaw);
    // Al pasar por 0°/360° la cinta "salta" una vuelta: ese cuadro va sin transición
    // para que no se vea barrer 360° de golpe.
    const jump = this.pos !== null && Math.abs(pos - this.pos) > 180;
    this.strip.toggleAttribute("data-jump", jump);
    this.strip.style.transform = `translateX(calc(${(-pos).toFixed(2)} * var(--ppd)))`;
    this.pos = pos;
    setText(this.value, heading(yaw));
  }
}

/* ------------------------------------------------------------------ */
/* Cinta de batería (BMS)                                              */
/* ------------------------------------------------------------------ */

/** Rango de tensión de celda que llena la mini-barra (Li-ion: vacía ~3.3 V, llena 4.2 V). */
const CELL_MIN_V = 3.3;
const CELL_MAX_V = 4.2;
/** Desbalance (mV) a partir del cual se resalta la celda más baja. */
const CELL_DELTA_WARN_MV = 25;

export class BatteryTape {
  constructor() {
    this.value = h("output", { class: "pv-big" }, "—");
    this.fill = h("div", { class: "pv-tape__fill" });
    const scale = [0, 25, 50, 75, 100].map((p) => h("span", { class: "pv-tape__tick", style: { bottom: `${p}%` } }, String(p)));
    this.current = h("span", { class: "pv-battery__current" }, "—");
    this.sense = h("span", { class: "pv-battery__sense" }, "");
    this.temp = h("span", {}, "—");
    this.cells = h("div", { class: "pv-cells", "aria-hidden": "true" });
    this.cellsText = h("span", { class: "pv-cells__text" }, "");
    this.el = h(
      "section",
      { class: "pv-battery", "aria-label": "Batería (BMS)" },
      h("span", { class: "pv-label" }, "Batería"),
      this.value,
      h("div", { class: "pv-tape" }, h("div", { class: "pv-tape__track" }, this.fill), h("div", { class: "pv-tape__scale", "aria-hidden": "true" }, ...scale)),
      h(
        "div",
        { class: "pv-battery__foot" },
        h("p", { class: "pv-battery__line" }, this.current, " ", this.sense),
        h("p", { class: "pv-battery__line pv-battery__line--muted" }, this.temp, h("span", { class: "pv-desk" }, " batería")),
        h("div", { class: "pv-desk" }, this.cells, this.cellsText),
      ),
    );
    this.cellBars = [];
    this.level = null;
  }

  update(bms, derived) {
    const soc = clamp(bms.soc, 0, 100);
    setText(this.value, `${Math.round(soc)}%`);
    this.fill.style.transform = `scaleY(${(soc / 100).toFixed(3)})`;
    const level = socLevel(bms.soc);
    if (level !== this.level) {
      this.el.setAttribute("data-level", level);
      this.level = level;
    }
    setText(this.current, milliamps(bms.corriente));
    setText(this.sense, currentSense(bms.corriente));
    setText(this.temp, `${fmt(bms.temperatura, 1)} °C`);
    this.#updateCells(bms.celdas, derived);
  }

  /** Mini-barras por celda. Se recrean solo si cambia la cantidad (la API puede mandar `[]`). */
  #updateCells(celdas, derived) {
    if (celdas.length !== this.cellBars.length) {
      this.cellBars = celdas.map(() => h("i", {}, h("b")));
      this.cells.replaceChildren(...this.cellBars);
    }
    if (!celdas.length) {
      setText(this.cellsText, "sin datos de celdas");
      return;
    }
    const lowOut = derived.cellDeltaMv > CELL_DELTA_WARN_MV;
    celdas.forEach((v, i) => {
      const frac = clamp((v - CELL_MIN_V) / (CELL_MAX_V - CELL_MIN_V), 0.08, 1);
      const bar = this.cellBars[i];
      bar.firstChild.style.transform = `scaleY(${frac.toFixed(3)})`;
      bar.toggleAttribute("data-low", lowOut && v === derived.cellMin);
    });
    setText(this.cellsText, `${celdas.length} celdas · mín ${fmt(derived.cellMin, 2)} V · Δ ${derived.cellDeltaMv} mV`);
  }
}

/* ------------------------------------------------------------------ */
/* Escala térmica: un eje de 25 a 75 °C, cada motor es una marca        */
/* ------------------------------------------------------------------ */

export const THERMO_MIN = 25;
export const THERMO_MAX = 75;
const span = THERMO_MAX - THERMO_MIN;
const pct = (t) => ((t - THERMO_MIN) / span) * 100;

export class ThermalScale {
  constructor() {
    this.value = h("output", { class: "pv-big" }, "—");
    this.marks = h("div", { class: "pv-thermo__marks", "aria-hidden": "true" });
    // Las tres zonas del semáforo, con la altura exacta de su tramo de temperatura.
    const zones = [
      ["crit", TEMP_THRESHOLDS.crit, THERMO_MAX],
      ["warn", TEMP_THRESHOLDS.warn, TEMP_THRESHOLDS.crit],
      ["ok", THERMO_MIN, TEMP_THRESHOLDS.warn],
    ].map(([lvl, lo, hi]) => h("i", { class: "pv-thermo__zone", "data-level": lvl, style: { height: `${pct(hi) - pct(lo)}%` } }));
    const ticks = [30, 40, 50, 60, 70].map((t) => h("span", { class: "pv-tape__tick", style: { bottom: `${pct(t)}%` } }, String(t)));
    this.name = h("span", { class: "pv-thermo__name" }, "—");
    this.counts = h("span", {}, "");
    this.torque = h("span", {}, "");
    this.el = h(
      "section",
      { class: "pv-thermo", "aria-label": "Escala térmica de motores" },
      h("span", { class: "pv-label" }, "Motor más caliente"),
      this.value,
      h("div", { class: "pv-tape" }, h("div", { class: "pv-tape__scale", "aria-hidden": "true" }, ...ticks), this.marks, h("div", { class: "pv-thermo__bar" }, ...zones)),
      h("div", { class: "pv-thermo__foot" }, this.name, h("span", { class: "pv-desk" }, this.counts), h("span", { class: "pv-desk" }, this.torque)),
    );
    this.byName = new Map();
    this.level = null;
  }

  build(info) {
    this.byName = new Map((info?.motores_nombres ?? []).map((n) => [n, h("i", { class: "pv-thermo__mark", title: n })]));
    this.marks.replaceChildren(...this.byName.values());
  }

  setSelected(name) {
    for (const [n, el] of this.byName) el.toggleAttribute("data-selected", n === name);
  }

  update(frame) {
    for (const m of frame.motores) {
      const el = this.byName.get(m.nombre);
      // La marca ocupa todo el alto de la escala: trasladarla un % de su propio alto la ubica.
      if (el) el.style.transform = `translateY(${(100 - pct(clamp(m.temperatura, THERMO_MIN, THERMO_MAX))).toFixed(2)}%)`;
    }
    const { tempMax, tempLevels, torqueMax } = frame.derived;
    const level = tempLevel(tempMax?.value);
    if (level !== this.level) {
      this.el.setAttribute("data-level", level);
      this.level = level;
    }
    setText(this.value, `${fmt(tempMax?.value, 1)}°`);
    setText(this.name, tempMax?.motor ?? "—");
    setText(this.counts, `${frame.motores.length} motores · ${tempLevels.warn} tibios · ${tempLevels.crit} calientes`);
    setText(this.torque, `torque máx ${fmt(Math.abs(torqueMax?.value ?? NaN), 1)} N·m · ${torqueMax?.motor ?? "—"}`);
  }
}
