/**
 * Tabla de motores de la Consola.
 *
 * Una fila por motor (12 en el Go2, 29 en el G1), agrupadas por pata o por
 * miembro según `motorGroup`. Cada fila muestra el semáforo de temperatura
 * por triplicado (punto, barra de 25 a 75 °C con marcas en 40 y 60, y número),
 * el ángulo, la velocidad y el torque con una barra que se llena al llegar al
 * umbral de alarma.
 *
 * El DOM se arma una sola vez en `build(info)`. `update(frame)` solo cambia
 * textos, atributos y `transform`, porque corre 10 veces por segundo.
 */
import { h, setText, fmt, clamp } from "../../ui/dom.js";
import { tempLevel, motorGroup, jointLabel, LEG_LABELS } from "../../core/telemetryModel.js";
import { setAttr, reducedMotion } from "./util.js";

/** Escala de la barra de temperatura: 25 °C vacía, 75 °C llena (40 y 60 quedan en 30 % y 70 %). */
const TEMP_SCALE = { min: 25, max: 75 };

/** Cada cuánto se reordena la tabla en modo "por calor": más seguido, las filas saltan y no se pueden leer. */
const RESORT_MS = 1000;

/** Grupo del G1 → pie cuyo contacto se muestra en su encabezado. */
const GROUP_FOOT = { L_pierna: "L_foot", R_pierna: "R_foot" };

