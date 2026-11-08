// TelemetryService (Facade): elige el transporte, consulta /info, normaliza y mide.
// Los transportes se reemplazan por dobles para controlar cuándo llega cada dato.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventBus } from "../../js/core/EventBus.js";
import { rawFrame, respuesta } from "./helpers.js";

const dobles = vi.hoisted(() => {
  const crear = (name, conInfo = false) => {
    const Clase = class {
      static instances = [];
      constructor(opts) {
        this.name = name;
        this.opts = opts;
        this.start = vi.fn();
        this.stop = vi.fn();
        if (conInfo) this.info = vi.fn(() => ({ modelo: "g1", n_motores: 29, modo: "demo" }));
        Clase.instances.push(this);
      }
      /** Simula lo que haría el transporte real. */
      state(state, detail) {
        this.opts.onState(state, detail);
      }
      data(raw, meta) {
        this.opts.onData(raw, meta);
      }
    };
    return Clase;
  };
  return { WS: crear("websocket"), Polling: crear("polling"), Sim: crear("sim", true) };
});

vi.mock("../../js/services/WebSocketTransport.js", () => ({ WebSocketTransport: dobles.WS }));
vi.mock("../../js/services/PollingTransport.js", () => ({ PollingTransport: dobles.Polling }));
vi.mock("../../js/services/SimTransport.js", async (importOriginal) => ({
  ...(await importOriginal()),
  SimTransport: dobles.Sim,
}));

const { TelemetryService } = await import("../../js/services/TelemetryService.js");

const INFO_GO2 = { modelo: "go2", nombre: "Unitree Go2 EDU", n_motores: 12 };

/** fetch falso: /info responde `info` (o falla si es un Error). */
function stubInfo(info = INFO_GO2) {
  const fetch = vi.fn(async (url) => {
    if (!String(url).endsWith("/info")) throw new Error(`pedido inesperado: ${url}`);
    if (info instanceof Error) throw info;
    return respuesta(typeof info === "function" ? info() : info);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Bus con registro de todo lo publicado. */
function busGrabador() {
  const bus = new EventBus();
  const ev = { connection: [], info: [], "info-error": [], frame: [], stats: [] };
  for (const k of Object.keys(ev)) bus.on(k, (p) => ev[k].push(p));
  return { bus, ev };
}

let service;
let ev;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
  for (const C of Object.values(dobles)) C.instances = [];
  const g = busGrabador();
  ev = g.ev;
  service = new TelemetryService(g.bus);
});
afterEach(() => {
  service.disconnect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const transporte = () => [dobles.WS, dobles.Polling, dobles.Sim].flatMap((C) => C.instances).at(-1);
const estados = () => ev.connection.map((c) => c.state);

describe("estado inicial", () => {
  it("arranca desconectado, sin métricas y con WebSocket a 250 ms", () => {
    expect(service.state).toBe("offline");
    expect(service.options).toEqual({ baseUrl: "", transport: "websocket", intervalMs: 250 });
    expect(service.frames).toBe(0);
    expect(service.errors).toBe(0);
    expect(service.gapMs).toBeNull();
    expect(service.rttMs).toBeNull();
    expect(service.stats()).toEqual({ hz: 0, gapMs: null, rttMs: null, frames: 0, errors: 0, transport: "websocket" });
  });

  it("refreshInfo sin haberse conectado publica info-error y devuelve null", async () => {
    await expect(service.refreshInfo()).resolves.toBeNull();
    expect(ev["info-error"]).toHaveLength(1);
    expect(ev["info-error"][0]).toBeInstanceOf(TypeError);
    expect(ev.info).toEqual([]);
  });

  it("desconectar sin estar conectado no publica nada", () => {
    service.disconnect();
    expect(ev.connection).toEqual([]);
  });
});

describe("connect", () => {
  it("por defecto usa WebSocket hacia la dirección normalizada, consulta /info y recién después arranca", async () => {
    const fetch = stubInfo();
    const p = service.connect({ baseUrl: "robot:8001/" });
    const t = transporte();
    expect(t).toBeInstanceOf(dobles.WS);
    expect(t.opts).toMatchObject({ baseUrl: "http://robot:8001", intervalMs: 250 });
    expect(ev.connection).toEqual([
      { state: "connecting", changed: true, detail: "http://robot:8001", transport: "websocket", baseUrl: "http://robot:8001" },
    ]);
    expect(t.start).not.toHaveBeenCalled(); // espera a /info
    await p;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("http://robot:8001/info");
    expect(ev.info).toEqual([INFO_GO2]);
    expect(t.start).toHaveBeenCalledTimes(1);
    expect(service.options).toEqual({ baseUrl: "robot:8001/", transport: "websocket", intervalMs: 250 });
  });

  it("con transport 'polling' usa PollingTransport con el intervalo pedido", async () => {
    stubInfo();
    await service.connect({ baseUrl: "http://x", transport: "polling", intervalMs: 100 });
    expect(transporte()).toBeInstanceOf(dobles.Polling);
    expect(transporte().opts.intervalMs).toBe(100);
    expect(service.stats().transport).toBe("polling");
  });

  it("un transporte desconocido cae en WebSocket", async () => {
    stubInfo();
    await service.connect({ baseUrl: "http://x", transport: "palomas" });
    expect(transporte()).toBeInstanceOf(dobles.WS);
  });

  it("'demo-g1' usa el simulador del navegador: su info, sin pedir nada a la red", async () => {
    const fetch = stubInfo();
    await service.connect({ baseUrl: "demo-g1" });
    const t = transporte();
    expect(t).toBeInstanceOf(dobles.Sim);
    expect(t.opts.baseUrl).toBe("demo-g1");
    expect(fetch).not.toHaveBeenCalled();
    expect(ev.info).toEqual([{ modelo: "g1", n_motores: 29, modo: "demo" }]);
    expect(ev.connection[0]).toEqual({ state: "connecting", changed: true, detail: "demo-g1", transport: "sim", baseUrl: "demo-g1" });
    expect(t.start).toHaveBeenCalledTimes(1);
  });

  it("si /info falla, publica info-error y arranca igual", async () => {
    const falla = new Error("sin /info");
    stubInfo(falla);
    await service.connect({ baseUrl: "http://x" });
    expect(ev["info-error"]).toEqual([falla]);
    expect(ev.info).toEqual([]);
    expect(transporte().start).toHaveBeenCalledTimes(1);
  });

  it("una dirección vacía falla antes de crear el transporte", async () => {
    await expect(service.connect({ baseUrl: "  " })).rejects.toThrow("Falta la dirección del servidor");
    expect(transporte()).toBeUndefined();
  });

  it("reconectar detiene el transporte anterior y conserva las opciones no indicadas", async () => {
    stubInfo();
    await service.connect({ baseUrl: "http://x", transport: "polling", intervalMs: 120 });
    const viejo = transporte();
    await service.connect({ transport: "websocket" });
    expect(viejo.stop).toHaveBeenCalledTimes(1);
    expect(service.options).toEqual({ baseUrl: "http://x", transport: "websocket", intervalMs: 120 });
    expect(estados()).toEqual(["connecting", "offline", "connecting"]);
  });

  it("si se desconecta mientras espera /info, no arranca el transporte", async () => {
    let responder;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => (responder = r))));
    const p = service.connect({ baseUrl: "http://x" });
    const t = transporte();
    service.disconnect();
    responder(respuesta(INFO_GO2));
    await p;
    expect(t.start).not.toHaveBeenCalled();
    expect(t.stop).toHaveBeenCalledTimes(1);
    expect(service.state).toBe("offline");
  });
});

