import { describe, test, expect, afterEach, vi } from "vitest";
import { Timeline, WINDOW_MS } from "../../js/views/body/timeline.js";
import { frame, fakeCtx2d, setBox, setDpr, PALETTE, simFrames } from "./helpers.js";

const NOW = 1_000_000;
const GO2_LEGS = ["FR", "FL", "RR", "RL"];

function setup(W = 800, H = 200) {
  const ctx = fakeCtx2d();
  const canvas = document.createElement("canvas");
  canvas.getContext = (kind) => (kind === "2d" ? ctx : null);
  setBox(canvas, W, H);
  return { tl: new Timeline(canvas), ctx, canvas };
}

const draw = (tl, o = {}) => tl.draw({ frames: [], captures: [], now: NOW, legs: GO2_LEGS, palette: PALETTE, ...o });

/** Muestras cada `dt` ms terminando en NOW, con los valores que devuelve `fn(i)`. */
const timed = (n, fn = () => ({}), dt = 100) =>
  Array.from({ length: n }, (_, i) => frame({ receivedAt: NOW - (n - 1 - i) * dt, ...fn(i) }));

const manual = (n, t) => ({ n, tipo: "manual", capturedAt: new Date(t), frame: { receivedAt: t } });
const rec = (n, t) => ({ n, tipo: "grabacion", capturedAt: new Date(t), frame: { receivedAt: t } });

/** Geometría esperada (W = 800 → columnas de 92 + 42 px). */
const LEFT = 134;
const RIGHT = 794;
const X = (t) => RIGHT - ((NOW - t) / WINDOW_MS) * 660;

let restore = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe("Timeline › lienzo", () => {
  test("pide el contexto 2D y arranca con la escala de ±5°", () => {
    const { tl, ctx } = setup();
    expect(tl.ctx).toBe(ctx);
    expect(tl.tiltScale).toBe(5);
    expect(WINDOW_MS).toBe(30_000);
  });

  test("si el lienzo no tiene tamaño solo lo limpia", () => {
    const { tl, ctx } = setup(0, 0);
    draw(tl, { frames: timed(3) });
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 0, 0);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(tl.count).toBeUndefined();
    const { tl: tl2, ctx: ctx2 } = setup(300, 0);
    draw(tl2);
    expect(ctx2.fillRect).not.toHaveBeenCalled();
  });

  test("ajusta el lienzo a la densidad de pantalla", () => {
    restore = setDpr(2);
    const { tl, ctx, canvas } = setup(400, 150);
    draw(tl);
    expect([canvas.width, canvas.height]).toEqual([800, 300]);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 150);
  });

  test("si el tamaño no cambió no vuelve a dimensionar el lienzo", () => {
    const { tl, canvas } = setup(800, 200);
    draw(tl);
    expect(canvas.width).toBe(800);
    const widthSet = vi.spyOn(canvas, "width", "set");
    const heightSet = vi.spyOn(canvas, "height", "set");
    draw(tl);
    expect(widthSet).not.toHaveBeenCalled();
    expect(heightSet).not.toHaveBeenCalled();
  });

  test("sin devicePixelRatio usa 1 y corrige también solo el alto", () => {
    restore = setDpr(undefined);
    const { tl, ctx, canvas } = setup(800, 200);
    canvas.width = 800;
    draw(tl);
    expect([canvas.width, canvas.height]).toEqual([800, 200]);
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });
});

