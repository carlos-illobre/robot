/**
 * main.js es la raíz de composición: al importarse lee el DOM de index.html,
 * crea los servicios, registra el teclado y arranca la vista inicial. Cada
 * prueba lo vuelve a importar de cero (vi.resetModules) con dobles de las
 * vistas, del servicio de telemetría, del cliente HTTP, de la barra y de los
 * toasts; el EventBus, el historial, las alarmas y el tema son los reales.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { montarIndex, rastrearListeners, flush, motores } from "./helpers.js";

const m = vi.hoisted(() => ({
  views: {},
  loaders: {},
  creadas: [],
  bar: null,
  svc: null,
  api: { instances: [], fuentes: null, cambiarFuente: null },
  toast: [],
  help: [],
  download: [],
  toCsv: [],
  maxCaptures: 50_000,
}));

vi.mock("../../js/views/registry.js", async (importOriginal) => {
  const real = await importOriginal();
  const VIEWS = real.VIEWS.map((v) => ({
    ...v,
    load: () => (m.loaders[v.id] ? m.loaders[v.id]() : Promise.resolve({ default: m.views[v.id] })),
  }));
  return { VIEWS, viewById: (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0] };
});

vi.mock("../../js/services/TelemetryService.js", () => ({
  TelemetryService: class {
    constructor(bus) {
      this.bus = bus;
      this.connect = vi.fn(async () => {});
      this.setTransport = vi.fn(() => "transporte cambiado");
      this.refreshInfo = vi.fn(async () => {});
      m.svc = this;
    }
  },
}));

vi.mock("../../js/services/ApiClient.js", async (importOriginal) => {
  const { ApiClient: Real } = await importOriginal();
  return {
    ApiClient: class {
      static normalizeBaseUrl = Real.normalizeBaseUrl;
      constructor(url, opts) {
        this.url = url;
        this.opts = opts;
        m.api.instances.push(this);
      }
      fuentes() {
        return m.api.fuentes(this);
      }
      cambiarFuente(body) {
        return m.api.cambiarFuente(body, this);
      }
    },
  };
});

vi.mock("../../js/shell/AppBar.js", () => ({
  AppBar: class {
    constructor(root, deps) {
      this.root = root;
      this.deps = deps;
      for (const n of ["setPaused", "setSources", "setTheme", "setView", "setInfo", "setStats", "setConnection"]) this[n] = vi.fn();
      m.bar = this;
    }
  },
}));

vi.mock("../../js/shell/HelpDialog.js", () => ({ openHelp: (dialog, view) => m.help.push([dialog, view]) }));
vi.mock("../../js/ui/toast.js", () => ({ toast: (msg, opts) => m.toast.push([msg, opts]) }));
vi.mock("../../js/core/csv.js", async (importOriginal) => ({
  ...(await importOriginal()),
  toCsv: (samples, opts) => {
    m.toCsv.push([samples, opts]);
    return "CSV";
  },
  downloadText: (...args) => m.download.push(args),
}));
vi.mock("../../js/core/CaptureStore.js", async (importOriginal) => {
  const { CaptureStore } = await importOriginal();
  return {
    CaptureStore: class extends CaptureStore {
      constructor() {
        super({ maxSamples: m.maxCaptures });
      }
    },
  };
});

/* ------------------------------------------------------------------ */

const METODOS = ["destroy", "onConnection", "onRecording", "onPause", "onFigureMode", "onEvent", "onSource", "onTheme", "onAlerts", "onStats", "goTo"];

/** Vista falsa que anota cada llamada. `completa: false` = solo mount/setInfo/update. */
function vista(id, { completa = true, onKey = () => false } = {}) {
  return class Vista {
    static id = id;
    constructor(ctx) {
      this.ctx = ctx;
      this.calls = [];
      const rec = (n) => (...a) => this.calls.push([n, ...a]);
      this.mount = (root) => {
        this.calls.push(["mount", root]);
        root.append(Object.assign(document.createElement("p"), { textContent: `vista ${id}` }));
      };
      this.setInfo = rec("setInfo");
      this.update = rec("update");
      if (completa) {
        for (const n of METODOS) this[n] = rec(n);
        this.onKey = (e) => {
          this.calls.push(["onKey", e.key]);
          return onKey(e);
        };
      }
      m.creadas.push(this);
    }
  };
}

const llamadas = (v, n) => v.calls.filter((c) => c[0] === n).map((c) => c.slice(1));
const nombres = (v) => v.calls.map((c) => c[0]);
const ultimaVista = () => m.creadas.at(-1);
const toasts = () => m.toast.map(([msg]) => msg);
const ultimoToast = () => m.toast.at(-1);
const mensajes = (tp) => tp.state.events.map((e) => e.message);

const go2 = (over = {}) => ({ modelo: "go2", ts: 12.34, motores: motores(12), fuerzas: { FL: 1, FR: 1, RL: 1, RR: 1 }, bms: { soc: 80 }, ...over });
const g1 = (over = {}) => ({ modelo: "g1", ts: 3, motores: motores(29), fuerzas: { izq: 1, der: 1 }, bms: { soc: 80 }, ...over });
const INFO_GO2 = { modelo: "go2", nombre: "Unitree Go2", n_motores: 12, modo: "demo" };

let root, help, limpiar;

async function arrancar({ url = "http://localhost:3000/", guardado = null } = {}) {
  window.happyDOM.setURL(url);
  if (guardado) localStorage.setItem("tp05-dashboard", JSON.stringify(guardado));
  await import("../../js/main.js");
  return window.tp05;
}

const tecla = (key, opts = {}, target = document) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(ev);
  return ev;
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  Object.assign(m, { loaders: {}, creadas: [], bar: null, svc: null, toast: [], help: [], download: [], toCsv: [], maxCaptures: 50_000 });
  m.views = Object.fromEntries(["console", "body", "pilot", "twin", "manual"].map((id) => [id, vista(id)]));
  m.api = { instances: [], fuentes: vi.fn(() => Promise.reject(new Error("Failed to fetch"))), cambiarFuente: vi.fn(() => Promise.resolve({})) };
  ({ root, help } = montarIndex());
  limpiar = rastrearListeners([document, window]);
});
afterEach(() => {
  limpiar();
  delete window.tp05;
  vi.useRealTimers();
  window.happyDOM.setURL("http://localhost:3000/");
});

/* ------------------------------------------------------------------ */

