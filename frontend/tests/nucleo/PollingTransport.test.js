// PollingTransport: setTimeout encadenado, backoff ante errores y parada limpia.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PollingTransport, MAX_POLL_INTERVAL_MS } from "../../js/services/PollingTransport.js";
import { respuesta } from "./helpers.js";

const RELOJ = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"];

beforeEach(() => vi.useFakeTimers({ toFake: RELOJ }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * fetch falso: cada llamada tarda `demora(n)` ms (temporizador falso) y responde
 * lo que devuelva `responder(n)`; si responder tira, el pedido falla. Respeta abort.
 */
function stubFetch({ demora = () => 0, responder = (n) => respuesta({ n }), ignorarAbort = false } = {}) {
  let n = 0;
  const fetch = vi.fn((url, opts) => {
    const i = ++n;
    // Sin demora responde en una microtarea (un setTimeout(0) falso correría 1 ms después).
    if (demora(i) === 0) return Promise.resolve().then(() => responder(i));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        try {
          resolve(responder(i));
        } catch (err) {
          reject(err);
        }
      }, demora(i));
      if (!ignorarAbort) {
        opts.signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(opts.signal.reason);
        });
      }
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const crear = (extra = {}) => {
  const onData = vi.fn();
  const onState = vi.fn();
  const t = new PollingTransport({ baseUrl: "robot:8001", onData, onState, ...extra });
  return { t, onData, onState };
};

describe("configuración", () => {
  it("se presenta como 'polling'", () => {
    const { t } = crear();
    expect(t.name).toBe("polling");
    expect(t.label).toBe("Polling");
    expect(t.lastRttMs).toBeNull();
  });

  it("usa un ApiClient con 2 s de timeout hacia la dirección normalizada", () => {
    const { t } = crear();
    expect(t.api.baseUrl).toBe("http://robot:8001");
    expect(t.api.timeoutMs).toBe(2000);
  });

  it.each([
    [undefined, 250],
    [2000, 500],
    [500, 500],
    [501, 500],
    [10, 50],
    [50, 50],
    [120, 120],
  ])("intervalo pedido %s ms → %s ms (la consigna pide como máximo 500 ms)", (intervalMs, esperado) => {
    expect(crear({ intervalMs }).t.intervalMs).toBe(esperado);
    expect(MAX_POLL_INTERVAL_MS).toBe(500);
  });
});

describe("ciclo de pedidos", () => {
  it("al arrancar avisa 'connecting' con la URL y pide /telemetria", async () => {
    const fetch = stubFetch();
    const { t, onState } = crear();
    t.start();
    expect(onState).toHaveBeenNthCalledWith(1, "connecting", "http://robot:8001/telemetria");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("http://robot:8001/telemetria");
    t.stop();
  });

  it("entrega cada muestra con el tiempo de ida y vuelta y avisa 'live'", async () => {
    stubFetch({ demora: () => 30 });
    const { t, onData, onState } = crear();
    t.start();
    await vi.advanceTimersByTimeAsync(30);
    expect(onState).toHaveBeenLastCalledWith("live");
    expect(onData).toHaveBeenCalledExactlyOnceWith({ n: 1 }, { rttMs: 30 });
    expect(t.lastRttMs).toBe(30);
    t.stop();
  });

  it("descuenta lo que tardó el pedido: un pedido cada 250 ms exactos", async () => {
    const fetch = stubFetch({ demora: () => 30 });
    const { t } = crear();
    t.start();
    await vi.advanceTimersByTimeAsync(249);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenCalledTimes(3);
    t.stop();
  });

  it("si el servidor tarda más que el intervalo, pide de nuevo enseguida pero nunca superpone pedidos", async () => {
    let enVuelo = 0;
    let maxEnVuelo = 0;
    const fetch = stubFetch({
      demora: () => 400,
      responder: () => respuesta({}),
    });
    const fetchContado = vi.fn((...args) => {
      enVuelo += 1;
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
      return fetch(...args).finally(() => (enVuelo -= 1));
    });
    vi.stubGlobal("fetch", fetchContado);
    const { t, onData } = crear({ intervalMs: 100 });
    t.start();
    await vi.advanceTimersByTimeAsync(400);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(fetchContado).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2); // el segundo sale enseguida, sin esperar otros 100 ms
    expect(fetchContado).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1600);
    expect(fetchContado).toHaveBeenCalledTimes(5);
    expect(onData).toHaveBeenCalledTimes(4);
    expect(maxEnVuelo).toBe(1);
    t.stop();
  });
});

