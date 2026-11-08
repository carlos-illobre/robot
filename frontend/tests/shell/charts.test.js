import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createLineChart, destroyChart, drawSparkline, seriesColor, SERIES_COLORS } from "../../js/ui/charts.js";
import { applyTheme } from "../../js/ui/theme.js";
import { contexto2d, conTamano } from "./helpers.js";

/** Doble de Chart.js: guarda la configuración y llama a los plugins al destruirse. */
class FakeChart {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.options = config.options;
    this.update = vi.fn();
    this.destroy = vi.fn(() => config.plugins.forEach((p) => p.afterDestroy?.(this)));
  }
}

const root = document.documentElement;
let tema = 0;
/** Cambia el tema (alternando) para disparar el re-coloreo de los gráficos. */
const cambiarTema = () => applyTheme(`tema-${++tema}`);

// happy-dom no hereda las variables CSS: se ponen en el propio canvas.
const SHELL = "--shell-border: #111; --shell-muted: #222; --shell-surface-2: #333; --shell-text: #444";
const canvasEnPagina = (vars = "") => {
  const c = document.createElement("canvas");
  c.setAttribute("style", `${SHELL}; ${vars}`);
  document.body.append(c);
  return c;
};

beforeEach(() => {
  globalThis.Chart = FakeChart;
});
afterEach(() => {
  delete globalThis.Chart;
  root.removeAttribute("style");
  document.body.replaceChildren();
});

describe("colores de series", () => {
  test("hay ocho variables de color y se repiten en ciclo", () => {
    expect(SERIES_COLORS).toEqual(["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"]);
    root.style.setProperty("--s1", "#a00");
    root.style.setProperty("--s3", "#0a0");
    expect(seriesColor(0)).toBe("#a00");
    expect(seriesColor(8)).toBe("#a00");
    expect(seriesColor(10)).toBe("#0a0");
  });

  test("seriesColor() lee la variable del elemento pedido", () => {
    const el = canvasEnPagina("--s2: #00f");
    expect(seriesColor(1, el)).toBe("#00f");
    expect(seriesColor(1)).toBe("");
  });
});

describe("createLineChart()", () => {
  test("sin Chart.js cargado tira un error claro", () => {
    delete globalThis.Chart;
    expect(() => createLineChart(canvasEnPagina())).toThrow("Chart.js no está cargado (vendor/chart.umd.min.js)");
  });

  test("crea un gráfico de líneas sin animación con los colores de la barra común", () => {
    const canvas = canvasEnPagina();
    const chart = createLineChart(canvas);
    expect(chart).toBeInstanceOf(FakeChart);
    expect(chart.canvas).toBe(canvas);
    const { type, data, options, plugins } = chart.config;
    expect(type).toBe("line");
    expect(data).toEqual({ datasets: [] });
    expect(plugins.map((p) => p.id)).toEqual(["tp05-forget"]);
    expect(options).toMatchObject({
      animation: false,
      parsing: false,
      normalized: true,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", axis: "x", intersect: false },
      elements: { point: { radius: 0, hoverRadius: 3 }, line: { borderWidth: 2, tension: 0.25 } },
    });
    const font = { family: "monospace", size: 11 };
    expect(options.scales.x).toEqual({
      grid: { color: "#111", drawTicks: false },
      border: { display: false },
      ticks: { color: "#222", font, maxTicksLimit: 7, callback: expect.any(Function) },
      title: { display: true, text: "tiempo [s]", color: "#222", font },
      type: "linear",
    });
    expect(options.scales.y).toEqual({
      grid: { color: "#111", drawTicks: false },
      border: { display: false },
      ticks: { color: "#222", font, padding: 6, maxTicksLimit: 6 },
      title: undefined,
      suggestedMin: undefined,
      suggestedMax: undefined,
    });
    expect(options.scales.y2).toBeUndefined();
    expect(options.plugins.legend).toEqual({ display: false });
    expect(options.plugins.decimation).toEqual({ enabled: false });
    expect(options.plugins.tooltip).toMatchObject({
      backgroundColor: "#333",
      titleColor: "#444",
      bodyColor: "#444",
      borderColor: "#111",
      borderWidth: 1,
      titleFont: font,
      bodyFont: font,
    });
  });

  test("los colores propios de la vista tienen prioridad sobre los de la barra", () => {
    const canvas = canvasEnPagina("--grid: g; --text-muted: m; --surface-2: s; --text: t; --border: b; --font-mono: Mono");
    const { options } = createLineChart(canvas).config;
    expect(options.scales.x.grid.color).toBe("g");
    expect(options.scales.x.ticks.color).toBe("m");
    expect(options.scales.x.ticks.font).toEqual({ family: "Mono", size: 11 });
    expect(options.plugins.tooltip).toMatchObject({ backgroundColor: "s", titleColor: "t", bodyColor: "t", borderColor: "b" });
  });

  test("con títulos, límites y segundo eje en grados", () => {
    const { options } = createLineChart(canvasEnPagina(), { yTitle: "N·m", y2Title: "°", y2: true, yMin: -5, yMax: 5 }).config;
    expect(options.scales.y.title).toEqual({ display: true, text: "N·m", color: "#222", font: { family: "monospace", size: 11 } });
    expect(options.scales.y.suggestedMin).toBe(-5);
    expect(options.scales.y.suggestedMax).toBe(5);
    expect(options.scales.y2).toMatchObject({ position: "right", min: -180, max: 180, grid: { display: false } });
    expect(options.scales.y2.title.text).toBe("°");
  });

  test("el eje X muestra segundos enteros y el tooltip el tiempo con un decimal", () => {
    const { options } = createLineChart(canvasEnPagina()).config;
    expect(options.scales.x.ticks.callback(12.6)).toBe("13");
    expect(options.scales.x.ticks.callback("3")).toBe("3");
    const title = options.plugins.tooltip.callbacks.title;
    expect(title([{ parsed: { x: 4.26 } }, { parsed: { x: 9 } }])).toBe("t = 4.3 s");
    expect(title([])).toBe("t = NaN s");
  });
});

