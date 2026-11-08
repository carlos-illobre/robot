import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ImuPanel } from "../../js/views/console/ImuPanel.js";
import { instalarChart, muestras, historial, conCambios } from "./helpers.js";

let creados;
let root;
let panel;

beforeEach(() => {
  creados = instalarChart();
  root = document.createElement("div");
  root.style.setProperty("--cv-s1", "#e11");
  document.body.append(root);
  panel = new ImuPanel({ root });
  root.append(panel.el);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const [base] = muestras("go2", 1, { desde: 8 });
const conImu = (imu) => conCambios(base, { imu: { ...base.imu, ...imu } });

describe("ImuPanel: construcción", () => {
  test("arma el panel con el horizonte, los valores y el gráfico de 150 muestras", () => {
    expect(panel.el.querySelector("#cv-imu-title").textContent).toBe("Inclinación (IMU)");
    expect(panel.sub.textContent).toBe("150 muestras");
    expect(panel.chips.map((c) => [c.textContent, c.getAttribute("aria-pressed")])).toEqual([
      ["Roll", "true"],
      ["Pitch", "true"],
      ["Yaw", "false"],
    ]);
    expect(Object.values(panel.value).map((v) => v.textContent)).toEqual(["—", "—", "—"]);
    const lbls = [...panel.el.querySelectorAll(".cv-stat__lbl")];
    expect(lbls.map((l) => l.textContent)).toEqual(["Roll", "Pitch", "Yaw"]);
    expect(lbls[0].querySelector(".cv-sw").style.background).toBe("var(--cv-s1)");
    expect(lbls[1].querySelector(".cv-sw").style.background).toBe("var(--cv-s2)");
    expect(lbls[2].querySelector("svg.cv-compass")).not.toBeNull();
    expect(panel.el.querySelector(".cv-hz__gain").textContent).toBe("×4");
    expect(panel.el.querySelectorAll(".cv-hz__ladder line")).toHaveLength(4);
    const ladder = [...panel.el.querySelectorAll(".cv-hz__ladder line")].map((l) => [l.getAttribute("x1"), l.getAttribute("y1")]);
    expect(ladder).toEqual([["-14", "-40"], ["-8", "-20"], ["-8", "20"], ["-14", "40"]]);
    expect(panel.canvas.getAttribute("aria-label")).toBe("Gráfico histórico de roll, pitch y yaw en grados");
  });
});

describe("ImuPanel: update sin gráfico", () => {
  test("escribe los valores y mueve el horizonte y la brújula aunque no haya gráfico", () => {
    const history = { tail: vi.fn(() => []) };
    panel.update(conImu({ roll: 2, pitch: -1, yaw: 45 }), history);
    expect(panel.value.roll.textContent).toBe("+2.0");
    expect(panel.value.pitch.textContent).toBe("−1.0");
    expect(panel.value.yaw.textContent).toBe("45");
    expect(panel.needle.getAttribute("transform")).toBe("rotate(-45.0)");
    expect(panel.horizon.world.getAttribute("transform")).toBe("rotate(-8.00) translate(0 4.00)");
    expect(history.tail).not.toHaveBeenCalled();
  });

  test("con el robot nivelado el horizonte queda quieto", () => {
    panel.update(conImu({ roll: 0, pitch: 0, yaw: -90 }), historial());
    expect(panel.value.roll.textContent).toBe(" 0.0");
    expect(panel.needle.getAttribute("transform")).toBe("rotate(90.0)");
    expect(panel.horizon.world.getAttribute("transform")).toBe("rotate(0.00) translate(0 0.00)");
  });
});

describe("ImuPanel: con gráfico", () => {
  beforeEach(() => panel.init());

  test("init arma tres series: roll y pitch a la izquierda, yaw punteado a la derecha y oculto", () => {
    expect(creados).toHaveLength(1);
    const chart = panel.chart;
    expect(chart.options.scales.y2.ticks.stepSize).toBe(90);
    expect(chart.options.scales.y2.display).toBe(false);
    expect(chart.options.scales.y.suggestedMin).toBe(-5);
    expect(chart.options.scales.y.suggestedMax).toBe(5);
    expect(chart.options.scales.y2.title.text).toBe("yaw °");
    expect(chart.data.datasets.map((d) => [d.label, d.yAxisID, d.hidden, d.borderWidth, d.borderDash, d.$color])).toEqual([
      ["Roll", "y", false, 2, undefined, "--cv-s1"],
      ["Pitch", "y", false, 2, undefined, "--cv-s2"],
      ["Yaw", "y2", true, 1.5, [5, 3], "--cv-s3"],
    ]);
    expect(chart.data.datasets[0].data).toBe(panel.points.roll);
    expect(chart.data.datasets[2].data).toBe(panel.points.yaw);
    expect(chart.data.datasets[0].borderColor).toBe("#e11");
    expect(chart.update).toHaveBeenLastCalledWith("none");
  });

  test("el tooltip muestra el ángulo con signo", () => {
    const label = panel.chart.options.plugins.tooltip.callbacks.label;
    expect(label({ dataset: { label: "Roll" }, parsed: { y: 1.26 } })).toBe(" Roll: +1.3°");
    expect(label({ dataset: { label: "Yaw" }, parsed: { y: -170 } })).toBe(" Yaw: −170.0°");
  });

  test("los chips prenden y apagan cada serie; el eje del yaw aparece con su serie", () => {
    const chart = panel.chart;
    chart.update.mockClear();
    panel.chips[0].click();
    expect(chart.data.datasets[0].hidden).toBe(true);
    expect(panel.chips[0].getAttribute("aria-pressed")).toBe("false");
    expect(chart.options.scales.y2.display).toBe(false);
    expect(chart.update).toHaveBeenCalledExactlyOnceWith("none");

    panel.chips[2].click();
    expect(chart.data.datasets[2].hidden).toBe(false);
    expect(panel.chips[2].getAttribute("aria-pressed")).toBe("true");
    expect(chart.options.scales.y2.display).toBe(true);

    panel.chips[2].click();
    expect(chart.options.scales.y2.display).toBe(false);
    panel.chips[0].click();
    expect(chart.data.datasets[0].hidden).toBe(false);
  });

  test("grafica roll, pitch y yaw del historial con el eje X ajustado a la ventana", () => {
    const frames = muestras("go2", 40, { desde: 8 });
    const chart = panel.chart;
    chart.update.mockClear();
    panel.update(frames.at(-1), historial(frames));
    expect(panel.points.roll.map((p) => p.y)).toEqual(frames.map((f) => f.imu.roll));
    expect(panel.points.pitch.map((p) => p.y)).toEqual(frames.map((f) => f.imu.pitch));
    expect(panel.points.yaw.filter((p) => p.y !== null)).toHaveLength(40);
    const span = frames.at(-1).ts - frames[0].ts;
    expect(chart.options.scales.x.min).toBeCloseTo(-span);
    expect(panel.sub.textContent).toBe(`40 muestras · ${span.toFixed(0)} s`);
    expect(chart.update).toHaveBeenCalledExactlyOnceWith("none");
  });

  test("usa como mucho las últimas 150 muestras", () => {
    const frames = muestras("go2", 160);
    panel.update(frames.at(-1), historial(frames));
    expect(panel.points.roll).toHaveLength(150);
    expect(panel.sub.textContent.startsWith("150 muestras")).toBe(true);
  });

  test("corta la línea del yaw cuando da la vuelta de +180 a −180", () => {
    const [a, b] = muestras("go2", 2);
    const frames = [conCambios(a, { imu: { ...a.imu, yaw: 179 } }), conCambios(b, { imu: { ...b.imu, yaw: -179 } })];
    panel.update(frames[1], historial(frames));
    expect(panel.points.yaw.map((p) => p.y)).toEqual([179, null, -179]);
  });

  test("con una sola muestra el eje X muestra al menos 1 s", () => {
    panel.update(base, historial([base]));
    expect(panel.chart.options.scales.x.min).toBe(-1);
    expect(panel.sub.textContent).toBe("1 muestras · 0 s");
  });

  test("destroy destruye el gráfico y lo olvida", () => {
    const chart = panel.chart;
    panel.destroy();
    expect(chart.destroy).toHaveBeenCalledOnce();
    expect(panel.chart).toBeNull();
  });
});
