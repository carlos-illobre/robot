// Dobles compartidos por las pruebas de la vista Manual.
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Raíz de `frontend/`, para leer los archivos reales que usa el manual. */
export const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..") + path.sep;

/** Las marcas reales que sacó tools/capturas_manual.mjs. */
export const MARCAS = JSON.parse(readFileSync(`${FRONTEND}assets/manual/marcas.json`, "utf8"));

/**
 * IntersectionObserver falso: guarda el callback, las opciones y lo que se
 * observa, para disparar a mano "esta sección entró en pantalla".
 */
export class FakeIntersectionObserver {
  static instances = [];
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = [];
    this.observe = vi.fn((el) => this.observed.push(el));
    this.disconnect = vi.fn();
    FakeIntersectionObserver.instances.push(this);
  }
  /** Simula que entran (o salen) estas secciones. */
  fire(...entries) {
    this.callback(entries.map(([target, isIntersecting = true]) => ({ target, isIntersecting })));
  }
}

/** Respuesta de fetch mínima. */
export const jsonResponse = (body, ok = true) => ({ ok, json: vi.fn(async () => body) });

/**
 * Instala los dobles globales que la vista necesita y que happy-dom no trae
 * (o no trae controlables). Devuelve los espías.
 */
export function installGlobals({ fetchImpl, reduceMotion = false } = {}) {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  const frames = [];
  const raf = vi.fn((cb) => frames.push(cb));
  vi.stubGlobal("requestAnimationFrame", raf);
  const fetch = vi.fn(fetchImpl ?? (async () => jsonResponse(MARCAS)));
  vi.stubGlobal("fetch", fetch);
  const matchMedia = vi.fn((query) => ({ matches: reduceMotion, media: query }));
  vi.stubGlobal("matchMedia", matchMedia);
  window.matchMedia = matchMedia;
  return { raf, frames, fetch, matchMedia };
}

/** Contexto de vista mínimo (ver js/views/README.md). */
export function makeCtx(connection = { state: "offline" }) {
  return {
    state: { connection },
    actions: { switchView: vi.fn() },
  };
}

/** Espera a que se resuelvan las promesas pendientes (fetch de marcas). */
export const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** Normaliza HTML como lo serializa el DOM (comillas, etiquetas cerradas). */
export function html(str) {
  const t = document.createElement("template");
  t.innerHTML = str;
  return t.innerHTML;
}
