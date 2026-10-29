/**
 * Panel de la batería (BMS): carga en un anillo, corriente, temperatura,
 * tensión y potencia, y una barra por celda con la más baja resaltada.
 *
 * La corriente llega en mA y es POSITIVA mientras la batería se descarga.
 * La API de la cátedra puede mandar `celdas: []`: el panel lo dice en vez de
 * dibujar barras vacías.
 */
import { h, s, setText, fmt, clamp } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { socLevel } from "../../core/telemetryModel.js";
import { setAttr, grouped } from "./util.js";

const RING_R = 44;
const RING_LEN = 2 * Math.PI * RING_R;

/** Rango útil de una celda de litio: 3,3 V vacía, 4,2 V llena. */
const CELL_V = { min: 3.3, max: 4.2 };

/** Diferencia entre la celda más alta y la más baja a partir de la cual se resalta la más baja. */
const CELL_IMBALANCE_MV = 25;

/** Por debajo de este módulo de corriente se considera que la batería está en reposo. */
const IDLE_MA = 50;

export class BatteryPanel {
  constructor() {
    this.sub = h("span", { class: "cv-sub" }, "");
    this.arc = s("circle", { cx: 50, cy: 50, r: RING_R, class: "cv-ring__arc", "stroke-dasharray": RING_LEN.toFixed(1), "stroke-dashoffset": RING_LEN.toFixed(1) });
    this.soc = h("b", { class: "num" }, "—");
    this.ring = h(
      "div",
      { class: "cv-ring", "data-level": "ok" },
      s("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" }, s("circle", { cx: 50, cy: 50, r: RING_R, class: "cv-ring__track" }), this.arc),
      h("div", { class: "cv-ring__c" }, h("div", {}, this.soc, h("span", {}, "% carga"))),
    );
    this.kv = {};
    const row = (key, label, title) => {
      this.kv[key] = h("dd", { class: "num" }, "—");
      return [h("dt", { title }, label), this.kv[key]];
    };
    this.cellTitle = h("span", {}, "Celdas");
    this.cellDelta = h("span", { class: "num" }, "");
    this.cells = h("div", { class: "cv-cells" });
    this.noCells = h("p", { class: "cv-empty", hidden: true }, "El BMS no informa la tensión de cada celda.");
    this.cellEls = [];

    this.el = h(
      "section",
      { class: "cv-panel cv-bms", "aria-labelledby": "cv-bms-title" },
      h("header", { class: "cv-ph" }, h("span", { class: "cv-ph__icon", html: icon("battery", { size: 16 }) }), h("h2", { id: "cv-bms-title" }, "Batería"), this.sub),
      h(
        "div",
        { class: "cv-bms__body" },
        h(
          "div",
          { class: "cv-bms__top" },
          this.ring,
          h(
            "dl",
            { class: "cv-kv" },
            ...row("cur", "Corriente", "Positiva = descargando"),
            ...row("temp", "Temperatura", "Temperatura de la batería"),
            ...row("volt", "Tensión", "Suma de las tensiones de las celdas"),
            ...row("power", "Potencia", "Tensión × corriente"),
          ),
        ),
        h("div", { class: "cv-cellhdr" }, this.cellTitle, this.cellDelta),
        this.cells,
        this.noCells,
      ),
    );
  }

  /** Crea una barra por celda; solo se llama cuando cambia la cantidad de celdas. */
  #buildCells(n) {
    this.cellEls = Array.from({ length: n }, () => {
      const bar = h("i");
      const value = h("span", { class: "num" });
      const el = h("div", { class: "cv-cell", "data-min": "false" }, h("div", { class: "cv-cell__bar", "aria-hidden": "true" }, bar), value);
      return { el, bar, value };
    });
    this.cells.replaceChildren(...this.cellEls.map((c) => c.el));
    this.cells.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
    setText(this.cellTitle, n ? `Celdas · ${n}` : "Celdas");
    this.cells.hidden = n === 0;
    this.noCells.hidden = n > 0;
  }

  update(frame) {
    const { soc, corriente, temperatura, celdas } = frame.bms;
    const d = frame.derived;

    setText(this.soc, fmt(soc, 0));
    setAttr(this.ring, "data-level", socLevel(soc));
    setAttr(this.arc, "stroke-dashoffset", (RING_LEN * (1 - clamp(soc, 0, 100) / 100)).toFixed(1));
    setText(this.sub, Math.abs(corriente) < IDLE_MA ? "sin consumo" : corriente > 0 ? "descargando" : "cargando");

    setText(this.kv.cur, `${grouped(corriente)} mA`);
    setText(this.kv.temp, `${fmt(temperatura, 1)} °C`);
    setText(this.kv.volt, celdas.length ? `${fmt(d.packVoltage, 1)} V` : "—");
    setText(this.kv.power, celdas.length ? `${fmt(d.powerW, 0)} W` : "—");

    if (celdas.length !== this.cellEls.length) this.#buildCells(celdas.length);
    const imbalanced = d.cellDeltaMv !== null && d.cellDeltaMv > CELL_IMBALANCE_MV;
    celdas.forEach((v, i) => {
      const c = this.cellEls[i];
      setAttr(c.el, "data-min", imbalanced && v === d.cellMin);
      setText(c.value, fmt(v, 2));
      c.bar.style.transform = `scaleY(${clamp((v - CELL_V.min) / (CELL_V.max - CELL_V.min), 0.04, 1).toFixed(3)})`;
    });
    setText(this.cellDelta, celdas.length ? `mín. ${fmt(d.cellMin, 2)} V · Δ ${d.cellDeltaMv} mV` : "");
  }
}
