// CaptureStore: capturas congeladas, tope de memoria y suscriptores.
import { describe, it, expect, vi, afterEach } from "vitest";
import { CaptureStore } from "../../js/core/CaptureStore.js";

afterEach(() => vi.useRealTimers());

describe("CaptureStore", () => {
  it("por defecto admite hasta 50 000 muestras", () => {
    expect(new CaptureStore().maxSamples).toBe(50_000);
    expect(new CaptureStore({}).maxSamples).toBe(50_000);
  });

  it("agrega una copia numerada con tipo, fecha de recepción y el frame clonado", () => {
    const store = new CaptureStore();
    const frame = { modelo: "go2", receivedAt: 1_700_000_000_000, motores: [{ t: 1 }] };
    const s = store.add(frame);
    expect(s).toEqual({ n: 1, tipo: "manual", capturedAt: new Date(1_700_000_000_000), frame });
    expect(s.frame).not.toBe(frame);
    frame.motores[0].t = 99;
    expect(s.frame.motores[0].t).toBe(1); // la captura quedó congelada
    expect(store.size).toBe(1);
    expect(store.samples).toEqual([s]);
    const s2 = store.add(frame, "continua");
    expect(s2.n).toBe(2);
    expect(s2.tipo).toBe("continua");
  });

  it("sin receivedAt usa la hora actual", () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T17:30:05Z") });
    const s = new CaptureStore().add({ modelo: "g1" });
    expect(s.capturedAt.toISOString()).toBe("2026-10-29T17:30:05.000Z");
  });

  it.each([null, undefined])("ignora un frame %s sin avisar a nadie", (frame) => {
    const store = new CaptureStore();
    const fn = vi.fn();
    store.subscribe(fn);
    expect(store.add(frame)).toBeNull();
    expect(store.size).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it("al llegar al tope devuelve null y no agrega más", () => {
    const store = new CaptureStore({ maxSamples: 2 });
    const fn = vi.fn();
    store.subscribe(fn);
    expect(store.add({ a: 1 })).not.toBeNull();
    expect(store.add({ a: 2 })).not.toBeNull();
    expect(store.add({ a: 3 })).toBeNull();
    expect(store.size).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("avisa a los suscriptores al agregar y al vaciar, hasta que se desuscriben", () => {
    const store = new CaptureStore();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.add({ a: 1 });
    expect(fn).toHaveBeenLastCalledWith(store);
    store.clear();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(0);
    expect(store.samples).toEqual([]);
    expect(off()).toBe(true);
    store.add({ a: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("después de vaciar la numeración vuelve a empezar en 1", () => {
    const store = new CaptureStore();
    store.add({ a: 1 });
    store.add({ a: 2 });
    store.clear();
    expect(store.add({ a: 3 }).n).toBe(1);
  });
});
