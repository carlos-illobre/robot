/**
 * TelemetryService — patrón Facade.
 *
 * Es la ÚNICA puerta de entrada del frontend al backend. Esconde detrás de
 * tres métodos (`connect`, `setTransport`, `disconnect`) todo lo complicado:
 * consultar /info, elegir y crear el transporte (Strategy), reconectar,
 * normalizar los datos (Adapter) y medir frecuencia y latencia.
 *
 * Los paneles nunca hablan con fetch ni con WebSocket: escuchan el EventBus.
 *
 *   Eventos que publica:
 *     "connection" → { state, transport, detail }
 *     "info"       → respuesta de GET /info
 *     "frame"      → muestra normalizada (ver telemetryModel.normalizeFrame)
 *     "stats"      → { hz, gapMs, rttMs, frames, errors }
 */
import { ApiClient } from "./ApiClient.js";
import { WebSocketTransport } from "./WebSocketTransport.js";
import { PollingTransport } from "./PollingTransport.js";
import { SimTransport, isSimUrl } from "./SimTransport.js";
import { normalizeFrame } from "../core/telemetryModel.js";

const TRANSPORTS = { websocket: WebSocketTransport, polling: PollingTransport };
const STALE_AFTER_MS = 2000;

export class TelemetryService {
  #bus;
  #transport = null;
  #api = null;
  #arrivals = [];
  #lastFrameAt = 0;
  #staleTimer = null;
  #state = "offline";
  #infoModel = null;
  #detail = "";

  constructor(bus) {
    this.#bus = bus;
    this.options = { baseUrl: "", transport: "websocket", intervalMs: 250 };
    this.frames = 0;
    this.errors = 0;
    this.gapMs = null;   // intervalo medio entre muestras (suavizado)
    this.rttMs = null;   // ida y vuelta HTTP (solo polling)
  }

  get state() {
    return this.#state;
  }

  /** Conecta (o reconecta) con nuevas opciones. */
  async connect(options = {}) {
    this.disconnect();
    this.options = { ...this.options, ...options };
    const sim = isSimUrl(this.options.baseUrl);
    this.#api = sim ? null : new ApiClient(this.options.baseUrl);
    const baseUrl = sim ? this.options.baseUrl : this.#api.baseUrl;

    // Strategy: el transporte se elige en tiempo de ejecución. "demo" como
    // dirección usa el simulador del navegador (sin servidor).
    const Transport = sim ? SimTransport : TRANSPORTS[this.options.transport] ?? WebSocketTransport;
    this.#transport = new Transport({
      baseUrl,
      intervalMs: this.options.intervalMs,
      onState: (state, detail) => this.#setState(state, detail),
      onData: (raw, meta) => this.#onData(raw, meta),
    });
    this.#setState("connecting", baseUrl);

    // /info primero: el dashboard se arma según el robot ("consultá /info en vez de asumir").
    await this.refreshInfo();
    this.#transport?.start();
    this.#staleTimer = setInterval(() => this.#checkStale(), 500);
  }

  /** Cambia de estrategia de transporte en caliente, sin perder el historial. */
  setTransport(transport, intervalMs = this.options.intervalMs) {
    return this.connect({ transport, intervalMs });
  }

  disconnect() {
    this.#transport?.stop();
    this.#transport = null;
    clearInterval(this.#staleTimer);
    this.#arrivals = [];
    this.#lastFrameAt = 0;
    this.gapMs = null;
    this.rttMs = null;
    if (this.#state !== "offline") this.#setState("offline");
  }

  async refreshInfo() {
    try {
      const info = this.#transport?.info ? this.#transport.info() : await this.#api.info();
      this.#infoModel = info.modelo;
      this.#bus.emit("info", info);
      return info;
    } catch (err) {
      // Sin /info el dashboard igual funciona: se deduce del primer frame.
      this.#bus.emit("info-error", err);
      return null;
    }
  }

  #onData(raw, meta = {}) {
    let frame;
    try {
      frame = normalizeFrame(raw);
    } catch (err) {
      this.errors += 1;
      console.warn("[Telemetría] Muestra inválida descartada", err);
      return;
    }
    this.frames += 1;
    const now = performance.now();

    // Intervalo entre muestras (media móvil exponencial) y, en polling, el
    // tiempo de ida y vuelta de cada petición HTTP.
    this.rttMs = meta.rttMs ?? null;
    if (this.#lastFrameAt) {
      const gap = now - this.#lastFrameAt;
      this.gapMs = this.gapMs === null ? gap : this.gapMs * 0.8 + gap * 0.2;
    }
    this.#lastFrameAt = now;
    this.#arrivals.push(now);
    while (this.#arrivals.length && now - this.#arrivals[0] > 2000) this.#arrivals.shift();

    if (this.#infoModel && frame.modelo !== this.#infoModel) {
      // El backend se reinició con otro robot: reconstruir el dashboard.
      this.#infoModel = frame.modelo;
      this.refreshInfo();
    }
    if (this.#state !== "live") this.#setState("live");
    this.#bus.emit("frame", frame);
    this.#bus.emit("stats", this.stats());
  }

  stats() {
    const n = this.#arrivals.length;
    const span = n > 1 ? (this.#arrivals[n - 1] - this.#arrivals[0]) / 1000 : 0;
    return {
      hz: span > 0 ? (n - 1) / span : 0,
      gapMs: this.gapMs,
      rttMs: this.rttMs,
      frames: this.frames,
      errors: this.errors,
      transport: this.#transport?.name ?? this.options.transport,
    };
  }

  #checkStale() {
    if (this.#state === "live" && performance.now() - this.#lastFrameAt > STALE_AFTER_MS) {
      this.#setState("stale", "sin datos hace más de 2 s");
    }
  }

  #setState(state, detail = "") {
    const changed = state !== this.#state;
    if (!changed && detail === this.#detail) return;
    this.#state = state;
    this.#detail = detail;
    this.#bus.emit("connection", {
      state,
      changed,
      detail,
      transport: this.#transport?.name ?? this.options.transport,
      baseUrl: this.#api?.baseUrl ?? this.options.baseUrl,
    });
  }
}
