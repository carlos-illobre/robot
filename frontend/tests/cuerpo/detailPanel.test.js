import { describe, test, expect, vi, afterEach } from "vitest";
import { DetailPanel } from "../../js/views/body/detailPanel.js";
import { frame, fakeCtx2d, setBox, setDpr, PALETTE, simFrames } from "./helpers.js";

const values = (p) => [p.temp, p.ang, p.vel, p.tq].map((e) => e.textContent);

/** Muestras con el motor `name` en la posición `index`, con las temperaturas dadas. */
const series = (temps, { name = "FR_calf", index = 0, start = 0 } = {}) =>
  temps.map((t, i) => {
    const motores = [["FR_hip", 30], ["FR_thigh", 30]];
    motores.splice(index, 0, [name, t]);
    return frame({ motores, receivedAt: start + i * 100 });
  });

/** Panel con el lienzo "medido" y un contexto 2D falso. */
function withCanvas(W = 300, H = 80) {
  const p = new DetailPanel();
  const ctx = fakeCtx2d();
  setBox(p.canvas, W, H);
  p.canvas.getContext = vi.fn(() => ctx);
  return { p, ctx };
}

let restoreDpr = null;
afterEach(() => {
  restoreDpr?.();
  restoreDpr = null;
});

describe("DetailPanel › selección", () => {
  test("arranca vacío, con un lienzo accesible", () => {
    const p = new DetailPanel();
    expect(p.name.textContent).toBe("—");
    expect(values(p)).toEqual(["—", "—", "—", "—"]);
    expect(p.canvas.getAttribute("role")).toBe("img");
    expect(p.el.querySelector("#bd-detail-title").textContent).toBe("Articulación elegida");
    expect([...p.el.querySelectorAll(".bd-detail__k")].map((k) => k.textContent)).toEqual(["Temperatura", "Ángulo", "Velocidad", "Torque"]);
  });

  test("Go2: nombre y dónde está (pata y parte)", () => {
    const p = new DetailPanel();
    p.select("FR_calf", 2);
    expect(p.name.textContent).toBe("FR_calf");
    expect(p.where.textContent).toBe("delantera derecha · pantorrilla");
    expect(p.index).toBe(2);
  });

  test("G1: brazo, articulación y eje", () => {
    const p = new DetailPanel();
    p.select("L_shoulder_pitch", 15);
    expect(p.where.textContent).toBe("brazo izquierdo · hombro · cabeceo");
    p.select("R_knee", 9);
    expect(p.where.textContent).toBe("pierna derecha · rodilla");
  });

  test("un motor sin grupo conocido muestra solo la parte", () => {
    const p = new DetailPanel();
    p.select("aux_fan", 0);
    expect(p.where.textContent).toBe("aux · fan");
  });

  test("sin selección vuelve a la raya", () => {
    const p = new DetailPanel();
    p.select("FR_calf", 2);
    p.select(null, -1);
    expect(p.name.textContent).toBe("—");
    expect(p.where.textContent).toBe("");
  });
});

describe("DetailPanel › valores", () => {
  test("muestra las cuatro magnitudes del motor elegido", () => {
    const p = new DetailPanel();
    p.select("FR_thigh", 1);
    const f = frame({ motores: [["FR_hip", 30], ["FR_thigh", 61.27, { angulo: -3.21, velocidad: 0.456, torque: 12.34 }]] });
    p.update(f, [], PALETTE);
    expect(values(p)).toEqual(["61.3", "−3.2", "0.46", "12.3"]);
    expect(p.temp.dataset.level).toBe("crit");
  });

  test("si la posición no coincide, busca el motor por nombre", () => {
    const p = new DetailPanel();
    p.select("FR_thigh", 0);
    p.update(frame({ motores: [["FR_hip", 30], ["FR_thigh", 45]] }), [], PALETTE);
    expect(p.temp.textContent).toBe("45.0");
    expect(p.temp.dataset.level).toBe("warn");
  });

  test("si el motor no está en la muestra no toca nada", () => {
    const p = new DetailPanel();
    p.select("nada", 7);
    p.update(frame({ motores: [["FR_hip", 30]] }), [], PALETTE);
    expect(values(p)).toEqual(["—", "—", "—", "—"]);
    expect(p.temp.dataset.level).toBeUndefined();
  });

  test("el nivel solo se reescribe cuando cambia", () => {
    const p = new DetailPanel();
    p.select("FR_calf", 0);
    p.update(series([30])[0], [], PALETTE);
    expect(p.level).toBe("ok");
    p.temp.dataset.level = "marca";
    p.update(series([31])[0], [], PALETTE);
    expect(p.temp.dataset.level).toBe("marca");
    p.update(series([41])[0], [], PALETTE);
    expect(p.temp.dataset.level).toBe("warn");
  });
});

