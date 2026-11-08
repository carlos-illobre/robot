// Ayudantes compartidos por las pruebas del área shell (barra, ayuda, ui/ y main.js).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INDEX = fileURLToPath(new URL("../../index.html", import.meta.url));

/** Arma en happy-dom el <body> real de index.html (appbar, view-root, help, toasts). */
export function montarIndex() {
  const html = readFileSync(INDEX, "utf8");
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  document.body.innerHTML = body;
  document.documentElement.dataset.theme = "dark";
  return {
    appbar: document.getElementById("appbar"),
    root: document.getElementById("view-root"),
    help: document.getElementById("help"),
    toasts: document.getElementById("toasts"),
  };
}

/**
 * Registra los listeners que se agregan a `document` y `window` para poder
 * sacarlos al final de la prueba: main.js y AppBar se cuelgan del documento y,
 * sin esto, los de una prueba seguirían escuchando en la siguiente.
 */
export function rastrearListeners(targets = [document, window]) {
  const added = [];
  const originals = targets.map((t) => {
    const orig = t.addEventListener;
    t.addEventListener = function (type, fn, opts) {
      added.push([t, type, fn, opts]);
      return orig.call(this, type, fn, opts);
    };
    return [t, orig];
  });
  return () => {
    for (const [t, orig] of originals) t.addEventListener = orig;
    for (const [t, type, fn, opts] of added) t.removeEventListener(type, fn, opts);
    added.length = 0;
  };
}

/** Contexto 2D falso: cada método es un vi.fn y se recuerdan las propiedades asignadas. */
export function contexto2d(vi) {
  const grad = { addColorStop: vi.fn() };
  return {
    grad,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    createLinearGradient: vi.fn(() => grad),
  };
}

/** Le da a un elemento un tamaño de layout (happy-dom no calcula layout). */
export function conTamano(el, { width = 0, height = 0, left = 0 } = {}) {
  Object.defineProperty(el, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: height });
  Object.defineProperty(el, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(el, "offsetLeft", { configurable: true, value: left });
  return el;
}

/** Espera a que se vacíe la cola de microtareas (promesas encadenadas). */
export const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

/** Motores de ejemplo: Go2 tiene 12 y G1 29. */
export const motores = (n) => Array.from({ length: n }, (_, i) => ({ nombre: `m${i}`, temperatura: 30, torque: 1, posicion: 0 }));
