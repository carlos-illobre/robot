/**
 * Fábrica de gráficos Chart.js con la estética del dashboard.
 * Chart.js se carga localmente (vendor/) para funcionar sin internet.
 */
import { cssVar } from "./dom.js";
import { onThemeChange } from "./theme.js";

const charts = new Set();

/** Paleta categórica para series (motores). Ordenada para máximo contraste. */
export const SERIES_COLORS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
export const seriesColor = (i) => cssVar(SERIES_COLORS[i % SERIES_COLORS.length]);

function themeOptions() {
  const grid = cssVar("--grid");
  const muted = cssVar("--text-muted");
  return {
    grid,
    muted,
    font: { family: cssVar("--font-mono") || "monospace", size: 11 },
  };
}

/**
 * Crea un gráfico de líneas temporal (eje X = ts del servidor, en segundos).
 * @param {HTMLCanvasElement} canvas
 * @param {object} cfg { yTitle, y2Title, y2: boolean, yMin, yMax }
 */
export function createLineChart(canvas, cfg = {}) {
  const Chart = globalThis.Chart;
  if (!Chart) throw new Error("Chart.js no está cargado (vendor/chart.umd.min.js)");
  const t = themeOptions();
  const axis = (title, extra = {}) => ({
    grid: { color: t.grid, drawTicks: false },
    border: { display: false },
    ticks: { color: t.muted, font: t.font, padding: 6, maxTicksLimit: 6 },
    title: title ? { display: true, text: title, color: t.muted, font: t.font } : undefined,
    ...extra,
  });

  const chart = new Chart(canvas, {
    type: "line",
    data: { datasets: [] },
    options: {
      animation: false,           // a 10 Hz las animaciones solo agregan lag
      parsing: false,             // los datos ya vienen como {x, y}
      normalized: true,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      elements: { point: { radius: 0, hoverRadius: 3 }, line: { borderWidth: 2, tension: 0.25 } },
      scales: {
        x: axis("tiempo [s]", { type: "linear", ticks: { color: t.muted, font: t.font, maxTicksLimit: 7, callback: (v) => Number(v).toFixed(0) } }),
        y: axis(cfg.yTitle, { suggestedMin: cfg.yMin, suggestedMax: cfg.yMax }),
        ...(cfg.y2 ? { y2: axis(cfg.y2Title, { position: "right", min: -180, max: 180, grid: { display: false } }) } : {}),
      },
      plugins: {
        legend: { display: false },
        decimation: { enabled: false },
        tooltip: {
          backgroundColor: cssVar("--surface-2"),
          titleColor: cssVar("--text"),
          bodyColor: cssVar("--text"),
          borderColor: cssVar("--border"),
          borderWidth: 1,
          titleFont: t.font,
          bodyFont: t.font,
          callbacks: { title: (items) => `t = ${Number(items[0]?.parsed.x).toFixed(1)} s` },
        },
      },
    },
  });
  charts.add(chart);
  return chart;
}

/** Al cambiar de tema, re-colorea ejes y grillas de todos los gráficos. */
onThemeChange(() => {
  const t = themeOptions();
  for (const chart of charts) {
    for (const scale of Object.values(chart.options.scales)) {
      if (scale.grid) scale.grid.color = t.grid;
      if (scale.ticks) scale.ticks.color = t.muted;
      if (scale.title) scale.title.color = t.muted;
    }
    const tip = chart.options.plugins.tooltip;
    tip.backgroundColor = cssVar("--surface-2");
    tip.titleColor = tip.bodyColor = cssVar("--text");
    tip.borderColor = cssVar("--border");
    chart.$recolor?.();
    chart.update("none");
  }
});

/**
 * Sparkline sobre canvas: liviana (sin Chart.js) para tener 29 a 10 Hz.
 */
export function drawSparkline(canvas, values, { color, min, max, fill = true } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (!w || !hgt) return;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  if (values.length < 2) return;
  let lo = min ?? Math.min(...values);
  let hi = max ?? Math.max(...values);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const x = (i) => (i / (values.length - 1)) * (w - 2) + 1;
  const y = (v) => hgt - 2 - ((v - lo) / (hi - lo)) * (hgt - 4);
  ctx.beginPath();
  values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();
  if (fill) {
    ctx.lineTo(x(values.length - 1), hgt);
    ctx.lineTo(x(0), hgt);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, hgt);
    grad.addColorStop(0, color + "55");
    grad.addColorStop(1, color + "00");
    ctx.fillStyle = grad;
    ctx.fill();
  }
}
