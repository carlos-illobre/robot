// Vista Piloto completa con un ctx falso armado con datos reales de PaseoSim
// (Go2 y G1). FigureSwitch (ui/) y toast (ui/) se reemplazan por dobles.
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { RingBuffer } from "../../js/core/RingBuffer.js";
import { CaptureStore } from "../../js/core/CaptureStore.js";
import * as figura from "../../js/ui/FigureSwitch.js";
import { toast } from "../../js/ui/toast.js";
import PilotView from "../../js/views/pilot/PilotView.js";
import { audioFalso, muestra, resizeObserverFalso, simular, temperaturas } from "./helpers.js";

vi.mock("../../js/ui/toast.js", () => ({ toast: vi.fn() }));

vi.mock("../../js/ui/FigureSwitch.js", () => {
  const instancias = [];
  class FigureSwitch {
    constructor(ctx, opts) {
      this.ctx = ctx;
      this.host = opts.host;
      this.schematic = opts.schematic;
      this.opts = { preset: opts.preset, interactive: opts.interactive, labels: opts.labels };
      this.scene = null;
      this.calls = [];
      instancias.push(this);
    }
    setInfo(info) {
      this.calls.push(["setInfo", info]);
    }
    update(frame) {
      this.calls.push(["update", frame]);
    }
    setMode(mode) {
      this.calls.push(["setMode", mode]);
    }
    setPaused(paused) {
      this.calls.push(["setPaused", paused]);
    }
    applyTheme() {
      this.calls.push(["applyTheme"]);
    }
    destroy() {
      this.calls.push(["destroy"]);
    }
  }
  function figureToggle(ctx, opts) {
    const el = document.createElement("div");
    el.className = "fig-toggle";
    el.opts = opts;
    el.ctx = ctx;
    el.modos = [];
    el.set = (mode) => el.modos.push(mode);
    return el;
  }
  return { FigureSwitch, figureToggle, instancias };
});

let container;

