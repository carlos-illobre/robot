// Osciloscopio de roll y pitch con un contexto 2D falso y un ResizeObserver falso.
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Oscilloscope, OSC_SAMPLES } from "../../js/views/pilot/Oscilloscope.js";
import { contexto2d, resizeObserverFalso, simular, tamano, T0 } from "./helpers.js";

let g;
let observers;

beforeEach(() => {
  observers = resizeObserverFalso();
  g = contexto2d();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(g);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Muestras mínimas con roll/pitch dados, cada 100 ms. */
const serie = (pares, { t0 = T0, ts0 = 0 } = {}) =>
  pares.map(([roll, pitch], i) => ({ ts: ts0 + i * 0.1, receivedAt: t0 + i * 100, imu: { roll, pitch, yaw: 0 } }));

/** Osciloscopio con tamaño CSS w×h, ya medido. */
function osciloscopio(w = 300, h = 100, dpr = 1) {
  vi.stubGlobal("devicePixelRatio", dpr);
  const osc = new Oscilloscope();
  tamano(osc.canvas, w, h);
  observers.at(-1).disparar();
  g.reiniciar();
  return osc;
}
const llamadas = (m) => g.log.filter(([n]) => n === m).map(([, ...a]) => a);

describe("construcción y tamaño", () => {
  test("muestra 120 muestras y arma la cabecera de roll, pitch y yaw", () => {
    expect(OSC_SAMPLES).toBe(120);
    const osc = new Oscilloscope();
    expect(osc.canvas.getAttribute("aria-label")).toBe("Histórico de roll y pitch: últimas 120 muestras");
    expect([...osc.el.querySelectorAll(".pv-osc__item")].map((i) => i.dataset.series)).toEqual(["roll", "pitch", "yaw"]);
    expect([osc.roll.textContent, osc.pitch.textContent, osc.yaw.textContent]).toEqual(["—", "—", "—"]);
    expect(osc.g).toBe(g);
    expect(osc.size).toEqual({ w: 0, h: 0 });
  });

  test("observa el tamaño del canvas y deja de hacerlo al destruirse", () => {
    const osc = new Oscilloscope();
    const ro = observers.at(-1);
    expect(ro.observe).toHaveBeenCalledWith(osc.canvas);
    osc.destroy();
    expect(ro.disconnect).toHaveBeenCalledTimes(1);
  });

  test("al medir ajusta el canvas a la densidad de píxeles de la pantalla", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const osc = new Oscilloscope();
    tamano(osc.canvas, 300.4, 99.6);
    observers.at(-1).disparar();
    expect(osc.size).toEqual({ w: 300.4, h: 99.6 });
    expect([osc.canvas.width, osc.canvas.height]).toEqual([601, 199]);
    expect(g.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  test("sin densidad de píxeles informada usa 1", () => {
    vi.stubGlobal("devicePixelRatio", 0);
    const osc = new Oscilloscope();
    tamano(osc.canvas, 200, 80);
    observers.at(-1).disparar();
    expect([osc.canvas.width, osc.canvas.height]).toEqual([200, 80]);
    expect(g.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  test("mientras el canvas mide cero (oculto) no hace nada", () => {
    const osc = new Oscilloscope();
    tamano(osc.canvas, 0, 100);
    observers.at(-1).disparar();
    tamano(osc.canvas, 100, 0);
    observers.at(-1).disparar();
    expect(osc.size).toEqual({ w: 0, h: 0 });
    expect(g.setTransform).not.toHaveBeenCalled();
  });

  test("al cambiar de tamaño redibuja lo último que dibujó", () => {
    const osc = osciloscopio();
    osc.draw(serie([[1, 1], [2, 2]]), []);
    g.clearRect.mockClear();
    tamano(osc.canvas, 400, 120);
    observers.at(-1).disparar();
    expect(g.clearRect).toHaveBeenCalledWith(0, 0, 400, 120);
  });
});

describe("colores", () => {
  test("lee los colores de las variables CSS de la vista", () => {
    const osc = new Oscilloscope();
    document.body.append(osc.el);
    const vars = { "--pv-s1": "#0af", "--pv-s2": "#fa0", "--pv-hud-4": "#333", "--pv-hud-3": "#999", "--pv-accent": "#f0f" };
    for (const [k, v] of Object.entries(vars)) osc.el.style.setProperty(k, v);
    osc.readColors();
    expect(osc.colors).toEqual({ s1: "#0af", s2: "#fa0", grid: "#333", text: "#999", accent: "#f0f" });
    osc.el.remove();
  });

  test("al cambiar el tema redibuja con los colores nuevos, si ya había dibujado", () => {
    const osc = osciloscopio();
    document.body.append(osc.el);
    osc.readColors();
    expect(g.clearRect).not.toHaveBeenCalled();
    osc.draw(serie([[1, 1]]), []);
    osc.el.style.setProperty("--pv-s1", "red");
    g.reiniciar();
    osc.readColors();
    expect(g.clearRect).toHaveBeenCalledTimes(1);
    expect(g.sets).toContainEqual(["strokeStyle", "red"]);
    osc.el.remove();
  });
});

describe("lecturas numéricas", () => {
  test("escribe roll y pitch con signo y el yaw con un decimal", () => {
    const osc = new Oscilloscope();
    osc.draw([{ ts: 3, receivedAt: T0, imu: { roll: -2.14, pitch: 0.45, yaw: -12.34 } }], []);
    expect(osc.roll.textContent).toBe("−2.1°");
    expect(osc.pitch.textContent).toBe("+0.5°");
    expect(osc.yaw.textContent).toBe("−12.3°");
  });

  test("el rótulo dice cuántas muestras y cuántos segundos abarca", () => {
    const osc = new Oscilloscope();
    osc.draw(serie([[0, 0], [0, 0], [0, 0]], { ts0: 4 }).map((f, i) => ({ ...f, ts: 4 + i * 0.8 })), []);
    expect(osc.caption.textContent).toBe("3 muestras · 2 s · horizonte ×4");
    osc.draw(serie([[0, 0]]), []);
    expect(osc.caption.textContent).toBe("1 muestras · 0 s · horizonte ×4");
  });

  test("sin muestras deja las rayas y no dibuja nada", () => {
    const osc = osciloscopio();
    osc.draw([], [{ n: 1, tipo: "manual", frame: { receivedAt: T0 } }]);
    expect(osc.roll.textContent).toBe("—");
    expect(osc.caption.textContent).toBe("");
    expect(g.clearRect).toHaveBeenCalledTimes(1);
    expect(g.fillRect).not.toHaveBeenCalled();
    expect(llamadas("moveTo").filter(([x]) => x === 34)).toHaveLength(llamadas("lineTo").length);
  });

  test("sin tamaño todavía solo actualiza los números", () => {
    const osc = new Oscilloscope();
    osc.draw(serie([[1, 2]]), []);
    expect(osc.roll.textContent).toBe("+1.0°");
    expect(g.clearRect).not.toHaveBeenCalled();
  });

  test("con el paseo real del Go2 muestra la última muestra del historial", () => {
    const osc = new Oscilloscope();
    const { frames } = simular("go2", 15, { desde: 10 });
    osc.draw(frames, []);
    const last = frames.at(-1).imu;
    expect(osc.roll.textContent).toMatch(/^[+−]?\d+\.\d°$/);
    expect(osc.yaw.textContent).toBe(`${last.yaw < 0 ? "−" : ""}${Math.abs(last.yaw).toFixed(1)}°`);
    expect(osc.caption.textContent).toBe("15 muestras · 1 s · horizonte ×4");
  });
});

describe("escala y trazos", () => {
  test("limpia el área y dibuja la escala mínima de ±6° con marcas cada 5°", () => {
    const osc = osciloscopio(300, 100);
    osc.draw(serie([[1, -2], [2, 1]]), []);
    expect(g.clearRect).toHaveBeenCalledWith(0, 0, 300, 100);
    expect(llamadas("fillText")).toEqual([["−5°", 28, 78.5], ["0°", 28, 46.5], ["+5°", 28, 14.5]]);
    expect(llamadas("setLineDash")).toEqual([[[2, 4]], [[]], [[2, 4]], [[]]]);
    expect(g.font).toBe('500 11px "JetBrains Mono", monospace');
    expect(g.textAlign).toBe("right");
  });

  test("cada línea de la escala va de borde a borde, en medio píxel", () => {
    const osc = osciloscopio(300, 100);
    osc.draw(serie([[0, 0]]), []);
    const moves = llamadas("moveTo").slice(0, 3);
    const lines = llamadas("lineTo").slice(0, 3);
    expect(moves).toEqual([[34, 78.5], [34, 46.5], [34, 14.5]]);
    expect(lines).toEqual([[298, 78.5], [298, 46.5], [298, 14.5]]);
  });

  test("hasta ±15° mantiene marcas cada 5°", () => {
    const osc = osciloscopio(300, 100);
    osc.draw(serie([[13, 0]]), []);
    expect(llamadas("fillText").map(([t]) => t)).toEqual(["−15°", "−10°", "−5°", "0°", "+5°", "+10°", "+15°"]);
  });

  test("si el robot se inclina más, la escala crece de a 5° con marcas cada 10°", () => {
    const osc = osciloscopio(300, 100);
    osc.draw(serie([[2, -20]]), []);
    expect(llamadas("fillText").map(([t]) => t)).toEqual(["−20°", "−10°", "0°", "+10°", "+20°"]);
  });

  test("traza el roll y el pitch con sus colores, alineados a la derecha", () => {
    const osc = osciloscopio(300, 100);
    osc.colors = { s1: "R", s2: "P", grid: "G", text: "T", accent: "A" };
    osc.draw(serie([[0, 0], [3, -3]]), []);
    const strokes = g.sets.filter(([k]) => k === "strokeStyle").map(([, v]) => v);
    expect(strokes.slice(-2)).toEqual(["R", "P"]);
    expect(g.lineWidth).toBe(1.6);
    expect(g.lineJoin).toBe("round");
    // Las dos últimas muestras de 120: X(0) = 34 + 118/119 × 264, X(1) = 298.
    const xPen = 34 + (118 / 119) * 264;
    const moves = llamadas("moveTo").slice(-2);
    const lines = llamadas("lineTo").slice(-2);
    expect(moves[0][0]).toBeCloseTo(xPen, 9);
    expect(moves[0][1]).toBe(46);
    expect(lines[0]).toEqual([298, 46 - (3 / 6) * 38]);
    expect(lines[1]).toEqual([298, 46 + (3 / 6) * 38]);
  });

  test("un trazo por serie: mueve una vez y une el resto de las muestras", () => {
    const osc = osciloscopio(300, 100);
    osc.draw(serie(Array.from({ length: OSC_SAMPLES }, () => [1, 1])), []);
    const lines = llamadas("lineTo");
    // 3 líneas de escala + 2 series × 119 tramos.
    expect(lines).toHaveLength(3 + 2 * 119);
    expect(llamadas("moveTo").slice(-2).map(([x]) => x)).toEqual([34, 34]);
  });
});

describe("marcas de captura", () => {
  const slot = 264 / 119;
  const X = (n, i) => 34 + ((120 - n + i) / 119) * 264;

  test("una captura manual es una línea vertical con su número debajo", () => {
    const osc = osciloscopio(300, 100);
    osc.colors.accent = "#acc";
    const tail = serie(Array.from({ length: 10 }, () => [0, 0]));
    osc.draw(tail, [{ n: 7, tipo: "manual", frame: { receivedAt: tail[5].receivedAt } }]);
    const x = X(10, 5);
    expect(llamadas("fillText").at(-1)).toEqual(["7", x, 98]);
    expect(llamadas("moveTo")).toContainEqual([Math.round(x) + 0.5, 6]);
    expect(llamadas("lineTo")).toContainEqual([Math.round(x) + 0.5, 86]);
    expect(g.sets).toContainEqual(["fillStyle", "#acc"]);
    expect(g.sets).toContainEqual(["font", '700 11px "JetBrains Mono", monospace']);
    expect(g.sets).toContainEqual(["textAlign", "center"]);
    expect(g.sets).toContainEqual(["textBaseline", "alphabetic"]);
    expect(g.sets).toContainEqual(["lineWidth", 1.5]);
    expect(g.fillRect).not.toHaveBeenCalled();
    expect(g.globalAlpha).toBe(1);
  });

  test("la grabación continua es una franja translúcida del ancho de una muestra", () => {
    const osc = osciloscopio(300, 100);
    const tail = serie(Array.from({ length: 10 }, () => [0, 0]));
    osc.draw(tail, [{ n: 1, tipo: "continua", frame: { receivedAt: tail[2].receivedAt } }]);
    expect(g.sets).toContainEqual(["globalAlpha", 0.14]);
    const [[x, y, w, h]] = llamadas("fillRect");
    expect(x).toBeCloseTo(X(10, 2) - slot / 2, 9);
    expect([y, h]).toEqual([8, 76]);
    expect(w).toBeCloseTo(slot + 0.5, 9);
    expect(g.globalAlpha).toBe(1);
  });

  test("si todas las muestras caen en la misma columna, la franja mide 4 px", () => {
    const osc = osciloscopio(36, 100);
    const tail = serie([[0, 0], [0, 0]]);
    osc.draw(tail, [{ n: 1, tipo: "continua", frame: { receivedAt: tail[1].receivedAt } }]);
    expect(llamadas("fillRect")).toEqual([[32, 8, 4.5, 76]]);
  });

  test("ignora capturas que no coinciden con una muestra visible", () => {
    const osc = osciloscopio(300, 100);
    const tail = serie(Array.from({ length: 5 }, () => [0, 0]));
    osc.draw(tail, [{ n: 1, tipo: "manual", frame: { receivedAt: tail[2].receivedAt + 50 } }]);
    expect(llamadas("fillText").map(([t]) => t)).not.toContain("1");
  });

  test("marca varias capturas, de la más nueva a la más vieja", () => {
    const osc = osciloscopio(300, 100);
    const tail = serie(Array.from({ length: 10 }, () => [0, 0]));
    const caps = [1, 4, 8].map((i, k) => ({ n: k + 1, tipo: "manual", frame: { receivedAt: tail[i].receivedAt } }));
    osc.draw(tail, caps);
    const labels = llamadas("fillText").filter(([t]) => /^\d$/.test(t));
    expect(labels.map(([t]) => t)).toEqual(["3", "2", "1"]);
    expect(labels.map(([, x]) => x)).toEqual([X(10, 8), X(10, 4), X(10, 1)]);
  });

  test("corta al llegar a una captura anterior a la ventana visible", () => {
    const osc = osciloscopio(300, 100);
    const tail = serie(Array.from({ length: 10 }, () => [0, 0]), { t0: T0 + 1000 });
    const caps = [
      { n: 1, tipo: "manual", frame: { receivedAt: tail[3].receivedAt } },
      { n: 2, tipo: "manual", frame: { receivedAt: T0 } },
      { n: 3, tipo: "manual", frame: { receivedAt: tail[6].receivedAt } },
    ];
    osc.draw(tail, caps);
    const labels = llamadas("fillText").map(([t]) => t).filter((t) => /^\d$/.test(t));
    expect(labels).toEqual(["3"]);
  });

  test("la captura en la primera muestra visible también se marca", () => {
    const osc = osciloscopio(300, 100);
    const tail = serie(Array.from({ length: 4 }, () => [0, 0]));
    osc.draw(tail, [{ n: 9, tipo: "manual", frame: { receivedAt: tail[0].receivedAt } }]);
    expect(llamadas("fillText").at(-1)).toEqual(["9", X(4, 0), 98]);
  });
});