describe("arranque", () => {
  test("monta la Consola, conecta al servidor por defecto y expone tp05", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    expect(v).toBeInstanceOf(m.views.console);
    expect(m.creadas).toHaveLength(1);
    expect(v.ctx).toEqual({ bus: tp.bus, history: tp.history, captures: tp.captures, state: tp.state, actions: tp.actions, service: tp.service });
    expect(tp.service).toBe(m.svc);
    expect(m.svc.bus).toBe(tp.bus);
    expect(m.svc.connect).toHaveBeenCalledExactlyOnceWith({ baseUrl: "http://localhost:8001", transport: "websocket", intervalMs: 250 });
    expect(m.bar.root).toBe(document.getElementById("appbar"));
    expect(m.bar.deps).toEqual({ state: tp.state, actions: tp.actions });
    expect(tp.state).toMatchObject({
      baseUrl: "http://localhost:8001",
      backendUrl: "http://localhost:8001",
      transport: "websocket",
      intervalMs: 250,
      torqueAlarm: 18,
      excel: false,
      figure: "esquema",
      info: null,
      latest: null,
      paused: false,
      recording: false,
      connection: { state: "offline", detail: "", transport: "websocket" },
      stats: { hz: 0, gapMs: null, rttMs: null, frames: 0, errors: 0 },
      alerts: [],
      viewId: "console",
    });
  });

  test("la vista recibe el estado inicial al montarse", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    expect(v.calls).toEqual([
      ["mount", root],
      ["onConnection", tp.state.connection],
      ["onRecording", false],
      ["onPause", false],
      ["onFigureMode", "esquema"],
      ["onSource", tp.state.source],
    ]);
    expect(root.className).toBe("view view-console view--enter");
    expect(root.textContent).toBe("vista console");
    expect(document.title).toBe("Consola · Telemetría Unitree");
    expect(location.search).toBe("?view=console");
    expect(JSON.parse(localStorage.getItem("tp05-dashboard")).view).toBe("console");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(m.bar.setTheme).toHaveBeenCalledWith("dark");
    expect(m.bar.setView).toHaveBeenCalledWith("console");
  });

  test("la animación de entrada se quita al terminar", async () => {
    await arrancar();
    root.dispatchEvent(new Event("animationend"));
    expect(root.className).toBe("view view-console");
  });

  test("al arrancar carga las fuentes sin consultar a un servidor que no responde", async () => {
    const tp = await arrancar();
    await flush();
    expect(m.api.instances[0].url).toBe("http://localhost:8001");
    expect(m.api.instances[0].opts).toEqual({ timeoutMs: 1500 });
    const res = m.bar.setSources.mock.calls[0][0];
    expect(res.error).toBe("No hay un servidor en http://localhost:8001.");
    expect(tp.state.backendOk).toBe(false);
  });

  test("la vista inicial sale de ?view=", async () => {
    const tp = await arrancar({ url: "http://localhost:3000/?view=body" });
    expect(tp.state.viewId).toBe("body");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.title).toBe("Cuerpo · Telemetría Unitree");
  });

  test("sin ?view= usa la última vista guardada y sus preferencias", async () => {
    const tp = await arrancar({
      guardado: { view: "pilot", baseUrl: "http://10.0.0.5:8001", transport: "polling", intervalMs: 100, torqueAlarm: 25, excel: true, figure: "3d", "theme:pilot": "light" },
    });
    expect(tp.state.viewId).toBe("pilot");
    expect(tp.state).toMatchObject({ baseUrl: "http://10.0.0.5:8001", transport: "polling", intervalMs: 100, torqueAlarm: 25, excel: true, figure: "3d" });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(llamadas(ultimaVista(), "onFigureMode")).toEqual([["3d"]]);
    expect(m.svc.connect).toHaveBeenCalledWith({ baseUrl: "http://10.0.0.5:8001", transport: "polling", intervalMs: 100 });
  });

  test("una vista desconocida en la URL cae en la Consola", async () => {
    const tp = await arrancar({ url: "http://localhost:3000/?view=nada" });
    expect(tp.state.viewId).toBe("console");
  });
});

describe("cambio de vista", () => {
  test("destruye la vista anterior y monta la nueva con los datos que ya hay", async () => {
    const tp = await arrancar();
    const consola = ultimaVista();
    tp.bus.emit("info", INFO_GO2);
    const f = go2();
    tp.bus.emit("frame", f);
    tp.actions.toggleRecording(true);
    await tp.actions.switchView("pilot");
    expect(nombres(consola)).toContain("destroy");
    const piloto = ultimaVista();
    expect(piloto).toBeInstanceOf(m.views.pilot);
    expect(piloto.calls.slice(0, 7)).toEqual([
      ["mount", root],
      ["setInfo", INFO_GO2],
      ["onConnection", tp.state.connection],
      ["onRecording", true],
      ["onPause", false],
      ["onFigureMode", "esquema"],
      ["update", f],
    ]);
    expect(root.textContent).toBe("vista pilot");
    expect(root.className).toBe("view view-pilot view--enter");
    expect(m.bar.setView).toHaveBeenLastCalledWith("pilot");
  });

  test("pedir la vista actual no la vuelve a montar", async () => {
    const tp = await arrancar();
    await tp.actions.switchView("console");
    expect(m.creadas).toHaveLength(1);
  });

  test("dos cambios seguidos se hacen en orden", async () => {
    const tp = await arrancar();
    const a = tp.actions.switchView("body");
    const b = tp.actions.switchView("twin");
    await Promise.all([a, b]);
    expect(m.creadas.map((v) => v.constructor.id)).toEqual(["console", "body", "twin"]);
    expect(tp.state.viewId).toBe("twin");
  });

  test("si el módulo de la vista no carga, avisa y se queda en la actual", async () => {
    const tp = await arrancar();
    const err = new Error("404");
    m.loaders.twin = () => Promise.reject(err);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await tp.actions.switchView("twin");
    expect(consoleError).toHaveBeenCalledWith(err);
    expect(ultimoToast()).toEqual(["No se pudo cargar la vista Gemelo 3D", { kind: "crit" }]);
    expect(tp.state.viewId).toBe("console");
    expect(m.creadas).toHaveLength(1);
    expect(nombres(ultimaVista())).not.toContain("destroy");
  });

  test("tolera vistas sin los métodos opcionales", async () => {
    m.views.body = vista("body", { completa: false });
    const tp = await arrancar({ url: "http://localhost:3000/?view=body" });
    const v = ultimaVista();
    tp.bus.emit("info", INFO_GO2);
    tp.bus.emit("frame", go2({ motores: motores(12).map((x, i) => (i ? x : { ...x, temperatura: 70 })) }));
    tp.bus.emit("connection", { state: "live", changed: true });
    vi.advanceTimersByTime(600);
    tp.bus.emit("stats", { hz: 10 });
    tp.actions.toggleRecording();
    tp.actions.togglePause();
    tp.actions.setFigureMode("3d");
    tp.actions.toggleTheme();
    await tp.actions.loadSources();
    await tp.actions.switchView("console");
    await tp.actions.openManual("fuentes");
    expect(nombres(v)).toEqual(["mount", "setInfo", "update"]);
  });

  test("openManual() abre el Manual en la sección pedida", async () => {
    const tp = await arrancar({ url: "http://localhost:3000/?view=console&x=1" });
    await tp.actions.openManual("fuentes");
    expect(tp.state.viewId).toBe("manual");
    expect(llamadas(ultimaVista(), "goTo")).toEqual([["fuentes"]]);
    expect(location.search).toBe("?view=manual&x=1");
    expect(location.hash).toBe("#man-fuentes");
  });
});

