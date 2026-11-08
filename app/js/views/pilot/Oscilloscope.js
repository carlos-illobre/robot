/**
 * Osciloscopio de roll y pitch (canvas 2D).
 *
 * Es el histórico de la IMU que pide la consigna (≥ 60 muestras): dibuja las
 * últimas 120 del historial compartido (`ctx.history`), con una escala
 * mínima en grados y las capturas marcadas encima. Va en canvas y no en
 * Chart.js porque se redibuja entero a 10 Hz y no necesita ejes, leyenda ni
 * tooltips: así cuesta casi nada.
 */
import { h, setText, fmt, cssVar } from "../../ui/dom.js";
import { signedDeg } from "./format.js";
import { HORIZON_GAIN } from "./instruments.js";

/** Muestras visibles: 120 a 10 Hz son 12 s, el doble del mínimo de la consigna. */
export const OSC_SAMPLES = 120;
/** Margen izquierdo para las marcas de la escala (px). */
const PAD_L = 34;
const PAD_T = 8;
const PAD_B = 16;

export class Oscilloscope {
  constructor() {
    this.canvas = h("canvas", { class: "pv-osc__canvas", role: "img", "aria-label": `Histórico de roll y pitch: últimas ${OSC_SAMPLES} muestras` });
    this.roll = h("output", { class: "pv-osc__num" }, "—");
    this.pitch = h("output", { class: "pv-osc__num" }, "—");
    this.yaw = h("output", { class: "pv-osc__num" }, "—");
    this.caption = h("span", { class: "pv-osc__caption pv-desk" }, "");
    this.el = h(
      "section",
      { class: "pv-osc", "aria-label": "IMU: roll, pitch y yaw" },
      h(
        "div",
        { class: "pv-osc__head" },
        h("span", { class: "pv-osc__item", "data-series": "roll" }, h("span", { class: "pv-label" }, "Roll"), this.roll),
        h("span", { class: "pv-osc__item", "data-series": "pitch" }, h("span", { class: "pv-label" }, "Pitch"), this.pitch),
        h("span", { class: "pv-osc__item", "data-series": "yaw" }, h("span", { class: "pv-label" }, "Yaw"), this.yaw),
        this.caption,
      ),
      this.canvas,
    );
    this.g = this.canvas.getContext("2d");
    this.size = { w: 0, h: 0 };
    this.last = null;
    this.ro = new ResizeObserver(() => this.#resize());
    this.ro.observe(this.canvas);
    this.readColors();
  }

  /** Los colores salen de las variables CSS de la vista: cambian con el tema. */
  readColors() {
    const v = (name) => cssVar(name, this.el);
    this.colors = { s1: v("--pv-s1"), s2: v("--pv-s2"), grid: v("--pv-hud-4"), text: v("--pv-hud-3"), accent: v("--pv-accent") };
    if (this.last) this.draw(...this.last);
  }

  #resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const hh = this.canvas.clientHeight;
    if (!w || !hh) return;
    this.size = { w, h: hh };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hh * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.last) this.draw(...this.last);
  }

  /**
   * @param {object[]} tail      últimas muestras del historial, en orden cronológico
   * @param {object[]} captures  `ctx.captures.samples` (para marcar las capturas)
   */
  draw(tail, captures) {
    this.last = [tail, captures];
    const cur = tail.at(-1);
    if (cur) {
      setText(this.roll, signedDeg(cur.imu.roll));
      setText(this.pitch, signedDeg(cur.imu.pitch));
      setText(this.yaw, `${fmt(cur.imu.yaw, 1)}°`);
      const secs = tail.length > 1 ? tail.at(-1).ts - tail[0].ts : 0;
      setText(this.caption, `${tail.length} muestras · ${fmt(secs, 0)} s · horizonte ×${HORIZON_GAIN}`);
    }

    const { w, h: hh } = this.size;
    if (!w) return;
    const g = this.g;
    const c = this.colors;
    g.clearRect(0, 0, w, hh);

    // Escala: ±6° como mínimo; si el robot se inclina más, crece de a 5°.
    let maxAbs = 0;
    for (const f of tail) maxAbs = Math.max(maxAbs, Math.abs(f.imu.roll), Math.abs(f.imu.pitch));
    const range = Math.max(6, Math.ceil((maxAbs * 1.1) / 5) * 5);
    const step = range <= 15 ? 5 : 10;
    const plotH = hh - PAD_T - PAD_B;
    const Y = (v) => PAD_T + plotH / 2 - (v / range) * (plotH / 2);
    const x0 = PAD_L;
    const x1 = w - 2;
    const X = (i) => x0 + ((OSC_SAMPLES - tail.length + i) / (OSC_SAMPLES - 1)) * (x1 - x0);

    g.font = '500 11px "JetBrains Mono", monospace';
    g.textAlign = "right";
    g.textBaseline = "middle";
    g.lineWidth = 1;
    for (let v = -Math.floor(range / step) * step; v <= range; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      g.strokeStyle = c.grid;
      g.setLineDash(v === 0 ? [] : [2, 4]);
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
      g.fillStyle = c.text;
      g.fillText(v === 0 ? "0°" : signedDeg(v, 0), x0 - 6, y);
    }
    g.setLineDash([]);

    // Capturas: línea y número; la grabación continua, como una franja sombreada.
    if (tail.length && captures.length) this.#drawCaptures(tail, captures, X, plotH);

    g.lineWidth = 1.6;
    g.lineJoin = "round";
    for (const [key, color] of [["roll", c.s1], ["pitch", c.s2]]) {
      g.strokeStyle = color;
      g.beginPath();
      tail.forEach((f, i) => (i ? g.lineTo(X(i), Y(f.imu[key])) : g.moveTo(X(i), Y(f.imu[key]))));
      g.stroke();
    }
  }

  #drawCaptures(tail, captures, X, plotH) {
    const g = this.g;
    const t0 = tail[0].receivedAt;
    const slot = (X(1) - X(0)) || 4;
    let j = tail.length - 1;
    g.fillStyle = this.colors.accent;
    g.strokeStyle = this.colors.accent;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = '700 11px "JetBrains Mono", monospace';
    // Se recorre desde la captura más nueva hacia atrás y se corta al salir de la ventana:
    // con miles de muestras grabadas, solo se miran las ~120 visibles.
    for (let k = captures.length - 1; k >= 0; k--) {
      const t = captures[k].frame.receivedAt;
      if (t < t0) break;
      while (j > 0 && tail[j].receivedAt > t) j--;
      if (tail[j].receivedAt !== t) continue;
      const x = X(j);
      if (captures[k].tipo === "manual") {
        g.globalAlpha = 1;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(Math.round(x) + 0.5, PAD_T - 2);
        g.lineTo(Math.round(x) + 0.5, PAD_T + plotH + 2);
        g.stroke();
        g.fillText(String(captures[k].n), x, PAD_T + plotH + PAD_B - 2);
      } else {
        g.globalAlpha = 0.14;
        g.fillRect(x - slot / 2, PAD_T, slot + 0.5, plotH);
      }
    }
    g.globalAlpha = 1;
  }

  destroy() {
    this.ro.disconnect();
  }
}