describe("cambio de tema", () => {
  test("re-colorea ejes, grilla y tooltip de los gráficos en pantalla", () => {
    const canvas = canvasEnPagina();
    const chart = createLineChart(canvas, { yTitle: "x", y2: true, y2Title: "°" });
    chart.$recolor = vi.fn();
    canvas.setAttribute("style", "--font-mono: X; --grid: G; --text-muted: M; --surface-2: S; --text: T; --border: B");
    cambiarTema();
    for (const axis of ["x", "y", "y2"]) {
      expect(chart.options.scales[axis].ticks.color, axis).toBe("M");
      expect(chart.options.scales[axis].title.color, axis).toBe("M");
    }
    expect(chart.options.scales.x.grid.color).toBe("G");
    expect(chart.options.scales.y2.grid.color).toBe("G");
    expect(chart.options.plugins.tooltip).toMatchObject({ backgroundColor: "S", titleColor: "T", bodyColor: "T", borderColor: "B" });
    expect(chart.$recolor).toHaveBeenCalledTimes(1);
    expect(chart.update).toHaveBeenCalledExactlyOnceWith("none");
  });

  test("tolera escalas sin grilla, sin ticks, sin título y gráficos sin $recolor", () => {
    const chart = createLineChart(canvasEnPagina());
    chart.options.scales = { a: {}, b: { title: undefined } };
    cambiarTema();
    expect(chart.options.scales).toEqual({ a: {}, b: { title: undefined } });
    expect(chart.update).toHaveBeenCalledWith("none");
  });

  test("olvida los gráficos cuyo canvas ya no está en la página", () => {
    const canvas = canvasEnPagina();
    const chart = createLineChart(canvas);
    canvas.remove();
    cambiarTema();
    expect(chart.update).not.toHaveBeenCalled();
    document.body.append(canvas);
    cambiarTema();
    expect(chart.update).not.toHaveBeenCalled();
  });

  test("olvida los gráficos sin canvas", () => {
    const chart = createLineChart(canvasEnPagina());
    chart.canvas = null;
    cambiarTema();
    expect(chart.update).not.toHaveBeenCalled();
  });

  test("un gráfico destruido por Chart.js deja de recibir el cambio de tema", () => {
    const a = createLineChart(canvasEnPagina());
    const b = createLineChart(canvasEnPagina());
    a.destroy();
    cambiarTema();
    expect(a.update).not.toHaveBeenCalled();
    expect(b.update).toHaveBeenCalledTimes(1);
    b.destroy();
  });
});