describe("Timeline › pistas", () => {
  test("cuatro pistas con fondo, en proporción, separadas 6 px", () => {
    const { tl, ctx } = setup();
    draw(tl);
    const tracks = ctx.calls("fillRect").filter((c) => c.fillStyle === "TRACK");
    // altura útil 148 px: pesos 0.4, 0.22, 0.33 (4 patas) y 0.1
    const hs = [0.4, 0.22, 0.33, 0.1].map((w) => (148 * w) / 1.05);
    expect(tracks).toHaveLength(4);
    let y = 16;
    tracks.forEach((c, i) => {
      expect(c.args[0]).toBe(LEFT);
      expect(c.args[1]).toBeCloseTo(y);
      expect(c.args[2]).toBe(660);
      expect(c.args[3]).toBeCloseTo(hs[i]);
      y += hs[i] + 6;
    });
  });

  test("en la compu los títulos van en su columna", () => {
    const { tl, ctx } = setup();
    draw(tl);
    const titles = ctx.calls("fillText").filter((c) => c.font === "600 12px SANS");
    expect(titles.map((c) => c.args[0])).toEqual(["Roll · pitch", "Yaw", "Patas", "Más caliente"]);
    expect(titles.every((c) => c.args[1] === 0 && c.fillStyle === "MUTED" && c.textAlign === "left")).toBe(true);
    expect(titles[0].args[2]).toBe(16 + 9);
    // la pista de calor mide 14 px: el título va a la mitad
    expect(titles[3].args[2]).toBeCloseTo(16 + (148 * 0.95) / 1.05 + 18 + ((148 * 0.1) / 1.05) / 2);
    expect(ctx.texts()).not.toContain("máx");
  });

  test("en el celular no hay columna de títulos: van dentro de la pista", () => {
    const { tl, ctx } = setup(559, 200);
    draw(tl);
    expect(ctx.calls("fillText").some((c) => c.font === "600 12px SANS")).toBe(false);
    const yaw = ctx.calls("fillText").find((c) => c.args[0] === "Yaw");
    expect(yaw.args[1]).toBe(42 + 6);
    expect(yaw.font).toBe("600 11px SANS");
    const max = ctx.calls("fillText").find((c) => c.args[0] === "máx");
    expect(max.args[1]).toBe(42 - 6);
    expect(max.textAlign).toBe("right");
  });

  test("con 560 px de ancho ya no es compacto", () => {
    const { tl, ctx } = setup(560, 200);
    draw(tl);
    expect(ctx.texts()).toContain("Roll · pitch");
  });

  test("el G1 dice Pies y rotula cada pie con su lado", () => {
    const { tl, ctx } = setup();
    draw(tl, { legs: ["L_foot", "R_foot"] });
    expect(ctx.texts()).toContain("Pies");
    // el orden de dibujo es el del dibujo: derecho primero
    const labels = ctx.calls("fillText").filter((c) => c.args[0] === "R" || c.args[0] === "L");
    expect(labels.map((c) => c.args[0])).toEqual(["R", "L"]);
  });

  test("las patas se ordenan como en el dibujo", () => {
    const { tl, ctx } = setup(800, 400);
    draw(tl, { legs: ["RR", "FR", "RL", "FL"] });
    const labels = ctx.calls("fillText").filter((c) => GO2_LEGS.includes(c.args[0]));
    expect(labels.map((c) => c.args[0])).toEqual(["FL", "FR", "RL", "RR"]);
    expect(labels[0].font).toBe("11px MONO");
  });

  test("con filas de patas bajas el rótulo es más chico", () => {
    const { tl, ctx } = setup(800, 120);
    draw(tl);
    const fr = ctx.calls("fillText").find((c) => c.args[0] === "FR");
    expect(fr.font).toBe("9px MONO");
  });

  test("sin patas informadas lo dice", () => {
    const { tl, ctx } = setup();
    draw(tl, { legs: [] });
    const msg = ctx.calls("fillText").find((c) => c.args[0] === "El robot no informa contacto de patas");
    expect(msg.args[1]).toBe(LEFT + 8);
    expect(msg.font).toBe("11px SANS");
    // la pista vacía pesa 0.1
    const tracks = ctx.calls("fillRect").filter((c) => c.fillStyle === "TRACK");
    expect(tracks[2].args[3]).toBeCloseTo((148 * 0.1) / 0.82);
    expect(ctx.texts()).toContain("Patas");
  });
});