describe("errores", () => {
  it("ante un error avisa 'reconnecting' con el motivo y espera el doble del intervalo", async () => {
    const fetch = stubFetch({
      responder: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const { t, onState, onData } = crear({ intervalMs: 100 });
    t.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "Failed to fetch");
    expect(onData).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(199);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    t.stop();
  });

  it("el backoff se duplica con cada error y se acota en 4 s", async () => {
    const fetch = stubFetch({
      responder: () => {
        throw new Error("caído");
      },
    });
    const instantes = [];
    vi.stubGlobal("fetch", vi.fn((...args) => {
      instantes.push(Date.now());
      return fetch(...args);
    }));
    const { t } = crear({ intervalMs: 250 });
    t.start();
    await vi.advanceTimersByTimeAsync(20_000);
    t.stop();
    const esperas = instantes.slice(1).map((x, i) => x - instantes[i]);
    expect(esperas.slice(0, 6)).toEqual([500, 1000, 2000, 4000, 4000, 4000]);
  });

  it("un HTTP 500 cuenta como error y al volver los datos el intervalo vuelve a la normalidad", async () => {
    const fetch = stubFetch({
      responder: (n) => (n === 1 ? respuesta({ detail: "roto" }, { status: 500 }) : respuesta({ n })),
    });
    const { t, onState, onData } = crear({ intervalMs: 100 });
    t.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onState).toHaveBeenLastCalledWith("reconnecting", "HTTP 500: roto");
    await vi.advanceTimersByTimeAsync(200);
    expect(onState).toHaveBeenLastCalledWith("live");
    expect(onData).toHaveBeenCalledWith({ n: 2 }, { rttMs: 0 });
    await vi.advanceTimersByTimeAsync(99);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    t.stop();
  });
});

describe("stop", () => {
  it("detener antes de arrancar no falla", () => {
    const { t } = crear();
    expect(() => t.stop()).not.toThrow();
  });

  it("cancela el pedido en vuelo sin avisar error ni programar otro", async () => {
    const fetch = stubFetch({ demora: () => 1000 });
    const { t, onState, onData } = crear();
    t.start();
    await vi.advanceTimersByTimeAsync(10);
    t.stop();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onState).toHaveBeenCalledTimes(1); // solo "connecting"
    expect(onData).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si la respuesta llega después de detener, se descarta", async () => {
    const fetch = stubFetch({ demora: () => 100, ignorarAbort: true });
    const { t, onState, onData } = crear();
    t.start();
    t.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onData).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("si el error llega después de detener, no se informa", async () => {
    stubFetch({
      demora: () => 100,
      ignorarAbort: true,
      responder: () => {
        throw new Error("tarde");
      },
    });
    const { t, onState } = crear();
    t.start();
    t.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onState).toHaveBeenCalledTimes(1);
  });

  it("cancela la espera hasta el próximo pedido", async () => {
    const fetch = stubFetch();
    const { t } = crear();
    t.start();
    await vi.advanceTimersByTimeAsync(10);
    t.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("si se detiene mientras avisa 'connecting', no hace ningún pedido", () => {
    const fetch = stubFetch();
    const onState = vi.fn(() => t.stop());
    const t = new PollingTransport({ baseUrl: "http://x", onData: vi.fn(), onState });
    t.start();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("FR-011: stop() + start() con un pedido en vuelo deja un solo ciclo de polling", async () => {
    const fetch = stubFetch({ demora: () => 100 });
    const { t, onState, onData } = crear({ intervalMs: 250 });
    t.start();
    await vi.advanceTimersByTimeAsync(10);
    t.stop();
    t.start(); // el rechazo por abort del primer pedido llega recién ahora
    await vi.advanceTimersByTimeAsync(990);
    // 1 abortado + un pedido cada 250 ms (0, 250, 500, 750): un solo ciclo.
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(onData).toHaveBeenCalledTimes(4);
    expect(onState.mock.calls.map(([s]) => s)).not.toContain("reconnecting");
    t.stop();
  });

  it("FR-011: la respuesta tardía de un pedido abortado se descarta tras volver a arrancar", async () => {
    const fetch = stubFetch({ demora: (n) => (n === 1 ? 100 : 0), ignorarAbort: true, responder: (n) => respuesta({ n }) });
    const { t, onData } = crear({ intervalMs: 250 });
    t.start();
    t.stop();
    t.start();
    await vi.advanceTimersByTimeAsync(990);
    expect(onData.mock.calls.map(([d]) => d.n)).toEqual([2, 3, 4, 5]);
    expect(fetch).toHaveBeenCalledTimes(5);
    t.stop();
  });

  it("se puede volver a arrancar después de detener", async () => {
    const fetch = stubFetch();
    const { t, onData } = crear();
    t.start();
    await vi.advanceTimersByTimeAsync(0);
    t.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    t.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenCalledTimes(2);
    t.stop();
  });
});
