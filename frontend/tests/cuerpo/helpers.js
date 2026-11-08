// Helpers compartidos por las pruebas de la vista Cuerpo (frontend/js/views/body/**).
import { vi } from "vitest";
import { PaseoSim } from "../../js/core/paseoSim.js";
import { normalizeFrame } from "../../js/core/telemetryModel.js";

/** /info de un robot del simulador: "go2" (12 motores) o "g1" (29 motores). */
export const infoFor = (modelo) => new PaseoSim(modelo).info();

/**
 * Muestras normalizadas reales del simulador, cada `dtMs` milisegundos.
 * @returns {object[]} en orden cronológico; receivedAt arranca en `start`
 */
export function simFrames(modelo, n, { dtMs = 100, start = 1_000_000, warmup = 0 } = {}) {
  const sim = new PaseoSim(modelo);
  if (warmup) sim.advance(warmup);
  const out = [];
  for (let i = 0; i < n; i++) {
    sim.advance(dtMs / 1000);
    out.push(normalizeFrame(sim.telemetria(), start + i * dtMs));
  }
  return out;
}

/**
 * Muestra armada a mano (cruda → normalizeFrame), para bordes precisos.
 * `motores` acepta [nombre, temperatura, extras?].
 */
export function frame({
  motores = [],
  imu = {},
  bms = {},
  fuerzas = {},
  receivedAt = 1_000_000,
  modelo = "go2",
} = {}) {
  return normalizeFrame(
    {
      modelo,
      ts: 1,
      motores: motores.map(([nombre, temperatura, extra = {}], id) => ({
        id, nombre, temperatura, angulo: 0, velocidad: 0, torque: 0, ...extra,
      })),
      imu: { roll: 0, pitch: 0, yaw: 0, ...imu },
      bms: { soc: 80, corriente: 0, temperatura: 30, celdas: [], ...bms },
      fuerzas,
    },
    receivedAt,
  );
}

/** Paleta de colores falsa (cada valor es reconocible en las aserciones). */
export const PALETTE = Object.freeze({
  ink: "INK", ink2: "INK2", muted: "MUTED", rule: "RULE", rule2: "RULE2", track: "TRACK",
  s1: "S1", s2: "S2", ok: "OK", warn: "WARN", crit: "CRIT", accent: "ACC", onAccent: "ONACC",
  sans: "SANS", mono: "MONO",
});

const STATE_PROPS = ["fillStyle", "strokeStyle", "font", "textAlign", "textBaseline", "globalAlpha", "lineWidth", "lineJoin"];
const METHODS = [
  "setTransform", "clearRect", "fillRect", "fillText", "beginPath", "moveTo", "lineTo", "stroke",
  "fill", "setLineDash", "roundRect",
];

/**
 * Contexto 2D falso: cada método es un vi.fn y cada llamada queda en `log`
 * junto con el estado (fillStyle, font, …) vigente en ese momento.
 */
export function fakeCtx2d() {
  const state = {};
  const log = [];
  const ctx = { log, state };
  for (const p of STATE_PROPS) {
    Object.defineProperty(ctx, p, {
      get: () => state[p],
      set: (v) => { state[p] = v; },
      enumerable: true,
    });
  }
  for (const m of METHODS) {
    ctx[m] = vi.fn((...args) => { log.push({ name: m, args, ...state }); });
  }
  ctx.measureText = vi.fn((t) => ({ width: String(t).length * 7 }));
  /** Llamadas a un método, con el estado del contexto en cada una. */
  ctx.calls = (name) => log.filter((c) => c.name === name);
  /** Textos dibujados con fillText. */
  ctx.texts = () => ctx.calls("fillText").map((c) => c.args[0]);
  ctx.reset = () => { log.length = 0; };
  return ctx;
}

/** Fija el tamaño de "layout" de un elemento (happy-dom no hace layout). */
export function setBox(el, width, height) {
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: height, configurable: true });
}

/** Stub de getBoundingClientRect con un rectángulo fijo. */
export function setRect(el, { left = 0, top = 0, width = 0, height = 0 }) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
}

/** Cambia window.devicePixelRatio y devuelve la función que lo restaura. */
export function setDpr(value) {
  const prev = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true, writable: true });
  return () => (prev ? Object.defineProperty(window, "devicePixelRatio", prev) : delete window.devicePixelRatio);
}