describe("Timeline › roll y pitch", () => {
  // Los dos primeros rótulos con grados son los de roll/pitch (el yaw se dibuja después).
  const ticks = (ctx) => ctx.calls("fillText").filter((c) => /^[+−]\d+°$/.test(c.args[0])).slice(0, 2).map((c) => c.args[0]);

  test("la escala es simétrica y salta de a escalones redondos", () => {
    const cases = [[0, "2"], [2, "2"], [2.1, "5"], [-7, "10"], [44, "45"], [91, "180"], [500, "180"]];
    for (const [peak, M] of cases) {
      const { tl, ctx } = setup();
      draw(tl, { frames: timed(2, (i) => ({ imu: { pitch: i ? peak : 0 } })) });
      expect(ticks(ctx)).toEqual([`+${M}°`, `−${M}°`]);
      expect(tl.tiltScale).toBe(Number(M));
    }
  });

  test("el roll también agranda la escala", () => {
    const { tl } = setup();
    draw(tl, { frames: timed(2, () => ({ imu: { roll: -12 } })) });
    expect(tl.tiltScale).toBe(15);
  });

  test("guías en 0 y en ±M/2, y las dos series con su color", () => {
    const { tl, ctx } = setup();
    const frames = timed(3, (i) => ({ imu: { roll: [1, -2, 3][i], pitch: [0, 1, 2][i] } }));
    draw(tl, { frames });
    const h = (148 * 0.4) / 1.05;
    const Y = (v) => 16 + 3 + ((5 - v) / 10) * (h - 6);
    const guides = ctx.calls("lineTo").filter((c) => ["RULE", "RULE2"].includes(c.strokeStyle)).slice(0, 3);
    expect(guides.map((c) => c.strokeStyle)).toEqual(["RULE2", "RULE", "RULE"]);
    expect(guides[0].args).toEqual([RIGHT, Math.round(Y(0)) + 0.5]);
    expect(guides[1].args).toEqual([RIGHT, Math.round(Y(2.5)) + 0.5]);
    expect(guides[2].args).toEqual([RIGHT, Math.round(Y(-2.5)) + 0.5]);
    const roll = ctx.calls("lineTo").filter((c) => c.strokeStyle === "S1");
    expect(roll.map((c) => c.args[0])).toEqual([X(NOW - 100), X(NOW)]);
    expect(roll.map((c) => c.args[1])).toEqual([Y(-2), Y(3)]);
    expect(roll[0].lineWidth).toBe(1.6);
    expect(ctx.calls("moveTo").find((c) => c.strokeStyle === "S1").args).toEqual([X(NOW - 200), Y(1)]);
    expect(ctx.calls("lineTo").filter((c) => c.strokeStyle === "S2")).toHaveLength(2);
    expect(ctx.texts()).toContain("0");
  });

  test("la leyenda va bajo el título en la compu y dentro de la pista en el celular", () => {
    const desk = setup();
    draw(desk.tl);
    const legend = (ctx, name) => ctx.calls("fillText").find((c) => c.args[0] === name);
    expect(legend(desk.ctx, "Roll").args).toEqual(["Roll", 14, 16 + 26]);
    expect(legend(desk.ctx, "Roll").fillStyle).toBe("S1");
    expect(legend(desk.ctx, "Pitch").args).toEqual(["Pitch", 14, 16 + 42]);
    expect(legend(desk.ctx, "Pitch").fillStyle).toBe("S2");
    const phone = setup(400, 200);
    draw(phone.tl);
    expect(legend(phone.ctx, "Roll").args).toEqual(["Roll", 42 + 20, 24]);
    expect(legend(phone.ctx, "Pitch").args).toEqual(["Pitch", 42 + 6 + 48 + 14, 24]);
  });

  test("un hueco de más de 1,5 s corta la línea", () => {
    const { tl, ctx } = setup();
    const frames = [NOW - 5000, NOW - 4900, NOW - 3300, NOW - 1800].map((t) => frame({ receivedAt: t, imu: { roll: 1 } }));
    draw(tl, { frames });
    const s1 = ctx.log.filter((c) => c.strokeStyle === "S1" && (c.name === "moveTo" || c.name === "lineTo")).map((c) => c.name);
    // 1600 ms corta; 1500 ms justos no
    expect(s1).toEqual(["moveTo", "lineTo", "moveTo", "lineTo"]);
  });
});

