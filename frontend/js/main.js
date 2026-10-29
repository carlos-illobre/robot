/**
 * Raíz de composición del dashboard.
 *
 * Es el ÚNICO archivo que conoce a todas las piezas: crea el EventBus, el
 * servicio de telemetría, el historial y las capturas, y se los pasa a la
 * vista activa a través de un "contexto". Las vistas no se conocen entre sí
 * ni conocen al transporte: reciben muestras ya normalizadas.
 *
 *   TelemetryService ──"frame"──► EventBus ──► historial · grabación · alarmas
 *                                         └──► requestAnimationFrame ──► vista.update()
 */
import { DEFAULTS, settings, resolveInitialServer, resolveInitialTransport, resolveBackendUrl } from "./config.js";
import { EventBus } from "./core/EventBus.js";
import { RingBuffer } from "./core/RingBuffer.js";
import { CaptureStore } from "./core/CaptureStore.js";
import { toCsv, csvFilename, downloadText } from "./core/csv.js";
import { evaluateAlerts, AlertTracker } from "./core/alerts.js";
import { TelemetryService } from "./services/TelemetryService.js";
import { ApiClient } from "./services/ApiClient.js";
import { isSimUrl } from "./services/SimTransport.js";
import { applyTheme, currentTheme, themeForView, rememberTheme } from "./ui/theme.js";
import { toast } from "./ui/toast.js";
import { AppBar } from "./shell/AppBar.js";
import { openHelp } from "./shell/HelpDialog.js";
import { VIEWS, viewById } from "./views/registry.js";

/* ------------------------------------------------------------------ */
/* Estado compartido                                                   */
/* ------------------------------------------------------------------ */

const bus = new EventBus();
const history = new RingBuffer(DEFAULTS.historySize);
const captures = new CaptureStore();
const service = new TelemetryService(bus);
const alertTracker = new AlertTracker();

/**
 * Estado que leen las vistas (solo lectura para ellas: para cambiarlo usan
 * `actions`). Es un objeto plano a propósito: fácil de inspeccionar desde la
 * consola del navegador con `tp05.state`.
 */
const state = {
  baseUrl: resolveInitialServer(),
  backendUrl: resolveBackendUrl(),
  /** Fuente de datos actual: { modo: "real"|"simulador"|"demo"|"demo-catedra"|"navegador", robot, medido } */
  source: null,
  transport: resolveInitialTransport(),
  intervalMs: settings.get("intervalMs", DEFAULTS.intervalMs),
  torqueAlarm: settings.get("torqueAlarm", DEFAULTS.torqueAlarm),
  excel: settings.get("excel", false),
  /** Ilustración del robot en las vistas: "esquema" (SVG) o "3d" (modelo real de Unitree). Tecla G. */
  figure: settings.get("figure", "esquema"),
  info: null,
  latest: null,
  paused: false,
  recording: false,
  connection: { state: "offline", detail: "", transport: "websocket" },
  stats: { hz: 0, gapMs: null, rttMs: null, frames: 0, errors: 0 },
  alerts: [],
  events: [],
  viewId: null,
};

let view = null;          // instancia de la vista activa
let viewMeta = null;      // su entrada en el registro
let switching = null;     // promesa del cambio de vista en curso

const root = document.getElementById("view-root");
const helpDialog = document.getElementById("help");

/* ------------------------------------------------------------------ */
/* Acciones: lo único que las vistas pueden "hacer"                    */
/* ------------------------------------------------------------------ */

function logEvent(level, message) {
  const ev = { at: new Date(), level, message };
  state.events.unshift(ev);
  state.events.length = Math.min(state.events.length, 200);
  view?.onEvent?.(ev);
  return ev;
}

