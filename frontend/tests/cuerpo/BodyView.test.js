import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { RingBuffer } from "../../js/core/RingBuffer.js";
import { CaptureStore } from "../../js/core/CaptureStore.js";
import { frame, fakeCtx2d, infoFor, setBox, simFrames } from "./helpers.js";

// FigureSwitch (ui/) carga el 3D real: acá se reemplaza por un doble que registra las llamadas.
const fs = vi.hoisted(() => ({ instances: [], toggles: [] }));
vi.mock("../../js/ui/FigureSwitch.js", () => ({
  FigureSwitch: class {
    constructor(ctx, opts) {
      this.ctx = ctx;
      this.opts = opts;
      for (const m of ["setInfo", "setMode", "update", "destroy", "setPaused", "applyTheme"]) this[m] = vi.fn();
      fs.instances.push(this);
    }
  },
  figureToggle: (ctx) => {
    const el = document.createElement("div");
    el.className = "fig-toggle";
    el.set = vi.fn();
    el.ctx = ctx;
    fs.toggles.push(el);
    return el;
  },
}));

const { default: BodyView } = await import("../../js/views/body/BodyView.js");

/* ------------------------------------------------------------------ */
/* Dobles del entorno                                                  */
/* ------------------------------------------------------------------ */

let env;

beforeEach(() => {
  fs.instances.length = 0;
  fs.toggles.length = 0;
  const mq = { matches: false, addEventListener: vi.fn((_, fn) => { mq.listener = fn; }), removeEventListener: vi.fn() };
  const ro = { instances: [] };
  const raf = [];
  vi.spyOn(window, "matchMedia").mockImplementation(() => mq);
  vi.stubGlobal("ResizeObserver", class {
    constructor(cb) {
      this.cb = cb;
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      ro.instances.push(this);
    }
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn((cb) => raf.push(cb)));
  const ctx2d = fakeCtx2d();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx2d);
  const animate = vi.spyOn(Element.prototype, "animate").mockReturnValue({});
  env = { mq, ro, raf, ctx2d, animate };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete document.fonts;
  document.body.replaceChildren();
});

function makeCtx(state = {}) {
  const ctx = {
    state: { torqueAlarm: 18, figure: "esquema", excel: false, recording: false, ...state },
    history: new RingBuffer(600),
    captures: new CaptureStore(),
    actions: {},
  };
  for (const a of ["capture", "toggleRecording", "exportCsv", "togglePause", "setFigureMode"]) ctx.actions[a] = vi.fn();
  ctx.actions.setExcel = vi.fn((v) => { ctx.state.excel = v; });
  return ctx;
}

function mount(state, { info } = {}) {
  const ctx = makeCtx(state);
  const view = new BodyView(ctx);
  const container = document.createElement("div");
  document.body.append(container);
  view.mount(container);
  if (info) view.setInfo(info);
  return { view, ctx, container };
}

/** Empuja muestras al historial y las pasa a la vista, como hace main.js. */
function feed(view, ctx, frames) {
  for (const f of frames) {
    ctx.history.push(f);
    view.update(f);
  }
  return frames.at(-1);
}

const text = (el) => el.textContent;
const sentence = (v) => [v.sAction, v.sContacts, v.sHeat, v.sBattery].map(text).join("");
const runRaf = () => env.raf.splice(0).forEach((cb) => cb());

/* ------------------------------------------------------------------ */

