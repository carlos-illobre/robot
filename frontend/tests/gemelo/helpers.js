/**
 * Dobles de prueba compartidos por las pruebas del Gemelo 3D (spec 007).
 *
 * Ojo: este archivo NO importa "three". Las pruebas lo cargan desde la
 * fábrica de `vi.mock("three", …)` para reemplazar lo único que no anda en
 * Node (WebGLRenderer y PMREMGenerator, que necesitan una placa de video);
 * si importara "three" se quedaría esperando al propio mock.
 */
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PaseoSim } from "../../js/core/paseoSim.js";
import { normalizeFrame } from "../../js/core/telemetryModel.js";

/* ------------------------------------------------------------------ */
/* three: renderer y entorno falsos                                    */
/* ------------------------------------------------------------------ */

/** WebGLRenderer sin GPU: un <canvas> de happy-dom y métodos espía. */
export class FakeRenderer {
  static instances = [];

  constructor(params) {
    this.params = params;
    this.domElement = document.createElement("canvas");
    this.shadowMap = { enabled: true, type: 0 };
    this.capabilities = { getMaxAnisotropy: () => 16 };
    this.renderLists = { dispose: vi.fn() };
    this.contextLost = false;
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
    this.getContext = vi.fn(() => ({ isContextLost: () => this.contextLost }));
    this.setPixelRatio = vi.fn();
    this.setSize = vi.fn();
    this.setClearColor = vi.fn();
    this.setRenderTarget = vi.fn();
    this.render = vi.fn();
    this.dispose = vi.fn();
    this.forceContextLoss = vi.fn();
    FakeRenderer.instances.push(this);
  }
}

/** PMREMGenerator falso: devuelve una textura con dispose espía. */
export class FakePMREM {
  static instances = [];

  constructor(renderer) {
    this.renderer = renderer;
    this.texture = { isTexture: true, dispose: vi.fn() };
    this.fromScene = vi.fn(() => ({ texture: this.texture }));
    this.dispose = vi.fn();
    FakePMREM.instances.push(this);
  }
}

/** Fábrica para `vi.mock("three", (orig) => threeSinGpu(orig))`. */
export async function threeSinGpu(importOriginal) {
  const real = await importOriginal();
  return { ...real, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREM };
}

/* ------------------------------------------------------------------ */
/* Canvas 2D / WebGL                                                   */
/* ------------------------------------------------------------------ */

/** Contexto 2D que anota cada llamada. */
export function fakeContext2D() {
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    gradient,
    /** [strokeStyle, lineWidth] en el momento de cada stroke()/strokeRect(). */
    strokes: [],
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 0,
    createRadialGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(() => ctx.strokes.push([ctx.strokeStyle, ctx.lineWidth])),
  };
  ctx.strokeRect = vi.fn(() => ctx.strokes.push([ctx.strokeStyle, ctx.lineWidth]));
  return ctx;
}

/**
 * Reemplaza HTMLCanvasElement#getContext. `webgl` decide qué devuelve el
 * contexto 3D: un objeto (gl falso), null (sin WebGL) o una función.
 */
export function stubCanvas({ webgl = fakeGL("ANGLE (NVIDIA GeForce)") } = {}) {
  const contexts2d = [];
  const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (kind) {
    if (kind === "2d") {
      const ctx = fakeContext2D();
      contexts2d.push(ctx);
      return ctx;
    }
    return typeof webgl === "function" ? webgl(kind) : webgl;
  });
  return { spy, contexts2d };
}

/** Contexto WebGL falso con (o sin) la extensión que da el nombre de la placa. */
export function fakeGL(name, { debugExt = true } = {}) {
  const ext = { UNMASKED_RENDERER_WEBGL: 0x9246 };
  return {
    RENDERER: 0x1f01,
    getExtension: vi.fn((n) => (debugExt && n === "WEBGL_debug_renderer_info" ? ext : null)),
    getParameter: vi.fn((p) => (p === ext.UNMASKED_RENDERER_WEBGL || p === 0x1f01 ? name : null)),
  };
}

/* ------------------------------------------------------------------ */
/* Reloj, rAF, ResizeObserver, visibilidad                             */
/* ------------------------------------------------------------------ */