beforeEach(() => {
  toast.mockClear();
  figura.instancias.length = 0;
  resizeObserverFalso();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  container = document.createElement("main");
  document.body.append(container);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** ctx como el de main.js, con 30 muestras reales del paseo en el historial. */
function contexto(modelo = "go2") {
  const { info, frames } = simular(modelo, 30, { desde: 8 });
  const history = new RingBuffer(600);
  frames.forEach((f) => history.push(f));
  const captures = new CaptureStore();
  const state = { info, latest: frames.at(-1), torqueAlarm: 18, alerts: [], figure: "esquema", paused: false };
  const actions = { capture: vi.fn(), toggleRecording: vi.fn(), exportCsv: vi.fn(), togglePause: vi.fn(), setFigureMode: vi.fn() };
  return { ctx: { state, actions, history, captures }, info, frames };
}

/** Vista montada (y con setInfo si `conInfo`). */
function vista(modelo = "go2", { conInfo = true } = {}) {
  const c = contexto(modelo);
  const view = new PilotView(c.ctx);
  view.mount(container);
  if (conInfo) view.setInfo(c.info);
  return { view, fig: figura.instancias.at(-1), ...c };
}
const boton = (view, texto) => [...view.root.querySelectorAll("button")].filter((b) => b.textContent.includes(texto));
const callsDe = (fig, name) => fig.calls.filter(([n]) => n === name).map(([, a]) => a);

describe("metadatos", () => {
  test("se registra como 'pilot' con sus atajos propios", () => {
    expect(PilotView.id).toBe("pilot");
    expect(PilotView.shortcuts).toEqual([
      ["M", "Tabla de motores y batería"],
      ["S", "Sonido: pisada por pata y alarma sobre 60 °C"],
      ["Esc", "Cerrar la tabla"],
    ]);
  });

  test("el constructor arranca sin selección ni capturas", () => {
    const view = new PilotView(contexto().ctx);
    expect(view.selected).toBeNull();
    expect(view.prevContacts).toEqual({});
    expect(view.captureCount).toBe(0);
  });
});

describe("mount", () => {
  test("arma la cabina dentro del contenedor, esperando datos", () => {
    const { view } = vista("go2", { conInfo: false });
    expect(container.firstChild).toBe(view.root);
    expect(view.root.className).toBe("pv");
    expect(view.root.dataset.link).toBe("connecting");
    expect(view.root.firstChild).toBe(view.horizon.el);
    for (const el of [view.heading.el, view.battery.el, view.thermo.el, view.ring.svg, view.osc.el, view.sheet.dialog]) expect(view.root.contains(el)).toBe(true);
    expect(view.root.querySelector(".pv-alarm").getAttribute("aria-hidden")).toBe("true");
    expect(view.shutter.getAttribute("aria-hidden")).toBe("true");
    expect(view.status.textContent).toBe("Esperando datos…");
    expect(view.ts.textContent).toBe("ts —");
    expect(view.linkText.getAttribute("role")).toBe("status");
    expect(view.recChip.hidden).toBe(true);
    expect(view.pauseChip.hidden).toBe(true);
  });

  test("pone el modelo 3D en el centro del anillo, chico y sin interacción", () => {
    const { view, fig, ctx } = vista("go2", { conInfo: false });
    expect(fig.ctx).toBe(ctx);
    expect(fig.host).toBe(view.figHost);
    expect(fig.schematic).toBe(view.ring.figure);
    expect(fig.opts).toEqual({ preset: "arriba", interactive: false, labels: false });
    expect(view.figHost.parentElement.className).toBe("pv-ring");
    expect(view.figHost.getAttribute("aria-hidden")).toBe("true");
    expect(view.figToggle.opts).toEqual({ compact: true });
    expect(view.figToggle.ctx).toBe(ctx);
    expect(view.root.contains(view.figToggle)).toBe(true);
  });

  test("los botones de captura, grabación, exportación y pausa llaman a las acciones", () => {
    const { view, ctx } = vista();
    const { actions } = ctx;
    boton(view, "Capturar").forEach((b) => b.click());
    expect(actions.capture).toHaveBeenCalledTimes(2);
    boton(view, "Grabar").forEach((b) => b.click());
    expect(actions.toggleRecording).toHaveBeenCalledTimes(2);
    boton(view, "CSV").forEach((b) => b.click());
    expect(actions.exportCsv).toHaveBeenCalledTimes(2);
    boton(view, "Pausa")[0].click();
    expect(actions.togglePause).toHaveBeenCalledTimes(1);
    expect([...view.root.querySelectorAll("button")].every((b) => b.type === "button")).toBe(true);
  });

  test("los botones muestran su tecla y arrancan sin presionar", () => {
    const { view } = vista();
    expect(view.soundBtn.getAttribute("aria-label")).toBe("Sonido");
    expect(view.soundBtn.getAttribute("aria-pressed")).toBe("false");
    expect(view.soundBtn.querySelector("kbd").textContent).toBe("S");
    expect(view.tableButtons[0].getAttribute("aria-expanded")).toBe("false");
    expect(view.tableButtons[0].getAttribute("aria-haspopup")).toBe("dialog");
    expect(view.tableButtons[0].querySelector("kbd").textContent).toBe("M");
    expect(view.pauseBtn.querySelector("kbd").textContent).toBe("Espacio");
    expect(view.recButtons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
  });

  test("los contadores de capturas arrancan con lo que ya había en el almacén", () => {
    const c = contexto();
    c.ctx.captures.add(c.frames[0]);
    c.ctx.captures.add(c.frames[1]);
    const view = new PilotView(c.ctx);
    view.mount(container);
    expect(view.captureCount).toBe(2);
    expect(view.counts.map((el) => el.textContent)).toEqual(["2", "2", "2"]);
  });
});

describe("setInfo", () => {
  test("con el Go2 construye anillo, escala y tabla de 12 motores, vistos desde arriba", () => {
    const { view, fig, info } = vista("go2");
    expect(view.ring.byName.size).toBe(12);
    expect(view.thermo.byName.size).toBe(12);
    expect(view.sheet.rows.size).toBe(12);
    expect(view.root.dataset.robot).toBe("cuadrupedo");
    expect(fig.opts.preset).toBe("arriba");
    expect(callsDe(fig, "setInfo")).toEqual([info]);
  });

  test("con el G1 construye 29 motores y la cámara 3D lo mira de frente", () => {
    const { view, fig } = vista("g1");
    fig.scene = { setPreset: vi.fn() };
    expect(view.ring.byName.size).toBe(29);
    expect(view.sheet.rows.size).toBe(29);
    expect(view.root.dataset.robot).toBe("humanoide");
    expect(fig.opts.preset).toBe("frente");
    view.setInfo({ ...view.info, patas: ["R_foot"] });
    expect(fig.scene.setPreset).toHaveBeenCalledWith("frente", { instant: true });
  });

  test("al pasar de G1 a Go2 la escena 3D vuelve a la cámara de arriba", () => {
    const { view, fig } = vista("g1");
    fig.scene = { setPreset: vi.fn() };
    view.setInfo(contexto("go2").info);
    expect(fig.scene.setPreset).toHaveBeenCalledWith("arriba", { instant: true });
    expect(view.ring.byName.size).toBe(12);
  });

  test("la misma info no reconstruye nada", () => {
    const { view, fig, info } = vista("go2");
    const build = vi.spyOn(view.ring, "build");
    view.setInfo({ ...info });
    expect(build).not.toHaveBeenCalled();
    expect(callsDe(fig, "setInfo")).toHaveLength(1);
  });

  test("otras patas con los mismos motores sí reconstruye y reinicia los contactos", () => {
    const { view, info } = vista("go2");
    view.prevContacts = { FR: 0 };
    view.setInfo({ ...info, patas: ["FR", "FL"] });
    expect(view.ring.feet.size).toBe(2);
    expect(view.prevContacts).toEqual({});
  });

  test("conserva el motor elegido si el robot nuevo lo tiene y lo suelta si no", () => {
    const { view, info } = vista("go2");
    view.ring.onSelect("FR_calf");
    view.setInfo({ ...info, patas: ["FR"] });
    expect(view.selected).toBe("FR_calf");
    expect(view.ring.byName.get("FR_calf").g.hasAttribute("data-selected")).toBe(true);
    expect(view.sheet.rows.get("FR_calf").pick.getAttribute("aria-pressed")).toBe("true");
    view.setInfo(contexto("g1").info);
    expect(view.selected).toBeNull();
  });

  test("sin info deja la cabina vacía, sin tipo de robot", () => {
    const { view, fig } = vista("go2", { conInfo: false });
    view.setInfo(null);
    expect(view.ring.byName.size).toBe(0);
    expect(view.root.dataset.robot).toBe("");
    expect(fig.opts.preset).toBe("arriba");
    expect(callsDe(fig, "setInfo")).toEqual([null]);
  });
});

describe("update", () => {
  test("reparte la muestra a todos los instrumentos", () => {
    const { view, fig, frames, ctx } = vista("go2");
    const f = frames.at(-1);
    const draw = vi.spyOn(view.osc, "draw");
    const ring = vi.spyOn(view.ring, "update");
    view.update(f);
    expect(view.ts.textContent).toBe(`ts ${f.ts.toFixed(2)} s`);
    expect(view.horizon.plane.style.transform).toBe(`rotate(${(-f.imu.roll * 4).toFixed(2)}deg) translateY(${(f.imu.pitch * 24).toFixed(1)}px)`);
    expect(view.heading.value.textContent).toMatch(/^\d{3}°$/);
    expect(view.battery.value.textContent).toBe(`${Math.round(f.bms.soc)}%`);
    expect(view.thermo.name.textContent).toBe(f.derived.tempMax.motor);
    expect(ring).toHaveBeenCalledWith(f, { torqueRef: 18 });
    expect(draw).toHaveBeenCalledWith(ctx.history.tail(120), ctx.captures.samples);
    expect(draw.mock.calls[0][0]).toHaveLength(30);
    expect(view.sheet.last).toBe(f);
    expect(callsDe(fig, "update")).toEqual([f]);
  });

  test("el umbral de torque del arco es el de la alarma configurada", () => {
    const { view, ctx, frames } = vista("go2");
    ctx.state.torqueAlarm = 7;
    const ring = vi.spyOn(view.ring, "update");
    view.update(frames[0]);
    expect(ring).toHaveBeenCalledWith(frames[0], { torqueRef: 7 });
  });

  test("el marco se pone en alarma solo con una alerta crítica", () => {
    const { view, ctx, frames } = vista("go2");
    ctx.state.alerts = [{ key: "bat", level: "warn", message: "batería" }];
    view.update(frames[0]);
    expect(view.root.hasAttribute("data-alarm")).toBe(false);
    ctx.state.alerts = [{ key: "bat", level: "warn" }, { key: "temp:FR_hip", level: "crit" }];
    view.update(frames[0]);
    expect(view.root.hasAttribute("data-alarm")).toBe(true);
    ctx.state.alerts = [];
    view.update(frames[0]);
    expect(view.root.hasAttribute("data-alarm")).toBe(false);
  });

  test("con el paseo real del G1 actualiza los 29 motores sin errores", () => {
    const { view, frames } = vista("g1");
    for (const f of frames) view.update(f);
    expect(view.ring.svg.querySelectorAll('.pv-seg[data-level="unknown"]')).toHaveLength(0);
    expect(view.thermo.counts.textContent).toMatch(/^29 motores · /);
    expect(view.status.textContent).toMatch(/pies? apoyados?/);
  });
});

describe("línea de estado", () => {
  const caminando = (raw) => raw.motores.forEach((m) => (m.velocidad = 2));
  const quieto = (raw) => raw.motores.forEach((m) => (m.velocidad = 0));

  test("con un motor sobre 60 °C lo nombra, en rojo", () => {
    const { view } = vista("go2");
    view.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 61 })));
    expect(view.status.textContent).toBe("FR_hip 61.0 °C · sobre 60 °C");
    expect(view.status.dataset.level).toBe("crit");
  });

  test("con varios sobre 60 °C los cuenta y nombra al peor", () => {
    const { view } = vista("go2");
    view.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 61, RL_calf: 65.04 })));
    expect(view.status.textContent).toBe("2 motores sobre 60 °C · RL_calf 65.0 °C");
  });

  test("el Go2 trotando cuenta patas apoyadas y motores tibios", () => {
    const { view } = vista("go2");
    view.update(muestra("go2", (raw) => {
      caminando(raw);
      temperaturas(raw, { FR_hip: 45, FL_hip: 50, RR_hip: 41 });
      raw.fuerzas = { FR: 1, FL: 0, RR: 0, RL: 1 };
    }));
    expect(view.status.textContent).toBe("Trote · 2 patas apoyadas · 3 tibios");
    expect(view.status.dataset.level).toBe("ok");
  });

  test("FR-006: con un solo motor tibio la línea de estado dice «1 tibio»", () => {
    const { view } = vista("go2");
    view.update(muestra("go2", (raw) => {
      quieto(raw);
      temperaturas(raw, { FR_hip: 45 });
      raw.fuerzas = { FR: 1, FL: 1, RR: 1, RL: 1 };
    }));
    expect(view.status.textContent).toBe("En reposo · 4 patas apoyadas · 1 tibio");
  });

  test("el Go2 quieto, con una sola pata, en singular y todo en rango", () => {
    const { view } = vista("go2");
    view.update(muestra("go2", (raw) => {
      quieto(raw);
      temperaturas(raw, {});
      raw.fuerzas = { FR: 1, FL: 0, RR: 0, RL: 0 };
    }));
    expect(view.status.textContent).toBe("En reposo · 1 pata apoyada · todo en rango");
  });

  test("el G1 marchando habla de pies", () => {
    const { view } = vista("g1");
    view.update(muestra("g1", (raw) => {
      caminando(raw);
      temperaturas(raw, {});
      raw.fuerzas = { R_foot: 1, L_foot: 0 };
    }));
    expect(view.status.textContent).toBe("Marcha · 1 pie apoyado · todo en rango");
    view.update(muestra("g1", (raw) => {
      quieto(raw);
      temperaturas(raw, { L_knee: 41 });
      raw.fuerzas = { R_foot: 1, L_foot: 1 };
    }));
    expect(view.status.textContent).toBe("En reposo · 2 pies apoyados · 1 tibio");
  });

  test("sin datos de patas solo dice si se mueve", () => {
    const { view } = vista("go2");
    view.update(muestra("go2", (raw) => {
      caminando(raw);
      temperaturas(raw, {});
      raw.fuerzas = {};
    }));
    expect(view.status.textContent).toBe("Marcha");
    view.update(muestra("go2", (raw) => {
      quieto(raw);
      raw.fuerzas = {};
    }));
    expect(view.status.textContent).toBe("En reposo");
  });

  test("sin /info todavía asume un cuadrúpedo", () => {
    const { view } = vista("go2", { conInfo: false });
    view.ring.build(contexto("go2").info);
    view.update(muestra("go2", (raw) => {
      quieto(raw);
      temperaturas(raw, {});
      raw.fuerzas = { FR: 1, FL: 1 };
    }));
    expect(view.status.textContent).toBe("En reposo · 2 patas apoyadas · todo en rango");
  });

  test("al normalizarse la temperatura vuelve a verde", () => {
    const { view } = vista("go2");
    view.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 70 })));
    view.update(muestra("go2", (raw) => temperaturas(raw, {})));
    expect(view.status.dataset.level).toBe("ok");
  });
});