describe("Timeline › yaw", () => {
  test("rótulos ±180° y el 0 solo si la pista es alta", () => {
    const low = setup(800, 200);
    draw(low.tl);
    expect(low.ctx.texts()).toEqual(expect.arrayContaining(["+180°", "−180°"]));
    expect(low.ctx.texts().filter((t) => t === "0")).toHaveLength(1); // solo el de roll/pitch
    const tall = setup(800, 300);
    draw(tall.tl);
    expect(tall.ctx.texts().filter((t) => t === "0")).toHaveLength(2);
  });

  test("lleva el yaw a −180…180 y corta la línea al dar la vuelta", () => {
    const { tl, ctx } = setup();
    const frames = timed(4, (i) => ({ imu: { yaw: [170, 179, 190, 200][i] } }));
    draw(tl, { frames });
    const yaw = ctx.log.filter((c) => c.strokeStyle === "INK" && (c.name === "moveTo" || c.name === "lineTo"));
    expect(yaw.map((c) => c.name)).toEqual(["moveTo", "lineTo", "moveTo", "lineTo"]);
    const top = 16 + (148 * 0.4) / 1.05 + 6;
    const h = (148 * 0.22) / 1.05;
    const Y = (v) => top + 3 + ((180 - v) / 360) * (h - 6);
    expect(yaw[2].args[1]).toBeCloseTo(Y(-170));
    expect(yaw[3].args[1]).toBeCloseTo(Y(-160));
  });
});

