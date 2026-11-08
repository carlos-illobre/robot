/**
 * Hoja lateral con la tabla de motores y la batería completa (tecla M).
 *
 * En la cabina la tabla no está a la vista: vive acá para que la pantalla
 * principal sea solo forma. Es un `<dialog>` nativo: atrapa el foco, se
 * cierra con Esc sin código extra y lo anuncia bien un lector de pantalla.
 * Se cierra también con un clic afuera (en el fondo).
 *
 * Las filas se crean en `build(info)`; `update()` solo escribe textos y solo
 * mientras la hoja está abierta.
 */
import { h, setText, fmt } from "../../ui/dom.js";
import { tempLevel, motorGroup, socLevel } from "../../core/telemetryModel.js";
import { icon } from "../../ui/icons.js";
import { milliamps, currentSense } from "./format.js";

/** Qué pata (o pie) corresponde a cada grupo de la tabla, para mostrar si apoya. */
const GROUP_LEG = { FR: "FR", FL: "FL", RR: "RR", RL: "RL", L_pierna: "L_foot", R_pierna: "R_foot" };

export class MotorSheet {
  /**
   * @param {{ onSelect: (name: string) => void, onToggle: (open: boolean) => void }} opts
   */
  constructor({ onSelect, onToggle }) {
    this.onSelect = onSelect;
    this.rows = new Map();
    this.groupLegs = [];
    this.cellChips = [];

    this.tbody = h("tbody");
    this.bat = {
      soc: h("dd", {}, "—"),
      current: h("dd", {}, "—"),
      temp: h("dd", {}, "—"),
      pack: h("dd", {}, "—"),
      power: h("dd", {}, "—"),
    };
    this.cells = h("ol", { class: "pv-sheet__cells", "aria-label": "Tensión de cada celda" });

    const close = h("button", { type: "button", class: "pv-btn pv-btn--icon", "aria-label": "Cerrar la tabla", html: icon("x"), onclick: () => this.toggle(false) });
    this.dialog = h(
      "dialog",
      { class: "pv-sheet", "aria-labelledby": "pv-sheet-title" },
      h(
        "div",
        { class: "pv-sheet__inner" },
        h("header", { class: "pv-sheet__head" }, h("h2", { id: "pv-sheet-title" }, "Motores"), close),
        h(
          "p",
          { class: "pv-sheet__legend" },
          h("i", { "data-level": "ok" }), "< 40 °C ", h("i", { "data-level": "warn" }), "40–60 °C ", h("i", { "data-level": "crit" }), "> 60 °C",
          h("span", {}, " · Tocá un motor para marcarlo en el anillo."),
        ),
        h(
          "div",
          { class: "pv-sheet__table" },
          h(
            "table",
            {},
            h("caption", { class: "sr-only" }, "Temperatura, ángulo, velocidad y torque de cada motor"),
            h(
              "thead",
              {},
              h("tr", {}, h("th", { scope: "col" }, "Motor"), h("th", { scope: "col" }, "Temp °C"), h("th", { scope: "col" }, "Ángulo °"), h("th", { scope: "col" }, "Vel rad/s"), h("th", { scope: "col" }, "Torque N·m")),
            ),
            this.tbody,
          ),
        ),
        h(
          "section",
          { class: "pv-sheet__battery", "aria-labelledby": "pv-sheet-bat" },
          h("h3", { id: "pv-sheet-bat" }, "Batería"),
          h(
            "dl",
            {},
            h("div", {}, h("dt", {}, "Carga"), this.bat.soc),
            h("div", {}, h("dt", {}, "Corriente"), this.bat.current),
            h("div", {}, h("dt", {}, "Temperatura"), this.bat.temp),
            h("div", {}, h("dt", {}, "Pack"), this.bat.pack),
            h("div", {}, h("dt", {}, "Potencia"), this.bat.power),
          ),
          this.cells,
        ),
      ),
    );
    // Un clic que cae directo en el <dialog> (y no en su contenido) es un clic en el fondo.
    this.dialog.addEventListener("click", (e) => {
      if (e.target === this.dialog) this.toggle(false);
    });
    this.dialog.addEventListener("close", () => onToggle(false));
    this.onToggle = onToggle;
  }

