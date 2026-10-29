/**
 * Tabla de todos los motores (panel de motores de la consigna): temperatura
 * con semáforo, ángulo, velocidad y torque.
 *
 * Las filas se crean una vez por robot. En cada muestra solo cambian textos y,
 * si se ordena por temperatura, el orden (se mueven las filas existentes, no se
 * recrean). Por defecto se agrupan por pata o por parte del cuerpo, en el
 * orden de los ids, como pide la consigna.
 */
import { h, setText, fmt } from "../../ui/dom.js";
import { tempLevel, motorGroup } from "../../core/telemetryModel.js";

export class MotorTable {
  /** @param {{ onSelect: (name: string) => void }} opts */
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.rows = new Map(); // nombre → { tr, temp, ang, vel, tq, level }
    this.sortByTemp = false;
    this.order = "";

    this.sortBtn = h("button", { type: "button", class: "bd-linkbtn", "aria-pressed": "false", onclick: () => this.toggleSort() }, "ordenar por temperatura");
    this.count = h("span", { class: "bd-sub" });
    this.tbody = h("tbody");
    this.tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-name]");
      if (tr) this.onSelect(tr.dataset.name);
    });
    const th = (text, cls, title) => h("th", { scope: "col", class: cls, title }, text);
    this.el = h(
      "section",
      { class: "bd-motors", "aria-labelledby": "bd-motors-title" },
      h("header", { class: "bd-panel-head" },
        h("h2", { class: "bd-eyebrow", id: "bd-motors-title" }, "Motores"),
        this.count,
        h("span", { class: "bd-spacer" }),
        this.sortBtn),
      h("div", { class: "bd-motors__scroll" },
        h("table", { class: "bd-table" },
          h("caption", { class: "sr-only" }, "Temperatura, ángulo, velocidad y torque de cada motor"),
          h("thead", {}, h("tr", {},
            th("Motor", "bd-l"),
            th("Temp. °C", "", "Temperatura del motor: verde < 40 °C, amarillo 40–60 °C, rojo > 60 °C"),
            th("Ángulo °", "", "Ángulo de la articulación en grados"),
            th("Vel. rad/s", "", "Velocidad angular en radianes por segundo"),
            th("Torque N·m", "", "Torque estimado en newton·metro"))),
          this.tbody)),
    );
  }

  build(info) {
    this.rows.clear();
    this.order = "";
    const names = info?.motores_nombres ?? [];
    setText(this.count, `· ${names.length} motores`);
    const frag = [];
    let lastGroup = null;
    for (const n of names) {
      const g = motorGroup(n);
      if (g.key !== lastGroup) {
        lastGroup = g.key;
        frag.push(h("tr", { class: "bd-table__group" }, h("th", { colspan: "5", scope: "rowgroup" }, g.label)));
      }
      const temp = h("span", { class: "bd-num" }, "—");
      const cells = {
        temp,
        ang: h("td", { class: "bd-num" }, "—"),
        vel: h("td", { class: "bd-num" }, "—"),
        tq: h("td", { class: "bd-num" }, "—"),
      };
      const tr = h(
        "tr",
        { "data-name": n, "data-level": "ok" },
        h("th", { scope: "row", class: "bd-l" }, h("button", { type: "button", class: "bd-rowbtn", "aria-label": `Ver detalle de ${n}` }, n)),
        h("td", { class: "bd-table__temp" }, h("i", { class: "bd-dot", "aria-hidden": "true" }), temp),
        cells.ang, cells.vel, cells.tq,
      );
      frag.push(tr);
      this.rows.set(n, { tr, ...cells, level: "ok" });
    }
    this.groupRows = frag.filter((r) => r.classList.contains("bd-table__group"));
    this.initialOrder = frag;
    this.tbody.replaceChildren(...frag);
    this.#applySortMode();
  }

  toggleSort() {
    this.sortByTemp = !this.sortByTemp;
    this.#applySortMode();
    if (this.last) this.update(this.last);
  }

  #applySortMode() {
    this.sortBtn.setAttribute("aria-pressed", String(this.sortByTemp));
    setText(this.sortBtn, this.sortByTemp ? "ordenar por grupo" : "ordenar por temperatura");
    this.order = "";
    for (const g of this.groupRows ?? []) g.hidden = this.sortByTemp;
    if (!this.sortByTemp && this.initialOrder) this.tbody.append(...this.initialOrder);
  }

  setSelected(name) {
    for (const [n, r] of this.rows) r.tr.classList.toggle("is-selected", n === name);
  }

  /** Lleva la fila elegida a la vista (al elegir desde el dibujo). */
  reveal(name) {
    this.rows.get(name)?.tr.scrollIntoView({ block: "nearest" });
  }

  update(frame) {
    this.last = frame;
    for (const m of frame.motores) {
      const r = this.rows.get(m.nombre);
      if (!r) continue;
      const level = tempLevel(m.temperatura);
      if (level !== r.level) {
        r.level = level;
        r.tr.dataset.level = level;
      }
      setText(r.temp, fmt(m.temperatura, 1));
      setText(r.ang, fmt(m.angulo, 1));
      setText(r.vel, fmt(m.velocidad, 2));
      setText(r.tq, fmt(m.torque, 1));
    }
    if (this.sortByTemp) {
      // Se reordena solo si el orden cambió (evita mover nodos 10 veces por segundo).
      const sorted = [...frame.motores].sort((a, b) => b.temperatura - a.temperatura).map((m) => m.nombre);
      const key = sorted.join(",");
      if (key !== this.order) {
        this.order = key;
        this.tbody.append(...sorted.map((n) => this.rows.get(n)?.tr).filter(Boolean));
      }
    }
  }
}