const actions = {
  /** Captura la muestra actual. Devuelve la captura (o null). */
  capture() {
    if (!state.latest) {
      toast("Todavía no llegó ninguna muestra para capturar", { kind: "warn" });
      return null;
    }
    const sample = captures.add(state.latest, "manual");
    if (!sample) {
      toast("Se alcanzó el máximo de capturas: exportá y limpiá", { kind: "warn" });
      return null;
    }
    logEvent("info", `Muestra #${sample.n} capturada (t = ${sample.frame.ts.toFixed(1)} s)`);
    toast(`Muestra #${sample.n} capturada`, { kind: "ok", timeout: 1600 });
    return sample;
  },

  toggleRecording(force) {
    state.recording = force ?? !state.recording;
    logEvent("info", state.recording ? "Grabación continua iniciada" : `Grabación detenida (${captures.size} muestras en total)`);
    toast(state.recording ? "Grabando todas las muestras… (R para detener)" : "Grabación detenida", { kind: state.recording ? "crit" : "info", timeout: 2000 });
    view?.onRecording?.(state.recording);
  },

  exportCsv({ excel = state.excel } = {}) {
    if (!captures.size) {
      toast("No hay muestras capturadas. Presioná C para capturar o R para grabar.", { kind: "warn" });
      return;
    }
    const modelo = state.info?.modelo ?? state.latest?.modelo ?? "robot";
    const name = csvFilename(modelo);
    downloadText(toCsv(captures.samples, { excel }), name);
    logEvent("ok", `Exportadas ${captures.size} muestras a ${name}`);
    toast(`${captures.size} muestras exportadas a ${name}`, { kind: "ok" });
  },

  exportJson() {
    if (!captures.size) return actions.exportCsv();
    const modelo = state.info?.modelo ?? "robot";
    const name = csvFilename(modelo, new Date(), "json");
    const data = captures.samples.map(({ n, tipo, capturedAt, frame }) => ({ n, tipo, capturedAt, ...frame, derived: undefined, receivedAt: undefined }));
    downloadText(JSON.stringify(data, null, 2), name, "application/json");
    toast(`${captures.size} muestras exportadas a ${name}`, { kind: "ok" });
  },

  clearCaptures() {
    const n = captures.size;
    captures.clear();
    if (n) logEvent("info", `Se borraron ${n} capturas`);
  },

  setExcel(on) {
    state.excel = Boolean(on);
    settings.set("excel", state.excel);
  },

  togglePause(force) {
    state.paused = force ?? !state.paused;
    appBar.setPaused(state.paused);
    view?.onPause?.(state.paused);
    if (!state.paused) scheduleRender();
    toast(state.paused ? "Vista en pausa: los datos se siguen recibiendo (Espacio para seguir)" : "Vista reanudada", { kind: "info", timeout: 1600 });
  },

  setTransport(transport, intervalMs = state.intervalMs) {
    state.transport = transport;
    state.intervalMs = Math.min(500, intervalMs);
    settings.set("transport", transport);
    settings.set("intervalMs", state.intervalMs);
    logEvent("info", `Transporte: ${transport === "polling" ? `polling cada ${state.intervalMs} ms` : "WebSocket"}`);
    return service.setTransport(transport, state.intervalMs);
  },

  toggleTransport() {
    return actions.setTransport(state.transport === "websocket" ? "polling" : "websocket");
  },

  async connect(url) {
    try {
      state.baseUrl = isSimUrl(url) ? url.trim().toLowerCase() : ApiClient.normalizeBaseUrl(url);
    } catch (err) {
      toast(err.message, { kind: "warn" });
      return;
    }
    settings.set("baseUrl", state.baseUrl);
    if (!isSimUrl(state.baseUrl)) {
      state.backendUrl = state.baseUrl;
      settings.set("backendUrl", state.backendUrl);
    }
    history.clear();
    logEvent("info", `Conectando a ${isSimUrl(state.baseUrl) ? "la simulación del navegador" : state.baseUrl}`);
    await service.connect({ baseUrl: state.baseUrl, transport: state.transport, intervalMs: state.intervalMs });
    await actions.loadSources({ probe: false });
  },

  /**
   * Fuentes de datos para el panel. Son tres: Robot real, Simulador MuJoCo y
   * Demo. La Demo es una sola opción para el usuario: si hay servidor la
   * calcula el servidor (demo «paseo»); si no (p. ej. GitHub Pages), la
   * calcula el navegador con la misma simulación. Es un detalle técnico que
   * no hace falta elegir.
   */
  async loadSources({ probe = true } = {}) {
    let backend = null;
    let error = "";
    const sim = isSimUrl(state.baseUrl);
    const onPages = location.hostname.endsWith("github.io");
    try {
      // Desde GitHub Pages (https) el navegador no deja conectarse a un backend http.
      if (onPages) throw new Error("pages");
      // En la simulación del navegador solo se le pregunta al servidor si el usuario
      // abre el panel (así no se ensucia la consola con un servidor que no existe).
      if (sim && !probe) throw new Error("sin-consulta");
      backend = await new ApiClient(state.backendUrl, { timeoutMs: 1500 }).fuentes();
    } catch (err) {
      error = onPages
        ? "Desde GitHub Pages no hay servidor: para el robot real, abrí el dashboard local con «python iniciar.py» (ver el Manual)."
        : /404/.test(err.message)
          ? "Este servidor no permite elegir la fuente (es el backend original de la cátedra)."
          : `No hay un servidor en ${state.backendUrl}.`;
    }
    state.backendOk = Boolean(backend);

    const demoDesc = backend
      ? "El robot pasea solo (camina, trota, gira, frena) con datos coherentes. No necesita nada."
      : "El robot pasea solo con datos coherentes, calculados en este navegador (no hay servidor). No necesita nada.";
    const fuentes = backend
      ? backend.fuentes.map((f) => (f.modo === "demo" ? { ...f, descripcion: demoDesc } : f))
      : [
          { modo: "real", nombre: "Robot real", medido: true, disponible: false, motivo: error },
          { modo: "simulador", nombre: "Simulador MuJoCo", medido: false, disponible: false, motivo: error },
          { modo: "demo", nombre: "Demo", medido: false, disponible: true, descripcion: demoDesc, motivo: "" },
        ];

    state.source = sim
      ? { modo: "demo", enNavegador: true, robot: /g1$/.test(state.baseUrl) ? "g1" : "go2", medido: false }
      : backend
        ? { ...backend.actual, medido: backend.actual.modo === "real" }
        : { modo: state.info?.modo ?? "desconocido", robot: state.info?.modelo, medido: state.info?.modo === "real" };
    const result = {
      actual: state.source,
      // Sin servidor, la única opción (Demo en el navegador) siempre se puede elegir.
      cambiable: backend ? backend.cambiable : true,
      fuentes,
      interfaces: backend?.interfaces ?? [],
      interfazSugerida: backend?.interfaz_sugerida ?? null,
      backendUrl: state.backendUrl,
      error,
    };
    appBar.setSources(result);
    view?.onSource?.(state.source);
    return result;
  },

  /** Cambia la fuente de datos (y el robot). La Demo va al servidor si hay uno; si no, al navegador. */
  async setSource({ modo, robot = "go2", interfaz = null }) {
    if (modo === "navegador" || (modo === "demo" && state.backendOk === false)) {
      await actions.connect(robot === "g1" ? "demo-g1" : "demo");
      toast(`Fuente: demo (en el navegador) · ${robot.toUpperCase()}`, { kind: "ok" });
      return true;
    }
    try {
      await new ApiClient(state.backendUrl).cambiarFuente({ modo, robot, interfaz: interfaz || null });
    } catch (err) {
      toast(`No se pudo cambiar la fuente: ${err.message.replace(/^HTTP \d+: /, "")}`, { kind: "crit", timeout: 6000 });
      logEvent("warn", `Cambio de fuente fallido (${modo}): ${err.message}`);
      return false;
    }
    if (isSimUrl(state.baseUrl) || state.baseUrl !== state.backendUrl) await actions.connect(state.backendUrl);
    else {
      await service.refreshInfo();
      await actions.loadSources();
    }
    const nombre = { real: "robot real", simulador: "simulador MuJoCo", demo: "demo" }[modo] ?? modo;
    logEvent("ok", `Fuente de datos: ${nombre} · ${robot}`);
    toast(`Fuente: ${nombre} · ${robot.toUpperCase()}`, { kind: "ok" });
    return true;
  },

  setTorqueAlarm(nm) {
    state.torqueAlarm = Number(nm) || DEFAULTS.torqueAlarm;
    settings.set("torqueAlarm", state.torqueAlarm);
  },

  setFigureMode(mode) {
    state.figure = mode === "3d" ? "3d" : "esquema";
    settings.set("figure", state.figure);
    view?.onFigureMode?.(state.figure);
  },

  toggleFigure() {
    actions.setFigureMode(state.figure === "3d" ? "esquema" : "3d");
    toast(state.figure === "3d" ? "Ilustración: modelo 3D real" : "Ilustración: esquema", { kind: "info", timeout: 1400 });
  },

  toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    rememberTheme(state.viewId, next);
    appBar.setTheme(next);
    view?.onTheme?.(next);
  },

  openHelp() {
    openHelp(helpDialog, view);
  },

  switchView(id) {
    return switchView(id);
  },

  /** Abre el manual en una sección (p. ej. desde el panel de fuentes). */
  async openManual(section) {
    window.history.replaceState(null, "", `${location.pathname}${location.search}#man-${section}`);
    await switchView("manual");
    view?.goTo?.(section);
  },
};