describe("flujo de datos", () => {
  test("«info» actualiza el estado, la barra, la vista y la bitácora", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    tp.bus.emit("info", INFO_GO2);
    expect(tp.state.info).toBe(INFO_GO2);
    expect(m.bar.setInfo).toHaveBeenCalledWith(INFO_GO2);
    expect(llamadas(v, "setInfo")).toEqual([[INFO_GO2]]);
    expect(tp.state.events[0]).toMatchObject({ level: "ok", message: "Conectado a Unitree Go2 (12 motores, modo demo)" });
    expect(tp.state.events[0].at).toBeInstanceOf(Date);
    expect(llamadas(v, "onEvent")[0][0]).toBe(tp.state.events[0]);
    tp.bus.emit("info", { ...INFO_GO2, modo: null });
    expect(tp.state.events[0].message).toBe("Conectado a Unitree Go2 (12 motores, modo ?)");
  });

  test("si cambia el robot se vacía el historial y se descarta la muestra del otro modelo", async () => {
    const tp = await arrancar();
    tp.bus.emit("info", INFO_GO2);
    tp.bus.emit("frame", go2());
    tp.bus.emit("frame", go2());
    expect(tp.history.tail(10)).toHaveLength(2);
    tp.bus.emit("info", { ...INFO_GO2 }); // mismo robot: no se borra nada
    expect(tp.history.tail(10)).toHaveLength(2);
    expect(tp.state.latest).not.toBeNull();
    tp.bus.emit("info", { modelo: "g1", nombre: "Unitree G1", n_motores: 29, modo: "demo" });
    expect(tp.history.tail(10)).toHaveLength(0);
    expect(tp.state.latest).toBeNull();
  });

  test("el mismo modelo con otra cantidad de motores también reinicia, pero conserva la muestra", async () => {
    const tp = await arrancar();
    tp.bus.emit("info", INFO_GO2);
    const f = go2();
    tp.bus.emit("frame", f);
    tp.bus.emit("info", { ...INFO_GO2, n_motores: 13 });
    expect(tp.history.tail(10)).toHaveLength(0);
    expect(tp.state.latest).toBe(f);
  });

  test("sin /info, deduce la info del primer frame de un Go2", async () => {
    const tp = await arrancar();
    tp.bus.emit("frame", go2());
    expect(tp.state.info).toEqual({
      modelo: "go2",
      nombre: "Unitree Go2",
      tipo: "cuadrupedo",
      n_motores: 12,
      motores_nombres: motores(12).map((x) => x.nombre),
      patas: ["FL", "FR", "RL", "RR"],
      frecuencia_hz: 10,
      modo: null,
    });
    expect(m.bar.setInfo).toHaveBeenCalledWith(tp.state.info);
  });

  test("sin /info, deduce la info de un G1 humanoide de 29 motores", async () => {
    const tp = await arrancar();
    tp.bus.emit("frame", g1());
    expect(tp.state.info).toMatchObject({ modelo: "g1", nombre: "Unitree G1", tipo: "humanoide", n_motores: 29, patas: ["izq", "der"] });
  });

  test("un modelo desconocido usa su id como nombre", async () => {
    const tp = await arrancar();
    tp.bus.emit("frame", go2({ modelo: "b2" }));
    expect(tp.state.info.nombre).toBe("b2");
    expect(tp.state.info.tipo).toBe("cuadrupedo");
  });

  test("con la info correcta, los frames no la vuelven a calcular", async () => {
    const tp = await arrancar();
    tp.bus.emit("info", INFO_GO2);
    tp.bus.emit("frame", go2());
    expect(tp.state.info).toBe(INFO_GO2);
    expect(m.bar.setInfo).toHaveBeenCalledTimes(1);
    tp.bus.emit("frame", g1());
    expect(tp.state.info.modelo).toBe("g1");
  });

  test("varias muestras en el mismo cuadro se dibujan una sola vez, con la última", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    const a = go2({ ts: 1 });
    const b = go2({ ts: 2 });
    tp.bus.emit("frame", a);
    tp.bus.emit("frame", b);
    expect(tp.state.latest).toBe(b);
    expect(llamadas(v, "update")).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(llamadas(v, "update")).toEqual([[b]]);
    tp.bus.emit("frame", a);
    vi.advanceTimersByTime(20);
    expect(llamadas(v, "update")).toEqual([[b], [a]]);
  });

  test("en pausa no se dibuja, y al reanudar se dibuja la última muestra", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    tp.actions.togglePause();
    expect(tp.state.paused).toBe(true);
    expect(m.bar.setPaused).toHaveBeenLastCalledWith(true);
    expect(llamadas(v, "onPause").at(-1)).toEqual([true]);
    expect(ultimoToast()).toEqual(["Vista en pausa: los datos se siguen recibiendo (Espacio para seguir)", { kind: "info", timeout: 1600 }]);
    const f = go2();
    tp.bus.emit("frame", f);
    vi.advanceTimersByTime(20);
    expect(llamadas(v, "update")).toEqual([]);
    tp.actions.togglePause();
    expect(tp.state.paused).toBe(false);
    expect(ultimoToast()).toEqual(["Vista reanudada", { kind: "info", timeout: 1600 }]);
    vi.advanceTimersByTime(20);
    expect(llamadas(v, "update")).toEqual([[f]]);
    tp.actions.togglePause(false);
    expect(tp.state.paused).toBe(false);
  });

  test("reanudar sin muestras no dibuja", async () => {
    const tp = await arrancar();
    tp.actions.togglePause(true);
    tp.actions.togglePause(false);
    vi.advanceTimersByTime(20);
    expect(llamadas(ultimaVista(), "update")).toEqual([]);
  });

  test("las alarmas nuevas se anotan, las críticas avisan, y al normalizarse se informa", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    const caliente = go2({ motores: motores(12).map((x, i) => (i === 3 ? { ...x, temperatura: 61 } : i === 5 ? { ...x, torque: 20 } : x)) });
    tp.bus.emit("frame", caliente);
    expect(tp.state.alerts.map((a) => a.key)).toEqual(["temp:m3", "tau:m5"]);
    expect(mensajes(tp).slice(0, 2)).toEqual(["Torque de m5: 20.0 N·m (> 18 N·m)", "m3 a 61 °C (> 60 °C)"]);
    expect(tp.state.events[0].level).toBe("warn");
    expect(tp.state.events[1].level).toBe("crit");
    expect(m.toast).toEqual([["m3 a 61 °C (> 60 °C)", { kind: "crit", timeout: 4500 }]]);
    const [res] = llamadas(v, "onAlerts").at(-1);
    expect(res.raised).toHaveLength(2);
    tp.bus.emit("frame", caliente); // sin cambios: no se repite
    expect(llamadas(v, "onAlerts")).toHaveLength(1);
    tp.bus.emit("frame", go2());
    expect(tp.state.alerts).toEqual([]);
    expect(mensajes(tp).slice(0, 2)).toEqual(["Normalizado: Torque de m5", "Normalizado: m3"]);
    expect(llamadas(v, "onAlerts")).toHaveLength(2);
  });

  test("el umbral de torque configurado se usa en las alarmas", async () => {
    const tp = await arrancar();
    tp.actions.setTorqueAlarm("25");
    tp.bus.emit("frame", go2({ motores: motores(12).map((x) => ({ ...x, torque: 20 })) }));
    expect(tp.state.alerts).toEqual([]);
  });

  test("las estadísticas se pintan como mucho cada medio segundo", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    tp.bus.emit("stats", { hz: 1 });
    expect(tp.state.stats).toEqual({ hz: 1 });
    expect(m.bar.setStats).not.toHaveBeenCalled();
    vi.advanceTimersByTime(501);
    tp.bus.emit("stats", { hz: 2 });
    expect(m.bar.setStats).toHaveBeenCalledExactlyOnceWith({ hz: 2 });
    expect(llamadas(v, "onStats")).toEqual([[{ hz: 2 }]]);
    vi.advanceTimersByTime(500);
    tp.bus.emit("stats", { hz: 3 });
    expect(m.bar.setStats).toHaveBeenCalledTimes(1);
    expect(tp.state.stats).toEqual({ hz: 3 });
    vi.advanceTimersByTime(1);
    tp.bus.emit("stats", { hz: 4 });
    expect(m.bar.setStats).toHaveBeenLastCalledWith({ hz: 4 });
  });

  test("«connection» actualiza la barra y la vista, sin avisar si no cambió", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    const conn = { state: "live", detail: "", transport: "websocket" };
    tp.bus.emit("connection", conn);
    expect(tp.state.connection).toBe(conn);
    expect(m.bar.setConnection).toHaveBeenCalledWith(conn);
    expect(llamadas(v, "onConnection").at(-1)).toEqual([conn]);
    expect(m.toast).toEqual([]);
  });

  test("avisa cuando la conexión se restablece, pero no en la primera conexión", async () => {
    const tp = await arrancar();
    tp.bus.emit("connection", { state: "connecting", changed: true });
    tp.bus.emit("connection", { state: "live", changed: true });
    expect(m.toast).toEqual([]);
    tp.bus.emit("connection", { state: "reconnecting", detail: "timeout", changed: true });
    expect(ultimoToast()).toEqual(["Se perdió la conexión: reintentando…", { kind: "warn" }]);
    expect(tp.state.events[0]).toMatchObject({ level: "warn", message: "Conexión perdida: timeout" });
    tp.bus.emit("connection", { state: "live", changed: true });
    expect(ultimoToast()).toEqual(["Conexión restablecida", { kind: "ok" }]);
    expect(tp.state.events[0]).toMatchObject({ level: "ok", message: "Conexión restablecida" });
    tp.bus.emit("connection", { state: "live", changed: true });
    expect(m.toast).toHaveLength(2);
  });

  test("desde offline a live también es «restablecida»; stale desde live es «perdida»", async () => {
    const tp = await arrancar();
    tp.bus.emit("connection", { state: "live", changed: true });
    expect(toasts()).toEqual(["Conexión restablecida"]);
    tp.bus.emit("connection", { state: "stale", detail: "sin datos hace 3 s", changed: true });
    expect(toasts().at(-1)).toBe("Se perdió la conexión: reintentando…");
    tp.bus.emit("connection", { state: "offline", changed: true });
    tp.bus.emit("connection", { state: "stale", changed: true });
    expect(m.toast).toHaveLength(2);
  });

  test("«info-error» se anota en la bitácora", async () => {
    const tp = await arrancar();
    tp.bus.emit("info-error", new Error("HTTP 500"));
    expect(tp.state.events[0]).toMatchObject({ level: "warn", message: "/info no respondió (HTTP 500); se deduce del primer dato" });
  });

  test("la bitácora guarda los 200 eventos más recientes", async () => {
    const tp = await arrancar();
    for (let i = 0; i < 205; i++) tp.bus.emit("info-error", new Error(`e${i}`));
    expect(tp.state.events).toHaveLength(200);
    expect(tp.state.events[0].message).toContain("(e204)");
    expect(tp.state.events[199].message).toContain("(e5)");
  });
});

