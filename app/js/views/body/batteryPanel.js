/**
 * Panel de batería (BMS): carga, corriente, temperatura y la tensión de cada
 * celda. En el dibujo el cuerpo del robot ya se llena con el SOC; acá están
 * los números que pide la consigna.
 */
import { h, setText, fmt, clamp } from "../../ui/dom.js";
import { socLevel } from "../../core/telemetryModel.js";
import { icon } from "../../ui/icons.js";
import { milliamps, currentSense } from "./format.js";

/** Rango de tensión de una celda de litio, para la altura de las barras. */
const CELL_MIN_V = 3.0;
const CELL_MAX_V = 4.25;
/** Desbalance a partir del cual se marca la celda más baja. */
const CELL_DELTA_WARN_MV = 30;

export class BatteryPanel {
  constructor() {
    this.soc = h("span", { class: "bd-num" }, "—");
    this.current = h("b", { class: "bd-num" }, "—");
    this.sense = h("span", { class: "bd-battery__sense" }, "");
    this.temp = h("b", { class: "bd-num" }, "—");
    this.pack = h("b", { class: "bd-num" }, "—");
    this.cells = h("div", { class: "bd-cells", role: "list", "aria-label": "Tensión de cada celda" });
    this.caption = h("span", {}, "");
    this.delta = h("span", { class: "bd-num" }, "");
    this.cellEls = [];
    this.el = h(
      "section",
      { class: "bd-battery", "aria-labelledby": "bd-battery-title" },
      h("h2", { class: "bd-eyebrow", id: "bd-battery-title", html: `${icon("battery", { size: 14 })}<span>Batería (BMS)</span>` }),
      h("div", { class: "bd-battery__main" },
        h("div", { class: "bd-battery__soc", title: "Estado de carga (SOC)" }, this.soc, h("small", {}, "%")),
        h("dl", { class: "bd-battery__meta" },
          h("div", {}, h("dt", {}, "Corriente"), h("dd", {}, this.current, this.sense)),
          h("div", {}, h("dt", {}, "Temperatura"), h("dd", {}, this.temp)),
          h("div", {}, h("dt", {}, "Pack"), h("dd", {}, this.pack)))),
      this.cells,
      h("div", { class: "bd-battery__cap" }, this.caption, this.delta),
    );
  }

  /** Crea las barras solo si cambió la cantidad de celdas (normalmente, una vez). */
  #ensureCells(n) {
    if (this.cellEls.length === n) return;
    this.cellEls = Array.from({ length: n }, (_, i) => {
      const bar = h("i", { class: "bd-cell__bar" });
      const v = h("span", { class: "bd-cell__v bd-num" }, "—");
      const el = h("div", { class: "bd-cell", role: "listitem", title: `Celda ${i + 1}` },
        h("span", { class: "sr-only" }, `Celda ${i + 1}: `),
        h("span", { class: "bd-cell__track", "aria-hidden": "true" }, bar), v, h("span", { class: "sr-only" }, " V"));
      return { el, bar, v, low: false };
    });
    this.cells.replaceChildren(...this.cellEls.map((c) => c.el));
    this.cells.dataset.count = String(n);
  }

  update(frame) {
    const { bms, derived } = frame;
    setText(this.soc, fmt(bms.soc, 0));
    this.soc.parentElement.dataset.level = socLevel(bms.soc);
    setText(this.current, milliamps(bms.corriente));
    setText(this.sense, currentSense(bms.corriente));
    setText(this.temp, bms.temperatura ? `${fmt(bms.temperatura, 1)} °C` : "—");

    const n = bms.celdas.length;
    this.#ensureCells(n);
    if (!n) {
      // La API de ejemplo trae `celdas: []`: se dice en lugar de mostrar un hueco.
      setText(this.pack, "—");
      setText(this.caption, "El robot no informa la tensión de las celdas");
      setText(this.delta, "");
      return;
    }
    setText(this.pack, `${fmt(derived.packVoltage, 2)} V`);
    const unbalanced = derived.cellDeltaMv > CELL_DELTA_WARN_MV;
    bms.celdas.forEach((v, i) => {
      const c = this.cellEls[i];
      c.bar.style.transform = `scaleY(${clamp((v - CELL_MIN_V) / (CELL_MAX_V - CELL_MIN_V), 0.05, 1).toFixed(3)})`;
      setText(c.v, fmt(v, 3));
      const low = unbalanced && v === derived.cellMin;
      if (low !== c.low) {
        c.low = low;
        c.el.classList.toggle("is-low", low);
      }
    });
    setText(this.caption, `${n} celdas · ${fmt(derived.cellMin, 3)}–${fmt(derived.cellMax, 3)} V`);
    setText(this.delta, `Δ ${derived.cellDeltaMv} mV`);
  }
}
