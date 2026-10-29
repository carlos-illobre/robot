// Pruebas de la capa de servicios (red) con un fetch simulado: sin servidor.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { ApiClient } from "../js/services/ApiClient.js";
import { PollingTransport, MAX_POLL_INTERVAL_MS } from "../js/services/PollingTransport.js";
import { TelemetryService } from "../js/services/TelemetryService.js";
import { isSimUrl, simModel } from "../js/services/SimTransport.js";
import { EventBus } from "../js/core/EventBus.js";
import { PaseoSim } from "../js/core/paseoSim.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** fetch falso: responde `body` con `status` después de `delayMs`, y cuenta llamadas. */
function fakeFetch({ body = {}, status = 200, delayMs = 0 } = {}) {
  const calls = { total: 0, active: 0, maxActive: 0, urls: [] };
  globalThis.fetch = async (url, opts = {}) => {
    calls.total += 1;
    calls.urls.push(String(url));
    calls.active += 1;
    calls.maxActive = Math.max(calls.maxActive, calls.active);
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        opts.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(opts.signal.reason ?? new Error("aborted"));
        });
      });
      const payload = typeof body === "function" ? body(calls.total) : body;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "Error",
        json: async () => payload,
      };
    } finally {
      calls.active -= 1;
    }
  };
  return calls;
}

const sample = () => new PaseoSim("go2").telemetria === undefined ? null : (() => {
  const sim = new PaseoSim("go2");
  sim.advance(1);
  return sim.telemetria();
})();

/* ---------------------------------------------------------------- */

test("ApiClient informa el código y el detalle de FastAPI cuando hay error", async () => {
  fakeFetch({ status: 409, body: { detail: "El servidor esta conectado a go2, no a g1" } });
  const api = new ApiClient("localhost:8001");
  await assert.rejects(api.telemetria(), /HTTP 409: El servidor esta conectado a go2, no a g1/);
});

test("ApiClient corta un pedido colgado (timeout) en vez de esperar para siempre", async () => {
  fakeFetch({ delayMs: 10_000 });
  const api = new ApiClient("http://x", { timeoutMs: 80 });
  const t0 = Date.now();
  await assert.rejects(api.info());
  assert.ok(Date.now() - t0 < 1000);
});

