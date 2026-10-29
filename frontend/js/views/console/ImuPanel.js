/**
 * Panel de la IMU: horizonte artificial, valores de roll / pitch / yaw y un
 * gráfico histórico con Chart.js (≥ 60 muestras, por consigna).
 *
 * Roll y pitch del robot caminando son de 1 a 3°: en un horizonte a escala
 * real casi no se moverían. Por eso el horizonte los exagera ×4, y lo dice.
 */
import { h, s, setText, fmt } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { DEFAULTS } from "../../config.js";
import { createConsoleChart, toPoints } from "./consoleChart.js";

/** Exageración del horizonte (está rotulada en el dibujo). */
const HORIZON_GAIN = 4;

/** Muestras del gráfico: 150 (≈ 15 s a 10 Hz), más que las 60 que pide la consigna. */
const WINDOW = Math.max(60, DEFAULTS.chartWindow);

const SERIES = [
  { key: "roll", label: "Roll", token: "--cv-s1", on: true },
  { key: "pitch", label: "Pitch", token: "--cv-s2", on: true },
  { key: "yaw", label: "Yaw", token: "--cv-s3", on: false },
];

export class ImuPanel {
  constructor({ root }) {
    this.root = root;
    this.points = { roll: [], pitch: [], yaw: [] };
    this.sub = h("span", { class: "cv-sub" }, `${WINDOW} muestras`);
    this.chips = SERIES.map((sr) =>
      h(
        "button",
        { type: "button", class: "cv-chip", "aria-pressed": String(sr.on), style: { "--c": `var(${sr.token})` }, onclick: (e) => this.#toggleSeries(sr.key, e.currentTarget) },
        h("i", { class: "cv-sw", "aria-hidden": "true" }),
        sr.label,
      ),
    );

    this.horizon = this.#buildHorizon();
    this.value = {};
    const stat = (key, label, extra = null) => {
      this.value[key] = h("span", {}, "—");
      return h(
        "div",
        { class: "cv-stat" },
        h("div", { class: "cv-stat__lbl" }, extra ?? h("i", { class: "cv-sw", style: { background: `var(--cv-s${key === "roll" ? 1 : 2})` }, "aria-hidden": "true" }), label),
        h("div", { class: "cv-stat__val num" }, this.value[key], h("small", {}, "°")),
      );
    };
    this.needle = s("g", {}, s("path", { d: "M0-9 3 0H-3Z", class: "cv-needle-n" }), s("path", { d: "M0 9 3 0H-3Z", class: "cv-needle-s" }));
    const compass = s("svg", { class: "cv-compass", viewBox: "-13 -13 26 26", "aria-hidden": "true" }, s("circle", { r: 11, class: "cv-compass__ring" }), this.needle);

    this.canvas = h("canvas", { role: "img", "aria-label": "Gráfico histórico de roll, pitch y yaw en grados" });
    this.el = h(
      "section",
      { class: "cv-panel cv-imu", "aria-labelledby": "cv-imu-title" },
      h(
        "header",
        { class: "cv-ph" },
        h("span", { class: "cv-ph__icon", html: icon("compass", { size: 16 }) }),
        h("h2", { id: "cv-imu-title" }, "Inclinación (IMU)"),
        this.sub,
        h("div", { class: "cv-chips", role: "group", "aria-label": "Series del gráfico" }, ...this.chips),
      ),
      h(
        "div",
        { class: "cv-imu__body" },
        this.horizon.el,
        h(
          "div",
          { class: "cv-imu__right" },
          h("div", { class: "cv-stats" }, stat("roll", "Roll"), stat("pitch", "Pitch"), stat("yaw", "Yaw", compass)),
          h("div", { class: "cv-chartbox" }, this.canvas),
        ),
      ),
    );
  }

  #buildHorizon() {
    const world = s(
      "g",
      { class: "cv-hz__world" },
      s("rect", { x: -200, y: -200, width: 400, height: 200, class: "cv-hz__sky" }),
      s("rect", { x: -200, y: 0, width: 400, height: 200, class: "cv-hz__ground" }),
      s("line", { x1: -200, x2: 200, y1: 0, y2: 0, class: "cv-hz__line" }),
      // Escalera de cabeceo: cada raya son 5° reales (20 unidades = 5° × 4).
      s("g", { class: "cv-hz__ladder" }, ...[-40, -20, 20, 40].map((y) => s("line", { x1: Math.abs(y) === 40 ? -14 : -8, x2: Math.abs(y) === 40 ? 14 : 8, y1: y, y2: y }))),
    );
    const svg = s(
      "svg",
      { viewBox: "-80 -80 160 160", role: "img", "aria-label": "Horizonte artificial: roll y pitch exagerados cuatro veces" },
      world,
      s("path", { d: "M-44 0h28l6 8 6-8h28", class: "cv-hz__plane" }),
      s("circle", { r: 2.5, class: "cv-hz__dot" }),
      s("text", { x: 0, y: -62, "text-anchor": "middle", class: "cv-hz__gain" }, document.createTextNode(`×${HORIZON_GAIN}`)),
    );
    return { el: h("div", { class: "cv-horizon" }, svg), world };
  }