/* ------------------------------------------------------------------ */
/* Gestor de vistas                                                    */
/* ------------------------------------------------------------------ */

const ctx = { bus, history, captures, state, actions, service };

async function switchView(id) {
  const meta = viewById(id);
  if (meta.id === state.viewId && view) return;
  if (switching) await switching;

  switching = (async () => {
    let Module;
    try {
      Module = await meta.load();
    } catch (err) {
      console.error(err);
      toast(`No se pudo cargar la vista ${meta.label}`, { kind: "crit" });
      return;
    }
    const View = Module.default;

    view?.destroy?.();
    view = null;
    root.replaceChildren();
    root.className = `view view-${meta.id} view--enter`;
    root.addEventListener("animationend", () => root.classList.remove("view--enter"), { once: true });

    state.viewId = meta.id;
    viewMeta = meta;
    settings.set("view", meta.id);
    const url = new URL(location.href);
    url.searchParams.set("view", meta.id);
    window.history.replaceState(null, "", url);

    const theme = themeForView(meta.id, meta.theme);
    applyTheme(theme);
    appBar.setTheme(theme);
    appBar.setView(meta.id);
    document.title = `${meta.label} · Telemetría Unitree`;

    view = new View(ctx);
    view.mount(root);
    if (state.info) view.setInfo(state.info);
    view.onConnection?.(state.connection);
    view.onRecording?.(state.recording);
    view.onPause?.(state.paused);
    view.onFigureMode?.(state.figure);
    if (state.latest) view.update(state.latest);
  })();
  await switching;
  switching = null;
}

