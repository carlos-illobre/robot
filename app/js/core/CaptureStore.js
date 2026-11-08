/**
 * Almacén de muestras capturadas durante la sesión.
 *
 * Replica el botón "Capturar" de electroSim: cada captura congela una copia
 * del estado completo del robot. Además permite una grabación continua
 * (todas las muestras que llegan) con un tope para no agotar la memoria.
 */
export class CaptureStore {
  #samples = [];
  #listeners = new Set();

  constructor({ maxSamples = 50_000 } = {}) {
    this.maxSamples = maxSamples;
  }

  get size() {
    return this.#samples.length;
  }

  get samples() {
    return this.#samples;
  }

  /** @returns {object|null} la captura agregada, o null si se llegó al tope */
  add(frame, tipo = "manual") {
    if (!frame) return null;
    if (this.#samples.length >= this.maxSamples) return null;
    const sample = {
      n: this.#samples.length + 1,
      tipo,
      capturedAt: new Date(frame.receivedAt ?? Date.now()),
      frame: structuredClone(frame),
    };
    this.#samples.push(sample);
    this.#notify();
    return sample;
  }

  clear() {
    this.#samples = [];
    this.#notify();
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #notify() {
    for (const fn of this.#listeners) fn(this);
  }
}