describe("sonidos", () => {
  test("suena una pisada solo cuando una pata pasa del aire al apoyo", () => {
    const { view } = vista("go2");
    const step = vi.spyOn(view.sound, "step");
    const pisadas = (fuerzas) => view.update(muestra("go2", (raw) => (raw.fuerzas = fuerzas)));
    pisadas({ FR: 1, FL: 0, RR: 0, RL: 1 });
    expect(step).not.toHaveBeenCalled();
    pisadas({ FR: 0, FL: 1, RR: 1, RL: 1 });
    expect(step.mock.calls).toEqual([["FL"], ["RR"]]);
    pisadas({ FR: 0, FL: 1, RR: 1, RL: 1 });
    expect(step).toHaveBeenCalledTimes(2);
    pisadas({ FR: 1, FL: 1, RR: 1, RL: 1 });
    expect(step.mock.calls.at(-1)).toEqual(["FR"]);
    expect(view.prevContacts).toEqual({ FR: 1, FL: 1, RR: 1, RL: 1 });
  });

  test("la alarma suena mientras haya un motor sobre 60 °C", () => {
    const { view } = vista("go2");
    const alarm = vi.spyOn(view.sound, "alarm");
    view.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 60 })));
    expect(alarm).not.toHaveBeenCalled();
    view.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 60.5 })));
    expect(alarm).toHaveBeenCalledTimes(1);
  });

  test("la tecla S prende el sonido, cambia el ícono y lo anuncia", () => {
    const audio = audioFalso();
    vi.stubGlobal("AudioContext", audio.FakeAudioContext);
    const { view } = vista("go2");
    const icono = view.soundBtn.querySelector(".pv-btn__icon");
    const apagado = icono.innerHTML;
    expect(view.onKey({ key: "s" })).toBe(true);
    expect(view.sound.enabled).toBe(true);
    expect(view.soundBtn.getAttribute("aria-pressed")).toBe("true");
    expect(icono.innerHTML).not.toBe(apagado);
    expect(icono.innerHTML).toContain("M15.5 8.5");
    expect(toast).toHaveBeenLastCalledWith("Sonido prendido: cada pata suena al apoyar y hay alarma doble sobre 60 °C", { kind: "info", timeout: 2200 });
    view.onKey({ key: "S" });
    expect(view.soundBtn.getAttribute("aria-pressed")).toBe("false");
    expect(icono.innerHTML).toBe(apagado);
    expect(icono.innerHTML).toContain("m22 9-6 6");
    expect(toast).toHaveBeenLastCalledWith("Sonido apagado", { kind: "info", timeout: 2200 });
  });

  test("el botón de sonido hace lo mismo; sin Web Audio queda apagado", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const { view } = vista("go2");
    view.soundBtn.click();
    expect(view.soundBtn.getAttribute("aria-pressed")).toBe("false");
    expect(toast).toHaveBeenCalledWith("Sonido apagado", { kind: "info", timeout: 2200 });
  });
});