/* ------------------------------------------------------------------ */
/* Flujo de datos                                                      */
/* ------------------------------------------------------------------ */

let renderQueued = false;

/** Agrupa el dibujo: varias muestras dentro del mismo cuadro → un solo repintado. */
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (!state.paused && view && state.latest) view.update(state.latest);
  });
}

/** Si /info no responde (servidor viejo), se deduce lo necesario del primer frame. */
function infoFromFrame(frame) {
  const legs = Object.keys(frame.fuerzas);
  return {
    modelo: frame.modelo,
    nombre: frame.modelo === "g1" ? "Unitree G1" : frame.modelo === "go2" ? "Unitree Go2" : frame.modelo,
    tipo: legs.length === 4 ? "cuadrupedo" : "humanoide",
    n_motores: frame.motores.length,
    motores_nombres: frame.motores.map((m) => m.nombre),
    patas: legs,
    frecuencia_hz: 10,
    modo: null,
  };
}

function setInfo(info) {
  const changed = state.info?.modelo !== info.modelo || state.info?.n_motores !== info.n_motores;
  state.info = info;
  if (changed) {
    history.clear();
    alertTracker.reset();
    if (state.latest && state.latest.modelo !== info.modelo) state.latest = null;
  }
  appBar.setInfo(info);
  view?.setInfo(info);
}

