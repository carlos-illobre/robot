/**
 * Anillo de motores alrededor de la silueta del robot (SVG).
 *
 * Cada motor es un segmento ubicado en el cuadrante de su pata (Go2) o de su
 * miembro (G1), pintado con el semáforo de temperatura. Un arco interior,
 * más grueso cuanto más torque, muestra el esfuerzo. Las patas (o pies) se
 * encienden al apoyar.
 *
 * Todo el SVG se crea en `build(info)`; `update(frame)` solo cambia
 * atributos y textos, y solo cuando el valor cambió.
 */
import { s, setText, fmt } from "../../ui/dom.js";
import { tempLevel, LEG_LABELS } from "../../core/telemetryModel.js";
import { RING_R as R, layoutRing, layoutFeet, polar, arcPath } from "./ringLayout.js";

/** Cuántas etiquetas de motor caliente se muestran a la vez (más, se pisan). */
const MAX_CALLOUTS = 3;
/** Distancia al centro de la silueta donde terminan las patas dibujadas. */
const LEG_REACH = R - 44;

export class MotorRing {
  /**
   * @param {{ onSelect: (name: string) => void }} opts
   */
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.byName = new Map();
    this.feet = new Map();
    this.selected = null;
    this.svg = s("svg", {
      class: "pv-ring__svg",
      viewBox: "-250 -250 500 500",
      role: "img",
      "aria-label": "Anillo de motores: cada segmento es un motor con el color de su temperatura",
    });
  }

  /** Reconstruye el anillo para el robot conectado (Go2 ↔ G1). */
  build(info) {
    const names = info?.motores_nombres ?? [];
    const legs = info?.patas ?? [];
    const { kind, segments, groups } = layoutRing(names);
    this.kind = kind;
    this.byName.clear();
    this.feet.clear();

    const guides = s(
      "g",
      { class: "pv-ring__guides", "aria-hidden": "true" },
      s("circle", { r: R + 14, class: "pv-ring__outer" }),
      s("circle", { r: R - 30, class: "pv-ring__inner" }),
    );

    const silhouette = this.#silhouette(kind, legs);
    this.stateText = s("text", { class: "pv-ring__state", x: 0, y: kind === "humanoide" ? -6 : 4, "text-anchor": "middle" }, "—");
    silhouette.append(this.stateText);

    const segLayer = s("g", { class: "pv-ring__segments" });
    const calloutLayer = s("g", { class: "pv-ring__callouts", "aria-hidden": "true" });
    for (const seg of segments) {
      const d = arcPath(R, seg.a0, seg.a1);
      const main = s("path", { class: "pv-seg__main", d });
      const g = s(
        "g",
        { class: "pv-seg", "data-level": "unknown", "data-name": seg.name },
        s("title", {}, seg.name),
        s("path", { class: "pv-seg__glow", d }),
        main,
        s("path", { class: "pv-seg__torque", d: arcPath(R - 18, seg.a0, seg.a1) }),
        s("path", { class: "pv-seg__pick", d: arcPath(R + 22, seg.a0, seg.a1) }),
      );
      g.addEventListener("click", () => this.onSelect(seg.name));
      segLayer.append(g);

      const callout = this.#callout(seg);
      calloutLayer.append(callout.g);
      this.byName.set(seg.name, {
        g,
        torque: g.querySelector(".pv-seg__torque"),
        callout,
        level: "unknown",
        torqueW: "",
        over: false,
        temp: NaN,
      });
    }

    // En el humanoide los grupos no son patas: se rotulan por dentro del anillo.
    const groupLabels = s("g", { class: "pv-ring__groups", "aria-hidden": "true" });
    if (kind === "humanoide") {
      for (const g of groups) {
        const [x, y] = polar(R - 46, g.mid);
        groupLabels.append(s("text", { x: x.toFixed(1), y: (y + 4).toFixed(1), "text-anchor": "middle" }, g.short));
      }
    }

    const feetLayer = s("g", { class: "pv-ring__feet" });
    for (const foot of layoutFeet(legs)) {
      const [cx, cy] = polar(R + 40, foot.angle);
      const [lx, ly] = polar(R + 66, foot.angle);
      const g = s(
        "g",
        { class: "pv-foot", "data-contact": "0" },
        s("title", {}, LEG_LABELS[foot.leg] ?? foot.leg),
        s("circle", { class: "pv-foot__ring", cx: cx.toFixed(1), cy: cy.toFixed(1), r: 11 }),
        // El relleno es un círculo aparte: "encenderlo" es animar solo su opacidad.
        s("circle", { class: "pv-foot__dot", cx: cx.toFixed(1), cy: cy.toFixed(1), r: 11 }),
        s("text", { x: lx.toFixed(1), y: (ly + 5).toFixed(1), "text-anchor": "middle" }, foot.label),
      );
      feetLayer.append(g);
      this.feet.set(foot.leg, { g, line: silhouette.querySelector(`[data-leg="${foot.leg}"]`), contact: -1 });
    }
    if (!legs.length) {
      feetLayer.append(s("text", { class: "pv-ring__nofeet", x: 0, y: R + 56, "text-anchor": "middle" }, `${(info?.modelo ?? "").toUpperCase()} · SIN DATOS DE PATAS`));
    }

    this.svg.replaceChildren(guides, silhouette, groupLabels, segLayer, feetLayer, calloutLayer);
    this.setSelected(this.byName.has(this.selected) ? this.selected : null);
  }

  /** Silueta del robot: Go2 visto desde arriba, G1 visto desde atrás. */
  #silhouette(kind, legs) {
    const g = s("g", { class: "pv-silhouette", "aria-hidden": "true" });
    const feet = new Map(layoutFeet(legs).map((f) => [f.leg, f.angle]));
    const leg = (name, x0, y0, fallback) => {
      const [x1, y1] = feet.has(name) ? polar(LEG_REACH, feet.get(name)) : fallback;
      return s("line", { class: "pv-silhouette__leg", "data-leg": name, x1: x0, y1: y0, x2: x1.toFixed(1), y2: y1.toFixed(1) });
    };

    if (kind === "cuadrupedo") {
      const d = LEG_REACH * Math.SQRT1_2;
      g.append(
        leg("FL", -26, -54, [-d, -d]),
        leg("FR", 26, -54, [d, -d]),
        leg("RL", -26, 54, [-d, d]),
        leg("RR", 26, 54, [d, d]),
        s("rect", { class: "pv-silhouette__body", x: -30, y: -66, width: 60, height: 132, rx: 18 }),
        s("rect", { class: "pv-silhouette__body", x: -18, y: -86, width: 36, height: 22, rx: 9 }),
      );
    } else {
      g.append(
        s("line", { class: "pv-silhouette__limb", x1: -34, y1: -40, x2: -58, y2: 22 }),
        s("line", { class: "pv-silhouette__limb", x1: 34, y1: -40, x2: 58, y2: 22 }),
        leg("L_foot", -14, 32, [-18, 100]),
        leg("R_foot", 14, 32, [18, 100]),
        s("circle", { class: "pv-silhouette__body", cx: 0, cy: -70, r: 16 }),
        s("rect", { class: "pv-silhouette__body", x: -30, y: -50, width: 60, height: 84, rx: 16 }),
      );
    }
    return g;
  }

  /** Etiqueta de motor caliente: línea guía desde el segmento + temperatura + nombre. */
  #callout(seg) {
    const [x1, y1] = polar(R + 26, seg.mid);
    const [x2, y2] = polar(R + 62, seg.mid);
    const right = Math.cos((seg.mid * Math.PI) / 180) >= 0;
    const x3 = x2 + (right ? 22 : -22);
    const tx = x3 + (right ? 6 : -6);
    const anchor = right ? "start" : "end";
    const temp = s("text", { class: "pv-callout__temp", x: tx.toFixed(1), y: (y2 + 3).toFixed(1), "text-anchor": anchor }, "");
    const g = s(
      "g",
      { class: "pv-callout", visibility: "hidden", "data-level": "unknown" },
      s("polyline", { points: `${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y2.toFixed(1)}` }),
      temp,
      s("text", { class: "pv-callout__name", x: tx.toFixed(1), y: (y2 + 22).toFixed(1), "text-anchor": anchor }, seg.name),
    );
    return { g, temp, on: false, level: "unknown" };
  }

  /** Marca un motor (desde el anillo o la tabla). `null` desmarca. */
  setSelected(name) {
    this.selected = name;
    for (const [n, e] of this.byName) {
      const on = n === name;
      e.g.toggleAttribute("data-selected", on);
      e.callout.g.toggleAttribute("data-selected", on);
    }
  }

  /**
   * @param {object} frame  muestra normalizada
   * @param {{ torqueRef: number }} opts  torque (N·m) que llena el arco: el umbral de alarma
   */
  update(frame, { torqueRef }) {
    for (const m of frame.motores) {
      const e = this.byName.get(m.nombre);
      if (!e) continue;
      e.temp = m.temperatura;
      const level = tempLevel(m.temperatura);
      if (level !== e.level) {
        e.g.setAttribute("data-level", level);
        e.level = level;
      }
      const tau = Math.abs(m.torque);
      const width = (2 + Math.min(1, tau / torqueRef) * 8).toFixed(1);
      if (width !== e.torqueW) {
        e.torque.setAttribute("stroke-width", width);
        e.torqueW = width;
      }
      const over = tau > torqueRef;
      if (over !== e.over) {
        e.g.toggleAttribute("data-torque-alarm", over);
        e.over = over;
      }
    }
    this.#updateCallouts(frame);

    for (const [leg, foot] of this.feet) {
      const contact = frame.fuerzas[leg] === 1 ? 1 : 0;
      if (contact === foot.contact) continue;
      foot.contact = contact;
      foot.g.setAttribute("data-contact", String(contact));
      foot.line?.setAttribute("data-contact", String(contact));
    }
    setText(this.stateText, frame.derived.isMoving ? "CAMINA" : "QUIETO");
  }

  /** Rotula los motores sobre 60 °C (los más calientes primero), el elegido, o si no el más caliente. */
  #updateCallouts(frame) {
    const hot = [...this.byName.entries()]
      .filter(([, e]) => e.level === "crit")
      .sort((a, b) => b[1].temp - a[1].temp)
      .slice(0, MAX_CALLOUTS)
      .map(([n]) => n);
    const shown = new Set(hot.length ? hot : [frame.derived.tempMax?.motor]);
    if (this.selected) shown.add(this.selected);

    for (const [name, e] of this.byName) {
      const c = e.callout;
      const on = shown.has(name);
      if (on !== c.on) {
        c.g.setAttribute("visibility", on ? "visible" : "hidden");
        c.on = on;
      }
      if (!on) continue;
      setText(c.temp, `${fmt(e.temp, 1)}°`);
      if (c.level !== e.level) {
        c.g.setAttribute("data-level", e.level);
        c.level = e.level;
      }
    }
  }
}