describe("teclas y botón de la tabla", () => {
  test("M abre y cierra la tabla, y el botón refleja si está abierta", () => {
    const { view } = vista("go2");
    expect(view.onKey({ key: "m" })).toBe(true);
    expect(view.sheet.open).toBe(true);
    expect(view.tableButtons[0].getAttribute("aria-expanded")).toBe("true");
    expect(view.onKey({ key: "M" })).toBe(true);
    expect(view.sheet.open).toBe(false);
    expect(view.tableButtons[0].getAttribute("aria-expanded")).toBe("false");
  });

  test("el botón Tabla abre la hoja", () => {
    const { view } = vista("go2");
    view.tableButtons[0].click();
    expect(view.sheet.open).toBe(true);
  });

  test("las demás teclas no las consume", () => {
    const { view } = vista("go2");
    expect(view.onKey({ key: "c" })).toBe(false);
    expect(view.onKey({ key: "Escape" })).toBe(false);
    expect(view.sheet.open).toBe(false);
  });
});

describe("selección de un motor", () => {
  test("tocar un segmento lo marca en el anillo, la escala y la tabla", () => {
    const { view, ctx } = vista("go2");
    const ring = vi.spyOn(view.ring, "update");
    view.ring.svg.querySelector('.pv-seg[data-name="RR_thigh"]').dispatchEvent(new Event("click"));
    expect(view.selected).toBe("RR_thigh");
    expect(view.ring.byName.get("RR_thigh").g.hasAttribute("data-selected")).toBe(true);
    expect(view.thermo.byName.get("RR_thigh").hasAttribute("data-selected")).toBe(true);
    expect(view.sheet.rows.get("RR_thigh").pick.getAttribute("aria-pressed")).toBe("true");
    // Redibuja enseguida con la última muestra, para que aparezca su etiqueta.
    expect(ring).toHaveBeenCalledWith(ctx.state.latest, { torqueRef: 18 });
    expect(view.ring.byName.get("RR_thigh").callout.g.getAttribute("visibility")).toBe("visible");
  });

  test("tocar el mismo motor otra vez lo desmarca", () => {
    const { view } = vista("go2");
    view.sheet.rows.get("FL_hip").pick.click();
    view.sheet.rows.get("FL_hip").pick.click();
    expect(view.selected).toBeNull();
    expect(view.root.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  test("elegir otro cambia la marca", () => {
    const { view } = vista("g1");
    view.sheet.rows.get("L_knee").pick.click();
    view.sheet.rows.get("R_knee").pick.click();
    expect(view.selected).toBe("R_knee");
    expect(view.thermo.byName.get("L_knee").hasAttribute("data-selected")).toBe(false);
  });

  test("sin ninguna muestra todavía no redibuja el anillo", () => {
    const { view, ctx } = vista("go2");
    ctx.state.latest = null;
    const ring = vi.spyOn(view.ring, "update");
    view.sheet.rows.get("FR_hip").pick.click();
    expect(view.selected).toBe("FR_hip");
    expect(ring).not.toHaveBeenCalled();
  });
});

describe("hooks de estado", () => {
  test("onConnection muestra el rótulo grande cuando no hay datos frescos", () => {
    const { view } = vista("go2");
    const casos = [
      ["connecting", "Conectando"],
      ["reconnecting", "Reconectando"],
      ["stale", "Sin enlace"],
      ["offline", "Sin enlace"],
      ["live", ""],
    ];
    for (const [state, text] of casos) {
      view.onConnection({ state });
      expect(view.root.dataset.link).toBe(state);
      expect(view.linkText.textContent).toBe(text);
    }
  });

  test("onRecording muestra la ficha y presiona los dos botones de grabar", () => {
    const { view } = vista("go2");
    view.onRecording(true);
    expect(view.recChip.hidden).toBe(false);
    expect(view.recButtons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    view.onRecording(false);
    expect(view.recChip.hidden).toBe(true);
    expect(view.recButtons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
  });

  test("onPause muestra la ficha, presiona el botón y pausa el 3D", () => {
    const { view, fig } = vista("go2");
    view.onPause(true);
    expect(view.pauseChip.hidden).toBe(false);
    expect(view.pauseBtn.getAttribute("aria-pressed")).toBe("true");
    view.onPause(false);
    expect(view.pauseChip.hidden).toBe(true);
    expect(view.pauseBtn.getAttribute("aria-pressed")).toBe("false");
    expect(callsDe(fig, "setPaused")).toEqual([true, false]);
  });

  test("onTheme relee los colores del osciloscopio y avisa al 3D", () => {
    const { view, fig } = vista("go2");
    const read = vi.spyOn(view.osc, "readColors");
    view.onTheme("light");
    expect(read).toHaveBeenCalledTimes(1);
    expect(fig.calls.at(-1)).toEqual(["applyTheme"]);
  });

  test("onFigureMode cambia la ilustración, el botón y el atributo de la vista", () => {
    const { view, fig } = vista("go2");
    view.onFigureMode("3d");
    expect(callsDe(fig, "setMode")).toEqual(["3d"]);
    expect(view.figToggle.modos).toEqual(["3d"]);
    expect(view.root.dataset.figure).toBe("3d");
    view.onFigureMode("esquema");
    expect(view.root.dataset.figure).toBe("esquema");
  });
});

describe("capturas", () => {
  test("una captura manual actualiza los contadores, suena y dispara el obturador", () => {
    const { view, ctx, frames } = vista("go2");
    const shutter = vi.spyOn(view.sound, "shutter");
    const draw = vi.spyOn(view.osc, "draw");
    view.shutter.animate = vi.fn();
    ctx.captures.add(frames.at(-1), "manual");
    expect(view.counts.map((el) => el.textContent)).toEqual(["1", "1", "1"]);
    expect(shutter).toHaveBeenCalledTimes(1);
    expect(view.shutter.animate).toHaveBeenCalledWith(
      [{ opacity: 1, transform: "scale(1.02)" }, { opacity: 0, transform: "scale(1)" }],
      { duration: 500, easing: "ease-out" },
    );
    expect(draw).toHaveBeenCalledWith(ctx.history.tail(120), ctx.captures.samples);
  });

  test("con movimiento reducido suena pero no anima", () => {
    vi.stubGlobal("matchMedia", (q) => ({ matches: q === "(prefers-reduced-motion: reduce)" }));
    const { view, ctx, frames } = vista("go2");
    const shutter = vi.spyOn(view.sound, "shutter");
    view.shutter.animate = vi.fn();
    ctx.captures.add(frames[0], "manual");
    expect(shutter).toHaveBeenCalledTimes(1);
    expect(view.shutter.animate).not.toHaveBeenCalled();
  });

  test("la grabación continua cuenta pero no dispara el obturador", () => {
    const { view, ctx, frames } = vista("go2");
    const shutter = vi.spyOn(view.sound, "shutter");
    const draw = vi.spyOn(view.osc, "draw");
    ctx.captures.add(frames[0], "continua");
    ctx.captures.add(frames[1], "continua");
    expect(view.counts[0].textContent).toBe("2");
    expect(shutter).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
  });

  test("al borrar las capturas el contador vuelve a cero sin obturador", () => {
    const { view, ctx, frames } = vista("go2");
    view.shutter.animate = vi.fn();
    ctx.captures.add(frames[0], "manual");
    const shutter = vi.spyOn(view.sound, "shutter");
    ctx.captures.clear();
    expect(view.counts.map((el) => el.textContent)).toEqual(["0", "0", "0"]);
    expect(view.captureCount).toBe(0);
    expect(shutter).not.toHaveBeenCalled();
  });
});

describe("destroy", () => {
  test("se desuscribe, libera todo y saca la vista del contenedor", () => {
    const { view, fig, ctx, frames } = vista("go2");
    const ro = view.osc.ro;
    const sound = vi.spyOn(view.sound, "destroy");
    view.onKey({ key: "m" });
    const close = vi.spyOn(view.sheet.dialog, "close");
    view.destroy();
    expect(callsDe(fig, "destroy")).toHaveLength(1);
    expect(ro.disconnect).toHaveBeenCalledTimes(1);
    expect(sound).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
    ctx.captures.add(frames[0], "manual");
    expect(view.counts[0].textContent).toBe("0");
  });

  test("con la tabla cerrada no intenta cerrarla", () => {
    const { view } = vista("go2");
    const close = vi.spyOn(view.sheet.dialog, "close");
    view.destroy();
    expect(close).not.toHaveBeenCalled();
  });

  test("destruir una vista que nunca se montó no falla", () => {
    const view = new PilotView(contexto().ctx);
    expect(() => view.destroy()).not.toThrow();
  });
});
