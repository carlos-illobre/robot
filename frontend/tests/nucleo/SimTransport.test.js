// SimTransport: telemetría generada en el navegador con la misma interfaz que los demás transportes.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SimTransport, isSimUrl, simModel } from "../../js/services/SimTransport.js";
import { PaseoSim } from "../../js/core/paseoSim.js";

beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date", "performance"] }));
afterEach(() => vi.useRealTimers());

const crear = (extra = {}) => {
  const onData = vi.fn();
  const onState = vi.fn();
  const t = new SimTransport({ baseUrl: "demo", onData, onState, ...extra });
  return { t, onData, onState };
};

describe("isSimUrl", () => {
  it.each(["demo", "DEMO", " demo ", "demo-g1", "Demo-G1", "demo-go2"])("%j es el simulador", (url) => {
    expect(isSimUrl(url)).toBe(true);
  });

  it.each(["http://demo:8001", "demo-b2", "demos", "mi-demo", "", null, undefined, "demo-g1x"])("%j no es el simulador", (url) => {
    expect(isSimUrl(url)).toBe(false);
  });
});

describe("simModel", () => {
  it.each([
    ["demo-g1", "g1"],
    ["DEMO-G1", "g1"],
    ["demo", "go2"],
    ["demo-go2", "go2"],
    [undefined, "go2"],
  ])("%j → %s", (url, modelo) => {
    expect(simModel(url)).toBe(modelo);
  });
});

describe("SimTransport", () => {
  it("se presenta como 'sim' y simula el robot de la dirección", () => {
    const { t } = crear({ baseUrl: "demo-g1" });
    expect(t.name).toBe("sim");
    expect(t.label).toBe("Simulador local");
    expect(t.sim).toBeInstanceOf(PaseoSim);
    expect(t.sim.modelo).toBe("g1");
    expect(crear().t.sim.modelo).toBe("go2");
  });

  it("arranca con 25 s de precalentamiento a 10 Hz por defecto", () => {
    const { t } = crear();
    expect(t.sim.t).toBeCloseTo(25, 6);
    expect(t.periodMs).toBe(100);
  });

  it("acepta otro precalentamiento y otra frecuencia", () => {
    const { t } = crear({ warmupS: 0, rateHz: 4 });
    expect(t.sim.t).toBe(0);
    expect(t.periodMs).toBe(250);
  });

  it("info() es la de GET /info del simulador", () => {
    const { t } = crear({ baseUrl: "demo-g1" });
    expect(t.info()).toEqual(t.sim.info());
    expect(t.info().n_motores).toBe(29);
  });

  it("start avisa 'connecting' y después entrega una muestra por período, en vivo", () => {
    const { t, onState, onData } = crear({ warmupS: 0 });
    t.start();
    expect(onState).toHaveBeenCalledExactlyOnceWith("connecting", "simulador en el navegador");
    vi.advanceTimersByTime(99);
    expect(onData).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onState).toHaveBeenLastCalledWith("live");
    expect(onData).toHaveBeenCalledTimes(1);
    const muestra = onData.mock.calls[0][0];
    expect(muestra.modelo).toBe("go2");
    expect(muestra.ts).toBe(0.1);
    expect(onData.mock.calls[0]).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(onData).toHaveBeenCalledTimes(5);
    expect(onData.mock.calls[4][0].ts).toBe(0.5);
    t.stop();
  });

  it("el tiempo simulado sigue al reloj real", () => {
    const { t } = crear({ warmupS: 0, rateHz: 5 });
    t.start();
    vi.advanceTimersByTime(1000);
    expect(t.sim.t).toBeCloseTo(1, 6);
    t.stop();
  });

  it("si la pestaña se congela, no avanza más de 0,5 s de golpe", () => {
    const { t } = crear({ warmupS: 0, rateHz: 0.5 }); // un tick cada 2 s
    t.start();
    vi.advanceTimersByTime(2000);
    expect(t.sim.t).toBeCloseTo(0.5, 6);
    t.stop();
  });

  it("stop corta la generación de muestras", () => {
    const { t, onData } = crear();
    t.start();
    vi.advanceTimersByTime(200);
    t.stop();
    vi.advanceTimersByTime(5000);
    expect(onData).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
