import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { MotorChart, METRICS, MAX_SELECTED } from "../../js/views/console/MotorChart.js";
import { instalarChart, muestras, historial, conCambios } from "./helpers.js";

let creados;
let onMetric;
let root;
let mc;

beforeEach(() => {
  creados = instalarChart();
  onMetric = vi.fn();
  root = document.createElement("div");
  root.style.setProperty("--cv-s1", "#e11");
  root.style.setProperty("--cv-warn", "#fa0");
  root.style.setProperty("--cv-hot-band", "#f004");
  document.body.append(root);
  mc = new MotorChart({ root, onMetric });
  root.append(mc.el);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const checked = () => mc.metricButtons.map((b) => b.getAttribute("aria-checked"));

describe("MotorChart: constantes", () => {
  test("se grafican hasta 3 motores y cuatro magnitudes", () => {
    expect(MAX_SELECTED).toBe(3);
    expect(Object.keys(METRICS)).toEqual(["temperatura", "angulo", "velocidad", "torque"]);
    expect(METRICS.velocidad).toEqual({ label: "Velocidad", short: "Vel.", unit: "rad/s", decimals: 2 });
  });
});

describe("MotorChart: antes de init", () => {
  test("arma un botón por magnitud, con temperatura elegida", () => {
    expect(mc.metric).toBe("temperatura");
    expect(mc.metricButtons.map((b) => [b.textContent, b.title, b.dataset.metric])).toEqual([
      ["Temp.", "Temperatura", "temperatura"],
      ["Ángulo", "Ángulo", "angulo"],
      ["Vel.", "Velocidad", "velocidad"],
      ["Torque", "Torque", "torque"],
    ]);
    expect(checked()).toEqual(["true", "false", "false", "false"]);
    expect(mc.el.querySelector("canvas").getAttribute("aria-label")).toBe("Gráfico histórico de los motores elegidos");
  });

  test("tocar una magnitud la pide a la vista", () => {
    mc.metricButtons[3].click();
    expect(onMetric).toHaveBeenCalledExactlyOnceWith("torque");
  });

  test("setMetric, setSelection y update no fallan sin gráfico", () => {
    mc.setMetric("angulo");
    expect(mc.metric).toBe("angulo");
    expect(mc.title.textContent).toBe("Ángulo de los motores elegidos");
    expect(checked()).toEqual(["false", "true", "false", "false"]);
    mc.setSelection(["FR_calf"]);
    expect(mc.selected).toEqual(["FR_calf"]);
    const history = { tail: vi.fn(() => []) };
    mc.update(history, 18);
    expect(history.tail).not.toHaveBeenCalled();
    expect(creados).toHaveLength(0);
  });
});

describe("MotorChart: init", () => {
  beforeEach(() => mc.init());

  test("crea el gráfico con dos bandas del semáforo, dos líneas de umbral y tres series", () => {
    expect(creados).toHaveLength(1);
    const ds = mc.chart.data.datasets;
    expect(ds).toHaveLength(7);
    expect(ds.slice(0, 4).every((d) => d.$band)).toBe(true);
    expect(ds[0]).toMatchObject({ fill: { value: 60 }, $fill: "--cv-warn-band", borderWidth: 0 });
    expect(ds[1]).toMatchObject({ fill: "end", $fill: "--cv-hot-band", backgroundColor: "#f004" });
    expect(ds[2]).toMatchObject({ $color: "--cv-warn", borderDash: [4, 4], fill: false, borderColor: "#fa0" });
    expect(ds.slice(4).map((d) => d.$color)).toEqual(["--cv-s1", "--cv-s2", "--cv-s3"]);
    expect(ds[4].borderColor).toBe("#e11");
    expect(ds.slice(4).some((d) => d.$band)).toBe(false);
  });

  test("con temperatura muestra las bandas y fija la escala de 25 a 70 °C", () => {
    const y = mc.chart.options.scales.y;
    expect(y.title.text).toBe("°C");
    expect(y.suggestedMin).toBe(25);
    expect(y.suggestedMax).toBe(70);
    expect(mc.chart.data.datasets.slice(0, 4).map((d) => d.hidden)).toEqual([false, false, true, true]);
    expect(mc.title.textContent).toBe("Temperatura de los motores elegidos");
  });

  test("con torque muestra las líneas de umbral y la escala es libre", () => {
    mc.setMetric("torque");
    const y = mc.chart.options.scales.y;
    expect(y.title.text).toBe("N·m");
    expect(y.suggestedMin).toBeUndefined();
    expect(y.suggestedMax).toBeUndefined();
    expect(mc.chart.data.datasets.slice(0, 4).map((d) => d.hidden)).toEqual([true, true, false, false]);
    expect(checked()).toEqual(["false", "false", "false", "true"]);
  });

  test("con ángulo no muestra ni bandas ni umbral", () => {
    mc.setMetric("angulo");
    expect(mc.chart.data.datasets.slice(0, 4).map((d) => d.hidden)).toEqual([true, true, true, true]);
    expect(mc.chart.options.scales.y.title.text).toBe("°");
  });

  test("el tooltip ignora las bandas y muestra el valor con la unidad de la magnitud", () => {
    const tooltip = mc.chart.options.plugins.tooltip;
    const filter = tooltip.filter;
    const label = tooltip.callbacks.label;
    expect(filter({ dataset: { $band: true } })).toBe(false);
    expect(filter({ dataset: {} })).toBe(true);
    const item = { dataset: { label: "FR_calf" }, parsed: { y: 1.23456 } };
    expect(label(item)).toBe(" FR_calf: 1.2 °C");
    mc.setMetric("velocidad");
    expect(label(item)).toBe(" FR_calf: 1.23 rad/s");
  });

  test("setSelection rotula las series y oculta las que sobran", () => {
    mc.setSelection(["RL_calf", "FR_calf"]);
    expect(mc.chart.data.datasets.slice(4).map((d) => [d.label, d.hidden])).toEqual([
      ["RL_calf", false],
      ["FR_calf", false],
      ["", true],
    ]);
  });
});

describe("MotorChart: update", () => {
  const frames = muestras("go2", 30);
  beforeEach(() => {
    mc.init();
    mc.setSelection(["RL_calf", "FR_calf", "no_existe"]);
    mc.chart.update.mockClear();
  });

  test("con el historial vacío no dibuja", () => {
    mc.update(historial([]), 18);
    expect(mc.chart.update).not.toHaveBeenCalled();
  });

  test("grafica la magnitud de cada motor elegido, en segundos antes de la última muestra", () => {
    mc.update(historial(frames), 18);
    const ds = mc.chart.data.datasets;
    const last = frames.at(-1);
    const x0 = frames[0].ts - last.ts;
    const idx = last.motores.findIndex((m) => m.nombre === "RL_calf");
    expect(ds[4].data).toHaveLength(30);
    expect(ds[4].data.at(-1)).toEqual({ x: 0, y: last.motores[idx].temperatura });
    expect(ds[4].data[0]).toEqual({ x: x0, y: frames[0].motores[idx].temperatura });
    expect(ds[5].data).toHaveLength(30);
    expect(ds[6].data).toEqual([]);
    expect(ds[0].data).toEqual([{ x: x0, y: 40 }, { x: 0, y: 40 }]);
    expect(ds[1].data).toEqual([{ x: x0, y: 60 }, { x: 0, y: 60 }]);
    expect(ds[2].data).toEqual([{ x: x0, y: 18 }, { x: 0, y: 18 }]);
    expect(ds[3].data).toEqual([{ x: x0, y: -18 }, { x: 0, y: -18 }]);
    expect(mc.chart.options.scales.x.min).toBeCloseTo(x0);
    expect(mc.span.textContent).toBe(` · últimos ${Math.round(-x0)} s · tocá una fila para sumarla`);
    expect(mc.chart.update).toHaveBeenCalledExactlyOnceWith("none");
  });

  test("cambia de magnitud y vuelve a graficar", () => {
    mc.setMetric("torque");
    mc.update(historial(frames), 12.5);
    const idx = frames.at(-1).motores.findIndex((m) => m.nombre === "FR_calf");
    expect(mc.chart.data.datasets[5].data.map((p) => p.y)).toEqual(frames.map((f) => f.motores[idx].torque));
    expect(mc.chart.data.datasets[2].data[0].y).toBe(12.5);
  });

  test("con una sola muestra el eje X muestra al menos 1 s", () => {
    mc.update(historial(frames.slice(0, 1)), 18);
    expect(mc.chart.options.scales.x.min).toBe(-1);
    expect(mc.span.textContent).toBe(" · últimos 0 s · tocá una fila para sumarla");
  });

  test("las muestras viejas sin ese motor quedan como hueco (null)", () => {
    const sinMotores = conCambios(frames[0], { motores: [] });
    mc.update(historial([sinMotores, ...frames.slice(1)]), 18);
    expect(mc.chart.data.datasets[4].data[0].y).toBeNull();
    expect(mc.chart.data.datasets[4].data[1].y).not.toBeNull();
  });

  test("si el motor elegido deja de existir se vacía su serie", () => {
    mc.update(historial(frames), 18);
    expect(mc.chart.data.datasets[4].data.length).toBeGreaterThan(0);
    mc.setSelection(["otro", "FR_calf"]);
    mc.update(historial(frames), 18);
    expect(mc.chart.data.datasets[4].data).toEqual([]);
  });
});

describe("MotorChart: destroy", () => {
  test("destruye el gráfico y lo olvida", () => {
    mc.init();
    const chart = mc.chart;
    mc.destroy();
    expect(chart.destroy).toHaveBeenCalledOnce();
    expect(mc.chart).toBeNull();
    expect(() => mc.destroy()).not.toThrow();
  });
});