test("ApiClient manda JSON en los POST", async () => {
  let sent;
  globalThis.fetch = async (url, opts) => {
    sent = { url, ...opts };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  await new ApiClient("http://robot:8001").cambiarFuente({ modo: "demo", robot: "g1" });
  assert.equal(sent.url, "http://robot:8001/fuente");
  assert.equal(sent.method, "POST");
  assert.deepEqual(JSON.parse(sent.body), { modo: "demo", robot: "g1" });
});

test("el polling nunca supera 500 ms de intervalo (consigna)", () => {
  const t = new PollingTransport({ baseUrl: "http://x", onData() {}, onState() {}, intervalMs: 2000 });
  assert.equal(t.intervalMs, MAX_POLL_INTERVAL_MS);
  assert.equal(MAX_POLL_INTERVAL_MS, 500);
});

test("el polling no superpone pedidos aunque el servidor tarde más que el intervalo", async () => {
  const calls = fakeFetch({ body: sample(), delayMs: 60 });
  const datos = [];
  const t = new PollingTransport({ baseUrl: "http://x", onData: (d) => datos.push(d), onState() {}, intervalMs: 50 });
  t.start();
  await sleep(400);
  t.stop();
  assert.equal(calls.maxActive, 1, "nunca hay dos pedidos en vuelo a la vez");
  assert.ok(datos.length >= 3, `llegaron ${datos.length} muestras`);
  assert.ok(calls.urls.every((u) => u === "http://x/telemetria"));
});

test("el polling se recupera solo después de errores del servidor", async () => {
  let falla = true;
  globalThis.fetch = async () => {
    if (falla) throw new TypeError("Failed to fetch");
    return { ok: true, status: 200, json: async () => sample() };
  };
  const estados = [];
  const datos = [];
  const t = new PollingTransport({ baseUrl: "http://x", onData: (d) => datos.push(d), onState: (s) => estados.push(s), intervalMs: 50 });
  t.start();
  await sleep(150);
  assert.ok(estados.includes("reconnecting"));
  falla = false;
  await sleep(600);
  t.stop();
  assert.ok(datos.length > 0, "volvieron a llegar datos");
  assert.equal(estados.at(-1), "live");
});

test("TelemetryService (Facade): consulta /info, normaliza y publica frames por el bus", async () => {
  const info = { modelo: "go2", nombre: "Unitree Go2 EDU", n_motores: 12, motores_nombres: [], patas: ["FR", "FL", "RR", "RL"], modo: "demo" };
  fakeFetch({ body: (n) => (n === 1 ? info : sample()) });
  const bus = new EventBus();
  const recibido = { info: null, frames: [], estados: [] };
  bus.on("info", (i) => (recibido.info = i));
  bus.on("frame", (f) => recibido.frames.push(f));
  bus.on("connection", (c) => recibido.estados.push(c.state));

  const service = new TelemetryService(bus);
  await service.connect({ baseUrl: "http://x", transport: "polling", intervalMs: 50 });
  await sleep(300);
  service.disconnect();

  assert.equal(recibido.info.nombre, "Unitree Go2 EDU");
  assert.ok(recibido.frames.length >= 2);
  assert.equal(recibido.frames[0].motores.length, 12);
  assert.ok(recibido.frames[0].derived, "los frames llegan con las métricas derivadas");
  const sinRepetidos = recibido.estados.filter((e, i, a) => e !== a[i - 1]);
  assert.deepEqual(sinRepetidos.slice(0, 2), ["connecting", "live"]);
  assert.equal(recibido.estados.at(-1), "offline");
});

test("TelemetryService avisa cuando dejan de llegar datos", async () => {
  // Después de 3 respuestas el servidor "se cuelga".
  globalThis.fetch = async (url, opts) => {
    if (String(url).endsWith("/info")) return { ok: true, status: 200, json: async () => ({ modelo: "go2" }) };
    fetch.n = (fetch.n ?? 0) + 1;
    if (fetch.n > 3) await new Promise((_, rej) => opts.signal.addEventListener("abort", () => rej(new Error("abort"))));
    return { ok: true, status: 200, json: async () => sample() };
  };
  const bus = new EventBus();
  const estados = [];
  bus.on("connection", (c) => estados.push(c.state));
  const service = new TelemetryService(bus);
  await service.connect({ baseUrl: "http://x", transport: "polling", intervalMs: 50 });
  await sleep(2700);
  service.disconnect();
  // Lo detecta el vigilante de 2 s ("stale") o el timeout del pedido ("reconnecting"):
  // lo importante es que el dashboard no siga diciendo "En vivo".
  const despuesDeVivo = estados.slice(estados.indexOf("live") + 1);
  assert.ok(despuesDeVivo.some((e) => e === "stale" || e === "reconnecting"), `estados: ${estados.join(", ")}`);
});

test("'demo' y 'demo-g1' como dirección usan el simulador del navegador", async () => {
  assert.ok(isSimUrl("demo") && isSimUrl("DEMO-G1") && !isSimUrl("http://demo:8001"));
  assert.equal(simModel("demo-g1"), "g1");

  const bus = new EventBus();
  const frames = [];
  let info;
  bus.on("info", (i) => (info = i));
  bus.on("frame", (f) => frames.push(f));
  const service = new TelemetryService(bus);
  await service.connect({ baseUrl: "demo-g1" });
  await sleep(350);
  service.disconnect();
  assert.equal(info.n_motores, 29);
  assert.ok(frames.length >= 2);
  assert.equal(frames[0].modelo, "g1");
});