describe("destroyChart()", () => {
  test("destruye el gráfico y lo saca del registro", () => {
    const chart = createLineChart(canvasEnPagina());
    chart.destroy = vi.fn(); // sin el plugin: solo destroyChart lo saca del registro
    destroyChart(chart);
    expect(chart.destroy).toHaveBeenCalledTimes(1);
    cambiarTema();
    expect(chart.update).not.toHaveBeenCalled();
  });

  test("con null o undefined no hace nada", () => {
    expect(() => destroyChart(null)).not.toThrow();
    expect(() => destroyChart(undefined)).not.toThrow();
  });
});

describe("drawSparkline()", () => {
  let ctx;
  const sparkCanvas = (width, height, attrs = {}) => {
    const c = conTamano(document.createElement("canvas"), { width, height });
    Object.assign(c, attrs);
    ctx = contexto2d(vi);
    c.getContext = vi.fn(() => ctx);
    return c;
  };

  afterEach(() => vi.unstubAllGlobals());

  test("sin tamaño de layout no dibuja", () => {
    const sinAncho = sparkCanvas(0, 20);
    drawSparkline(sinAncho, [1, 2]);
    expect(sinAncho.getContext).not.toHaveBeenCalled();
    const sinAlto = sparkCanvas(50, 0);
    drawSparkline(sinAlto, [1, 2]);
    expect(sinAlto.getContext).not.toHaveBeenCalled();
  });

  test("ajusta el tamaño del canvas a la densidad de píxeles", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const c = sparkCanvas(50.4, 20.2);
    drawSparkline(c, [1]);
    expect(c.width).toBe(101);
    expect(c.height).toBe(40);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 50.4, 20.2);
  });

  test("si el canvas ya tiene el ancho justo no lo redimensiona", () => {
    vi.stubGlobal("devicePixelRatio", 0); // sin dato: se usa 1
    const c = sparkCanvas(50, 20, { width: 50, height: 7 });
    drawSparkline(c, [1, 2]);
    expect(c.height).toBe(7);
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  test("con menos de dos valores solo limpia", () => {
    const c = sparkCanvas(50, 20);
    drawSparkline(c, [3]);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.beginPath).not.toHaveBeenCalled();
    drawSparkline(c, []);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  test("traza la línea entre el mínimo y el máximo y la rellena con degradé", () => {
    const c = sparkCanvas(52, 24);
    drawSparkline(c, [0, 10, 5], { color: "#ff0000" });
    // x: 1 → 26 → 51 ; y: alto-2 − (v−lo)/(hi−lo)·(alto−4)
    expect(ctx.moveTo).toHaveBeenCalledExactlyOnceWith(1, 22);
    expect(ctx.lineTo.mock.calls).toEqual([[26, 2], [51, 12], [51, 24], [1, 24]]);
    expect(ctx.strokeStyle).toBe("#ff0000");
    expect(ctx.lineWidth).toBe(1.5);
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 24);
    expect(ctx.grad.addColorStop.mock.calls).toEqual([[0, "#ff000055"], [1, "#ff000000"]]);
    expect(ctx.fillStyle).toBe(ctx.grad);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  test("respeta min y max dados", () => {
    const c = sparkCanvas(12, 14);
    drawSparkline(c, [5, 5], { color: "#000", min: 0, max: 10, fill: false });
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 7);
    expect(ctx.lineTo).toHaveBeenCalledExactlyOnceWith(11, 7);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.closePath).not.toHaveBeenCalled();
  });

  test("una serie plana se centra abriendo el rango ±1", () => {
    const c = sparkCanvas(12, 14);
    drawSparkline(c, [3, 3], { fill: false });
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 7);
    expect(ctx.lineTo).toHaveBeenCalledWith(11, 7);
  });

  test("un rango apenas mayor que 1e-6 no se abre", () => {
    const c = sparkCanvas(12, 14);
    drawSparkline(c, [0, 2e-6], { fill: false });
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 12);
    expect(ctx.lineTo).toHaveBeenCalledWith(11, 2);
  });
});