describe("capturas y exportación", () => {
  test("capturar sin muestras avisa y devuelve null", async () => {
    const tp = await arrancar();
    expect(tp.actions.capture()).toBeNull();
    expect(m.toast).toEqual([["Todavía no llegó ninguna muestra para capturar", { kind: "warn" }]]);
    expect(tp.captures.size).toBe(0);
  });

  test("capturar guarda la muestra actual, la anota y avisa", async () => {
    const tp = await arrancar();
    tp.bus.emit("frame", go2({ ts: 12.34 }));
    const s = tp.actions.capture();
    expect(s).toMatchObject({ n: 1, tipo: "manual" });
    expect(tp.captures.size).toBe(1);
    expect(tp.state.events[0]).toMatchObject({ level: "info", message: "Muestra #1 capturada (t = 12.3 s)" });
    expect(ultimoToast()).toEqual(["Muestra #1 capturada", { kind: "ok", timeout: 1600 }]);
  });

  test("con el tope de capturas lleno avisa que hay que exportar", async () => {
    m.maxCaptures = 1;
    const tp = await arrancar();
    tp.bus.emit("frame", go2());
    tp.actions.capture();
    expect(tp.actions.capture()).toBeNull();
    expect(ultimoToast()).toEqual(["Se alcanzó el máximo de capturas: exportá y limpiá", { kind: "warn" }]);
  });

  test("la grabación continua guarda cada muestra y se detiene sola en el tope", async () => {
    m.maxCaptures = 2;
    const tp = await arrancar();
    const v = ultimaVista();
    tp.actions.toggleRecording();
    expect(tp.state.recording).toBe(true);
    expect(tp.state.events[0].message).toBe("Grabación continua iniciada");
    expect(ultimoToast()).toEqual(["Grabando todas las muestras… (R para detener)", { kind: "crit", timeout: 2000 }]);
    expect(llamadas(v, "onRecording").at(-1)).toEqual([true]);
    tp.bus.emit("frame", go2());
    tp.bus.emit("frame", go2());
    expect(tp.captures.samples.map((s) => s.tipo)).toEqual(["continua", "continua"]);
    expect(tp.state.recording).toBe(true);
    tp.bus.emit("frame", go2());
    expect(tp.state.recording).toBe(false);
    expect(tp.state.events[0].message).toBe("Grabación detenida (2 muestras en total)");
    expect(toasts().slice(-2)).toEqual(["Grabación detenida", "Grabación detenida: se alcanzó el máximo de muestras"]);
    expect(m.toast.at(-2)[1]).toEqual({ kind: "info", timeout: 2000 });
    expect(m.toast.at(-1)[1]).toEqual({ kind: "warn" });
  });

  test("toggleRecording(force) fuerza el estado", async () => {
    const tp = await arrancar();
    tp.actions.toggleRecording(false);
    expect(tp.state.recording).toBe(false);
    tp.actions.toggleRecording(true);
    tp.actions.toggleRecording(true);
    expect(tp.state.recording).toBe(true);
  });

  test("exportar sin capturas avisa cómo capturar", async () => {
    const tp = await arrancar();
    tp.actions.exportCsv();
    tp.actions.exportJson();
    expect(m.toast).toEqual([
      ["No hay muestras capturadas. Presioná C para capturar o R para grabar.", { kind: "warn" }],
      ["No hay muestras capturadas. Presioná C para capturar o R para grabar.", { kind: "warn" }],
    ]);
    expect(m.download).toEqual([]);
  });

  test("exportCsv() descarga el CSV con el nombre del modelo conectado", async () => {
    vi.setSystemTime(new Date(2026, 9, 29, 17, 30, 5));
    const tp = await arrancar();
    tp.bus.emit("info", INFO_GO2);
    tp.bus.emit("frame", go2());
    tp.actions.capture();
    tp.actions.exportCsv();
    expect(m.toCsv).toEqual([[tp.captures.samples, { excel: false }]]);
    expect(m.download).toEqual([["CSV", "telemetria_go2_2026-10-29_17-30-05.csv"]]);
    expect(tp.state.events[0]).toMatchObject({ level: "ok", message: "Exportadas 1 muestras a telemetria_go2_2026-10-29_17-30-05.csv" });
    expect(ultimoToast()).toEqual(["1 muestras exportadas a telemetria_go2_2026-10-29_17-30-05.csv", { kind: "ok" }]);
  });

  test("exportCsv() usa la preferencia de Excel o la pedida", async () => {
    const tp = await arrancar();
    tp.bus.emit("frame", go2());
    tp.actions.capture();
    tp.actions.setExcel(1);
    expect(tp.state.excel).toBe(true);
    expect(JSON.parse(localStorage.getItem("tp05-dashboard")).excel).toBe(true);
    tp.actions.exportCsv();
    tp.actions.exportCsv({ excel: false });
    expect(m.toCsv.map(([, o]) => o)).toEqual([{ excel: true }, { excel: false }]);
    tp.actions.setExcel(0);
    expect(tp.state.excel).toBe(false);
  });

  test("sin info, el nombre del CSV sale de la muestra o dice «robot»", async () => {
    const tp = await arrancar();
    tp.bus.emit("frame", g1());
    tp.actions.capture();
    tp.state.info = null;
    tp.actions.exportCsv();
    expect(m.download.at(-1)[1]).toMatch(/^telemetria_g1_/);
    tp.state.latest = null;
    tp.actions.exportCsv();
    expect(m.download.at(-1)[1]).toMatch(/^telemetria_robot_/);
  });

  test("exportJson() descarga las capturas como JSON sin los campos internos", async () => {
    vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
    const tp = await arrancar();
    tp.bus.emit("info", INFO_GO2);
    const f = { ...go2({ ts: 1 }), derived: { x: 1 }, receivedAt: 99 };
    tp.bus.emit("frame", f);
    tp.actions.capture();
    tp.actions.exportJson();
    const [[text, name, mime]] = m.download;
    expect(name).toBe("telemetria_go2_2026-01-02_03-04-05.json");
    expect(mime).toBe("application/json");
    const data = JSON.parse(text);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ n: 1, tipo: "manual", modelo: "go2", ts: 1 });
    expect(data[0].capturedAt).toBe(new Date(99).toISOString());
    expect(data[0]).not.toHaveProperty("derived");
    expect(data[0]).not.toHaveProperty("receivedAt");
    expect(data[0]).not.toHaveProperty("frame");
    expect(text).toBe(JSON.stringify(data, null, 2));
    expect(ultimoToast()).toEqual(["1 muestras exportadas a telemetria_go2_2026-01-02_03-04-05.json", { kind: "ok" }]);
  });

  test("exportJson() sin info usa «robot»", async () => {
    const tp = await arrancar();
    tp.bus.emit("frame", go2());
    tp.actions.capture();
    tp.state.info = null;
    tp.actions.exportJson();
    expect(m.download[0][1]).toMatch(/^telemetria_robot_.*\.json$/);
  });

  test("clearCaptures() borra y lo anota solo si había capturas", async () => {
    const tp = await arrancar();
    tp.actions.clearCaptures();
    expect(tp.state.events).toEqual([]);
    tp.bus.emit("frame", go2());
    tp.actions.capture();
    tp.actions.capture();
    tp.actions.clearCaptures();
    expect(tp.captures.size).toBe(0);
    expect(tp.state.events[0]).toMatchObject({ level: "info", message: "Se borraron 2 capturas" });
  });
});