export class MotorTable {
  /** @param {{ onToggle: (nombre: string) => void }} handlers */
  constructor({ onToggle }) {
    this.onToggle = onToggle;
    this.rows = new Map();     // nombre → referencias a sus celdas
    this.groups = [];          // [{ tr, contact, foot }]
    this.order = [];           // filas en el orden "por pata"
    this.sort = "body";
    this.lastSort = 0;

    this.tbody = h("tbody");
    this.el = h(
      "div",
      { class: "cv-tablewrap" },
      h(
        "table",
        { class: "cv-table" },
        h("caption", { class: "sr-only" }, "Estado de cada motor: temperatura, ángulo, velocidad y torque"),
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", { scope: "col", class: "is-left" }, "Motor"),
            h("th", { scope: "col" }, "Temperatura °C"),
            h("th", { scope: "col", class: "cv-col-ang" }, "Ángulo °"),
            h("th", { scope: "col" }, "Vel. rad/s"),
            h("th", { scope: "col" }, "Torque N·m"),
          ),
        ),
        this.tbody,
      ),
    );
  }

  /** Reconstruye las filas a partir de `info.motores_nombres` (Go2 ↔ G1). */
  build(info) {
    this.rows.clear();
    this.groups = [];
    this.order = [];
    const fragment = document.createDocumentFragment();

    // Grupos en el orden en que aparecen los motores (Go2: FR FL RR RL; G1: piernas, torso, brazos).
    const byGroup = new Map();
    for (const nombre of info.motores_nombres ?? []) {
      const g = motorGroup(nombre);
      if (!byGroup.has(g.key)) byGroup.set(g.key, { ...g, motores: [] });
      byGroup.get(g.key).motores.push(nombre);
    }

    for (const g of byGroup.values()) {
      const foot = (info.patas ?? []).includes(g.key) ? g.key : GROUP_FOOT[g.key];
      const contact = foot ? h("span", { class: "cv-contact", "data-down": "false" }, "") : null;
      const label = foot && GROUP_FOOT[g.key] ? `${g.label} · ${LEG_LABELS[foot].toLowerCase()}` : g.label;
      const tr = h("tr", { class: "cv-grp" }, h("th", { scope: "rowgroup", colspan: "5" }, label, contact));
      this.groups.push({ tr, contact, foot });
      this.order.push(tr);
      fragment.append(tr);
      for (const nombre of g.motores) {
        const row = this.#buildRow(nombre);
        this.rows.set(nombre, row);
        this.order.push(row.tr);
        fragment.append(row.tr);
      }
    }
    this.tbody.replaceChildren(fragment);
    this.lastSort = 0;
  }

  #buildRow(nombre) {
    const pick = h(
      "button",
      { type: "button", class: "cv-pick", "aria-pressed": "false", title: `${jointLabel(nombre)} · clic para graficarlo` },
      h("span", { class: "cv-pick__box", "aria-hidden": "true" }),
      h("span", { class: "sr-only" }, "Graficar "),
      nombre,
    );
    const lamp = h("i", { class: "cv-lamp", "aria-hidden": "true" });
    const tbar = h("i");
    const temp = h("span", { class: "num cv-temp__v" });
    const ang = h("td", { class: "num cv-col-ang" });
    const vel = h("td", { class: "num" });
    const tqBar = h("i");
    const tq = h("span", { class: "num" });
    const tempCell = h("span", { class: "cv-temp", "data-level": "ok" }, lamp, h("span", { class: "cv-tbar", "aria-hidden": "true" }, tbar), temp);
    const tr = h(
      "tr",
      { class: "cv-row", dataset: { motor: nombre }, onclick: () => this.onToggle(nombre) },
      h("th", { scope: "row", class: "is-left" }, pick),
      h("td", {}, tempCell),
      ang,
      vel,
      h("td", {}, h("span", { class: "cv-tq" }, h("span", { class: "cv-tq__bar", "aria-hidden": "true" }, tqBar), tq)),
    );
    return { tr, pick, tempCell, tbar, temp, ang, vel, tqBar, tq };
  }

  /**
   * @param {object} frame muestra normalizada
   * @param {number} torqueAlarm umbral en N·m: la barra se llena al llegar y la fila se resalta al pasarlo
   */
  update(frame, torqueAlarm) {
    for (const m of frame.motores) {
      const r = this.rows.get(m.nombre);
      if (!r) continue;
      const level = tempLevel(m.temperatura);
      const over = Math.abs(m.torque) > torqueAlarm;
      setAttr(r.tempCell, "data-level", level);
      setAttr(r.tr, "data-hot", level === "crit");
      setAttr(r.tr, "data-over", over);
      setText(r.temp, fmt(m.temperatura, 1));
      setText(r.ang, fmt(m.angulo, 1));
      setText(r.vel, fmt(m.velocidad, 2));
      setText(r.tq, fmt(m.torque, 1));
      const t = clamp((m.temperatura - TEMP_SCALE.min) / (TEMP_SCALE.max - TEMP_SCALE.min), 0.03, 1);
      r.tbar.style.transform = `scaleX(${t.toFixed(3)})`;
      r.tqBar.style.transform = `scaleX(${clamp(Math.abs(m.torque) / torqueAlarm, 0, 1).toFixed(3)})`;
    }
    for (const g of this.groups) {
      if (!g.contact) continue;
      const down = frame.fuerzas[g.foot] === 1;
      setAttr(g.contact, "data-down", down);
      setText(g.contact, down ? "apoyada" : "en el aire");
    }
    if (this.sort === "heat" && performance.now() - this.lastSort > RESORT_MS) this.#sortByHeat(frame);
  }

  /** Marca las filas elegidas para el gráfico con el color de su serie (índice 0, 1, 2…). */
  setSelection(names) {
    for (const [nombre, r] of this.rows) {
      const i = names.indexOf(nombre);
      setAttr(r.pick, "aria-pressed", i >= 0);
      if (i >= 0) r.tr.style.setProperty("--pick", `var(--cv-s${i + 1})`);
      else r.tr.style.removeProperty("--pick");
    }
  }

  /** "body" = agrupada por pata/miembro; "heat" = de la más caliente a la más fría. */
  setSort(mode, frame) {
    this.sort = mode;
    for (const g of this.groups) g.tr.hidden = mode === "heat";
    if (mode === "heat" && frame) this.#sortByHeat(frame);
    else this.tbody.append(...this.order); // append mueve los nodos existentes: no crea nada
  }

  /** Reordena moviendo las filas existentes (no se crea DOM), como mucho una vez por segundo. */
  #sortByHeat(frame) {
    this.lastSort = performance.now();
    const sorted = [...frame.motores].sort((a, b) => b.temperatura - a.temperatura);
    const trs = sorted.map((m) => this.rows.get(m.nombre)?.tr).filter(Boolean);
    const current = this.tbody.querySelectorAll("tr.cv-row");
    if (trs.every((tr, i) => current[i] === tr)) return; // mismo orden: no tocar el DOM
    this.tbody.append(...trs);
  }

  /** Lleva la fila del motor al centro y la hace destellar (desde la franja de alarma). */
  reveal(nombre) {
    const r = this.rows.get(nombre);
    if (!r) return;
    const reduce = reducedMotion();
    r.tr.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    r.pick.focus({ preventScroll: true });
    if (!reduce) r.tr.animate([{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 900 });
  }
}
