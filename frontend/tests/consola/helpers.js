// Helpers compartidos por las pruebas de la vista Consola (spec 007).
// Datos reales del simulador del navegador (PaseoSim) normalizados con normalizeFrame,
// y dobles de lo que happy-dom no trae (Chart.js, matchMedia).
import { vi } from "vitest";
import { PaseoSim } from "../../js/core/paseoSim.js";
import { normalizeFrame } from "../../js/core/telemetryModel.js";
import { RingBuffer } from "../../js/core/RingBuffer.js";
import { CaptureStore } from "../../js/core/CaptureStore.js";

/**
 * Instala un doble de Chart.js en `globalThis.Chart` y devuelve la lista de
 * gráficos creados. Se restaura con `vi.unstubAllGlobals()`.
 */
export function instalarChart() {
  const creados = [];
  class ChartFalso {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.options = config.options;
      this.data = config.data;
      this.update = vi.fn();
      this.destroy = vi.fn();
      creados.push(this);
    }
  }
  vi.stubGlobal("Chart", ChartFalso);
  return creados;
}

/** Doble de `matchMedia` que responde `reduce` a "prefers-reduced-motion". */
export function movimientoReducido(reduce) {
  const fn = vi.fn(() => ({ matches: reduce }));
  vi.stubGlobal("matchMedia", fn);
  return fn;
}

/** `n` muestras normalizadas del paseo, cada `dt` s, después de `desde` s de simulación. */
export function muestras(modelo = "go2", n = 20, { dt = 0.1, desde = 0, seed = 7 } = {}) {
  const sim = new PaseoSim(modelo, { seed });
  if (desde) sim.advance(desde);
  const out = [];
  for (let i = 0; i < n; i++) {
    sim.advance(dt);
    out.push(normalizeFrame(sim.telemetria(), 1_700_000_000_000 + i * 100));
  }
  return out;
}

/** `/info` del robot simulado. */
export const infoDe = (modelo = "go2") => new PaseoSim(modelo).info();

/** RingBuffer cargado con las muestras dadas. */
export function historial(frames = [], capacidad = 600) {
  const rb = new RingBuffer(capacidad);
  for (const f of frames) rb.push(f);
  return rb;
}

/** Muestra normalizada a partir de una muestra base, pisando lo que haga falta. */
export function conCambios(base, cambios = {}) {
  const raw = structuredClone({
    modelo: base.modelo,
    ts: base.ts,
    motores: base.motores,
    imu: base.imu,
    bms: base.bms,
    fuerzas: base.fuerzas,
  });
  return normalizeFrame({ ...raw, ...cambios }, base.receivedAt);
}

/** Contexto falso de una vista, con el estado, las acciones y los almacenes reales. */
export function crearCtx({ frames = [], state = {} } = {}) {
  const actions = {
    capture: vi.fn(),
    toggleRecording: vi.fn(),
    exportCsv: vi.fn(),
    exportJson: vi.fn(),
    clearCaptures: vi.fn(),
    setExcel: vi.fn(),
    togglePause: vi.fn(),
    setTorqueAlarm: vi.fn(),
    setFigureMode: vi.fn(),
  };
  return {
    state: {
      info: null,
      latest: frames.at(-1) ?? null,
      paused: false,
      recording: false,
      connection: { state: "live", detail: "", transport: "websocket", baseUrl: "http://localhost:8001" },
      alerts: [],
      torqueAlarm: 18,
      excel: false,
      figure: "esquema",
      transport: "websocket",
      intervalMs: 100,
      baseUrl: "http://localhost:8001",
      ...state,
    },
    actions,
    history: historial(frames),
    captures: new CaptureStore(),
  };
}
