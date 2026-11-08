// ApiClient: URLs, pedidos con timeout, cancelación y errores de FastAPI.
import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiClient } from "../../js/services/ApiClient.js";
import { respuesta } from "./helpers.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** fetch falso que registra las llamadas y responde lo que diga `responder`. */
function stubFetch(responder = () => respuesta({ ok: true })) {
  const fetch = vi.fn(async (url, opts) => responder(url, opts));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** fetch que nunca responde, salvo que lo aborten. */
function fetchColgado() {
  return stubFetch(
    (url, opts) =>
      new Promise((_, reject) => {
        opts.signal.addEventListener("abort", () => reject(opts.signal.reason));
      }),
  );
}

describe("ApiClient.normalizeBaseUrl", () => {
  it.each([
    ["10.0.0.5:8001/", "http://10.0.0.5:8001"],
    ["  localhost:8001  ", "http://localhost:8001"],
    ["http://robot:8001///", "http://robot:8001"],
    ["HTTPS://robot.example.com", "HTTPS://robot.example.com"],
    ["https://x/api/", "https://x/api"],
  ])("%j → %j", (url, esperado) => {
    expect(ApiClient.normalizeBaseUrl(url)).toBe(esperado);
  });

  it.each([undefined, null, "", "   "])("rechaza %j", (url) => {
    expect(() => ApiClient.normalizeBaseUrl(url)).toThrow("Falta la dirección del servidor");
  });
});

describe("ApiClient.toWebSocketUrl", () => {
  it.each([
    ["http://host:8001", "ws://host:8001/ws"],
    ["host:8001", "ws://host:8001/ws"],
    ["https://robot.example.com/", "wss://robot.example.com/ws"],
  ])("%s → %s", (base, ws) => {
    expect(ApiClient.toWebSocketUrl(base)).toBe(ws);
  });

  it("acepta otra ruta", () => {
    expect(ApiClient.toWebSocketUrl("http://h:1", "/stream")).toBe("ws://h:1/stream");
  });
});

describe("constructor", () => {
  it("normaliza la dirección y usa 2,5 s de timeout por defecto", () => {
    const api = new ApiClient("robot:8001/");
    expect(api.baseUrl).toBe("http://robot:8001");
    expect(api.timeoutMs).toBe(2500);
    expect(new ApiClient("x", { timeoutMs: 10 }).timeoutMs).toBe(10);
  });
});

describe("request", () => {
  it("hace un GET sin caché, sin cuerpo ni encabezados, y devuelve el JSON", async () => {
    const fetch = stubFetch(() => respuesta({ modelo: "go2" }));
    await expect(new ApiClient("http://r:8001").telemetria()).resolves.toEqual({ modelo: "go2" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("http://r:8001/telemetria");
    expect(opts).toEqual({ method: "GET", signal: expect.any(AbortSignal), cache: "no-store", headers: undefined, body: undefined });
  });

  it.each([
    ["info", "/info"],
    ["telemetria", "/telemetria"],
    ["fuentes", "/fuentes"],
  ])("%s() pide %s", async (metodo, ruta) => {
    const fetch = stubFetch();
    await new ApiClient("http://r")[metodo]();
    expect(fetch.mock.calls[0][0]).toBe(`http://r${ruta}`);
  });

  it("cambiarFuente hace un POST JSON a /fuente con 9 s de timeout", async () => {
    vi.useFakeTimers();
    const fetch = fetchColgado();
    const api = new ApiClient("http://robot:8001");
    const p = api.cambiarFuente({ modo: "demo", robot: "g1" });
    const err = expect(p).rejects.toMatchObject({ name: "TimeoutError" });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe("http://robot:8001/fuente");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(opts.body)).toEqual({ modo: "demo", robot: "g1" });
    await vi.advanceTimersByTimeAsync(8999);
    expect(opts.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(opts.signal.aborted).toBe(true);
    await err;
  });

  it("post sin opciones usa el timeout del cliente", async () => {
    vi.useFakeTimers();
    const fetch = fetchColgado();
    const p = new ApiClient("http://r", { timeoutMs: 100 }).post("/x", { a: 1 });
    const err = expect(p).rejects.toThrow("Timeout");
    await vi.advanceTimersByTimeAsync(99);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await err;
  });

  it("corta un pedido colgado al vencer el timeout con un TimeoutError", async () => {
    vi.useFakeTimers();
    fetchColgado();
    const p = new ApiClient("http://r", { timeoutMs: 80 }).info();
    const err = expect(p).rejects.toSatisfy((e) => e instanceof DOMException && e.name === "TimeoutError" && e.message === "Timeout");
    await vi.advanceTimersByTimeAsync(80);
    await err;
  });

  it("limpia el temporizador al terminar, haya salido bien o mal", async () => {
    vi.useFakeTimers();
    stubFetch(() => respuesta({}));
    await new ApiClient("http://r").info();
    expect(vi.getTimerCount()).toBe(0);
    stubFetch(() => respuesta({}, { status: 500 }));
    await expect(new ApiClient("http://r").info()).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si se aborta la señal externa, el pedido se cancela con ese motivo", async () => {
    const fetch = fetchColgado();
    const ctrl = new AbortController();
    const p = new ApiClient("http://r").get("/telemetria", { signal: ctrl.signal });
    const motivo = new Error("cambié de pantalla");
    ctrl.abort(motivo);
    await expect(p).rejects.toBe(motivo);
    expect(fetch.mock.calls[0][1].signal.reason).toBe(motivo);
  });

  it("un timeout por pedido pisa el del cliente", async () => {
    vi.useFakeTimers();
    fetchColgado();
    const p = new ApiClient("http://r", { timeoutMs: 10_000 }).get("/x", { timeoutMs: 50 });
    const err = expect(p).rejects.toThrow("Timeout");
    await vi.advanceTimersByTimeAsync(50);
    await err;
  });

  it("informa el código y el detalle de FastAPI cuando hay error", async () => {
    stubFetch(() => respuesta({ detail: "El servidor esta conectado a go2, no a g1" }, { status: 409, statusText: "Conflict" }));
    await expect(new ApiClient("http://r").telemetria()).rejects.toThrow(new Error("HTTP 409: El servidor esta conectado a go2, no a g1"));
  });

  it("si el error no trae detail, usa el texto del estado HTTP", async () => {
    stubFetch(() => respuesta({ otro: 1 }, { status: 404, statusText: "Not Found" }));
    await expect(new ApiClient("http://r").info()).rejects.toThrow(new Error("HTTP 404: Not Found"));
  });

  it("si el cuerpo del error no es JSON, usa el texto del estado HTTP", async () => {
    const json = vi.fn(async () => {
      throw new SyntaxError("Unexpected token <");
    });
    stubFetch(() => respuesta(null, { status: 502, statusText: "Bad Gateway", json }));
    await expect(new ApiClient("http://r").info()).rejects.toThrow(new Error("HTTP 502: Bad Gateway"));
    expect(json).toHaveBeenCalledTimes(1);
  });

  it("los 2xx distintos de 200 también son éxito", async () => {
    stubFetch(() => respuesta({ creado: true }, { status: 201 }));
    await expect(new ApiClient("http://r").post("/x", { a: 1 })).resolves.toEqual({ creado: true });
  });

  it("un error de red se propaga tal cual", async () => {
    const red = new TypeError("Failed to fetch");
    stubFetch(() => {
      throw red;
    });
    await expect(new ApiClient("http://r").info()).rejects.toBe(red);
  });
});
