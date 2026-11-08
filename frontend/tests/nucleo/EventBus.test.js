// EventBus (Observer): suscripción, desuscripción y aislamiento de errores.
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../js/core/EventBus.js";

describe("EventBus", () => {
  it("entrega el payload a todos los suscriptores del evento, y solo a ellos", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    const otro = vi.fn();
    bus.on("frame", a);
    bus.on("frame", b);
    bus.on("info", otro);
    bus.emit("frame", { n: 1 });
    expect(a).toHaveBeenCalledExactlyOnceWith({ n: 1 });
    expect(b).toHaveBeenCalledExactlyOnceWith({ n: 1 });
    expect(otro).not.toHaveBeenCalled();
  });

  it("emitir un evento sin suscriptores no hace nada ni falla", () => {
    expect(() => new EventBus().emit("nadie", 1)).not.toThrow();
  });

  it("la función que devuelve `on` desuscribe a ese manejador", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    const off = bus.on("x", a);
    bus.on("x", b);
    off();
    bus.emit("x", 2);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(2);
  });

  it("`off` de un evento desconocido no falla", () => {
    expect(() => new EventBus().off("nunca", () => {})).not.toThrow();
  });

  it("suscribir dos veces el mismo manejador lo llama una sola vez", () => {
    const bus = new EventBus();
    const a = vi.fn();
    bus.on("x", a);
    bus.on("x", a);
    bus.emit("x");
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("un suscriptor que tira error no impide que los demás reciban el evento", () => {
    const bus = new EventBus();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const falla = new Error("boom");
    const sano = vi.fn();
    bus.on("frame", () => {
      throw falla;
    });
    bus.on("frame", sano);
    bus.emit("frame", 7);
    expect(sano).toHaveBeenCalledWith(7);
    expect(error).toHaveBeenCalledExactlyOnceWith('[EventBus] Error en un suscriptor de "frame"', falla);
  });
});
