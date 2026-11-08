/**
 * La articulación elegida: sus cuatro magnitudes en grande y la curva de su
 * temperatura con los umbrales del semáforo (40 y 60 °C) marcados.
 */
import { h, setText, fmt } from "../../ui/dom.js";
import { tempLevel, motorGroup, jointLabel, TEMP_THRESHOLDS } from "../../core/telemetryModel.js";
import { icon } from "../../ui/icons.js";

/** Muestras de la curva de temperatura (≈ 30 s a 10 Hz). */
const SPARK_SAMPLES = 300;

export class DetailPanel {
  constructor() {
    const value = (cls = "") => h("span", { class: `bd-detail__v bd-num ${cls}` }, "—");
    const unit = (u) => h("small", {}, u);
    this.name = h("span", {}, "—");
    this.where = h("small", {}, "");
    this.temp = value("bd-detail__v--big");
    this.ang = value();
    this.vel = value();
    this.tq = value();
    this.canvas = h("canvas", { class: "bd-spark", role: "img", "aria-label": "Temperatura de la articulación elegida en los últimos 30 segundos" });
    const cell = (k, v, u) => h("div", {}, h("div", { class: "bd-detail__k" }, k), h("div", {}, v, unit(u)));
    this.el = h(
      "section",
      { class: "bd-detail", "aria-labelledby": "bd-detail-title", "aria-live": "off" },
      h("h2", { class: "bd-eyebrow", id: "bd-detail-title", html: `${icon("cpu", { size: 14 })}<span>Articulación elegida</span>` }),
      h("p", { class: "bd-detail__name" }, this.name, this.where),
      h("div", { class: "bd-detail__grid" },
        cell("Temperatura", this.temp, "°C"),
        cell("Ángulo", this.ang, "°"),
        cell("Velocidad", this.vel, "rad/s"),
        cell("Torque", this.tq, "N·m")),
      this.canvas,
    );
    this.level = null;
  }

  /** @param {string} name  @param {number} index posición del motor en `frame.motores` */
  select(name, index) {
    this.selected = name;
    this.index = index;
    setText(this.name, name ?? "—");
    if (!name) return setText(this.where, "");
    const g = motorGroup(name);
    const part = jointLabel(name);
    setText(this.where, [g.key === "otros" ? null : g.label.replace(/^\w+ · /, ""), part].filter(Boolean).join(" · ").toLowerCase());
  }

  /** Busca el motor por posición y, si no coincide, por nombre. */
  #motor(frame) {
    const m = frame.motores[this.index];
    return m?.nombre === this.selected ? m : frame.motores.find((x) => x.nombre === this.selected);
  }

  /**
   * @param {object} frame
   * @param {object[]} history  muestras recientes en orden cronológico
   * @param {Record<string,string>} palette colores ya resueltos del tema
   */
  update(frame, history, palette) {
    const m = this.#motor(frame);
    if (!m) return;
    const level = tempLevel(m.temperatura);
    if (level !== this.level) {
      this.level = level;
      this.temp.dataset.level = level;
    }
    setText(this.temp, fmt(m.temperatura, 1));
    setText(this.ang, fmt(m.angulo, 1));
    setText(this.vel, fmt(m.velocidad, 2));
    setText(this.tq, fmt(m.torque, 1));
    this.#spark(history.slice(-SPARK_SAMPLES), palette);
  }

  #spark(frames, P) {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const x = c.getContext("2d");
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);

    const vals = [];
    for (const f of frames) {
      const m = f.motores[this.index]?.nombre === this.selected ? f.motores[this.index] : null;
      if (m) vals.push(m.temperatura);
    }
    // Escala que siempre muestra las dos líneas del semáforo y la curva entera.
    const lo = Math.min(25, ...vals) - 1;
    const hi = Math.max(70, ...vals) + 1;
    const right = W - 44; // lugar para los rótulos de los umbrales
    const Y = (v) => H - 3 - ((v - lo) / (hi - lo)) * (H - 6);

    x.font = `11px ${P.mono}`;
    x.textBaseline = "middle";
    x.setLineDash([3, 3]);
    x.lineWidth = 1;
    for (const [t, color] of [[TEMP_THRESHOLDS.warn, P.warn], [TEMP_THRESHOLDS.crit, P.crit]]) {
      x.strokeStyle = color;
      x.globalAlpha = 0.6;
      x.beginPath();
      x.moveTo(0, Y(t));
      x.lineTo(right, Y(t));
      x.stroke();
      x.globalAlpha = 1;
      x.fillStyle = P.muted;
      x.fillText(`${t} °C`, right + 6, Y(t));
    }
    x.setLineDash([]);
    if (vals.length < 2) return;
    x.strokeStyle = this.level === "crit" ? P.crit : P.ink;
    x.lineWidth = 1.8;
    x.lineJoin = "round";
    x.beginPath();
    // Anclada a la derecha ("ahora"): con pocas muestras la curva arranca a mitad de camino.
    const offset = SPARK_SAMPLES - vals.length;
    vals.forEach((v, i) => {
      const px = ((offset + i) / (SPARK_SAMPLES - 1)) * right;
      i ? x.lineTo(px, Y(v)) : x.moveTo(px, Y(v));
    });
    x.stroke();
  }
}