describe("BodyView › montaje", () => {
  test("id y atajos propios para la ayuda", () => {
    expect(BodyView.id).toBe("body");
    expect(BodyView.shortcuts.map(([k]) => k)).toEqual(["← →", "O"]);
  });

  test("arma las seis zonas de la vista", () => {
    const { container } = mount();
    expect([...container.children].map((c) => c.className)).toEqual([
      "bd-status", "bd-stage", "bd-side", "bd-timeline", "bd-shutterbar", "bd-flash",
    ]);
    expect(container.querySelector(".bd-side").getAttribute("aria-label")).toBe("Detalle, motores y batería");
    expect(container.querySelectorAll(".bd-side > section")).toHaveLength(3);
  });

  test("antes de conectar dice que está conectando y no hay capturas", () => {
    const { view } = mount();
    expect(text(view.sAction)).toBe("Conectando con el robot…");
    expect(text(view.count)).toBe("0");
    expect(text(view.countPhone)).toBe("0");
    expect(view.chipRec.hidden).toBe(true);
    expect(view.chipPaused.hidden).toBe(true);
    expect(view.canvas.getAttribute("aria-label")).toBe(
      "Línea de tiempo de los últimos 30 segundos: roll y pitch en grados, yaw en grados, " +
      "apoyo de cada pata y temperatura del motor más caliente. 0 muestras capturadas.",
    );
    expect(view.excelBtn.getAttribute("aria-pressed")).toBe("false");
    expect(text(view.tlSub)).toBe("últimos 30 s");
  });

  test("refleja las capturas que ya existían y la preferencia de Excel", () => {
    const ctx = makeCtx({ excel: true });
    ctx.captures.add(frame(), "manual");
    ctx.captures.add(frame(), "grabacion");
    const view = new BodyView(ctx);
    view.mount(document.createElement("div"));
    expect(text(view.count)).toBe("2");
    expect(view.excelBtn.getAttribute("aria-pressed")).toBe("true");
    expect(view.canvas.getAttribute("aria-label")).toMatch(/2 muestras capturadas, 1 marcadas como alfileres numerados\.$/);
  });

  test("crea el FigureSwitch desde arriba en la caja del dibujo, con su botón", () => {
    const { view, ctx } = mount();
    expect(fs.instances).toHaveLength(1);
    const fig = fs.instances[0];
    expect(fig.ctx).toBe(ctx);
    expect(fig.opts).toEqual({ host: view.figure.el, schematic: view.figure.tilt, preset: "arriba" });
    expect(fig.setMode).toHaveBeenCalledWith("esquema");
    expect(fig.setInfo).not.toHaveBeenCalled();
    expect(fs.toggles[0].ctx).toBe(ctx);
    expect(fs.toggles[0].classList.contains("bd-figtoggle")).toBe(true);
    expect(view.figure.el.lastChild).toBe(fs.toggles[0]);
  });

  test("sin preferencia de ilustración usa el esquema; con 3D lo respeta", () => {
    mount({ figure: undefined });
    expect(fs.instances[0].setMode).toHaveBeenCalledWith("esquema");
    const { view } = mount({ figure: "3d" });
    expect(fs.instances[1].setMode).toHaveBeenCalledWith("3d");
    expect(text(view.imuNote)).toBe("Modelo 3D real · arrastrá para girar");
  });

  test("observa el tamaño del escenario y de la línea de tiempo", () => {
    const { view } = mount();
    const [obs] = env.ro.instances;
    expect(obs.observe.mock.calls.map(([el]) => el)).toEqual([view.stage, view.canvas]);
  });

  test("la nota de la IMU dice la vista y la exageración", () => {
    const { view } = mount();
    expect(text(view.imuNote)).toBe("Vista desde arriba · inclinación ×3");
  });

  test("con movimiento reducido no exagera la inclinación, y escucha el cambio", () => {
    env.mq.matches = true;
    const { view } = mount();
    expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(view.reducedMotion).toBe(true);
    expect(text(view.imuNote)).toBe("Vista desde arriba · sin inclinación (movimiento reducido)");
    env.mq.listener({ matches: false });
    expect(view.reducedMotion).toBe(false);
    expect(text(view.imuNote)).toBe("Vista desde arriba · inclinación ×3");
  });

  test("lee la paleta del tema, con tipografías de respaldo", () => {
    const { view } = mount();
    expect(view.palette.sans).toBe("sans-serif");
    expect(view.palette.mono).toBe("monospace");
    expect(Object.keys(view.palette)).toHaveLength(15);
  });

  test("usa las tipografías del tema cuando están definidas", () => {
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => ({
      getPropertyValue: (n) => ({ "--bd-font": " Inter ", "--bd-mono": "Plex Mono", "--ink": "#111" })[n] ?? real(el).getPropertyValue(n),
    }));
    const { view } = mount();
    expect(view.palette).toMatchObject({ sans: "Inter", mono: "Plex Mono", ink: "#111" });
  });

  test("cuando cargan las fuentes vuelve a medir, salvo que la vista ya no esté", async () => {
    let resolve;
    document.fonts = { ready: new Promise((r) => { resolve = r; }) };
    const { view } = mount();
    const measure = vi.spyOn(view.callouts, "measure");
    resolve();
    await document.fonts.ready;
    await Promise.resolve();
    expect(measure).toHaveBeenCalledWith(view.stage);

    let resolve2;
    document.fonts = { ready: new Promise((r) => { resolve2 = r; }) };
    const { view: v2 } = mount();
    const measure2 = vi.spyOn(v2.callouts, "measure");
    v2.destroy();
    resolve2();
    await document.fonts.ready;
    await Promise.resolve();
    expect(measure2).not.toHaveBeenCalled();
  });

  test("la barra de torque se llena un poco por encima del umbral de alarma", () => {
    const { view, ctx } = mount();
    expect(view.callouts.torqueScale()).toBe(22.5);
    ctx.state.torqueAlarm = 4;
    expect(view.callouts.torqueScale()).toBe(10);
    ctx.state.torqueAlarm = undefined;
    expect(view.callouts.torqueScale()).toBe(22.5);
    ctx.state.torqueAlarm = 40;
    expect(view.callouts.torqueScale()).toBe(50);
  });
});