bus.on("info", (info) => {
  setInfo(info);
  logEvent("ok", `Conectado a ${info.nombre} (${info.n_motores} motores, modo ${info.modo ?? "?"})`);
});

bus.on("frame", (frame) => {
  if (!state.info || state.info.modelo !== frame.modelo) setInfo(state.info?.modelo === frame.modelo ? state.info : infoFromFrame(frame));

  state.latest = frame;
  history.push(frame);
  if (state.recording && !captures.add(frame, "continua")) {
    actions.toggleRecording(false);
    toast("Grabación detenida: se alcanzó el máximo de muestras", { kind: "warn" });
  }

  const result = alertTracker.update(evaluateAlerts(frame, { torqueAlarm: state.torqueAlarm }, alertTracker.keys));
  state.alerts = result.active;
  if (result.raised.length || result.cleared.length) {
    for (const a of result.raised) {
      logEvent(a.level, a.message);
      if (a.level === "crit") toast(a.message, { kind: "crit", timeout: 4500 });
    }
    for (const a of result.cleared) logEvent("ok", `Normalizado: ${a.message.split(":")[0].split(" a ")[0]}`);
    view?.onAlerts?.(result);
  }
  scheduleRender();
});

let lastStatsPaint = 0;
bus.on("stats", (stats) => {
  state.stats = stats;
  const now = performance.now();
  if (now - lastStatsPaint > 500) {
    lastStatsPaint = now;
    appBar.setStats(stats);
    view?.onStats?.(stats);
  }
});

bus.on("connection", (conn) => {
  const prev = state.connection.state;
  state.connection = conn;
  appBar.setConnection(conn);
  view?.onConnection?.(conn);
  if (conn.changed) {
    if (conn.state === "live" && prev !== "live" && prev !== "connecting") {
      logEvent("ok", "Conexión restablecida");
      toast("Conexión restablecida", { kind: "ok" });
    } else if ((conn.state === "reconnecting" || conn.state === "stale") && prev === "live") {
      logEvent("warn", `Conexión perdida: ${conn.detail}`);
      toast("Se perdió la conexión: reintentando…", { kind: "warn" });
    }
  }
});

bus.on("info-error", (err) => logEvent("warn", `/info no respondió (${err.message}); se deduce del primer dato`));

/* ------------------------------------------------------------------ */
/* Teclado                                                             */
/* ------------------------------------------------------------------ */

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (helpDialog.open && e.key !== "?") return;
  if (view?.onKey?.(e)) { e.preventDefault(); return; }

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const map = {
    c: () => actions.capture(),
    r: () => actions.toggleRecording(),
    e: () => actions.exportCsv(),
    " ": () => actions.togglePause(),
    w: () => actions.toggleTransport(),
    g: () => actions.toggleFigure(),
    t: () => actions.toggleTheme(),
    "?": () => (helpDialog.open ? helpDialog.close() : actions.openHelp()),
  };
  for (const v of VIEWS) map[v.key] = () => actions.switchView(v.id);
  if (map[key]) {
    e.preventDefault();
    map[key]();
  }
});

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

const appBar = new AppBar(document.getElementById("appbar"), { state, actions });

const initialView = new URLSearchParams(location.search).get("view") ?? settings.get("view") ?? VIEWS[0].id;
await switchView(initialView);
await service.connect({ baseUrl: state.baseUrl, transport: state.transport, intervalMs: state.intervalMs });
actions.loadSources({ probe: false });

// Para curiosear desde la consola del navegador (F12): tp05.state, tp05.history.tail(5)…
window.tp05 = { state, history, captures, actions, service, bus };
