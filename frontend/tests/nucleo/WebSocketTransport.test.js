// WebSocketTransport: conexión, mensajes, reconexión con backoff y parada.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketTransport } from "../../js/services/WebSocketTransport.js";
import { FakeWebSocket } from "./helpers.js";

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5); // sin jitter: demora = base
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const crear = (extra = {}) => {
  const onData = vi.fn();
  const onState = vi.fn();
  const t = new WebSocketTransport({ baseUrl: "robot:8001", onData, onState, ...extra });
  return { t, onData, onState };
};

describe("WebSocketTransport.backoffDelay", () => {
  it.each([
    [0, 500],
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 8000],
    [5, 8000],
    [20, 8000],
  ])("intento %i → %i ms sin azar", (intento, ms) => {
    expect(WebSocketTransport.backoffDelay(intento, 500, 8000, () => 0.5)).toBe(ms);
  });

  it("el azar mueve la demora entre -25 % y +25 %", () => {
    expect(WebSocketTransport.backoffDelay(1, 500, 8000, () => 0)).toBe(750);
    expect(WebSocketTransport.backoffDelay(1, 500, 8000, () => 1)).toBe(1250);
    expect(WebSocketTransport.backoffDelay(0, 100, 8000, () => 0.123)).toBe(Math.round(100 * (0.75 + 0.123 * 0.5)));
  });

  it("usa 500 ms, 8 s y Math.random por defecto", () => {
    Math.random.mockReturnValue(1);
    expect(WebSocketTransport.backoffDelay(0)).toBe(625);
    expect(WebSocketTransport.backoffDelay(10)).toBe(10_000);
  });
});

describe("constructor", () => {
  it("arma la URL ws:// y se presenta como 'websocket'", () => {
    const { t } = crear();
    expect(t.url).toBe("ws://robot:8001/ws");
    expect(t.name).toBe("websocket");
    expect(t.label).toBe("WebSocket");
    expect(t.minDelayMs).toBe(500);
    expect(t.maxDelayMs).toBe(8000);
  });

  it("con https usa wss:// y acepta otras demoras", () => {
    const { t } = crear({ baseUrl: "https://robot.example.com", minDelayMs: 100, maxDelayMs: 1000 });
    expect(t.url).toBe("wss://robot.example.com/ws");
    expect(t.minDelayMs).toBe(100);
    expect(t.maxDelayMs).toBe(1000);
  });

  it("no abre nada hasta start()", () => {
    crear();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe("conexión y mensajes", () => {
  it("start abre el socket y avisa 'connecting'; al abrir, 'live'", () => {
    const { t, onState } = crear();
    t.start();
    expect(onState).toHaveBeenCalledExactlyOnceWith("connecting", "ws://robot:8001/ws");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.last().url).toBe("ws://robot:8001/ws");
    FakeWebSocket.last().open();
    expect(onState).toHaveBeenLastCalledWith("live");
  });

  it("entrega cada mensaje JSON ya parseado", () => {
    const { t, onData } = crear();
    t.start();
    FakeWebSocket.last().message('{"modelo":"go2","ts":1.5}');
    expect(onData).toHaveBeenCalledExactlyOnceWith({ modelo: "go2", ts: 1.5 });
  });

  it("descarta un mensaje que no es JSON con un aviso, y sigue funcionando", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { t, onData } = crear();
    t.start();
    FakeWebSocket.last().message("<html>");
    expect(onData).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith("[WS] Mensaje no JSON descartado", expect.any(SyntaxError));
    FakeWebSocket.last().message("[1]");
    expect(onData).toHaveBeenCalledWith([1]);
  });

  it("un error del socket no cambia el estado: el detalle llega con el cierre", () => {
    const { t, onState } = crear();
    t.start();
    expect(FakeWebSocket.last().onerror()).toBeUndefined();
    expect(onState).toHaveBeenCalledTimes(1);
  });
});

describe("reconexión", () => {
  it("si el servidor corta, reintenta con backoff exponencial: 0,5 s, 1 s, 2 s…", () => {
    const { t, onState } = crear();
    t.start();
    FakeWebSocket.last().serverClose(1006);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "código 1006 · reintento en 0.5 s");
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "ws://robot:8001/ws");

    FakeWebSocket.last().serverClose(1011);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "código 1011 · reintento en 1.0 s");
    vi.advanceTimersByTime(1000);
    FakeWebSocket.last().serverClose(1006);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "código 1006 · reintento en 2.0 s");
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(4);
    t.stop();
  });

  it("al volver a conectar se reinicia el backoff (el próximo corte espera 0,5 s otra vez)", () => {
    const { t, onState } = crear();
    t.start();
    FakeWebSocket.last().serverClose();
    vi.advanceTimersByTime(500);
    FakeWebSocket.last().serverClose();
    vi.advanceTimersByTime(1000);
    FakeWebSocket.last().open();
    expect(onState).toHaveBeenLastCalledWith("live");
    FakeWebSocket.last().serverClose(1001);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "código 1001 · reintento en 0.5 s");
    vi.advanceTimersByTime(500);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "ws://robot:8001/ws");
    t.stop();
  });

  it("respeta las demoras mínima y máxima configuradas", () => {
    const { t, onState } = crear({ minDelayMs: 100, maxDelayMs: 150 });
    t.start();
    FakeWebSocket.last().serverClose();
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "código 1006 · reintento en 0.1 s");
    vi.advanceTimersByTime(100);
    FakeWebSocket.last().serverClose();
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "código 1006 · reintento en 0.1 s"); // 150 ms
    vi.advanceTimersByTime(149);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
    t.stop();
  });

  it("si el navegador rechaza la URL al crear el socket, reintenta igual", () => {
    let fallas = 1;
    vi.stubGlobal(
      "WebSocket",
      class extends FakeWebSocket {
        constructor(url) {
          if (fallas-- > 0) throw new SyntaxError("URL inválida");
          super(url);
        }
      },
    );
    const { t, onState } = crear();
    t.start();
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "URL inválida · reintento en 0.5 s");
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(1);
    t.stop();
  });
});

describe("stop", () => {
  it("cierra el socket con código 1000 y no reintenta", () => {
    const { t, onState } = crear();
    t.start();
    const ws = FakeWebSocket.last();
    t.stop();
    expect(ws.close).toHaveBeenCalledExactlyOnceWith(1000, "cliente");
    expect(ws.onclose).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(onState).toHaveBeenCalledTimes(1);
  });

  it("detener durante la espera de un reintento cancela el reintento", () => {
    const { t } = crear();
    t.start();
    FakeWebSocket.last().serverClose();
    t.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.last().close).not.toHaveBeenCalled(); // ya estaba cerrado
  });

  it("detener antes de arrancar no falla", () => {
    expect(() => crear().t.stop()).not.toThrow();
  });

  it("un cierre que ya estaba en curso cuando se detuvo no reprograma la conexión", () => {
    const { t, onState } = crear();
    t.start();
    const cierre = FakeWebSocket.last().onclose;
    t.stop();
    cierre({ code: 1000 });
    vi.advanceTimersByTime(60_000);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("se puede volver a arrancar después de detener", () => {
    const { t, onState } = crear();
    t.start();
    t.stop();
    t.start();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onState).toHaveBeenLastCalledWith("connecting", "ws://robot:8001/ws");
    t.stop();
  });
});
