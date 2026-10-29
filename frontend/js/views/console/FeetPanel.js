/**
 * Panel de contacto de las patas (`fuerzas`: 1 = apoyada, 0 = en el aire).
 *
 * A la izquierda, el robot dibujado: el Go2 visto desde arriba y el G1 de
 * frente. El pie que apoya se rellena y crece un poco. A la derecha, una
 * fila por pata con su "diagrama de apoyos" de los últimos 4 s (40 muestras):
 * cada cuadradito es una muestra, lleno si la pata estaba apoyada. Así se ve
 * la marcha: en el trote del Go2 las patas en diagonal apoyan juntas.
 */
import { h, s, setText } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { LEG_LABELS } from "../../core/telemetryModel.js";
import { setAttr } from "./util.js";

/** Muestras del diagrama de apoyos (4 s a 10 Hz). */
const STRIP = 40;

/** Orden "espacial" de las filas: como se ven en el dibujo. */
const SPATIAL = ["FL", "FR", "RL", "RR", "R_foot", "L_foot"];

/** Ordena las patas como aparecen en el dibujo (izquierda a derecha, adelante hacia atrás). */
export const spatialOrder = (patas) => [...patas].sort((a, b) => SPATIAL.indexOf(a) - SPATIAL.indexOf(b));

/** Etiqueta corta de cada pata para la lista. */
const SHORT = { R_foot: "Der.", L_foot: "Izq." };

/** Go2 visto desde arriba (la cabeza arriba). Devuelve el SVG y sus pies por nombre. */
function drawQuadruped() {
  const feet = {};
  const foot = (id, cx, cy) => (feet[id] = s("circle", { class: "cv-foot", cx, cy, r: 9, "data-down": "false" }));
  const svg = s(
    "svg",
    { class: "cv-robot", viewBox: "0 0 132 168", role: "img", "aria-label": "Go2 visto desde arriba, con la cabeza hacia arriba" },
    s("path", { class: "cv-robot__leg", d: "M46 46 34 44 22 26M86 46l12-2 12-18M46 122l-12 2-12 18M86 122l12 2 12 18" }),
    s("g", { class: "cv-robot__joint" }, ...[[34, 44], [98, 44], [34, 124], [98, 124]].map(([cx, cy]) => s("circle", { cx, cy, r: 3.5 }))),
    s("rect", { class: "cv-robot__body", x: 40, y: 30, width: 52, height: 108, rx: 16 }),
    s("rect", { class: "cv-robot__inner", x: 47, y: 40, width: 38, height: 88, rx: 10 }),
    s("path", { class: "cv-robot__body", d: "M50 30c0-10 7-16 16-16s16 6 16 16" }),
    s("circle", { class: "cv-robot__eye", cx: 60, cy: 22, r: 2.2 }),
    s("circle", { class: "cv-robot__eye", cx: 72, cy: 22, r: 2.2 }),
    s("g", { class: "cv-robot__hip" }, ...[[46, 46], [86, 46], [46, 122], [86, 122]].map(([cx, cy]) => s("circle", { cx, cy, r: 4 }))),
    s("path", { class: "cv-robot__inner", d: "M58 76h16M58 84h16M58 92h16" }),
    foot("FL", 22, 26), foot("FR", 110, 26), foot("RL", 22, 142), foot("RR", 110, 142),
    s(
      "g",
      { class: "cv-robot__lbl" },
      ...[["FL", 14, 66], ["FR", 118, 66], ["RL", 14, 108], ["RR", 118, 108]].map(([t, x, y]) => s("text", { x, y, "text-anchor": "middle" }, document.createTextNode(t))),
    ),
    s("text", { class: "cv-robot__caption", x: 66, y: 164, "text-anchor": "middle" }, document.createTextNode("▲ frente")),
  );
  return { svg, feet };
}

