/**
 * Tarjetas unidas a las articulaciones con una línea (callouts de lámina técnica).
 *
 * - Go2: una tarjeta por motor (temperatura + torque), agrupadas por pata en
 *   las cuatro esquinas, y el estado de apoyo de la pata en el título.
 * - G1: 29 tarjetas no entran; se agrupan con `motorGroup` (brazos, piernas,
 *   torso) en filas compactas, y la línea va al centro de cada grupo.
 *
 * Las posiciones de las tarjetas se miden solo cuando cambia el layout
 * (`measure`); en cada muestra se mueven los extremos de las líneas con la
 * proyección que calcula RobotFigure, sin leer el DOM.
 */
import { h, s, setText, fmt, clamp } from "../../ui/dom.js";
import { tempLevel, motorGroup, LEG_LABELS } from "../../core/telemetryModel.js";

/** "Delantera izquierda" → "Delantera izq." para que entre en la tarjeta. */
const shortLeg = (leg) => (LEG_LABELS[leg] ?? leg).replace("izquierda", "izq.").replace("derecha", "der.");

export class Callouts {
  /**
   * @param {{ figure: import("./robotFigure.js").RobotFigure, onSelect: Function, torqueScale: () => number }} opts
   */
  constructor({ figure, onSelect, torqueScale }) {
    this.figure = figure;
    this.onSelect = onSelect;
    this.torqueScale = torqueScale;
    this.cards = new Map();    // nombre → { el, temp, tq, bar, level }
    this.legStatus = new Map(); // pata → { el, down }
    this.leaders = [];          // { line, el, side, joint, x1, y1, ox, oy }
    this.colL = h("div", { class: "bd-col bd-col--l" });
    this.colR = h("div", { class: "bd-col bd-col--r" });
    this.lines = s("svg", { class: "bd-leaders", "aria-hidden": "true" });
    this.selectedLine = s("line", { class: "bd-leader bd-leader--selected" });
  }

  /** Los nodos que la vista inserta en el escenario. */
  get nodes() {
    return [this.lines, this.colL, this.colR];
  }

  build(info, kind) {
    this.cards.clear();
    this.legStatus.clear();
    this.leaders = [];
    this.colL.replaceChildren();
    this.colR.replaceChildren();
    this.lines.replaceChildren();
    this.kind = kind;
    this.colL.dataset.kind = this.colR.dataset.kind = kind;
    const names = info?.motores_nombres ?? [];

    if (kind === "quad") {
      // Izquierda de la pantalla = patas izquierdas; arriba = delanteras.
      for (const leg of ["FL", "RL", "FR", "RR"].filter((l) => info.patas.includes(l))) {
        const own = names.filter((n) => n.startsWith(`${leg}_`));
        // En las delanteras la pantorrilla va arriba: así las líneas no se cruzan.
        if (leg[0] === "F") own.reverse();
        const col = leg[1] === "L" ? this.colL : this.colR;
        col.append(this.#group(`${leg} · ${shortLeg(leg)}`, leg, own, "card"));
        for (const n of own) this.#leader(this.cards.get(n).el, leg[1] === "L" ? "l" : "r", n);
      }
    } else if (kind === "humanoid") {
      // De frente: el lado derecho del robot queda a la izquierda de la pantalla.
      const groups = new Map();
      for (const n of names) {
        const g = motorGroup(n);
        if (!groups.has(g.key)) groups.set(g.key, { ...g, names: [] });
        groups.get(g.key).names.push(n);
      }
      const place = { R_brazo: "l", R_pierna: "l", torso: "r", L_brazo: "r", L_pierna: "r" };
      for (const g of groups.values()) {
        const side = place[g.key] ?? "r";
        const foot = g.key.endsWith("_pierna") ? `${g.key[0]}_foot` : null;
        const el = this.#group(g.label, foot && info.patas?.includes(foot) ? foot : null, g.names, "row");
        (side === "l" ? this.colL : this.colR).append(el);
        // Una línea por grupo, al motor del medio (codo, rodilla, torso).
        this.#leader(el.querySelector(".bd-group__title"), side, g.names[Math.floor(g.names.length / 2)]);
      }
    }
    this.lines.append(this.selectedLine);
  }

  #group(title, leg, names, variant) {
    const status = leg ? h("span", { class: "bd-group__status" }, "—") : null;
    if (leg) this.legStatus.set(leg, { el: status, down: null });
    const el = h("section", { class: `bd-group bd-group--${variant}` },
      h("h3", { class: "bd-group__title" }, h("span", {}, title), status));
    for (const n of names) {
      const temp = h("span", { class: "bd-card__temp" }, "—");
      const tq = h("span", { class: "bd-card__tq" }, "—");
      const bar = h("i");
      const card = h(
        "button",
        { type: "button", class: `bd-card bd-card--${variant}`, "data-level": "ok", title: `Ver el detalle de ${n}`, onclick: () => this.onSelect(n) },
        h("span", { class: "bd-card__name" }, variant === "row" ? n.replace(/^[LR]_|^torso_/, "") : n),
        temp,
        h("span", { class: "bd-card__q" }, h("span", { class: "bd-bar", "aria-hidden": "true" }, bar), tq),
      );
      el.append(card);
      this.cards.set(n, { el: card, temp, tq, bar, level: "ok", torque: null });
    }
    return el;
  }