describe("transporte y preferencias", () => {
  test("setTransport() guarda el transporte, limita el intervalo a 500 ms y lo pide al servicio", async () => {
    const tp = await arrancar();
    expect(tp.actions.setTransport("polling", 900)).toBe("transporte cambiado");
    expect(tp.state).toMatchObject({ transport: "polling", intervalMs: 500 });
    expect(m.svc.setTransport).toHaveBeenCalledExactlyOnceWith("polling", 500);
    expect(tp.state.events[0].message).toBe("Transporte: polling cada 500 ms");
    const saved = JSON.parse(localStorage.getItem("tp05-dashboard"));
    expect(saved).toMatchObject({ transport: "polling", intervalMs: 500 });
    tp.actions.setTransport("polling", 500);
    expect(tp.state.intervalMs).toBe(500);
  });

  test("setTransport() sin intervalo conserva el actual", async () => {
    const tp = await arrancar();
    tp.actions.setTransport("websocket");
    expect(m.svc.setTransport).toHaveBeenCalledWith("websocket", 250);
    expect(tp.state.events[0].message).toBe("Transporte: WebSocket");
  });

  test("toggleTransport() alterna WebSocket ↔ polling", async () => {
    const tp = await arrancar();
    tp.actions.toggleTransport();
    expect(tp.state.transport).toBe("polling");
    tp.actions.toggleTransport();
    expect(tp.state.transport).toBe("websocket");
  });

  test("setTorqueAlarm() guarda el umbral y vuelve al de fábrica si no es un número", async () => {
    const tp = await arrancar();
    tp.actions.setTorqueAlarm("22.5");
    expect(tp.state.torqueAlarm).toBe(22.5);
    expect(JSON.parse(localStorage.getItem("tp05-dashboard")).torqueAlarm).toBe(22.5);
    tp.actions.setTorqueAlarm("abc");
    expect(tp.state.torqueAlarm).toBe(18);
    tp.actions.setTorqueAlarm(0);
    expect(tp.state.torqueAlarm).toBe(18);
  });

  test("setFigureMode() solo acepta 3d o esquema y avisa a la vista", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    tp.actions.setFigureMode("3d");
    expect(tp.state.figure).toBe("3d");
    expect(JSON.parse(localStorage.getItem("tp05-dashboard")).figure).toBe("3d");
    tp.actions.setFigureMode("otro");
    expect(tp.state.figure).toBe("esquema");
    expect(llamadas(v, "onFigureMode").slice(1)).toEqual([["3d"], ["esquema"]]);
  });

  test("toggleFigure() alterna y avisa qué ilustración se ve", async () => {
    const tp = await arrancar();
    tp.actions.toggleFigure();
    expect(tp.state.figure).toBe("3d");
    expect(ultimoToast()).toEqual(["Ilustración: modelo 3D real", { kind: "info", timeout: 1400 }]);
    tp.actions.toggleFigure();
    expect(tp.state.figure).toBe("esquema");
    expect(ultimoToast()).toEqual(["Ilustración: esquema", { kind: "info", timeout: 1400 }]);
  });

  test("toggleTheme() alterna el tema y lo recuerda para la vista actual", async () => {
    const tp = await arrancar();
    const v = ultimaVista();
    tp.actions.toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(JSON.parse(localStorage.getItem("tp05-dashboard"))["theme:console"]).toBe("light");
    expect(m.bar.setTheme).toHaveBeenLastCalledWith("light");
    expect(llamadas(v, "onTheme")).toEqual([["light"]]);
    tp.actions.toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(llamadas(v, "onTheme")).toEqual([["light"], ["dark"]]);
  });

  test("openHelp() abre el diálogo #help con la vista activa", async () => {
    const tp = await arrancar();
    tp.actions.openHelp();
    expect(m.help).toEqual([[help, ultimaVista()]]);
  });
});

