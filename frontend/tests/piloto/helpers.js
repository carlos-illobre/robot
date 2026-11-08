// Helpers de las pruebas de la vista Piloto: datos reales del simulador y dobles
// de lo que happy-dom no trae (canvas 2D, ResizeObserver, Web Audio).
import { vi } from "vitest";
import { PaseoSim } from "../../js/core/paseoSim.js";
import { normalizeFrame } from "../../js/core/telemetryModel.js";

/** Marca de tiempo base de las muestras (ms): fija para que todo sea determinista. */
export const T0 = 1_700_000_000_000;

/** `/info` del simulador: Go2 (12 motores, 4 patas) o G1 (29 motores, 2 pies). */
export const infoDe = (modelo = "go2") => new PaseoSim(modelo).info();

/**
 * `n` muestras normalizadas del paseo, cada `dt` segundos de simulación y
 * con `receivedAt` cada 100 ms a partir de T0.
 */
export function simular(modelo = "go2", n = 1, { dt = 0.1, desde = 0 } = {}) {
  const sim = new PaseoSim(modelo);
  if (desde) sim.advance(desde);
  const frames = [];
  for (let i = 0; i < n; i++) {
    sim.advance(dt);
    frames.push(normalizeFrame(sim.telemetria(), T0 + i * 100));
  }
  return { sim, info: sim.info(), frames };
}

/**
 * Una muestra del simulador modificada ANTES de normalizar (así las métricas
 * derivadas son coherentes con lo que se cambió). `cambiar(raw)` puede mutar el JSON.
 */
export function muestra(modelo = "go2", cambiar = () => {}, { receivedAt = T0, desde = 0.5 } = {}) {
  const sim = new PaseoSim(modelo);
  sim.advance(desde);
  const raw = sim.telemetria();
  cambiar(raw);
  return normalizeFrame(raw, receivedAt);
}

/** Pone la temperatura de motores por nombre (el resto queda a 30 °C). */
export function temperaturas(raw, mapa = {}, resto = 30) {
  for (const m of raw.motores) m.temperatura = mapa[m.nombre] ?? resto;
}

/**
 * Contexto 2D falso: cada método es un `vi.fn()` y cada asignación de
 * propiedad (strokeStyle, globalAlpha…) queda anotada en `sets`. `log` guarda
 * el orden de todo, para verificar secuencias. `reiniciar()` borra lo anotado.
 */
export function contexto2d() {
  const log = [];
  const sets = [];
  const metodos = ["clearRect", "setTransform", "beginPath", "moveTo", "lineTo", "stroke", "fillText", "fillRect", "setLineDash"];
  const g = {};
  for (const m of metodos) g[m] = vi.fn((...args) => log.push([m, ...args]));
  return new Proxy(g, {
    set(target, prop, value) {
      sets.push([prop, value]);
      log.push(["set", prop, value]);
      target[prop] = value;
      return true;
    },
    get(target, prop) {
      if (prop === "log") return log;
      if (prop === "sets") return sets;
      if (prop === "reiniciar") {
        return () => {
          log.length = 0;
          sets.length = 0;
          for (const m of metodos) target[m].mockClear();
        };
      }
      return target[prop];
    },
  });
}

/** ResizeObserver falso: guarda las instancias para disparar el callback a mano. */
export function resizeObserverFalso() {
  const instancias = [];
  class FakeResizeObserver {
    constructor(cb) {
      this.cb = cb;
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      instancias.push(this);
    }
    disparar() {
      this.cb([]);
    }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return instancias;
}

/** Fija el tamaño CSS de un elemento (happy-dom no calcula layout). */
export function tamano(el, w, h) {
  Object.defineProperty(el, "clientWidth", { configurable: true, value: w });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: h });
}

/**
 * Web Audio falso: un AudioContext con osciladores y ganancias de mentira
 * que anotan todo lo programado (frecuencia, tipo, envolvente, start/stop).
 */
export function audioFalso({ state = "running", currentTime = 10 } = {}) {
  const contextos = [];
  class FakeAudioContext {
    constructor() {
      this.state = state;
      this.currentTime = currentTime;
      this.destination = { nombre: "destino" };
      this.osciladores = [];
      this.ganancias = [];
      this.resume = vi.fn(() => {
        this.state = "running";
      });
      this.close = vi.fn();
      contextos.push(this);
    }
    createOscillator() {
      const osc = {
        type: "sine",
        frequency: { value: 0 },
        connect: vi.fn((nodo) => nodo),
        start: vi.fn(),
        stop: vi.fn(),
      };
      this.osciladores.push(osc);
      return osc;
    }
    createGain() {
      const gain = {
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn((nodo) => nodo),
      };
      this.ganancias.push(gain);
      return gain;
    }
  }
  return { FakeAudioContext, contextos };
}

/** Almacén de capturas mínimo con la misma interfaz que CaptureStore. */
export function capturasFalsas(samples = []) {
  const listeners = new Set();
  return {
    samples,
    get size() {
      return this.samples.length;
    },
    subscribe: vi.fn((fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    emitir() {
      for (const fn of listeners) fn(this);
    },
    listeners,
  };
}