describe("BodyView › setInfo", () => {
  test("Go2: dibujo desde arriba, chips de patas y el primer motor elegido", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    expect(view.figure.kind).toBe("quad");
    expect(view.stage.dataset.kind).toBe("quad");
    expect(fs.instances).toHaveLength(1); // mismo preset: no se recrea
    expect(fs.instances[0].setInfo).toHaveBeenCalledWith(infoFor("go2"));
    expect(view.callouts.cards.size).toBe(12);
    expect(view.table.rows.size).toBe(12);
    const chips = [...view.legChips.children];
    expect(chips.map((c) => c.textContent)).toEqual(["FR", "FL", "RR", "RL"]);
    expect(chips[0].getAttribute("title")).toBe("Delantera derecha");
    expect(view.selected).toBe("FR_hip");
    expect(text(view.detail.name)).toBe("FR_hip");
    expect(view.figure.joints.get("FR_hip").g.classList.contains("is-selected")).toBe(true);
  });

  test("G1: recrea el FigureSwitch de frente y nombra los pies", () => {
    const { view } = mount({ figure: "3d" }, { info: infoFor("go2") });
    view.setInfo(infoFor("g1"));
    expect(fs.instances).toHaveLength(2);
    expect(fs.instances[0].destroy).toHaveBeenCalled();
    const fig = fs.instances[1];
    expect(fig.opts.preset).toBe("frente");
    expect(fig.setInfo).toHaveBeenCalledWith(infoFor("g1"));
    expect(fig.setMode).toHaveBeenCalledWith("3d");
    expect(view.stage.dataset.kind).toBe("humanoid");
    expect([...view.legChips.children].map((c) => c.textContent)).toEqual(["Pie der.", "Pie izq."]);
    expect(view.legChips.children[1].getAttribute("title")).toBe("Pie izquierdo");
    expect(view.table.rows.size).toBe(29);
  });

  test("G1 en esquema: la nota dice vista de frente al volver a medir", () => {
    const { view } = mount({}, { info: infoFor("g1") });
    runRaf();
    expect(text(view.imuNote)).toBe("Vista de frente · inclinación ×3");
  });

  test("una pata sin nombre conocido usa su código como título", () => {
    const { view } = mount({}, { info: { patas: ["FR", "X"], motores_nombres: ["FR_hip"] } });
    expect(view.legChips.children[1].getAttribute("title")).toBe("X");
  });

  test("conserva la selección del usuario si el motor sigue existiendo", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    view.select("RL_calf", { fromUser: true });
    view.setInfo(infoFor("go2"));
    expect(view.selected).toBe("RL_calf");
    expect(view.userPicked).toBe(true);
  });

  test("si el motor elegido ya no existe vuelve al primero y olvida la elección", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    view.select("RL_calf", { fromUser: true });
    view.setInfo(infoFor("g1"));
    expect(view.selected).toBe("L_hip_pitch");
    expect(view.userPicked).toBe(false);
  });

  test("sin motores ni patas no elige nada", () => {
    const { view } = mount({}, { info: {} });
    expect(view.selected).toBeNull();
    expect(view.legChips.children).toHaveLength(0);
    expect(text(view.detail.name)).toBe("—");
  });

  test("al cuadro siguiente vuelve a medir el layout, si la vista sigue montada", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    setBox(view.figure.el, 420, 420);
    const measure = vi.spyOn(view.callouts, "measure");
    runRaf();
    expect(view.figure.sizePx).toBe(420);
    expect(measure).toHaveBeenCalledWith(view.stage);
    view.setInfo(infoFor("go2"));
    view.destroy();
    measure.mockClear();
    runRaf();
    expect(measure).not.toHaveBeenCalled();
  });
});