describe("setTransport", () => {
  it("cambia de estrategia en caliente con la misma dirección", async () => {
    stubInfo();
    await service.connect({ baseUrl: "http://x", intervalMs: 300 });
    await service.setTransport("polling");
    expect(transporte()).toBeInstanceOf(dobles.Polling);
    expect(transporte().opts).toMatchObject({ baseUrl: "http://x", intervalMs: 300 });
    await service.setTransport("polling", 80);
    expect(transporte().opts.intervalMs).toBe(80);
    expect(service.options.intervalMs).toBe(80);
  });
});

describe("estado de la conexión", () => {
  beforeEach(async () => {
    stubInfo();
    await service.connect({ baseUrl: "http://x" });
    ev.connection.length = 0;
  });

  it("publica los cambios que informa el transporte", () => {
    transporte().state("live");
    expect(ev.connection).toEqual([{ state: "live", changed: true, detail: "", transport: "websocket", baseUrl: "http://x" }]);
    expect(service.state).toBe("live");
  });

  it("no repite un aviso idéntico, pero sí publica un detalle nuevo con changed=false", () => {
    transporte().state("reconnecting", "código 1006 · reintento en 0.5 s");
    transporte().state("reconnecting", "código 1006 · reintento en 0.5 s");
    transporte().state("reconnecting", "código 1006 · reintento en 1.0 s");
    expect(ev.connection.map(({ state, changed, detail }) => ({ state, changed, detail }))).toEqual([
      { state: "reconnecting", changed: true, detail: "código 1006 · reintento en 0.5 s" },
      { state: "reconnecting", changed: false, detail: "código 1006 · reintento en 1.0 s" },
    ]);
  });

  it("al desconectar publica 'offline' una sola vez, ya sin transporte", () => {
    const t = transporte();
    service.disconnect();
    service.disconnect();
    expect(t.stop).toHaveBeenCalledTimes(1);
    expect(ev.connection).toEqual([{ state: "offline", changed: true, detail: "", transport: "websocket", baseUrl: "http://x" }]);
  });
});

