/**
 * Gráfico histórico de los motores elegidos en la tabla (hasta 3, cada uno
 * con el color de su casilla). Se elige la magnitud: temperatura, ángulo,
 * velocidad o torque. Muestra los últimos 60 s del historial compartido.
 *
 * Con temperatura se sombrean las zonas amarilla (40–60 °C) y roja (> 60 °C)
 * del semáforo; con torque se dibuja el umbral de alarma (± N·m).
 */
import { h, setText } from "../../ui/dom.js";
import { createConsoleChart, toPoints } from "./consoleChart.js";

export const MAX_SELECTED = 3;

/** Magnitudes graficables: campo del JSON, rótulo y unidad. */
export const METRICS = {
  temperatura: { label: "Temperatura", short: "Temp.", unit: "°C", decimals: 1 },
  angulo: { label: "Ángulo", short: "Ángulo", unit: "°", decimals: 1 },
  velocidad: { label: "Velocidad", short: "Vel.", unit: "rad/s", decimals: 2 },
  torque: { label: "Torque", short: "Torque", unit: "N·m", decimals: 1 },
};

/** Muestras del historial que se grafican: todo el buffer (≈ 60 s a 10 Hz). */
const WINDOW = 600;

export class MotorChart {
  /** @param {{ root: HTMLElement, onMetric: (m: string) => void }} opts */
  constructor({ root, onMetric }) {
    this.root = root;
    this.metric = "temperatura";
    this.selected = [];
    this.title = h("b", {}, "");
    this.span = h("span", { class: "cv-hide-phone" }, "");
    this.metricButtons = Object.entries(METRICS).map(([key, m]) =>
      h("button", { type: "button", role: "radio", "aria-checked": String(key === this.metric), title: m.label, dataset: { metric: key }, onclick: () => onMetric(key) }, m.short),
    );
    this.canvas = h("canvas", { role: "img", "aria-label": "Gráfico histórico de los motores elegidos" });
    this.el = h(
      "div",
      { class: "cv-mchart" },
      h(
        "div",
        { class: "cv-mchart__hdr" },
        h("span", { class: "cv-mchart__title" }, this.title, this.span),
        h("div", { class: "cv-seg cv-seg--sm", role: "radiogroup", "aria-label": "Magnitud del gráfico" }, ...this.metricButtons),
      ),
      h("div", { class: "cv-chartbox" }, this.canvas),
    );
  }

  /** Se crea después de montar: Chart.js necesita el canvas en el documento para medirlo. */
  init() {
    // Las zonas del semáforo y el umbral de torque son datasets "decorativos" ($band):
    // así se dibujan con el plugin de relleno que ya trae Chart.js, sin registrar plugins globales.
    const band = (fill, token) => ({ label: "", data: [], $band: true, $fill: token, borderWidth: 0, fill, pointRadius: 0, tension: 0 });
    const limit = () => ({ label: "", data: [], $band: true, $color: "--cv-warn", borderWidth: 1, borderDash: [4, 4], fill: false, tension: 0 });
    const series = (i) => ({ label: "", data: [], $color: `--cv-s${i + 1}`, borderWidth: 2, pointRadius: 0 });
    this.chart = createConsoleChart(this.canvas, this.root, { yTitle: "°C" });
    this.chart.data.datasets = [
      band({ value: 60 }, "--cv-warn-band"), // de 40 a 60 °C
      band("end", "--cv-hot-band"),          // de 60 °C hacia arriba
      limit(),
      limit(),
      series(0),
      series(1),
      series(2),
    ];
    this.chart.options.plugins.tooltip.filter = (item) => !item.dataset.$band;
    this.chart.options.plugins.tooltip.callbacks.label = (item) => {
      const m = METRICS[this.metric];
      return ` ${item.dataset.label}: ${item.parsed.y.toFixed(m.decimals)} ${m.unit}`;
    };
    this.chart.$recolor();
    this.setMetric(this.metric);
  }

  setSelection(names) {
    this.selected = names;
    this.chart?.data.datasets.slice(4).forEach((ds, i) => {
      ds.label = names[i] ?? "";
      ds.hidden = !names[i];
    });
  }

  setMetric(metric) {
    this.metric = metric;
    const m = METRICS[metric];
    for (const b of this.metricButtons) b.setAttribute("aria-checked", String(b.dataset.metric === metric));
    setText(this.title, `${m.label} de los motores elegidos`);
    if (!this.chart) return;
    const y = this.chart.options.scales.y;
    y.title.text = m.unit;
    // La temperatura tiene una escala fija para que la zona de alarma esté siempre a la vista.
    y.suggestedMin = metric === "temperatura" ? 25 : undefined;
    y.suggestedMax = metric === "temperatura" ? 70 : undefined;
    const ds = this.chart.data.datasets;
    ds[0].hidden = ds[1].hidden = metric !== "temperatura";
    ds[2].hidden = ds[3].hidden = metric !== "torque";
  }

  /**
   * @param {object[]} samples últimas muestras del historial (`history.tail`)
   * @param {number} torqueAlarm umbral para las líneas de alarma de torque
   */
  update(history, torqueAlarm) {
    if (!this.chart) return;
    const samples = history.tail(WINDOW);
    if (!samples.length) return;
    const ds = this.chart.data.datasets;
    const x0 = samples[0].ts - samples.at(-1).ts;
    const span = [x0, 0];
    ds[0].data = span.map((x) => ({ x, y: 40 }));
    ds[1].data = span.map((x) => ({ x, y: 60 }));
    ds[2].data = span.map((x) => ({ x, y: torqueAlarm }));
    ds[3].data = span.map((x) => ({ x, y: -torqueAlarm }));

    const last = samples.at(-1);
    for (let i = 0; i < MAX_SELECTED; i++) {
      const idx = last.motores.findIndex((m) => m.nombre === this.selected[i]);
      if (idx < 0) ds[4 + i].data.length = 0;
      else toPoints(samples, (f) => f.motores[idx]?.[this.metric] ?? null, ds[4 + i].data);
    }
    this.chart.options.scales.x.min = Math.min(x0, -1);
    setText(this.span, ` · últimos ${Math.round(-x0)} s · tocá una fila para sumarla`);
    this.chart.update("none");
  }

  destroy() {
    this.chart?.destroy();
    this.chart = null;
  }
}