describe("BodyView › update", () => {
  test("antes de saber qué robot es no hace nada", () => {
    const { view } = mount();
    view.update(frame());
    expect(view.latest).toBeUndefined();
    expect(text(view.sAction)).toBe("Conectando con el robot…");
  });

  test("elige solo una vez el motor más caliente al llegar la primera muestra", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame({ motores: [["FR_hip", 30], ["RR_calf", 55]] })]);
    expect(view.selected).toBe("RR_calf");
    feed(view, ctx, [frame({ motores: [["FR_hip", 70], ["RR_calf", 55]] })]);
    expect(view.selected).toBe("RR_calf");
  });

  test("no cambia la elección del usuario ni elige sin motores", () => {
    const a = mount({}, { info: infoFor("go2") });
    a.view.select("FL_thigh", { fromUser: true });
    feed(a.view, a.ctx, [frame({ motores: [["RR_calf", 55]] })]);
    expect(a.view.selected).toBe("FL_thigh");
    const b = mount({}, { info: infoFor("go2") });
    feed(b.view, b.ctx, [frame()]);
    expect(b.view.selected).toBe("FR_hip");
    expect(b.view.autoPicked).toBeUndefined();
  });

  test("actualiza todas las zonas con muestras reales del Go2", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    setBox(view.canvas, 800, 200);
    const last = feed(view, ctx, simFrames("go2", 30, { warmup: 8 }));
    const fig = fs.instances[0];
    expect(fig.update).toHaveBeenLastCalledWith(last);
    expect(text(view.battery.soc)).toBe(String(Math.round(last.bms.soc)));
    expect(text(view.table.rows.get("FR_calf").temp)).toBe(last.motores[2].temperatura.toFixed(1));
    expect(text(view.callouts.cards.get("RL_hip").temp)).toBe(`${last.motores[9].temperatura.toFixed(1)} °C`);
    expect(text(view.tlSub)).toBe("últimos 30 s · 30 muestras");
    expect(env.ctx2d.texts()).toContain("ahora");
    expect(text(view.sBattery)).toBe(` · batería ${Math.round(last.bms.soc)} %`);
    expect(text(view.sContacts)).toMatch(/^, .*pata/);
  });

  test("FR-009: sin tamaño todavía, la línea de tiempo dice la cuenta real de muestras", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    setBox(view.canvas, 0, 0);
    feed(view, ctx, simFrames("go2", 12));
    expect(text(view.tlSub)).toBe("últimos 30 s · 12 muestras");
  });

  test("actualiza todas las zonas con muestras reales del G1", () => {
    const { view, ctx } = mount({}, { info: infoFor("g1") });
    const last = feed(view, ctx, simFrames("g1", 20));
    expect(text(view.table.rows.get("R_wrist_yaw").temp)).toBe(last.motores[28].temperatura.toFixed(1));
    expect(text(view.sContacts)).toMatch(/pie/);
  });

  test("roll, pitch y yaw con signo, y el rumbo de brújula", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame({ imu: { roll: 2.04, pitch: -1.26, yaw: 90 } })]);
    expect([view.imuRoll, view.imuPitch, view.imuYaw].map(text)).toEqual(["+2.0°", "−1.3°", "+90.0°"]);
    // yaw > 0 es giro a la izquierda: mira al oeste
    expect(text(view.imuDir)).toBe("O");
    feed(view, ctx, [frame({ imu: { yaw: -45 } })]);
    expect(text(view.imuDir)).toBe("NE");
  });

  test("los chips de patas dicen si apoyan, y solo se reescriben al cambiar", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame({ fuerzas: { FR: 1, FL: 0, RR: 1, RL: 0 } })]);
    const [fr, fl] = view.legChips.children;
    expect(fr.dataset.down).toBe("true");
    expect(fr.textContent).toBe("FR: apoyada");
    expect(fl.dataset.down).toBe("false");
    expect(fl.textContent).toBe("FL: en el aire");
    fr.dataset.down = "marca";
    feed(view, ctx, [frame({ fuerzas: { FR: 1, FL: 0, RR: 1, RL: 0 } })]);
    expect(fr.dataset.down).toBe("marca");
  });

  test("la frase de estado resume acción, apoyos, calor y batería", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame({ motores: [["FR_calf", 65]], fuerzas: { FR: 1, FL: 1, RR: 1, RL: 1 }, bms: { soc: 77 } })]);
    expect(sentence(view)).toBe("Quieto, las cuatro patas apoyadas · FR_calf a 65.0 °C (más de 60 °C) · batería 77 %");
    expect(view.sHeat.dataset.level).toBe("crit");
    feed(view, ctx, [frame({ fuerzas: { FR: 1 } })]);
    expect(text(view.sHeat)).toBe("");
    expect(view.sHeat.dataset.level).toBe("ok");
  });

  test("la frase usa el giro de las últimas muestras", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    const frames = Array.from({ length: 12 }, (_, i) => frame({ imu: { yaw: i * 3 }, receivedAt: 1000 + i * 100 }));
    feed(view, ctx, frames);
    expect(text(view.sAction)).toBe("Girando en el lugar");
  });

  test("la línea de tiempo recibe historial, capturas, la hora y las patas", () => {
    const { view, ctx } = mount({}, { info: infoFor("g1") });
    const draw = vi.spyOn(view.timeline, "draw");
    const last = feed(view, ctx, simFrames("g1", 3));
    const arg = draw.mock.calls.at(-1)[0];
    expect(arg.frames).toHaveLength(3);
    expect(arg.captures).toBe(ctx.captures.samples);
    expect(arg.now).toBe(last.receivedAt);
    expect(arg.legs).toEqual(["R_foot", "L_foot"]);
    expect(arg.palette).toBe(view.palette);
  });

  test("si /info no trae patas, la línea de tiempo usa las de la muestra", () => {
    const { view, ctx } = mount({}, { info: { motores_nombres: ["FR_hip"] } });
    const draw = vi.spyOn(view.timeline, "draw");
    feed(view, ctx, [frame({ fuerzas: { FR: 1, RL: 0 } })]);
    expect(draw.mock.calls[0][0].legs).toEqual(["FR", "RL"]);
  });
});

