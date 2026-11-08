// RingBuffer: capacidad fija, orden cronológico e índices negativos.
import { describe, it, expect } from "vitest";
import { RingBuffer } from "../../js/core/RingBuffer.js";

const lleno = (cap, ...items) => {
  const rb = new RingBuffer(cap);
  for (const x of items) rb.push(x);
  return rb;
};

describe("RingBuffer", () => {
  it.each([0, -1, 2.5, "3", Number.NaN, undefined])("rechaza la capacidad %s", (cap) => {
    expect(() => new RingBuffer(cap)).toThrow(new RangeError("La capacidad debe ser un entero positivo"));
  });

  it("acepta capacidad 1 y guarda solo el último", () => {
    const rb = lleno(1, "a", "b");
    expect(rb.capacity).toBe(1);
    expect(rb.size).toBe(1);
    expect(rb.tail()).toEqual(["b"]);
  });

  it("empieza vacío", () => {
    const rb = new RingBuffer(3);
    expect(rb.size).toBe(0);
    expect(rb.last()).toBeUndefined();
    expect(rb.at(0)).toBeUndefined();
    expect(rb.tail()).toEqual([]);
  });

  it("crece hasta la capacidad y después pisa el más viejo", () => {
    const rb = lleno(3, 1, 2);
    expect(rb.size).toBe(2);
    expect(rb.tail()).toEqual([1, 2]);
    rb.push(3);
    expect(rb.size).toBe(3);
    rb.push(4);
    rb.push(5);
    expect(rb.size).toBe(3);
    expect(rb.tail()).toEqual([3, 4, 5]);
    expect(rb.at(0)).toBe(3);
    expect(rb.at(2)).toBe(5);
    expect(rb.last()).toBe(5);
  });

  it("at acepta índices negativos desde el final y devuelve undefined fuera de rango", () => {
    const rb = lleno(4, "a", "b", "c", "d", "e"); // queda b c d e
    expect(rb.at(-1)).toBe("e");
    expect(rb.at(-4)).toBe("b");
    expect(rb.at(-5)).toBeUndefined();
    expect(rb.at(4)).toBeUndefined();
    expect(rb.at(3)).toBe("e");
  });

  it("tail(n) devuelve las últimas n en orden, y todas si n es mayor que el tamaño", () => {
    const rb = lleno(5, 1, 2, 3, 4, 5, 6, 7);
    expect(rb.tail(2)).toEqual([6, 7]);
    expect(rb.tail(0)).toEqual([]);
    expect(rb.tail(99)).toEqual([3, 4, 5, 6, 7]);
  });

  it("clear lo vacía y vuelve a llenarse desde cero", () => {
    const rb = lleno(2, 1, 2, 3);
    rb.clear();
    expect(rb.size).toBe(0);
    expect(rb.tail()).toEqual([]);
    expect(rb.at(1)).toBeUndefined();
    rb.push(9);
    expect(rb.tail()).toEqual([9]);
    expect(rb.at(0)).toBe(9);
  });
});