/** G1 visto de frente: su pie derecho queda a la izquierda de quien mira. */
function drawBiped() {
  const feet = {};
  const foot = (id, x) => (feet[id] = s("rect", { class: "cv-foot", x, y: 140, width: 28, height: 13, rx: 6.5, "data-down": "false" }));
  const svg = s(
    "svg",
    { class: "cv-robot", viewBox: "0 0 132 168", role: "img", "aria-label": "G1 visto de frente: su pie derecho está a la izquierda del dibujo" },
    s("path", { class: "cv-robot__leg", d: "M47 42 36 64 32 88M85 42l11 22 4 24M57 92l-3 24 -4 22M75 92l3 24 4 22" }),
    s("g", { class: "cv-robot__joint" }, ...[[36, 64], [96, 64], [54, 116], [78, 116]].map(([cx, cy]) => s("circle", { cx, cy, r: 3.5 }))),
    s("rect", { class: "cv-robot__body", x: 45, y: 34, width: 42, height: 50, rx: 12 }),
    s("rect", { class: "cv-robot__body", x: 50, y: 82, width: 32, height: 14, rx: 6 }),
    s("path", { class: "cv-robot__inner", d: "M58 52h16M58 60h16M58 68h16" }),
    s("circle", { class: "cv-robot__body", cx: 66, cy: 20, r: 11 }),
    s("rect", { class: "cv-robot__eye", x: 59, y: 17, width: 14, height: 4, rx: 2 }),
    foot("R_foot", 34), foot("L_foot", 70),
    s(
      "g",
      { class: "cv-robot__lbl" },
      s("text", { x: 22, y: 151, "text-anchor": "middle" }, document.createTextNode("R")),
      s("text", { x: 110, y: 151, "text-anchor": "middle" }, document.createTextNode("L")),
    ),
    s("text", { class: "cv-robot__caption", x: 66, y: 166, "text-anchor": "middle" }, document.createTextNode("vista de frente")),
  );
  return { svg, feet };
}

export class FeetPanel {
  constructor() {
    this.sub = h("span", { class: "cv-sub" }, "");
    this.body = h("div", { class: "cv-feet__body" });
    this.legs = [];
    this.el = h(
      "section",
      { class: "cv-panel cv-feet", "aria-labelledby": "cv-feet-title" },
      h("header", { class: "cv-ph" }, h("span", { class: "cv-ph__icon", html: icon("feet", { size: 16 }) }), h("h2", { id: "cv-feet-title" }, "Patas"), this.sub),
      this.body,
    );
  }

  /** Dibuja el robot y una fila por pata según `info.patas` (Go2: 4, G1: 2). */
  build(info) {
    const patas = spatialOrder(info.patas ?? []);
    if (!patas.length) {
      this.legs = [];
      this.body.replaceChildren(h("p", { class: "cv-empty" }, "Este robot no informa el contacto de las patas."));
      return;
    }
    const drawing = patas.length === 4 ? drawQuadruped() : drawBiped();
    this.legs = patas.map((pata) => {
      const cells = Array.from({ length: STRIP }, () => h("i", { "data-on": "false" }));
      const state = h("span", { class: "cv-legrow__st", "data-down": "false" }, "");
      const row = h(
        "div",
        { class: "cv-legrow", title: LEG_LABELS[pata] ?? pata },
        h("b", {}, SHORT[pata] ?? pata),
        h("div", { class: "cv-steps", "aria-hidden": "true" }, ...cells),
        state,
      );
      return { pata, row, cells, state, foot: drawing.feet[pata] };
    });
    this.body.replaceChildren(drawing.svg, h("div", { class: "cv-legs" }, ...this.legs.map((l) => l.row)));
  }

  update(frame, history) {
    if (!this.legs.length) return;
    const samples = history.tail(STRIP);
    const offset = STRIP - samples.length; // al principio hay menos de 40 muestras: se alinean a la derecha
    for (const leg of this.legs) {
      const down = frame.fuerzas[leg.pata] === 1;
      setAttr(leg.state, "data-down", down);
      setText(leg.state, down ? "apoyada" : "en el aire");
      if (leg.foot) setAttr(leg.foot, "data-down", down);
      for (let i = 0; i < STRIP; i++) {
        const f = samples[i - offset];
        setAttr(leg.cells[i], "data-on", f ? f.fuerzas[leg.pata] === 1 : false);
      }
    }
    const span = samples.length > 1 ? samples.at(-1).ts - samples[0].ts : 0;
    setText(this.sub, `${frame.derived.contacts} de ${frame.derived.legs} apoyadas · últimos ${Math.round(span)} s`);
  }
}