describe("BodyView › selección y teclado", () => {
  test("tocar un motor en el dibujo lo elige y lo muestra en la tabla", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    const reveal = vi.spyOn(view.table, "reveal");
    view.figure.joints.get("RR_thigh").g.dispatchEvent(new Event("click"));
    expect(view.selected).toBe("RR_thigh");
    expect(view.userPicked).toBe(true);
    expect(reveal).toHaveBeenCalledWith("RR_thigh");
    expect(view.callouts.cards.get("RR_thigh").el.classList.contains("is-selected")).toBe(true);
    expect(view.table.rows.get("RR_thigh").tr.classList.contains("is-selected")).toBe(true);
    expect(view.detail.index).toBe(7);
  });

  test("una selección automática no mueve la tabla", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    const reveal = vi.spyOn(view.table, "reveal");
    view.select("FL_hip");
    expect(reveal).not.toHaveBeenCalled();
    expect(view.userPicked).toBe(false);
  });

  test("antes de setInfo el motor elegido no tiene posición", () => {
    const { view } = mount();
    view.select("FR_hip");
    expect(view.detail.index).toBe(-1);
  });

  test("con una muestra ya recibida, elegir actualiza el detalle al instante", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame({ motores: [["FR_hip", 30], ["FR_thigh", 47.5]] })]);
    view.select("FR_hip");
    expect(text(view.detail.temp)).toBe("30.0");
    const upd = vi.spyOn(view.detail, "update");
    view.select(null);
    expect(upd).not.toHaveBeenCalled();
  });

  test("las flechas recorren los motores dando la vuelta", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    const target = document.createElement("div");
    expect(view.onKey({ key: "ArrowLeft", target })).toBe(true);
    expect(view.selected).toBe("RL_calf");
    expect(view.onKey({ key: "ArrowRight", target })).toBe(true);
    expect(view.selected).toBe("FR_hip");
    expect(view.onKey({ key: "ArrowRight", target: {} })).toBe(true);
    expect(view.selected).toBe("FR_thigh");
    expect(view.userPicked).toBe(true);
  });

  test("no roba las flechas a un campo, un desplegable o un deslizador", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    for (const html of ["<input>", "<select></select>", '<div role="slider"><span></span></div>']) {
      const box = document.createElement("div");
      box.innerHTML = html;
      const target = box.querySelector("span") ?? box.firstChild;
      expect(view.onKey({ key: "ArrowRight", target })).toBe(false);
    }
    expect(view.selected).toBe("FR_hip");
  });

  test("sin robot las flechas no hacen nada", () => {
    const { view } = mount();
    expect(view.onKey({ key: "ArrowRight", target: document.body })).toBe(false);
  });

  test("O ordena la tabla por temperatura; otras teclas no se consumen", () => {
    const { view } = mount({}, { info: infoFor("go2") });
    expect(view.onKey({ key: "o" })).toBe(true);
    expect(view.table.sortByTemp).toBe(true);
    expect(view.onKey({ key: "O" })).toBe(true);
    expect(view.table.sortByTemp).toBe(false);
    expect(view.onKey({ key: "x" })).toBe(false);
  });
});