  init() {
    this.chart = createConsoleChart(this.canvas, this.root, { yTitle: "roll / pitch [°]", y2: true, y2Title: "yaw [°]", yMin: -5, yMax: 5 });
    this.chart.options.scales.y2.ticks.stepSize = 90;
    this.chart.data.datasets = SERIES.map((sr) => ({
      label: sr.label,
      data: this.points[sr.key],
      $color: sr.token,
      yAxisID: sr.key === "yaw" ? "y2" : "y",
      borderDash: sr.key === "yaw" ? [5, 3] : undefined,
      borderWidth: sr.key === "yaw" ? 1.5 : 2,
      hidden: !sr.on,
    }));
    this.chart.options.scales.y2.display = SERIES[2].on;
    this.chart.options.plugins.tooltip.callbacks.label = (item) => ` ${item.dataset.label}: ${fmt(item.parsed.y, 1, { sign: true })}°`;
    this.chart.$recolor();
    this.chart.update("none");
  }

  #toggleSeries(key, btn) {
    const i = SERIES.findIndex((sr) => sr.key === key);
    const ds = this.chart.data.datasets[i];
    ds.hidden = !ds.hidden;
    btn.setAttribute("aria-pressed", String(!ds.hidden));
    if (key === "yaw") this.chart.options.scales.y2.display = !ds.hidden;
    this.chart.update("none");
  }

  update(frame, history) {
    const { roll, pitch, yaw } = frame.imu;
    setText(this.value.roll, fmt(roll, 1, { sign: true }));
    setText(this.value.pitch, fmt(pitch, 1, { sign: true }));
    setText(this.value.yaw, fmt(yaw, 0));
    // Yaw positivo = giro antihorario visto desde arriba; la aguja apunta hacia donde mira el robot.
    this.needle.setAttribute("transform", `rotate(${(-yaw).toFixed(1)})`);
    // Convención de la IMU (x adelante, y izquierda, z arriba): roll > 0 baja el lado derecho y
    // pitch > 0 baja la nariz. Como en un avión, el que se mueve es el horizonte, en sentido contrario.
    this.horizon.world.setAttribute("transform", `rotate(${(-roll * HORIZON_GAIN).toFixed(2)}) translate(0 ${(-pitch * HORIZON_GAIN).toFixed(2)})`);

    if (!this.chart) return;
    const samples = history.tail(WINDOW);
    toPoints(samples, (f) => f.imu.roll, this.points.roll);
    toPoints(samples, (f) => f.imu.pitch, this.points.pitch);
    toPoints(samples, (f) => f.imu.yaw, this.points.yaw, { wrap: true });
    const span = samples.length > 1 ? samples.at(-1).ts - samples[0].ts : 0;
    this.chart.options.scales.x.min = Math.min(-span, -1);
    setText(this.sub, `${samples.length} muestras · ${fmt(span, 0)} s`);
    this.chart.update("none");
  }

  destroy() {
    this.chart?.destroy();
    this.chart = null;
  }
}