describe("muestras", () => {
  beforeEach(async () => {
    stubInfo();
    await service.connect({ baseUrl: "http://x", transport: "polling" });
    // performance.now() = 0 se usa como "todavía no llegó nada": el reloj falso arranca en 0.
    vi.advanceTimersByTime(1000);
  });

  it("normaliza cada muestra, la publica y pasa a 'live' una sola vez", () => {
    transporte().data(rawFrame("go2"));
    transporte().data(rawFrame("go2"));
    expect(ev.frame).toHaveLength(2);
    expect(ev.frame[0].motores).toHaveLength(12);
    expect(ev.frame[0].derived.legs).toBe(4);
    expect(ev.frame[0].receivedAt).toBe(Date.now());
    expect(estados()).toEqual(["connecting", "live"]);
    expect(service.frames).toBe(2);
    expect(ev.stats).toHaveLength(2);
    expect(ev.stats[1]).toEqual(service.stats());
  });

  it("descarta una muestra inválida, la cuenta como error y no publica nada", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    transporte().data(null);
    expect(service.errors).toBe(1);
    expect(service.frames).toBe(0);
    expect(ev.frame).toEqual([]);
    expect(warn).toHaveBeenCalledExactlyOnceWith("[Telemetría] Muestra inválida descartada", expect.any(TypeError));
    expect(service.state).toBe("connecting");
  });

  it("registra el tiempo de ida y vuelta del polling, o null si no viene", () => {
    transporte().data(rawFrame(), { rttMs: 42 });
    expect(service.rttMs).toBe(42);
    expect(ev.stats[0].rttMs).toBe(42);
    transporte().data(rawFrame());
    expect(service.rttMs).toBeNull();
  });

  it("suaviza el intervalo entre muestras con una media móvil (80 % / 20 %)", () => {
    transporte().data(rawFrame());
    expect(service.gapMs).toBeNull();
    vi.advanceTimersByTime(100);
    transporte().data(rawFrame());
    expect(service.gapMs).toBe(100);
    vi.advanceTimersByTime(200);
    transporte().data(rawFrame());
    expect(service.gapMs).toBeCloseTo(120, 9);
  });

  it("calcula la frecuencia con las muestras de los últimos 2 s", () => {
    for (let i = 0; i <= 10; i++) {
      transporte().data(rawFrame());
      if (i < 10) vi.advanceTimersByTime(100);
    }
    expect(service.stats().hz).toBeCloseTo(10, 9);
    vi.advanceTimersByTime(1000); // la primera queda a exactamente 2 s: todavía cuenta
    transporte().data(rawFrame());
    expect(service.stats().hz).toBeCloseTo(11 / 2, 9);
    vi.advanceTimersByTime(2001); // todas las anteriores quedan a más de 2 s
    transporte().data(rawFrame());
    expect(service.stats().hz).toBe(0);
    expect(service.stats().frames).toBe(13);
  });

  it("si el robot cambia de modelo, vuelve a consultar /info", async () => {
    const fetch = stubInfo({ modelo: "g1", n_motores: 29 });
    transporte().data(rawFrame("go2"));
    expect(fetch).not.toHaveBeenCalled();
    transporte().data(rawFrame("g1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ev.info.at(-1)).toEqual({ modelo: "g1", n_motores: 29 });
    transporte().data(rawFrame("g1"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("al desconectar se borran el intervalo, la latencia y la frecuencia, pero no los contadores", () => {
    transporte().data(rawFrame(), { rttMs: 5 });
    vi.advanceTimersByTime(100);
    transporte().data(rawFrame(), { rttMs: 5 });
    service.disconnect();
    expect(service.gapMs).toBeNull();
    expect(service.rttMs).toBeNull();
    expect(service.stats()).toEqual({ hz: 0, gapMs: null, rttMs: null, frames: 2, errors: 0, transport: "polling" });
  });
});

describe("sin /info", () => {
  it("no reconsulta /info por un cambio de modelo si nunca supo cuál era", async () => {
    const fetch = stubInfo(new Error("no hay"));
    await service.connect({ baseUrl: "http://x" });
    transporte().data(rawFrame("go2"));
    transporte().data(rawFrame("g1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("vigilante de datos", () => {
  beforeEach(async () => {
    stubInfo();
    await service.connect({ baseUrl: "http://x" });
  });

  it("si dejan de llegar muestras por más de 2 s, pasa a 'stale'", () => {
    transporte().data(rawFrame());
    vi.advanceTimersByTime(2000);
    expect(service.state).toBe("live"); // a los 2 s justos todavía no
    vi.advanceTimersByTime(500);
    expect(service.state).toBe("stale");
    expect(ev.connection.at(-1)).toMatchObject({ state: "stale", detail: "sin datos hace más de 2 s", changed: true });
    transporte().data(rawFrame());
    expect(service.state).toBe("live");
  });

  it("no marca 'stale' si nunca estuvo en vivo", () => {
    vi.advanceTimersByTime(10_000);
    expect(service.state).toBe("connecting");
  });

  it("al desconectar deja de vigilar", () => {
    transporte().data(rawFrame());
    service.disconnect();
    vi.advanceTimersByTime(10_000);
    expect(estados().at(-1)).toBe("offline");
    expect(vi.getTimerCount()).toBe(0);
  });
});