describe("conectar", () => {
  test("connect() normaliza la dirección, la recuerda como backend y reconecta", async () => {
    const tp = await arrancar();
    m.svc.connect.mockClear();
    tp.history.push(go2());
    await tp.actions.connect(" 10.0.0.5:8001/ ");
    expect(tp.state.baseUrl).toBe("http://10.0.0.5:8001");
    expect(tp.state.backendUrl).toBe("http://10.0.0.5:8001");
    expect(JSON.parse(localStorage.getItem("tp05-dashboard"))).toMatchObject({ baseUrl: "http://10.0.0.5:8001", backendUrl: "http://10.0.0.5:8001" });
    expect(tp.history.tail(5)).toHaveLength(0);
    expect(tp.state.events.at(-1).message).toBe("Conectando a http://10.0.0.5:8001");
    expect(m.svc.connect).toHaveBeenCalledExactlyOnceWith({ baseUrl: "http://10.0.0.5:8001", transport: "websocket", intervalMs: 250 });
    expect(m.api.instances.at(-1).url).toBe("http://10.0.0.5:8001");
  });

  test("connect() a la simulación del navegador no toca el backend guardado", async () => {
    const tp = await arrancar();
    await tp.actions.connect("  DEMO-G1 ");
    expect(tp.state.baseUrl).toBe("demo-g1");
    expect(tp.state.backendUrl).toBe("http://localhost:8001");
    expect(JSON.parse(localStorage.getItem("tp05-dashboard")).backendUrl).toBeUndefined();
    expect(mensajes(tp)).toContain("Conectando a la simulación del navegador");
  });

  test("connect() con una dirección vacía avisa y no reconecta", async () => {
    const tp = await arrancar();
    m.svc.connect.mockClear();
    await tp.actions.connect("   ");
    expect(ultimoToast()).toEqual(["Falta la dirección del servidor", { kind: "warn" }]);
    expect(m.svc.connect).not.toHaveBeenCalled();
    expect(tp.state.baseUrl).toBe("http://localhost:8001");
  });
});

