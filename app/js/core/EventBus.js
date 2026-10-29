/**
 * EventBus — patrón Observer (publicador / suscriptor).
 *
 * Los transportes publican eventos ("frame", "connection", "info") sin saber
 * quién los escucha; los paneles se suscriben sin saber de dónde salen los
 * datos. Ese desacople es lo que permite cambiar WebSocket por polling (o el
 * simulador por el robot real) sin tocar una sola línea de la UI.
 */
export class EventBus {
  #listeners = new Map();

  /** Suscribe `handler` a `event`. Devuelve una función para desuscribirse. */
  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  /** Notifica a todos los suscriptores. Un suscriptor que falla no rompe al resto. */
  emit(event, payload) {
    for (const handler of this.#listeners.get(event) ?? []) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error en un suscriptor de "${event}"`, err);
      }
    }
  }
}