describe("Timeline › apoyos", () => {
  const legRects = (ctx) => ctx.calls("fillRect").filter((c) => c.fillStyle === "INK2");

  test("un rectángulo por racha de apoyo, cerrado en el instante en que se levanta", () => {
    const { tl, ctx } = setup();
    const fr = [1, 1, 0, 0, 1];
    draw(tl, { frames: timed(5, (i) => ({ fuerzas: { FR: fr[i], FL: 0, RR: 0, RL: 0 } })), legs: ["FR"] });
    const rects = legRects(ctx);
    expect(rects).toHaveLength(2);
    expect(rects[0].args[0]).toBeCloseTo(X(NOW - 400));
    expect(rects[0].args[2]).toBeCloseTo(X(NOW - 200) - X(NOW - 400));
    // la racha abierta se cierra en "ahora"
    expect(rects[1].args[0]).toBeCloseTo(X(NOW));
    expect(rects[1].args[2]).toBe(1);
  });

  test("las rachas se recortan al borde izquierdo y un hueco las corta", () => {
    const { tl, ctx } = setup();
    const frames = [NOW - 31_000, NOW - 29_900, NOW - 10_000, NOW - 9_900].map((t) => frame({ receivedAt: t, fuerzas: { FR: 1 } }));
    draw(tl, { frames, legs: ["FR"] });
    const rects = legRects(ctx);
    expect(rects).toHaveLength(2);
    expect(rects[0].args[0]).toBe(LEFT);
    expect(rects[0].args[2]).toBeCloseTo(X(NOW - 29_900) - LEFT);
    expect(rects[1].args[0]).toBeCloseTo(X(NOW - 10_000));
    expect(rects[1].args[2]).toBeCloseTo(RIGHT - X(NOW - 10_000));
  });

  test("cada pata va en su fila", () => {
    const { tl, ctx } = setup();
    draw(tl, { frames: timed(2, () => ({ fuerzas: { FR: 1, FL: 1, RR: 0, RL: 1 } })) });
    const top = 16 + (148 * 0.62) / 1.05 + 12;
    const rh = ((148 * 0.33) / 1.05) / 4;
    const rows = legRects(ctx).map((c) => c.args[1]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBeCloseTo(top + 1.5); // FL
    expect(rows[1]).toBeCloseTo(top + rh + 1.5); // FR
    expect(rows[2]).toBeCloseTo(top + 2 * rh + 1.5); // RL (RR, la cuarta, en el aire)
    expect(legRects(ctx)[0].args[3]).toBeCloseTo(rh - 3);
  });
});

describe("Timeline › motor más caliente", () => {
  const heat = (ctx) => ctx.calls("fillRect").filter((c) => ["OK", "WARN", "CRIT"].includes(c.fillStyle));

  test("una franja por muestra con el color del semáforo (la última no tiene ancho todavía)", () => {
    const { tl, ctx } = setup();
    const temps = [39, 40, 60, 61, 99];
    draw(tl, { frames: timed(5, (i) => ({ motores: [["FR_calf", temps[i]]] })) });
    const r = heat(ctx);
    expect(r.map((c) => c.fillStyle)).toEqual(["OK", "WARN", "WARN", "CRIT"]);
    expect(r[0].args[0]).toBeCloseTo(X(NOW - 400));
    expect(r[0].args[2]).toBeCloseTo(X(NOW - 300) - X(NOW - 400) + 0.5);
    const y = 16 + (148 * 0.95) / 1.05 + 18;
    expect(r[0].args[1]).toBeCloseTo(y);
    expect(r[0].args[3]).toBeCloseTo((148 * 0.1) / 1.05);
  });

  test("saltea muestras sin motores, huecos y lo que queda fuera de la ventana", () => {
    const { tl, ctx } = setup();
    const frames = [
      frame({ receivedAt: NOW - 40_000, motores: [["a", 30]] }),
      frame({ receivedAt: NOW - 39_000, motores: [["a", 30]] }), // fuera de la ventana: ancho 0
      frame({ receivedAt: NOW - 20_000 }), // sin motores
      frame({ receivedAt: NOW - 19_900, motores: [["a", 70]] }), // la siguiente está a 2 s: hueco
      frame({ receivedAt: NOW - 17_900, motores: [["a", 45]] }),
      frame({ receivedAt: NOW - 17_800, motores: [["a", 61]] }), // la última: de acá a "ahora" hay un hueco
    ];
    draw(tl, { frames });
    expect(heat(ctx).map((c) => c.fillStyle)).toEqual(["WARN"]);
    expect(heat(ctx)[0].args[0]).toBeCloseTo(X(NOW - 17_900));
    expect(heat(ctx)[0].args[2]).toBeCloseTo(X(NOW - 17_800) - X(NOW - 17_900) + 0.5);
    // la muestra de −39 s todavía cuenta como visible (su sucesora entra a la ventana)
    expect(tl.count).toBe(5);
  });

  test("una muestra posterior a 'ahora' o repetida no dibuja franja", () => {
    const { tl, ctx } = setup();
    const frames = [
      frame({ receivedAt: NOW - 200, motores: [["a", 45]] }),
      frame({ receivedAt: NOW - 200, motores: [["a", 61]] }),
      frame({ receivedAt: NOW - 100, motores: [["a", 30]] }),
      frame({ receivedAt: NOW + 100, motores: [["a", 30]] }),
    ];
    draw(tl, { frames });
    expect(heat(ctx).map((c) => c.fillStyle)).toEqual(["CRIT", "OK"]);
    expect(heat(ctx)[1].args[2]).toBeCloseTo(RIGHT - X(NOW - 100) + 0.5);
  });
});

describe("Timeline › capturas", () => {
  const pins = (ctx) => ctx.calls("roundRect");

  test("cada captura manual es un alfiler numerado", () => {
    const { tl, ctx } = setup();
    draw(tl, { captures: [manual(1, NOW - 10_000), manual(12, NOW - 5_000)] });
    expect(pins(ctx)).toHaveLength(2);
    const px = Math.round(X(NOW - 5_000)) + 0.5;
    // se recorren de la más nueva a la más vieja
    expect(pins(ctx)[0].args).toEqual([px - 16 / 2 - 3, 0, 22, 15, 7.5]);
    expect(pins(ctx)[0].fillStyle).toBe("ACC");
    const label = ctx.calls("fillText").find((c) => c.args[0] === "12");
    expect(label.args).toEqual(["12", px, 8]);
    expect(label.fillStyle).toBe("ONACC");
    expect(label.textAlign).toBe("center");
    const stem = ctx.calls("lineTo").filter((c) => c.strokeStyle === "ACC");
    expect(stem.map((c) => c.args)).toEqual([[px, 182], [Math.round(X(NOW - 10_000)) + 0.5, 182]]);
    expect(stem[0].lineWidth).toBe(1.5);
    // el alfiler de un dígito tiene el ancho mínimo
    expect(pins(ctx)[1].args[2]).toBe(16);
  });

  test("la grabación continua es una franja sombreada, cortada por los huecos", () => {
    const { tl, ctx } = setup();
    const caps = [rec(1, NOW - 8_000), rec(2, NOW - 7_900), rec(3, NOW - 7_800), rec(4, NOW - 3_000), rec(5, NOW - 2_900)];
    draw(tl, { captures: caps });
    const bands = ctx.calls("fillRect").filter((c) => c.fillStyle === "ACC");
    expect(bands).toHaveLength(4);
    expect(bands[0].globalAlpha).toBe(0.14);
    expect(bands[1].globalAlpha).toBe(1);
    expect(bands[0].args[0]).toBeCloseTo(X(NOW - 3_000));
    expect(bands[0].args[1]).toBe(16);
    expect(bands[0].args[2]).toBeCloseTo(X(NOW - 2_900) - X(NOW - 3_000) + 2);
    expect(bands[0].args[3]).toBe(166);
    expect(bands[1].args[1]).toBe(14);
    expect(bands[1].args[3]).toBe(2);
    expect(bands[2].args[0]).toBeCloseTo(X(NOW - 8_000));
    expect(bands[2].args[2]).toBeCloseTo(X(NOW - 7_800) - X(NOW - 8_000) + 2);
    expect(pins(ctx)).toHaveLength(0);
  });

  test("una grabación de una sola muestra igual se ve (2 px)", () => {
    const { tl, ctx } = setup();
    draw(tl, { captures: [rec(1, NOW - 1_000)] });
    expect(ctx.calls("fillRect").filter((c) => c.fillStyle === "ACC")[0].args[2]).toBe(2);
  });

  test("ignora las capturas fuera de la ventana o del futuro y usa la hora de captura si falta la de la muestra", () => {
    const { tl, ctx } = setup();
    const noFrameTime = { n: 3, tipo: "manual", capturedAt: new Date(NOW - 1_000), frame: {} };
    draw(tl, { captures: [manual(1, NOW - 40_000), manual(2, NOW - 20_000), noFrameTime, manual(4, NOW + 500)] });
    expect(ctx.calls("fillText").filter((c) => c.font === "600 11px MONO").map((c) => c.args[0])).toEqual(["3", "2"]);
  });
});

describe("Timeline › eje de tiempo", () => {
  const axis = (ctx) => ctx.calls("fillText").filter((c) => c.textBaseline === "alphabetic");

  test("en la compu cada 5 s, con 'ahora' a la derecha", () => {
    const { tl, ctx } = setup();
    draw(tl);
    const a = axis(ctx);
    expect(a.map((c) => c.args[0])).toEqual(["ahora", "−5 s", "−10 s", "−15 s", "−20 s", "−25 s", "−30 s"]);
    expect(a.map((c) => c.textAlign)).toEqual(["right", "center", "center", "center", "center", "center", "left"]);
    expect(a[0].args).toEqual(["ahora", RIGHT, 197]);
    expect(a[1].args[1]).toBeCloseTo(RIGHT - 110);
    expect(a.at(-1).args[1]).toBeCloseTo(LEFT);
    expect(a[0].font).toBe("11px MONO");
  });

  test("en el celular cada 10 s", () => {
    const { tl, ctx } = setup(400, 200);
    draw(tl);
    expect(axis(ctx).map((c) => c.args[0])).toEqual(["ahora", "−10 s", "−20 s", "−30 s"]);
  });

  test("cuenta las muestras visibles, más la anterior a la ventana (la línea entra desde el borde)", () => {
    const { tl } = setup();
    const frames = [frame({ receivedAt: NOW - 50_000 }), frame({ receivedAt: NOW - 40_000 }), ...timed(3)];
    draw(tl, { frames });
    expect(tl.count).toBe(4);
  });

  test("con 60 s reales del simulador quedan 301 muestras en la ventana más la anterior", () => {
    const { tl, ctx } = setup();
    const frames = simFrames("go2", 600, { start: NOW - 59_900 });
    draw(tl, { frames, now: frames.at(-1).receivedAt });
    expect(tl.count).toBe(302);
    expect(ctx.calls("lineTo").length).toBeGreaterThan(300);
  });
});
