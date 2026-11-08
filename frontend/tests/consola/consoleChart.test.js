import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createConsoleChart, paintChart, toPoints, destroyConsoleChart } from "../../js/views/console/consoleChart.js";
import { instalarChart } from "./helpers.js";

/** Elemento raíz con la paleta de la Consola como variables CSS. */
function raizConPaleta() {
  const root = document.createElement("div");
  const vars = {
    "--cv-line": "#111111",
    "--cv-text-3": "#333333",
    "--cv-panel-2": "#222222",
    "--cv-text": "#eeeeee",
    "--cv-line-2": "#444444",
    "--cv-s1": "#ff0000",
    "--cv-warn-band": "#ffee00",
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, ` ${v} `);
  document.body.append(root);
  return root;
}

let creados;
beforeEach(() => {
  creados = instalarChart();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("createConsoleChart", () => {
  test("crea un gráfico de líneas con el eje X relativo que termina en 0", () => {
    const root = raizConPaleta();
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const chart = createConsoleChart(canvas, root, { yTitle: "°C" });

    expect(creados).toHaveLength(1);
    expect(chart).toBe(creados[0]);
    expect(chart.canvas).toBe(canvas);
    expect(chart.config.type).toBe("line");
    const { x, y } = chart.options.scales;
    expect(x.title.display).toBe(false);
    expect(x.title.text).toBeUndefined();
    expect(x.max).toBe(0);
    expect(x.grid.display).toBe(false);
    expect(y.title.text).toBe("°C");
    expect(chart.update).toHaveBeenCalledExactlyOnceWith("none");
  });

  test("rotula el eje X en segundos y el último instante como «ahora»", () => {
    const chart = createConsoleChart(document.createElement("canvas"), raizConPaleta(), {});
    const tick = chart.options.scales.x.ticks.callback;
    expect(tick(0)).toBe("ahora");
    expect(tick(-0.04)).toBe("ahora");
    expect(tick(0.04)).toBe("ahora");
    expect(tick(-0.05)).toBe("0 s");
    expect(tick(-10)).toBe("−10 s");
    expect(tick("-20")).toBe("−20 s");
  });

  test("el título del tooltip dice cuánto hace de la muestra", () => {
    const chart = createConsoleChart(document.createElement("canvas"), raizConPaleta(), {});
    const title = chart.options.plugins.tooltip.callbacks.title;
    expect(title([{ parsed: { x: -2.5 } }])).toBe("hace 2.5 s");
    expect(title([{ parsed: { x: -0.05 } }])).toBe("hace 0.1 s");
    expect(title([{ parsed: { x: -0.04 } }])).toBe("ahora");
    expect(title([{ parsed: { x: 0 } }])).toBe("ahora");
    expect(title([])).toBe("hace — s");
  });

  test("pinta con la paleta de la raíz y $recolor la vuelve a aplicar", () => {
    const root = raizConPaleta();
    const chart = createConsoleChart(document.createElement("canvas"), root, {});
    expect(chart.options.scales.x.grid.color).toBe("#111111");
    expect(chart.options.plugins.tooltip.backgroundColor).toBe("#222222");

    chart.data.datasets = [{ $color: "--cv-s1" }];
    root.style.setProperty("--cv-line", "#abcdef");
    chart.$recolor();
    expect(chart.options.scales.y.grid.color).toBe("#abcdef");
    expect(chart.data.datasets[0].borderColor).toBe("#ff0000");
  });
});

describe("paintChart", () => {
  test("colorea ejes, tooltip y series según las variables CSS", () => {
    const root = raizConPaleta();
    const chart = {
      options: {
        scales: {
          x: { grid: {}, ticks: {}, title: {} },
          y: {}, // sin grilla, marcas ni título: no se toca
        },
        plugins: { tooltip: {} },
      },
      data: {
        datasets: [
          { $color: "--cv-s1" },
          { $fill: "--cv-warn-band" },
          { $color: "--cv-s1", $fill: "--cv-warn-band" },
          { borderColor: "fijo" },
        ],
      },
    };
    paintChart(chart, root);

    expect(chart.options.scales.x).toEqual({ grid: { color: "#111111" }, ticks: { color: "#333333" }, title: { color: "#333333" } });
    expect(chart.options.scales.y).toEqual({});
    expect(chart.options.plugins.tooltip).toEqual({ backgroundColor: "#222222", titleColor: "#eeeeee", bodyColor: "#eeeeee", borderColor: "#444444" });
    const [a, b, c, d] = chart.data.datasets;
    expect(a).toEqual({ $color: "--cv-s1", borderColor: "#ff0000", pointBackgroundColor: "#ff0000" });
    expect(b).toEqual({ $fill: "--cv-warn-band", backgroundColor: "#ffee00" });
    expect(c.borderColor).toBe("#ff0000");
    expect(c.backgroundColor).toBe("#ffee00");
    expect(d).toEqual({ borderColor: "fijo" });
  });
});

describe("toPoints", () => {
  const f = (ts, v) => ({ ts, v });

  test("sin muestras devuelve la misma lista vacía", () => {
    const out = [{ x: 1, y: 1 }];
    expect(toPoints([], (s) => s.v, out)).toBe(out);
    expect(out).toEqual([]);
    expect(toPoints([], (s) => s.v)).toEqual([]);
  });

  test("x son los segundos antes de la última muestra", () => {
    const out = toPoints([f(10, 1), f(10.5, 2), f(12, 3)], (s) => s.v);
    expect(out).toEqual([{ x: -2, y: 1 }, { x: -1.5, y: 2 }, { x: 0, y: 3 }]);
  });

  test("reutiliza la lista recibida", () => {
    const out = [{ x: 9, y: 9 }, { x: 8, y: 8 }, { x: 7, y: 7 }];
    const r = toPoints([f(1, 5)], (s) => s.v, out);
    expect(r).toBe(out);
    expect(out).toEqual([{ x: 0, y: 5 }]);
  });

  test("descarta las muestras posteriores a la última (el servidor reinició el ts)", () => {
    const out = toPoints([f(50, 1), f(51, 2), f(0.5, 3), f(1, 4)], (s) => s.v);
    expect(out).toEqual([{ x: -0.5, y: 3 }, { x: 0, y: 4 }]);
  });

  test("con wrap corta la línea en el salto de +180 a −180", () => {
    const s = [f(0, 170), f(1, 179), f(2, -179), f(3, -170)];
    expect(toPoints(s, (x) => x.v, [], { wrap: true })).toEqual([
      { x: -3, y: 170 },
      { x: -2, y: 179 },
      { x: -1, y: null },
      { x: -1, y: -179 },
      { x: 0, y: -170 },
    ]);
  });

  test("con wrap no corta saltos de 180° o menos", () => {
    const s = [f(0, 90), f(1, -90), f(2, 0)];
    expect(toPoints(s, (x) => x.v, [], { wrap: true })).toEqual([{ x: -2, y: 90 }, { x: -1, y: -90 }, { x: 0, y: 0 }]);
  });

  test("sin wrap une los saltos grandes", () => {
    const s = [f(0, 179), f(1, -179)];
    expect(toPoints(s, (x) => x.v)).toEqual([{ x: -1, y: 179 }, { x: 0, y: -179 }]);
  });
});

describe("destroyConsoleChart", () => {
  test("destruye el gráfico", () => {
    const chart = createConsoleChart(document.createElement("canvas"), raizConPaleta(), {});
    destroyConsoleChart(chart);
    expect(chart.destroy).toHaveBeenCalledOnce();
  });

  test("no falla sin gráfico", () => {
    expect(() => destroyConsoleChart(null)).not.toThrow();
  });
});
