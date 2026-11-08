/**
 * Transporte "pull" por polling HTTP a GET /telemetria.
 *
 * Se usa `setTimeout` encadenado y NO `setInterval`: la próxima petición se
 * programa recién cuando terminó la anterior. Con `setInterval`, si el
 * servidor tarda más que el intervalo, las peticiones se apilan y llegan
 * fuera de orden. La consigna pide un intervalo máximo de 500 ms.
 */
import { ApiClient } from "./ApiClient.js";

export const MAX_POLL_INTERVAL_MS = 500;

export class PollingTransport {
  name = "polling";
  label = "Polling";
  #timer = null;
  #stopped = true;
  #abort = null;
  #failures = 0;

  constructor({ baseUrl, onData, onState, intervalMs = 250 }) {
    this.api = new ApiClient(baseUrl, { timeoutMs: 2000 });
    this.onData = onData;
    this.onState = onState;
    this.intervalMs = Math.min(MAX_POLL_INTERVAL_MS, Math.max(50, intervalMs));
    this.lastRttMs = null;
  }

  start() {
    this.#stopped = false;
    this.onState("connecting", `${this.api.baseUrl}/telemetria`);
    this.#tick();
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#abort?.abort();
    this.#abort = null;
  }

  async #tick() {
    if (this.#stopped) return;
    const t0 = performance.now();
    // Cada ciclo es dueño de su controlador: si después de un stop() (y quizá un start())
    // ya no es el actual, la respuesta o el error se descartan y el ciclo muere (spec 010 · FR-011).
    const abort = (this.#abort = new AbortController());
    try {
      const raw = await this.api.telemetria({ signal: abort.signal });
      if (abort !== this.#abort) return;
      this.lastRttMs = performance.now() - t0;
      this.#failures = 0;
      this.onState("live");
      this.onData(raw, { rttMs: this.lastRttMs });
    } catch (err) {
      if (abort !== this.#abort) return;
      this.#failures += 1;
      this.onState("reconnecting", err.message);
    }
    // Si hay errores se espera más (hasta 4 s) para no martillar un servidor caído.
    const wait = this.#failures
      ? Math.min(4000, this.intervalMs * 2 ** this.#failures)
      : Math.max(0, this.intervalMs - (performance.now() - t0));
    this.#timer = setTimeout(() => this.#tick(), wait);
  }
}