  get open() {
    return this.dialog.open;
  }

  toggle(force = !this.open) {
    if (force === this.open) return;
    if (force) {
      this.dialog.showModal();
      if (this.last) this.update(this.last);
      this.onToggle(true);
    } else {
      this.dialog.close();
    }
  }

  /** Filas agrupadas por pata o miembro; el encabezado del grupo dice si esa pata apoya. */
  build(info) {
    this.rows.clear();
    this.groupLegs = [];
    const names = info?.motores_nombres ?? [];
    const legs = new Set(info?.patas ?? []);
    const rows = [];
    let group = null;
    for (const name of names) {
      const g = motorGroup(name);
      if (g.key !== group) {
        group = g.key;
        const leg = GROUP_LEG[g.key];
        const contact = legs.has(leg) ? h("span", { class: "pv-sheet__contact", "data-contact": "0" }, "—") : null;
        if (contact) this.groupLegs.push({ leg, el: contact });
        rows.push(h("tr", { class: "pv-sheet__group" }, h("th", { scope: "rowgroup", colspan: "5" }, g.label, contact)));
      }
      const pick = h("button", { type: "button", class: "pv-sheet__pick", "aria-pressed": "false", onclick: () => this.onSelect(name) }, h("i", { class: "pv-lamp" }), name);
      const cells = [h("td"), h("td"), h("td"), h("td")];
      const tr = h("tr", { "data-level": "unknown" }, h("th", { scope: "row" }, pick), ...cells);
      rows.push(tr);
      this.rows.set(name, { tr, pick, cells, level: "unknown" });
    }
    this.tbody.replaceChildren(...rows);
  }

  setSelected(name) {
    for (const [n, r] of this.rows) r.pick.setAttribute("aria-pressed", String(n === name));
  }

  update(frame) {
    this.last = frame;
    if (!this.open) return;
    for (const m of frame.motores) {
      const r = this.rows.get(m.nombre);
      if (!r) continue;
      const level = tempLevel(m.temperatura);
      if (level !== r.level) {
        r.tr.setAttribute("data-level", level);
        r.level = level;
      }
      setText(r.cells[0], fmt(m.temperatura, 1));
      setText(r.cells[1], fmt(m.angulo, 1));
      setText(r.cells[2], fmt(m.velocidad, 2));
      setText(r.cells[3], fmt(m.torque, 1));
    }
    for (const { leg, el } of this.groupLegs) {
      const down = frame.fuerzas[leg] === 1;
      el.setAttribute("data-contact", down ? "1" : "0");
      setText(el, down ? "apoyada" : "en el aire");
    }
    this.#updateBattery(frame.bms, frame.derived);
  }

  #updateBattery(bms, d) {
    setText(this.bat.soc, `${fmt(bms.soc, 0)} %`);
    this.bat.soc.setAttribute("data-level", socLevel(bms.soc));
    setText(this.bat.current, `${milliamps(bms.corriente)} · ${currentSense(bms.corriente)}`);
    setText(this.bat.temp, `${fmt(bms.temperatura, 1)} °C`);
    setText(this.bat.pack, bms.celdas.length ? `${fmt(d.packVoltage, 2)} V` : "—");
    setText(this.bat.power, bms.celdas.length ? `${fmt(d.powerW, 1)} W` : "—");

    if (bms.celdas.length !== this.cellChips.length) {
      this.cellChips = bms.celdas.map((_, i) => h("li", {}, h("span", {}, `C${i + 1}`), h("b", {}, "")));
      this.cells.replaceChildren(...this.cellChips);
    }
    bms.celdas.forEach((v, i) => {
      const li = this.cellChips[i];
      setText(li.lastChild, `${fmt(v, 3)} V`);
      li.toggleAttribute("data-low", bms.celdas.length > 1 && v === d.cellMin);
    });
  }
}
