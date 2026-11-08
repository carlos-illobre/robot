// Sonido de la cabina con un Web Audio falso: se verifica lo que queda programado.
import { describe, test, expect, vi, afterEach } from "vitest";
import { CockpitSound } from "../../js/views/pilot/CockpitSound.js";
import { audioFalso } from "./helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Sonido prendido con un AudioContext falso en estado `state`. */
function prendido(opts) {
  const audio = audioFalso(opts);
  vi.stubGlobal("AudioContext", audio.FakeAudioContext);
  const sound = new CockpitSound();
  sound.toggle();
  return { sound, ctx: audio.contextos[0], audio };
}

/** Lo que se programó en el i-ésimo tono. */
function tono(ctx, i) {
  const osc = ctx.osciladores[i];
  const gain = ctx.ganancias[i];
  return {
    osc,
    gain,
    freq: osc.frequency.value,
    type: osc.type,
    start: osc.start.mock.calls[0][0],
    stop: osc.stop.mock.calls[0][0],
    attack: gain.gain.linearRampToValueAtTime.mock.calls[0],
    decay: gain.gain.exponentialRampToValueAtTime.mock.calls[0],
    zero: gain.gain.setValueAtTime.mock.calls[0],
  };
}

describe("toggle", () => {
  test("arranca apagado y sin crear el AudioContext", () => {
    const audio = audioFalso();
    vi.stubGlobal("AudioContext", audio.FakeAudioContext);
    const sound = new CockpitSound();
    expect(sound.enabled).toBe(false);
    expect(audio.contextos).toHaveLength(0);
  });

  test("al prenderlo crea un solo AudioContext y lo reutiliza", () => {
    const { sound, audio } = prendido();
    expect(sound.enabled).toBe(true);
    expect(sound.toggle()).toBe(false);
    expect(sound.toggle()).toBe(true);
    expect(audio.contextos).toHaveLength(1);
  });

  test("reanuda un contexto suspendido por el navegador", () => {
    const { ctx } = prendido({ state: "suspended" });
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe("running");
  });

  test("no reanuda un contexto que ya está sonando", () => {
    const { ctx } = prendido({ state: "running" });
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  test("usa webkitAudioContext si no hay AudioContext", () => {
    const audio = audioFalso();
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", audio.FakeAudioContext);
    const sound = new CockpitSound();
    expect(sound.toggle()).toBe(true);
    expect(audio.contextos).toHaveLength(1);
  });

  test("sin Web Audio queda apagado y devuelve false", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const sound = new CockpitSound();
    expect(sound.toggle()).toBe(false);
    expect(sound.enabled).toBe(false);
  });

  test("respeta el valor forzado", () => {
    const { sound } = prendido();
    expect(sound.toggle(true)).toBe(true);
    expect(sound.toggle(false)).toBe(false);
    expect(sound.toggle(false)).toBe(false);
    expect(sound.enabled).toBe(false);
  });
});

describe("step", () => {
  test("programa un tic triangular con el tono de la pata", () => {
    const { sound, ctx } = prendido({ currentTime: 10 });
    sound.step("FR");
    const t = tono(ctx, 0);
    expect(t.freq).toBe(220);
    expect(t.type).toBe("triangle");
    expect(t.zero).toEqual([0, 10]);
    expect(t.attack[0]).toBe(0.05);
    expect(t.attack[1]).toBeCloseTo(10.005, 9);
    expect(t.decay[0]).toBe(0.0001);
    expect(t.decay[1]).toBeCloseTo(10.06, 9);
    expect(t.start).toBe(10);
    expect(t.stop).toBeCloseTo(10.08, 9);
  });

  test("conecta oscilador → ganancia → salida", () => {
    const { sound, ctx } = prendido();
    sound.step("RL");
    const { osc, gain } = tono(ctx, 0);
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
  });

  test("cada pata y cada pie tiene su frecuencia; una desconocida suena a 200 Hz", () => {
    const { sound, ctx } = prendido();
    const legs = ["FR", "FL", "RR", "RL", "R_foot", "L_foot", "X"];
    legs.forEach((leg) => sound.step(leg));
    expect(ctx.osciladores.map((o) => o.frequency.value)).toEqual([220, 247, 196, 175, 220, 196, 200]);
  });

  test("apagado no programa nada", () => {
    const { sound, ctx } = prendido();
    sound.toggle(false);
    sound.step("FR");
    expect(ctx.osciladores).toHaveLength(0);
  });

  test("con el contexto todavía suspendido no programa nada", () => {
    const { sound, ctx } = prendido();
    ctx.state = "suspended";
    sound.step("FR");
    expect(ctx.osciladores).toHaveLength(0);
  });

  test("prendido a mano sin contexto creado no hace nada ni falla", () => {
    const sound = new CockpitSound();
    sound.enabled = true;
    expect(() => sound.step("FR")).not.toThrow();
    expect(() => sound.shutter()).not.toThrow();
  });
});

describe("alarm", () => {
  test("programa dos tonos senoidales, agudo y después grave", () => {
    vi.spyOn(performance, "now").mockReturnValue(5000);
    const { sound, ctx } = prendido({ currentTime: 2 });
    sound.alarm();
    expect(ctx.osciladores).toHaveLength(2);
    const a = tono(ctx, 0);
    const b = tono(ctx, 1);
    expect([a.freq, a.type, a.start]).toEqual([880, "sine", 2]);
    expect(a.attack[0]).toBe(0.06);
    expect(a.decay[1]).toBeCloseTo(2.12, 9);
    expect(a.stop).toBeCloseTo(2.14, 9);
    expect([b.freq, b.type]).toEqual([660, "sine"]);
    expect(b.start).toBeCloseTo(2.15, 9);
    expect(b.decay[1]).toBeCloseTo(2.31, 9);
    expect(b.stop).toBeCloseTo(2.33, 9);
  });

  test("no repite antes de 2,5 s y vuelve a sonar justo a los 2,5 s", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    const { sound, ctx } = prendido();
    sound.alarm();
    now.mockReturnValue(12_499);
    sound.alarm();
    expect(ctx.osciladores).toHaveLength(2);
    now.mockReturnValue(12_500);
    sound.alarm();
    expect(ctx.osciladores).toHaveLength(4);
  });

  test("apagado no suena ni consume la espera", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    const { sound, ctx } = prendido();
    sound.toggle(false);
    sound.alarm();
    sound.toggle(true);
    now.mockReturnValue(10_001);
    sound.alarm();
    expect(ctx.osciladores).toHaveLength(2);
  });
});

describe("shutter y destroy", () => {
  test("el obturador es un clic cuadrado de 1320 Hz", () => {
    const { sound, ctx } = prendido({ currentTime: 1 });
    sound.shutter();
    const t = tono(ctx, 0);
    expect([t.freq, t.type, t.start]).toEqual([1320, "square", 1]);
    expect(t.attack[0]).toBe(0.04);
    expect(t.stop).toBeCloseTo(1.07, 9);
  });

  test("destroy apaga y cierra el contexto; al prender de nuevo crea otro", () => {
    const { sound, ctx, audio } = prendido();
    sound.destroy();
    expect(sound.enabled).toBe(false);
    expect(ctx.close).toHaveBeenCalledTimes(1);
    sound.toggle();
    expect(audio.contextos).toHaveLength(2);
  });

  test("destroy sin haber prendido nunca no falla", () => {
    const sound = new CockpitSound();
    expect(() => sound.destroy()).not.toThrow();
    expect(sound.enabled).toBe(false);
  });
});