describe("BodyView › conexión", () => {
  test("sin muestras: espera al servidor o al robot", () => {
    const { view, container } = mount();
    view.onConnection({ state: "offline" });
    expect(sentence(view)).toBe("Sin conexión con el servidor");
    expect(container.classList.contains("is-stale")).toBe(false);
    view.onConnection({ state: "reconnecting" });
    expect(sentence(view)).toBe("Conectando con el robot…");
  });

  test("al cortarse con datos a la vista, los congela y lo dice", () => {
    const { view, ctx, container } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame({ motores: [["FR_calf", 70]] })]);
    view.onConnection({ state: "stale" });
    expect(container.classList.contains("is-stale")).toBe(true);
    expect(sentence(view)).toBe("Sin conexión con el robot · lo que ves quedó congelado · reintentando…");
    expect(view.sHeat.dataset.level).toBe("ok");
    // las muestras que lleguen mientras tanto no pisan el aviso
    feed(view, ctx, [frame()]);
    expect(text(view.sAction)).toBe("Sin conexión con el robot");
  });

  test("al volver la conexión vuelve la frase normal", () => {
    const { view, ctx, container } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame({ fuerzas: { FR: 1 } })]);
    view.onConnection({ state: "offline" });
    view.onConnection({ state: "live" });
    expect(container.classList.contains("is-stale")).toBe(false);
    expect(sentence(view)).toBe("Quieto, las 1 pata apoyada · batería 80 %");
    view.onConnection({ state: "connecting" });
    expect(container.classList.contains("is-stale")).toBe(false);
  });

  test("después de destruir la vista no falla", () => {
    const { view } = mount();
    view.destroy();
    expect(() => view.onConnection({ state: "offline" })).not.toThrow();
  });
});

