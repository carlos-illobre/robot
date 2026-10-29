/**
 * Transporte "push" por WebSocket, con reconexión automática.
 *
 * El servidor empuja ~10 muestras por segundo sin que el cliente pregunte:
 * no hay latencia de intervalo fijo ni overhead de una petición HTTP por dato.
 *
 * Si la conexión se corta (se reinició el backend, se cayó el WiFi) se
 * reintenta con *backoff exponencial con jitter*: 0,5 s, 1 s, 2 s, 4 s… hasta
 * 8 s. El jitter (azar) evita que 30 dashboards del laboratorio reconecten
 * exactamente en el mismo milisegundo y saturen al servidor.
 */
import { ApiClient } from "./ApiClient.js";

export class WebSocketTransport {
  name = "websocket";
  label = "WebSocket";
  #ws = null;
  #retry = 0;
  #retryTimer = null;
  #stopped = true;

  /**
   * @param {object} p
   * @param {string} p.baseUrl
   * @param {(raw: object) => void} p.onData
   * @param {(state: string, detail?: string) => void} p.onState
   */
  constructor({ baseUrl, onData, onState, minDelayMs = 500, maxDelayMs = 8000 }) {
    this.url = ApiClient.toWebSocketUrl(baseUrl);
    this.onData = onData;
    this.onState = onState;
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  start() {
    this.#stopped = false;
    this.#open();
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#retryTimer);
    if (this.#ws) {
      this.#ws.onclose = null;
      this.#ws.close(1000, "cliente");
      this.#ws = null;
    }
  }

  /** Demora del próximo reintento: exponencial, acotada, con ±25 % de azar. */
  static backoffDelay(attempt, min = 500, max = 8000, random = Math.random) {
    const base = Math.min(max, min * 2 ** attempt);
    return Math.round(base * (0.75 + random() * 0.5));
  }

  #open() {
    this.onState(this.#retry === 0 ? "connecting" : "reconnecting", this.url);
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.#scheduleRetry(err.message);
      return;
    }
    this.#ws = ws;
    ws.onopen = () => {
      this.#retry = 0;
      this.onState("live");
    };
    ws.onmessage = (ev) => {
      try {
        this.onData(JSON.parse(ev.data));
      } catch (err) {
        console.warn("[WS] Mensaje no JSON descartado", err);
      }
    };
    ws.onerror = () => { /* el detalle llega en onclose */ };
    ws.onclose = (ev) => {
      this.#ws = null;
      if (!this.#stopped) this.#scheduleRetry(`código ${ev.code}`);
    };
  }

  #scheduleRetry(detail) {
    const delay = WebSocketTransport.backoffDelay(this.#retry++, this.minDelayMs, this.maxDelayMs);
    this.onState("reconnecting", `${detail} · reintento en ${(delay / 1000).toFixed(1)} s`);
    this.#retryTimer = setTimeout(() => this.#open(), delay);
  }
}