  #leader(el, side, joint) {
    const line = s("line", { class: "bd-leader" });
    this.lines.append(line);
    this.leaders.push({ line, el, side, joint, x1: 0, y1: 0, x2: null, y2: null });
  }

  setSelected(name) {
    this.selected = name;
    for (const [n, c] of this.cards) c.el.classList.toggle("is-selected", n === name);
    this.#placeSelectedLine();
  }

  /**
   * Mide dónde quedaron las tarjetas y el dibujo. Solo al cambiar el
   * layout (ResizeObserver), nunca en cada muestra.
   * @param {HTMLElement} stage
   */
  measure(stage) {
    const sr = stage.getBoundingClientRect();
    const rr = this.figure.el.getBoundingClientRect();
    this.origin = [rr.left - sr.left, rr.top - sr.top];
    this.visible = this.colL.offsetParent !== null && sr.width > 0;
    this.lines.style.display = this.visible ? "" : "none";
    if (!this.visible) return;
    for (const L of this.leaders) {
      const r = L.el.getBoundingClientRect();
      L.x1 = (L.side === "l" ? r.right : r.left) - sr.left;
      L.y1 = r.top + r.height / 2 - sr.top;
      L.line.setAttribute("x1", L.x1.toFixed(1));
      L.line.setAttribute("y1", L.y1.toFixed(1));
      L.x2 = null; // obliga a recolocar el otro extremo
    }
    this.#measureSelected(sr);
    this.placeLines();
  }

  /** En el G1 la tarjeta elegida también se une a su articulación. */
  #measureSelected(sr = this.lines.getBoundingClientRect()) {
    const card = this.kind === "humanoid" && this.cards.get(this.selected);
    if (!card || !this.visible) { this.sel = null; return; }
    const r = card.el.getBoundingClientRect();
    const left = card.el.closest(".bd-col--l") !== null;
    this.sel = { x1: (left ? r.right : r.left) - sr.left, y1: r.top + r.height / 2 - sr.top };
  }

  #placeSelectedLine() {
    this.#measureSelected();
    const p = this.sel && this.figure.project(this.selected);
    this.selectedLine.style.display = p ? "" : "none";
    if (!p) return;
    this.selectedLine.setAttribute("x1", this.sel.x1.toFixed(1));
    this.selectedLine.setAttribute("y1", this.sel.y1.toFixed(1));
    this.selectedLine.setAttribute("x2", (this.origin[0] + p[0]).toFixed(1));
    this.selectedLine.setAttribute("y2", (this.origin[1] + p[1]).toFixed(1));
  }

  /** Mueve el extremo de cada línea a la articulación (que se inclina con la IMU). */
  placeLines() {
    if (!this.visible || !this.origin) return;
    for (const L of this.leaders) {
      const p = this.figure.project(L.joint);
      if (!p) continue;
      const x2 = this.origin[0] + p[0];
      const y2 = this.origin[1] + p[1];
      if (L.x2 !== null && Math.abs(x2 - L.x2) < 0.3 && Math.abs(y2 - L.y2) < 0.3) continue;
      L.x2 = x2;
      L.y2 = y2;
      L.line.setAttribute("x2", x2.toFixed(1));
      L.line.setAttribute("y2", y2.toFixed(1));
    }
    if (this.sel) {
      const p = this.figure.project(this.selected);
      if (p) {
        this.selectedLine.setAttribute("x2", (this.origin[0] + p[0]).toFixed(1));
        this.selectedLine.setAttribute("y2", (this.origin[1] + p[1]).toFixed(1));
      }
    }
  }

  update(frame) {
    const scale = this.torqueScale();
    for (const m of frame.motores) {
      const c = this.cards.get(m.nombre);
      if (!c) continue;
      const level = tempLevel(m.temperatura);
      if (level !== c.level) {
        c.level = level;
        c.el.dataset.level = level;
        const L = this.leaders.find((x) => x.joint === m.nombre);
        if (L) L.line.classList.toggle("is-hot", level === "crit");
      }
      setText(c.temp, `${fmt(m.temperatura, 1)} °C`);
      setText(c.tq, `${fmt(m.torque, 1)} N·m`);
      const k = clamp(Math.abs(m.torque) / scale, 0, 1);
      if (c.torque === null || Math.abs(k - c.torque) > 0.004) {
        c.torque = k;
        c.bar.style.transform = `scaleX(${k.toFixed(3)})`;
      }
    }
    for (const [leg, st] of this.legStatus) {
      const down = frame.fuerzas[leg] === 1;
      if (down === st.down) continue;
      st.down = down;
      setText(st.el, down ? (leg.endsWith("_foot") ? "pie apoyado" : "apoyada") : "en el aire");
      st.el.dataset.down = String(down);
    }
    this.placeLines();
  }
}