describe("fuentes de datos", () => {
  const BACKEND = {
    actual: { modo: "real", robot: "go2", interfaz: "eth0" },
    cambiable: false,
    fuentes: [
      { modo: "real", nombre: "Robot real", disponible: true },
      { modo: "demo", nombre: "Demo", disponible: true, descripcion: "del servidor" },
    ],
    interfaces: [{ nombre: "eth0", ip: "192.168.123.99", robot: true }],
    interfaz_sugerida: "eth0",
  };

  test("con servidor, usa sus fuentes y describe la Demo", async () => {
    const tp = await arrancar();
    m.api.fuentes.mockResolvedValue(BACKEND);
    const v = ultimaVista();
    const res = await tp.actions.loadSources();
    expect(res).toEqual({
      actual: { modo: "real", robot: "go2", interfaz: "eth0", medido: true },
      cambiable: false,
      fuentes: [
        { modo: "real", nombre: "Robot real", disponible: true },
        { modo: "demo", nombre: "Demo", disponible: true, descripcion: "El robot pasea solo (camina, trota, gira, frena) con datos coherentes. No necesita nada." },
      ],
      interfaces: BACKEND.interfaces,
      interfazSugerida: "eth0",
      backendUrl: "http://localhost:8001",
      error: "",
    });
    expect(tp.state.backendOk).toBe(true);
    expect(tp.state.source).toBe(res.actual);
    expect(m.bar.setSources).toHaveBeenLastCalledWith(res);
    expect(llamadas(v, "onSource").at(-1)).toEqual([res.actual]);
  });

  test("un servidor sin placas ni sugerencia da listas vacías", async () => {
    const tp = await arrancar();
    m.api.fuentes.mockResolvedValue({ actual: { modo: "simulador", robot: "g1" }, cambiable: true, fuentes: [] });
    const res = await tp.actions.loadSources();
    expect(res.interfaces).toEqual([]);
    expect(res.interfazSugerida).toBeNull();
    expect(res.actual.medido).toBe(false);
    expect(res.cambiable).toBe(true);
  });

  test("sin servidor, ofrece solo la Demo del navegador con el motivo", async () => {
    const tp = await arrancar();
    tp.bus.emit("info", { ...INFO_GO2, modo: "real" });
    const res = await tp.actions.loadSources();
    const motivo = "No hay un servidor en http://localhost:8001.";
    expect(res.fuentes).toEqual([
      { modo: "real", nombre: "Robot real", medido: true, disponible: false, motivo },
      { modo: "simulador", nombre: "Simulador MuJoCo", medido: false, disponible: false, motivo },
      { modo: "demo", nombre: "Demo", medido: false, disponible: true, descripcion: "El robot pasea solo con datos coherentes, calculados en este navegador (no hay servidor). No necesita nada.", motivo: "" },
    ]);
    expect(res.cambiable).toBe(true);
    expect(res.error).toBe(motivo);
    expect(res.actual).toEqual({ modo: "real", robot: "go2", medido: true });
  });

  test("sin servidor ni info, la fuente es desconocida", async () => {
    const tp = await arrancar();
    const res = await tp.actions.loadSources();
    expect(res.actual).toEqual({ modo: "desconocido", robot: undefined, medido: false });
  });

  test("un 404 indica el backend original de la cátedra", async () => {
    const tp = await arrancar();
    m.api.fuentes.mockRejectedValue(new Error("HTTP 404: Not Found"));
    const res = await tp.actions.loadSources();
    expect(res.error).toBe("Este servidor no permite elegir la fuente (es el backend original de la cátedra).");
  });

  test("desde GitHub Pages no consulta al servidor y explica cómo usar el robot real", async () => {
    const tp = await arrancar({ url: "https://carlos.github.io/tp05/" });
    m.api.instances.length = 0;
    const res = await tp.actions.loadSources();
    expect(m.api.instances).toEqual([]);
    expect(res.error).toBe("Desde GitHub Pages no hay servidor: para el robot real, abrí el dashboard local con «python iniciar.py» (ver el Manual).");
    expect(tp.state.baseUrl).toBe("demo");
    expect(res.actual).toEqual({ modo: "demo", enNavegador: true, robot: "go2", medido: false });
  });

  test("en la simulación del navegador solo consulta al servidor si se abre el panel", async () => {
    const tp = await arrancar({ guardado: { baseUrl: "demo-g1" } });
    await flush();
    expect(m.api.instances).toEqual([]);
    expect(m.bar.setSources.mock.calls[0][0].actual).toEqual({ modo: "demo", enNavegador: true, robot: "g1", medido: false });
    m.api.fuentes.mockResolvedValue(BACKEND);
    const res = await tp.actions.loadSources();
    expect(m.api.instances).toHaveLength(1);
    expect(res.actual).toEqual({ modo: "demo", enNavegador: true, robot: "g1", medido: false });
    expect(res.cambiable).toBe(false);
  });

  test("setSource() a la demo del navegador conecta a demo o demo-g1", async () => {
    const tp = await arrancar();
    expect(await tp.actions.setSource({ modo: "navegador" })).toBe(true);
    expect(tp.state.baseUrl).toBe("demo");
    expect(ultimoToast()).toEqual(["Fuente: demo (en el navegador) · GO2", { kind: "ok" }]);
    expect(await tp.actions.setSource({ modo: "navegador", robot: "g1" })).toBe(true);
    expect(tp.state.baseUrl).toBe("demo-g1");
    expect(ultimoToast()[0]).toBe("Fuente: demo (en el navegador) · G1");
    expect(m.api.cambiarFuente).not.toHaveBeenCalled();
  });

  test("setSource() de la Demo sin servidor va al navegador", async () => {
    const tp = await arrancar();
    await flush();
    expect(tp.state.backendOk).toBe(false);
    await tp.actions.setSource({ modo: "demo", robot: "g1" });
    expect(tp.state.baseUrl).toBe("demo-g1");
    expect(m.api.cambiarFuente).not.toHaveBeenCalled();
  });

  test("setSource() con servidor le pide el cambio y refresca la info", async () => {
    const tp = await arrancar();
    m.api.fuentes.mockResolvedValue(BACKEND);
    await tp.actions.loadSources();
    m.svc.connect.mockClear();
    expect(await tp.actions.setSource({ modo: "real", robot: "g1", interfaz: "eth0" })).toBe(true);
    expect(m.api.cambiarFuente).toHaveBeenCalledExactlyOnceWith({ modo: "real", robot: "g1", interfaz: "eth0" }, expect.anything());
    expect(m.api.instances.at(-2).url).toBe("http://localhost:8001");
    expect(m.svc.refreshInfo).toHaveBeenCalledTimes(1);
    expect(m.svc.connect).not.toHaveBeenCalled();
    expect(tp.state.events[0]).toMatchObject({ level: "ok", message: "Fuente de datos: robot real · g1" });
    expect(ultimoToast()).toEqual(["Fuente: robot real · G1", { kind: "ok" }]);
  });

  test("setSource() manda interfaz null si no hay placa, y nombra cada fuente", async () => {
    const tp = await arrancar();
    m.api.fuentes.mockResolvedValue(BACKEND);
    await tp.actions.loadSources();
    await tp.actions.setSource({ modo: "simulador", interfaz: "" });
    expect(m.api.cambiarFuente).toHaveBeenLastCalledWith({ modo: "simulador", robot: "go2", interfaz: null }, expect.anything());
    expect(ultimoToast()[0]).toBe("Fuente: simulador MuJoCo · GO2");
    await tp.actions.setSource({ modo: "demo" });
    expect(ultimoToast()[0]).toBe("Fuente: demo · GO2");
    await tp.actions.setSource({ modo: "demo-catedra" });
    expect(ultimoToast()[0]).toBe("Fuente: demo-catedra · GO2");
  });

  test("setSource() desde la simulación vuelve a conectar al backend", async () => {
    const tp = await arrancar({ guardado: { baseUrl: "demo", backendUrl: "http://10.0.0.5:8001" } });
    tp.state.backendOk = true;
    m.svc.connect.mockClear();
    await tp.actions.setSource({ modo: "simulador" });
    expect(tp.state.baseUrl).toBe("http://10.0.0.5:8001");
    expect(m.svc.connect).toHaveBeenCalledWith({ baseUrl: "http://10.0.0.5:8001", transport: "websocket", intervalMs: 250 });
    expect(m.svc.refreshInfo).not.toHaveBeenCalled();
  });

  test("setSource() conectado a otro servidor que el backend vuelve al backend", async () => {
    const tp = await arrancar({ guardado: { baseUrl: "http://otro:8001", backendUrl: "http://10.0.0.5:8001" } });
    tp.state.backendOk = true;
    await tp.actions.setSource({ modo: "real" });
    expect(tp.state.baseUrl).toBe("http://10.0.0.5:8001");
  });

  test("si el servidor rechaza el cambio, avisa sin el prefijo HTTP y devuelve false", async () => {
    const tp = await arrancar();
    tp.state.backendOk = true;
    m.api.cambiarFuente.mockRejectedValue(new Error("HTTP 503: El robot no responde"));
    expect(await tp.actions.setSource({ modo: "real" })).toBe(false);
    expect(ultimoToast()).toEqual(["No se pudo cambiar la fuente: El robot no responde", { kind: "crit", timeout: 6000 }]);
    expect(tp.state.events[0]).toMatchObject({ level: "warn", message: "Cambio de fuente fallido (real): HTTP 503: El robot no responde" });
    expect(m.svc.refreshInfo).not.toHaveBeenCalled();
  });
});

