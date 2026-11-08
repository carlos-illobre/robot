/**
 * RingBuffer — buffer circular de capacidad fija.
 *
 * Guarda las últimas N muestras de telemetría para los gráficos históricos.
 * `push` es O(1) y la memoria es constante: a 10 Hz, en una clase de 2 horas
 * llegan 72.000 muestras; con un array que crece sin límite el navegador se
 * pondría cada vez más lento. Acá nunca hay más de `capacity` elementos.
 */
export class RingBuffer {
  #items;
  #start = 0;
  #size = 0;

  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError("La capacidad debe ser un entero positivo");
    }
    this.capacity = capacity;
    this.#items = new Array(capacity);
  }

  get size() {
    return this.#size;
  }

  push(item) {
    const end = (this.#start + this.#size) % this.capacity;
    this.#items[end] = item;
    if (this.#size < this.capacity) this.#size += 1;
    else this.#start = (this.#start + 1) % this.capacity; // pisa el más viejo
  }

  /** Elemento i-ésimo, del más viejo (0) al más nuevo (size-1). */
  at(i) {
    if (i < 0) i += this.#size;
    if (i < 0 || i >= this.#size) return undefined;
    return this.#items[(this.#start + i) % this.capacity];
  }

  last() {
    return this.at(-1);
  }

  /** Las últimas `n` muestras (o todas), en orden cronológico. */
  tail(n = this.#size) {
    const count = Math.min(n, this.#size);
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = this.at(this.#size - count + i);
    return out;
  }

  clear() {
    this.#start = 0;
    this.#size = 0;
    this.#items = new Array(this.capacity);
  }
}