describe("BodyView › hooks", () => {
  test("pausa: botón, chip y figura 3D", () => {
    const { view } = mount();
    view.onPause(true);
    expect(view.pauseBtn.getAttribute("aria-pressed")).toBe("true");
    expect(text(view.pauseBtn.querySelector(".bd-btn__label"))).toBe("Seguir");
    expect(view.pauseBtn.querySelector(".bd-btn__icon").innerHTML).toContain("m6 3 14 9-14 9V3z");
    expect(view.chipPaused.hidden).toBe(false);
    expect(fs.instances[0].setPaused).toHaveBeenCalledWith(true);
    view.onPause(false);
    expect(view.pauseBtn.getAttribute("aria-pressed")).toBe("false");
    expect(text(view.pauseBtn.querySelector(".bd-btn__label"))).toBe("Pausar");
    expect(view.pauseBtn.querySelector(".bd-btn__icon").innerHTML).toContain('rect x="6" y="4"');
    expect(view.chipPaused.hidden).toBe(true);
    view.destroy();
    expect(() => view.onPause(true)).not.toThrow();
  });

  test("Esquema | 3D real", () => {
    const { view } = mount();
    view.onFigureMode("3d");
    expect(fs.instances[0].setMode).toHaveBeenLastCalledWith("3d");
    expect(fs.toggles[0].set).toHaveBeenCalledWith("3d");
    expect(view.stage.dataset.figure).toBe("3d");
    expect(text(view.imuNote)).toBe("Modelo 3D real · arrastrá para girar");
    view.onFigureMode("esquema");
    expect(view.stage.dataset.figure).toBe("esquema");
    expect(text(view.imuNote)).toBe("Vista desde arriba · inclinación ×3");
    view.destroy();
    expect(() => view.onFigureMode("3d")).not.toThrow();
  });

  test("grabación: los dos botones, el obturador y el chip", () => {
    const { view } = mount();
    view.onRecording(true);
    expect(view.recBtn.getAttribute("aria-pressed")).toBe("true");
    expect(view.recBtnPhone.getAttribute("aria-pressed")).toBe("true");
    expect(text(view.recBtnPhone.querySelector("span"))).toBe("Detener");
    expect(view.shutter.classList.contains("is-recording")).toBe(true);
    expect(view.shutter.getAttribute("aria-label")).toBe("Detener la grabación");
    expect(view.chipRec.hidden).toBe(false);
    view.onRecording(false);
    expect(view.recBtn.getAttribute("aria-pressed")).toBe("false");
    expect(text(view.recBtnPhone.querySelector("span"))).toBe("Grabar");
    expect(view.shutter.classList.contains("is-recording")).toBe(false);
    expect(view.shutter.getAttribute("aria-label")).toBe("Capturar muestra (mantené apretado para grabar)");
    expect(view.chipRec.hidden).toBe(true);
  });

  test("tema: relee los colores y redibuja si hay datos", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    const draw = vi.spyOn(view.timeline, "draw");
    const prev = view.palette;
    view.onTheme("light");
    expect(view.palette).not.toBe(prev);
    expect(fs.instances[0].applyTheme).toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
    feed(view, ctx, [frame()]);
    draw.mockClear();
    const det = vi.spyOn(view.detail, "update");
    view.onTheme("dark");
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0][0].palette).toBe(view.palette);
    expect(det).toHaveBeenCalledWith(view.latest, [view.latest], view.palette);
  });

  test("al cambiar el layout vuelve a medir y redibuja la línea de tiempo", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    const draw = vi.spyOn(view.timeline, "draw");
    const [obs] = env.ro.instances;
    setBox(view.figure.el, 300, 300);
    obs.cb();
    expect(view.figure.sizePx).toBe(300);
    expect(draw).not.toHaveBeenCalled();
    feed(view, ctx, [frame()]);
    draw.mockClear();
    obs.cb();
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

describe("BodyView › botones", () => {
  const btn = (view, label) => [...view.root.querySelectorAll(".bd-actions button")].find((b) => b.textContent.includes(label));

  test("los botones de la línea de tiempo llaman a sus acciones", () => {
    const { view, ctx } = mount({ excel: true });
    btn(view, "Pausar").click();
    expect(ctx.actions.togglePause).toHaveBeenCalledTimes(1);
    btn(view, "Grabar").click();
    expect(ctx.actions.toggleRecording).toHaveBeenCalledTimes(1);
    btn(view, "Capturar").click();
    expect(ctx.actions.capture).toHaveBeenCalledTimes(1);
    btn(view, "Exportar CSV").click();
    expect(ctx.actions.exportCsv).toHaveBeenCalledWith({ excel: true });
    expect(btn(view, "Capturar").querySelector("kbd").textContent).toBe("C");
    expect(btn(view, "Excel").querySelector("kbd")).toBeNull();
  });

  test("el botón Excel alterna la preferencia y se marca", () => {
    const { view, ctx } = mount();
    view.excelBtn.click();
    expect(ctx.actions.setExcel).toHaveBeenCalledWith(true);
    expect(view.excelBtn.getAttribute("aria-pressed")).toBe("true");
    view.excelBtn.click();
    expect(ctx.actions.setExcel).toHaveBeenLastCalledWith(false);
    expect(view.excelBtn.getAttribute("aria-pressed")).toBe("false");
  });

  test("la barra del celular exporta y graba", () => {
    const { view, ctx } = mount();
    const [csv] = view.root.querySelectorAll(".bd-shutterbar__side");
    csv.click();
    expect(ctx.actions.exportCsv).toHaveBeenCalledWith({ excel: false });
    expect(csv.textContent).toBe("CSV 0");
    view.recBtnPhone.click();
    expect(ctx.actions.toggleRecording).toHaveBeenCalledTimes(1);
  });
});

describe("BodyView › obturador", () => {
  const press = (el, type) => el.dispatchEvent(new Event(type));

  test("tocar captura y no empieza a grabar", () => {
    vi.useFakeTimers();
    const { view, ctx } = mount();
    press(view.shutter, "pointerdown");
    vi.advanceTimersByTime(499);
    view.shutter.click();
    vi.advanceTimersByTime(1000);
    expect(ctx.actions.capture).toHaveBeenCalledTimes(1);
    expect(ctx.actions.toggleRecording).not.toHaveBeenCalled();
  });

  test("mantener medio segundo empieza a grabar y el clic de soltar no captura", () => {
    vi.useFakeTimers();
    const { view, ctx } = mount();
    press(view.shutter, "pointerdown");
    vi.advanceTimersByTime(500);
    expect(ctx.actions.toggleRecording).toHaveBeenCalledWith(true);
    view.shutter.click();
    expect(ctx.actions.capture).not.toHaveBeenCalled();
    // el siguiente toque ya es normal
    view.shutter.click();
    expect(ctx.actions.capture).toHaveBeenCalledTimes(1);
  });

  test("mientras graba, tocar la detiene y mantener no hace nada más", () => {
    vi.useFakeTimers();
    const { view, ctx } = mount({ recording: true });
    press(view.shutter, "pointerdown");
    vi.advanceTimersByTime(800);
    expect(ctx.actions.toggleRecording).not.toHaveBeenCalled();
    view.shutter.click();
    expect(ctx.actions.toggleRecording).toHaveBeenCalledWith(false);
    expect(ctx.actions.capture).not.toHaveBeenCalled();
  });

  test.each(["pointerleave", "pointercancel"])("si el dedo se va (%s) no empieza a grabar", (type) => {
    vi.useFakeTimers();
    const { view, ctx } = mount();
    press(view.shutter, "pointerdown");
    vi.advanceTimersByTime(200);
    press(view.shutter, type);
    vi.advanceTimersByTime(1000);
    expect(ctx.actions.toggleRecording).not.toHaveBeenCalled();
  });

  test("dos apoyos seguidos reinician la espera", () => {
    vi.useFakeTimers();
    const { view, ctx } = mount();
    press(view.shutter, "pointerdown");
    vi.advanceTimersByTime(400);
    press(view.shutter, "pointerdown");
    vi.advanceTimersByTime(400);
    expect(ctx.actions.toggleRecording).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(ctx.actions.toggleRecording).toHaveBeenCalledTimes(1);
  });

  test("destruir la vista cancela una grabación pendiente", () => {
    vi.useFakeTimers();
    const { view, ctx } = mount();
    press(view.shutter, "pointerdown");
    view.destroy();
    vi.advanceTimersByTime(1000);
    expect(ctx.actions.toggleRecording).not.toHaveBeenCalled();
  });
});

describe("BodyView › capturas", () => {
  test("una captura manual sube el contador, destella y redibuja", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame()]);
    const draw = vi.spyOn(view.timeline, "draw");
    env.animate.mockClear();
    ctx.captures.add(view.latest, "manual");
    expect(text(view.count)).toBe("1");
    expect(text(view.countPhone)).toBe("1");
    const targets = env.animate.mock.contexts;
    expect(targets).toEqual([view.count, view.countPhone, view.flash]);
    expect(env.animate.mock.calls[0]).toEqual([[{ transform: "scale(1)" }, { transform: "scale(1.4)" }, { transform: "scale(1)" }], { duration: 350 }]);
    expect(env.animate.mock.calls[2]).toEqual([[{ opacity: 0.55 }, { opacity: 0 }], { duration: 350, easing: "ease-out" }]);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(view.canvas.getAttribute("aria-label")).toMatch(/1 muestras capturadas, 1 marcadas como alfileres numerados\.$/);
  });

  test("sin muestras todavía, la captura no redibuja", () => {
    const { view, ctx } = mount();
    const draw = vi.spyOn(view.timeline, "draw");
    ctx.captures.add(frame(), "manual");
    expect(draw).not.toHaveBeenCalled();
    expect(env.animate.mock.contexts).toContain(view.flash);
  });

  test("la grabación continua no destella ni hace saltar el contador", () => {
    const { view, ctx } = mount({ recording: true });
    ctx.captures.add(frame(), "grabacion");
    expect(text(view.count)).toBe("1");
    expect(env.animate).not.toHaveBeenCalled();
    expect(view.canvas.getAttribute("aria-label")).toMatch(/1 muestras capturadas\.$/);
  });

  test("con movimiento reducido no hay animaciones", () => {
    env.mq.matches = true;
    const { view, ctx } = mount();
    ctx.captures.add(frame(), "manual");
    expect(text(view.count)).toBe("1");
    expect(env.animate).not.toHaveBeenCalled();
  });

  test("al borrar las capturas el contador vuelve a 0 sin animar", () => {
    const { view, ctx } = mount();
    ctx.captures.add(frame(), "manual");
    env.animate.mockClear();
    ctx.captures.clear();
    expect(text(view.count)).toBe("0");
    expect(env.animate).not.toHaveBeenCalled();
    expect(view.canvas.getAttribute("aria-label")).toMatch(/0 muestras capturadas\.$/);
  });
});