describe("teclado", () => {
  test.each([
    ["c", "capture"],
    ["C", "capture"],
    ["r", "toggleRecording"],
    ["e", "exportCsv"],
    [" ", "togglePause"],
    ["w", "toggleTransport"],
    ["g", "toggleFigure"],
    ["t", "toggleTheme"],
    ["?", "openHelp"],
  ])("la tecla «%s» llama a %s", async (key, action) => {
    const tp = await arrancar();
    const spy = vi.spyOn(tp.actions, action).mockImplementation(() => {});
    const ev = tecla(key);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  test("las teclas 1 a 5 cambian de vista", async () => {
    const tp = await arrancar();
    const spy = vi.spyOn(tp.actions, "switchView").mockImplementation(() => {});
    for (const k of ["1", "2", "3", "4", "5"]) tecla(k);
    expect(spy.mock.calls).toEqual([["console"], ["body"], ["pilot"], ["twin"], ["manual"]]);
  });

  test("la tecla 2 monta de verdad el Cuerpo", async () => {
    const tp = await arrancar();
    tecla("2");
    await flush(20);
    expect(tp.state.viewId).toBe("body");
  });

  test("una tecla sin atajo no hace nada ni bloquea el navegador", async () => {
    await arrancar();
    const ev = tecla("x");
    const ev2 = tecla("Enter");
    expect(ev.defaultPrevented).toBe(false);
    expect(ev2.defaultPrevented).toBe(false);
    expect(m.toast).toEqual([]);
  });

  test("con Ctrl, Cmd o Alt no se usan los atajos", async () => {
    const tp = await arrancar();
    const spy = vi.spyOn(tp.actions, "capture");
    tecla("c", { ctrlKey: true });
    tecla("c", { metaKey: true });
    tecla("c", { altKey: true });
    expect(spy).not.toHaveBeenCalled();
    expect(nombres(ultimaVista())).not.toContain("onKey");
  });

  test("un evento ya atendido se ignora", async () => {
    const tp = await arrancar();
    const spy = vi.spyOn(tp.actions, "capture");
    const antes = (e) => e.preventDefault();
    window.addEventListener("keydown", antes, { capture: true });
    tecla("c");
    window.removeEventListener("keydown", antes, { capture: true });
    expect(spy).not.toHaveBeenCalled();
  });

  test("escribiendo en un campo no se usan los atajos", async () => {
    const tp = await arrancar();
    const spy = vi.spyOn(tp.actions, "capture");
    for (const tag of ["input", "textarea", "select"]) {
      const el = document.createElement(tag);
      document.body.append(el);
      tecla("c", {}, el);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "");
    const dentro = document.createElement("span");
    editable.append(dentro);
    document.body.append(editable);
    tecla("c", {}, dentro);
    expect(spy).not.toHaveBeenCalled();
    tecla("c", {}, document.body);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("con la ayuda abierta solo funciona «?», que la cierra", async () => {
    const tp = await arrancar();
    const spy = vi.spyOn(tp.actions, "capture");
    help.showModal();
    tecla("c");
    expect(spy).not.toHaveBeenCalled();
    expect(nombres(ultimaVista())).not.toContain("onKey");
    tecla("?");
    expect(help.open).toBe(false);
    expect(m.help).toEqual([]);
  });

  test("la vista atiende primero sus propias teclas", async () => {
    m.views.console = vista("console", { onKey: (e) => e.key === "c" });
    const tp = await arrancar();
    const spy = vi.spyOn(tp.actions, "capture");
    const ev = tecla("c");
    expect(ev.defaultPrevented).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(llamadas(ultimaVista(), "onKey")).toEqual([["c"]]);
    tecla("r");
    expect(tp.state.recording).toBe(true);
  });
});
