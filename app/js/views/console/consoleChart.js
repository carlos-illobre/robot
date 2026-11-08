/**
 * Gráficos de la Consola sobre la fábrica común `createLineChart` (ui/charts.js).
 *
 * La fábrica arma el gráfico con la estética del dashboard; acá se le suman
 * dos cosas propias de esta vista:
 *  - los colores de la paleta de la Consola, que viven como variables CSS en
 *    `.view-console` (no en :root, para no pisar a las otras vistas);
 *  - un eje X relativo al último dato ("−10 s … ahora"), que se lee mejor que
 *    el `ts` absoluto del servidor.
 */
import { createLineChart, destroyChart } from "../../ui/charts.js";
import { fmt } from "../../ui/dom.js";

/**
 * Crea un gráfico de líneas con la paleta de la Consola.
 * Cada dataset puede declarar `$color` (variable CSS de la línea) y
 * `$fill` (variable CSS del relleno) para re-colorearse al cambiar el tema.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} root elemento que define las variables `--cv-*`
 * @param {object} cfg       la misma configuración que `createLineChart`
 */
export function createConsoleChart(canvas, root, cfg) {
  const chart = createLineChart(canvas, cfg);
  const { x } = chart.options.scales;
  x.title = { display: false };
  x.max = 0;
  x.grid.display = false; // solo líneas horizontales: se lee el valor, no el instante
  x.ticks.callback = (v) => (Math.abs(v) < 0.05 ? "ahora" : `${fmt(Number(v), 0)} s`);
  chart.options.plugins.tooltip.callbacks.title = (items) => {
    const ago = -Number(items[0]?.parsed.x);
    return ago < 0.05 ? "ahora" : `hace ${fmt(ago, 1)} s`;
  };
  // charts.js llama a $recolor cuando cambia el tema (después de aplicar sus colores).
  chart.$recolor = () => paintChart(chart, root);
  paintChart(chart, root);
  chart.update("none");
  return chart;
}

/** Aplica los colores actuales del tema a ejes, tooltip y series. */
export function paintChart(chart, root) {
  const css = getComputedStyle(root);
  const v = (name) => css.getPropertyValue(name).trim();
  const grid = v("--cv-line");
  const muted = v("--cv-text-3");

  for (const scale of Object.values(chart.options.scales)) {
    if (scale.grid) scale.grid.color = grid;
    if (scale.ticks) scale.ticks.color = muted;
    if (scale.title) scale.title.color = muted;
  }
  const tip = chart.options.plugins.tooltip;
  tip.backgroundColor = v("--cv-panel-2");
  tip.titleColor = tip.bodyColor = v("--cv-text");
  tip.borderColor = v("--cv-line-2");

  for (const ds of chart.data.datasets) {
    if (ds.$color) ds.borderColor = ds.pointBackgroundColor = v(ds.$color);
    if (ds.$fill) ds.backgroundColor = v(ds.$fill);
  }
}

/**
 * Convierte muestras del historial en puntos {x, y} con x = segundos antes de
 * la última muestra. Reutiliza `out` para no crear arrays nuevos a 10 Hz.
 * Si `wrap` es true (yaw en ±180°), corta la línea en el salto de +180 a −180
 * en vez de dibujar una raya vertical que cruza todo el gráfico.
 */
export function toPoints(samples, pick, out = [], { wrap = false } = {}) {
  out.length = 0;
  const last = samples.at(-1);
  if (!last) return out;
  let prev = null;
  for (const f of samples) {
    const x = f.ts - last.ts;
    if (x > 0) continue; // el servidor se reinició y el ts volvió a empezar
    const y = pick(f);
    if (wrap && prev !== null && Math.abs(y - prev) > 180) out.push({ x, y: null });
    out.push({ x, y });
    prev = y;
  }
  return out;
}

/** Destruye un gráfico de la Consola (lo saca también del registro de temas). */
export function destroyConsoleChart(chart) {
  destroyChart(chart);
}