describe("BodyView › destroy", () => {
  test("suelta observadores, figura 3D, escuchas y suscripciones", () => {
    const { view, ctx } = mount();
    const [obs] = env.ro.instances;
    const fig = fs.instances[0];
    view.destroy();
    expect(obs.disconnect).toHaveBeenCalled();
    expect(fig.destroy).toHaveBeenCalled();
    expect(view.fig).toBeNull();
    expect(env.mq.removeEventListener).toHaveBeenCalledWith("change", env.mq.listener);
    expect(view.cleanup).toEqual([]);
    expect(view.root).toBeNull();
    ctx.captures.add(frame(), "manual");
    expect(text(view.count)).toBe("0");
  });

  test("FR-010: onTheme() después de destroy() no hace nada", () => {
    const { view, ctx } = mount({}, { info: infoFor("go2") });
    feed(view, ctx, [frame()]);
    const draw = vi.spyOn(view.timeline, "draw");
    const prev = view.palette;
    view.destroy();
    expect(() => view.onTheme("light")).not.toThrow();
    expect(view.palette).toBe(prev);
    expect(draw).not.toHaveBeenCalled();
  });

  test("destruir sin montar no falla", () => {
    const view = new BodyView(makeCtx());
    expect(() => view.destroy()).not.toThrow();
  });
});