describe("DetailPanel › curva de temperatura", () => {
  test("si el lienzo no tiene tamaño no dibuja", () => {
    const p = new DetailPanel();
    p.canvas.getContext = vi.fn();
    p.select("FR_calf", 0);
    p.update(series([30])[0], series([30, 31]), PALETTE);
    expect(p.canvas.getContext).not.toHaveBeenCalled();
    setBox(p.canvas, 100, 0);
    p.update(series([30])[0], series([30, 31]), PALETTE);
    expect(p.canvas.getContext).not.toHaveBeenCalled();
  });

  test("ajusta el lienzo a la densidad de la pantalla una sola vez", () => {
    restoreDpr = setDpr(2);
    const { p, ctx } = withCanvas(150, 40);
    p.select("FR_calf", 0);
    const hist = series([30, 31]);
    p.update(hist[1], hist, PALETTE);
    expect([p.canvas.width, p.canvas.height]).toEqual([300, 80]);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 150, 40);
    const widthSet = vi.spyOn(p.canvas, "width", "set");
    p.update(hist[1], hist, PALETTE);
    expect(widthSet).not.toHaveBeenCalled();
  });

  test("sin devicePixelRatio usa 1 y también corrige solo el alto", () => {
    restoreDpr = setDpr(0);
    const { p, ctx } = withCanvas(120, 50);
    p.canvas.width = 120;
    p.select("FR_calf", 0);
    p.update(series([30])[0], [], PALETTE);
    expect([p.canvas.width, p.canvas.height]).toEqual([120, 50]);
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  test("marca los umbrales de 40 y 60 °C con su color y rótulo", () => {
    const { p, ctx } = withCanvas(300, 80);
    p.select("FR_calf", 0);
    p.update(series([30])[0], [], PALETTE);
    // Escala por defecto 24…71 °C (siempre se ven las dos líneas).
    const Y = (v) => 80 - 3 - ((v - 24) / 47) * 74;
    const strokes = ctx.calls("lineTo");
    expect(strokes).toHaveLength(2);
    expect(strokes[0].args).toEqual([256, Y(40)]);
    expect(strokes[0].strokeStyle).toBe("WARN");
    expect(strokes[0].globalAlpha).toBe(0.6);
    expect(strokes[1].args).toEqual([256, Y(60)]);
    expect(strokes[1].strokeStyle).toBe("CRIT");
    expect(ctx.calls("moveTo").map((c) => c.args)).toEqual([[0, Y(40)], [0, Y(60)]]);
    const labels = ctx.calls("fillText");
    expect(labels.map((c) => c.args)).toEqual([["40 °C", 262, Y(40)], ["60 °C", 262, Y(60)]]);
    expect(labels[0].fillStyle).toBe("MUTED");
    expect(labels[0].globalAlpha).toBe(1);
    expect(labels[0].font).toBe("11px MONO");
    expect(ctx.setLineDash.mock.calls).toEqual([[[3, 3]], [[]]]);
  });

  test("con una sola muestra no traza curva", () => {
    const { p, ctx } = withCanvas();
    p.select("FR_calf", 0);
    p.update(series([30])[0], series([30]), PALETTE);
    expect(ctx.stroke).toHaveBeenCalledTimes(2); // solo los umbrales
  });

  test("traza la curva anclada a la derecha, en tinta si no es crítica", () => {
    const { p, ctx } = withCanvas(300, 80);
    p.select("FR_calf", 0);
    const hist = series([30, 35, 38]);
    p.update(hist[2], hist, PALETTE);
    const Y = (v) => 80 - 3 - ((v - 24) / 47) * 74;
    const right = 256;
    const moves = ctx.calls("moveTo");
    const lines = ctx.calls("lineTo");
    expect(moves).toHaveLength(3);
    expect(moves[2].args).toEqual([(297 / 299) * right, Y(30)]);
    expect(lines.slice(2).map((c) => c.args)).toEqual([[(298 / 299) * right, Y(35)], [right, Y(38)]]);
    expect(lines[2].strokeStyle).toBe("INK");
    expect(lines[2].lineWidth).toBe(1.8);
    expect(lines[2].lineJoin).toBe("round");
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });

  test("en crítico la curva es roja y la escala crece para contenerla", () => {
    const { p, ctx } = withCanvas(300, 80);
    p.select("FR_calf", 0);
    const hist = series([20, 80]);
    p.update(hist[1], hist, PALETTE);
    const Y = (v) => 80 - 3 - ((v - 19) / 62) * 74;
    const lines = ctx.calls("lineTo");
    expect(lines.at(-1).args).toEqual([256, Y(80)]);
    expect(lines.at(-1).strokeStyle).toBe("CRIT");
    expect(ctx.calls("moveTo").at(-1).args).toEqual([(298 / 299) * 256, Y(20)]);
  });

  test("ignora las muestras donde el motor está en otra posición", () => {
    const { p, ctx } = withCanvas();
    p.select("FR_calf", 0);
    const hist = [...series([30, 31], { index: 1 }), ...series([32, 33], { start: 500 })];
    p.update(hist.at(-1), hist, PALETTE);
    expect(ctx.calls("moveTo")).toHaveLength(3);
    expect(ctx.calls("lineTo")).toHaveLength(3);
  });

  test("usa como mucho las últimas 300 muestras", () => {
    const { p, ctx } = withCanvas(300, 80);
    p.select("FR_calf", 0);
    const hist = series(Array.from({ length: 320 }, (_, i) => (i < 20 ? 90 : 30)));
    p.update(hist.at(-1), hist, PALETTE);
    // Las muestras a 90 °C quedaron afuera: la escala no creció.
    expect(ctx.calls("moveTo").at(-1).args).toEqual([0, 80 - 3 - ((30 - 24) / 47) * 74]);
    expect(ctx.calls("lineTo")).toHaveLength(2 + 299);
  });

  test("con muestras reales del G1 dibuja la curva del motor elegido", () => {
    const { p, ctx } = withCanvas();
    const hist = simFrames("g1", 20);
    p.select("L_knee", 3);
    p.update(hist.at(-1), hist, PALETTE);
    expect(p.temp.textContent).toBe(hist.at(-1).motores[3].temperatura.toFixed(1));
    expect(ctx.calls("lineTo")).toHaveLength(2 + 19);
  });
});