/**
 * requestAnimationFrame y performance.now bajo control de la prueba.
 * `frame(ms)` avanza el reloj y corre los callbacks pendientes con ese `now`.
 */
export function fakeClock(start = 1000) {
  let t = start;
  const queue = new Map();
  let nextId = 0;
  vi.spyOn(performance, "now").mockImplementation(() => t);
  const raf = vi.fn((cb) => {
    queue.set(++nextId, cb);
    return nextId;
  });
  const caf = vi.fn((id) => queue.delete(id));
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);
  return {
    raf,
    caf,
    get now() {
      return t;
    },
    get pending() {
      return queue.size;
    },
    advance(ms) {
      t += ms;
    },
    frame(ms = 1000 / 60) {
      t += ms;
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) cb(t);
    },
    frames(n, ms) {
      for (let i = 0; i < n; i++) this.frame(ms);
    },
  };
}

/** ResizeObserver que se dispara a mano. */
export class FakeResizeObserver {
  static instances = [];

  constructor(cb) {
    this.cb = cb;
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    FakeResizeObserver.instances.push(this);
  }

  trigger() {
    this.cb([], this);
  }
}

/** document.hidden controlable. Devuelve un setter. */
export function stubHidden(initial = false) {
  let hidden = initial;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  return (value) => {
    hidden = value;
    document.dispatchEvent(new Event("visibilitychange"));
  };
}

export function restoreHidden() {
  delete document.hidden;
}

/** Fija el tamaño (clientWidth/clientHeight) de un elemento de happy-dom. */
export function setSize(el, width, height) {
  Object.defineProperty(el, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => height });
}

/* ------------------------------------------------------------------ */
/* Modelos .glb reales servidos por un fetch falso                     */
/* ------------------------------------------------------------------ */

/** Bytes del .glb real que está en frontend/assets (lo que bajaría el navegador). */
export function glbBytes(url) {
  const clean = String(url).replace(/[?#].*$/, "");
  return new Uint8Array(readFileSync(fileURLToPath(clean)));
}

/**
 * Respuesta de fetch. Por defecto sin Content-Length (se lee con arrayBuffer);
 * con `chunks` manda Content-Length y un cuerpo que se lee de a pedazos.
 */
export function glbResponse(bytes, { chunks = 0, contentLength } = {}) {
  if (!chunks) {
    return { ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => bytes.slice().buffer };
  }
  const size = Math.ceil(bytes.length / chunks);
  const parts = [];
  for (let i = 0; i < bytes.length; i += size) parts.push(bytes.slice(i, i + size));
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": String(contentLength ?? bytes.length) }),
    body: { getReader: () => ({ read: async () => (i < parts.length ? { done: false, value: parts[i++] } : { done: true }) }) },
    arrayBuffer: async () => {
      throw new Error("no debería leerse entero");
    },
  };
}

/** fetch falso que sirve los .glb del repositorio. */
export function stubFetchGlb(opts = {}) {
  const fetch = vi.fn(async (url) => glbResponse(glbBytes(url), opts));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Copia de un perfil con una URL propia (el módulo cachea las descargas por URL). */
let unique = 0;
export function freshProfile(profile) {
  return { ...profile, url: `${profile.url}?t=${++unique}` };
}

/* ------------------------------------------------------------------ */
/* Telemetría real (PaseoSim + normalizeFrame)                         */
/* ------------------------------------------------------------------ */

/** `info` y `n` muestras normalizadas del simulador del navegador, cada `dt` segundos. */
export function paseo(modelo, n = 1, { dt = 0.1, skip = 0, seed = 7 } = {}) {
  const sim = new PaseoSim(modelo, { seed });
  if (skip) sim.advance(skip);
  const frames = [];
  for (let i = 0; i < n; i++) {
    sim.advance(dt);
    frames.push(normalizeFrame(sim.telemetria(), 1_700_000_000_000 + i * 100));
  }
  return { info: sim.info(), frames, sim };
}

/** Muestra normalizada a medida a partir de una del simulador. */
export function withFrame(frame, patch) {
  const raw = structuredClone({ ...frame, derived: undefined });
  const merged = { ...raw, ...patch };
  return normalizeFrame(merged, frame.receivedAt);
}
