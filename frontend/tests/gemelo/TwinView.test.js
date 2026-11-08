import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import TwinView from "../../js/views/twin/TwinView.js";
import { CaptureStore } from "../../js/core/CaptureStore.js";
import { paseo, withFrame } from "./helpers.js";

/** Doble de RobotScene: TwinView solo usa su API pública. */
const { escenas, fakeModule } = vi.hoisted(() => {
  const escenas = [];
  const fakeModule = async () => {
    const { vi } = await import("vitest");
    class RobotScene {
      constructor(container, opts) {
        this.container = container;
        this.opts = opts;
        this.activeMotor = null;
        for (const m of ["setPaused", "setInfo", "update", "destroy", "applyTheme", "setPreset", "setFollow", "setMarkers"]) this[m] = vi.fn();
        this.pinMotor = vi.fn((i) => (this.activeMotor = i ?? null));
        escenas.push(this);
      }
    }
    return { RobotScene };
  };
  return { escenas, fakeModule };
});
vi.mock("../../js/views/twin/RobotScene.js", fakeModule);

let ctx, container, view;

function makeCtx(state = {}) {
  return {
    state: { paused: false, connection: { state: "live" }, torqueAlarm: 18, ...state },
    actions: { capture: vi.fn(), toggleRecording: vi.fn(), exportCsv: vi.fn() },
    captures: new CaptureStore(),
  };
}

/** Monta la vista y espera a que cargue el componente 3D (import dinámico). */
async function montar(c = ctx) {
  view = new TwinView(c);
  view.mount(container);
  await vi.waitFor(() => expect(view.r3d).not.toBeNull());
  return view;
}

const key = (k, mods = {}) => view.onKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });
const $ = (sel) => container.querySelector(sel);
const $$ = (sel) => [...container.querySelectorAll(sel)];
const pressed = (b) => b.getAttribute("aria-pressed");
const r3d = () => escenas.at(-1);

beforeEach(() => {
  escenas.length = 0;
  localStorage.clear();
  ctx = makeCtx();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  view?.destroy();
  view = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Por si una prueba reemplazó el módulo 3D (doMock): se vuelve al doble.
  vi.doMock("../../js/views/twin/RobotScene.js", fakeModule);
  document.body.replaceChildren();
});

/* ================================================================== */

describe("contrato de la vista", () => {
  test("id y atajos para la ayuda", () => {
    expect(TwinView.id).toBe("twin");
    expect(TwinView.shortcuts.map(([k]) => k)).toEqual(["V", "0", "F", "J", "M", "Esc"]);
  });

  test("mount arma HUD, estado, panel de motores y barra inferior dentro del contenedor", async () => {
    await montar();
    const el = $("section.tw");
    expect(el.getAttribute("aria-label")).toBe("Gemelo 3D del robot");
    expect([...el.children].map((c) => c.className)).toEqual(["tw-stage", "tw-hud tw-glass", "tw-status", "tw-panel tw-glass", "tw-dock"]);
    expect($(".tw-hud__name").textContent).toBe("Robot");
    expect($$(".tw-att__cell .tw-att__label").map((l) => l.textContent)).toEqual(["Roll", "Pitch", "Yaw"]);
    expect($(".tw-compass svg")).not.toBeNull();
    expect($$(".tw-dock [role=toolbar]").map((t) => t.getAttribute("aria-label"))).toEqual(["Cámara", "Datos"]);
    expect($$(".tw-btn[data-preset]").map((b) => b.dataset.preset)).toEqual(["perspectiva", "arriba", "lateral", "frente"]);
    expect($$("button").every((b) => b.type === "button")).toBe(true);
  });

  test("crea el robot 3D en el escenario con las preferencias de la vista", async () => {
    await montar();
    const s = r3d();
    expect(s.container).toBe($(".tw-stage"));
    expect(s.opts).toMatchObject({ interactive: true, labels: true, markers: true, follow: true, preset: "perspectiva" });
    expect(s.opts.torqueAlarm()).toBe(18);
    ctx.state.torqueAlarm = undefined;
    expect(s.opts.torqueAlarm()).toBe(Infinity);
    expect(s.setPaused).toHaveBeenCalledWith(false);
    expect(s.setInfo).not.toHaveBeenCalled();
  });

  test("si ya había info y muestra cuando termina de cargar el 3D, se las pasa", async () => {
    const { info, frames } = paseo("go2");
    view = new TwinView(ctx);
    view.mount(container);
    view.setInfo(info);
    view.update(frames[0]);
    await vi.waitFor(() => expect(view.r3d).not.toBeNull());
    expect(r3d().setInfo).toHaveBeenCalledWith(info);
    expect(r3d().update).toHaveBeenCalledWith(frames[0]);
  });

  test("si se sale de la vista antes de que cargue three.js, no crea el robot", async () => {
    view = new TwinView(ctx);
    view.mount(container);
    view.destroy();
    await new Promise((r) => setTimeout(r, 20));
    expect(escenas).toHaveLength(0);
    expect(view.r3d).toBeNull();
    view = null;
  });

  test("si no se puede cargar el módulo 3D lo dice y el panel sigue funcionando", async () => {
    vi.resetModules();
    vi.doMock("../../js/views/twin/RobotScene.js", () => {
      throw new Error("sin three");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: Fresh } = await import("../../js/views/twin/TwinView.js");
    view = new Fresh(ctx);
    view.mount(container);
    await vi.waitFor(() => expect($(".tw-error")).not.toBeNull());
    expect($(".tw-error").textContent).toBe("No se pudo cargar el motor 3D (three.js). Los datos siguen llegando en el panel.");
    expect($(".tw-error").parentNode).toBe($(".tw-stage"));
    expect(err).toHaveBeenCalled();
    const { info, frames } = paseo("go2");
    view.setInfo(info);
    view.update(frames[0]);
    expect($$(".tw-m")).toHaveLength(12);
    expect(key("v")).toBe(true);
    expect(key("Escape")).toBe(false);
  });

  test("destroy libera el robot 3D, la suscripción a capturas y el DOM", async () => {
    await montar();
    const s = r3d();
    view.destroy();
    expect(s.destroy).toHaveBeenCalledOnce();
    expect(view.r3d).toBeNull();
    expect(container.children).toHaveLength(0);
    ctx.captures.add(paseo("go2").frames[0]);
    expect(view.capCount.textContent).toBe("0");
    view = null;
  });

  test("destroy sin montar no falla", () => {
    expect(() => new TwinView(ctx).destroy()).not.toThrow();
  });
});

/* ================================================================== */

describe("info del robot", () => {
  test("Go2: nombre, 12 motores agrupados por pata y 4 patas", async () => {
    await montar();
    const { info } = paseo("go2");
    view.setInfo(info);
    expect($(".tw-hud__name").textContent).toBe("Unitree Go2 EDU");
    expect($(".tw-panel__count").textContent).toBe("(12)");
    expect($$(".tw-group").map((g) => g.getAttribute("aria-label"))).toEqual([
      "FR · Delantera derecha",
      "FL · Delantera izquierda",
      "RR · Trasera derecha",
      "RL · Trasera izquierda",
    ]);
    expect($$(".tw-group")[0].querySelectorAll(".tw-m")).toHaveLength(3);
    expect($(".tw-m").getAttribute("aria-label")).toBe("FR_hip: cadera");
    expect($$(".tw-pip").map((p) => [p.textContent, p.title])).toEqual([
      ["FR", "Delantera derecha"],
      ["FL", "Delantera izquierda"],
      ["RR", "Trasera derecha"],
      ["RL", "Trasera izquierda"],
    ]);
    expect(r3d().setInfo).toHaveBeenCalledWith(info);
  });

  test("G1: 29 motores en piernas, torso y brazos, y los pies Der/Izq", async () => {
    await montar();
    view.setInfo(paseo("g1").info);
    expect($(".tw-panel__count").textContent).toBe("(29)");
    expect($$(".tw-group h3").map((g) => g.textContent)).toEqual(["Pierna izquierda", "Pierna derecha", "Torso", "Brazo izquierdo", "Brazo derecho"]);
    expect($$(".tw-m")).toHaveLength(29);
    expect($$(".tw-pip").map((p) => [p.textContent, p.title])).toEqual([
      ["Der", "Pie derecho"],
      ["Izq", "Pie izquierdo"],
    ]);
  });

  test("sin nombre usa el modelo; sin motores ni patas, listas vacías; patas desconocidas con su código", async () => {
    await montar();
    view.setInfo({ modelo: "h1" });
    expect($(".tw-hud__name").textContent).toBe("h1");
    expect($(".tw-panel__count").textContent).toBe("(0)");
    expect($$(".tw-pip")).toHaveLength(0);
    view.setInfo({ modelo: "h1", patas: ["cola"] });
    expect($$(".tw-pip").map((p) => [p.textContent, p.title])).toEqual([["cola", "cola"]]);
  });

  test("al cambiar de robot se reconstruye la lista", async () => {
    await montar();
    view.setInfo(paseo("go2").info);
    view.setInfo(paseo("g1").info);
    expect($$(".tw-m")).toHaveLength(29);
    expect($$(".tw-pip")).toHaveLength(2);
  });
});

/* ================================================================== */

describe("muestras (10 Hz)", () => {
  async function conGo2(opts) {
    await montar();
    const p = paseo("go2", 3, opts);
    view.setInfo(p.info);
    return p;
  }

  test("ignora muestras antes de info o de otro robot", async () => {
    await montar();
    const go2 = paseo("go2").frames[0];
    view.update(go2);
    expect(view.frame).toBeNull();
    view.setInfo(paseo("g1").info);
    view.update(go2);
    expect(view.frame).toBeNull();
    expect(r3d().update).not.toHaveBeenCalled();
  });

  test("HUD: actitud con signo, marcadores sobre ±20° y brújula", async () => {
    const { frames } = await conGo2();
    const f = withFrame(frames[0], { imu: { ...frames[0].imu, roll: 5.25, pitch: -30, yaw: 123.4 } });
    view.update(f);
    expect(r3d().update).toHaveBeenCalledWith(f);
    expect(view.attRoll.value.textContent).toBe("+5.3°");
    expect(view.attPitch.value.textContent).toBe("−30.0°");
    expect(view.attYaw.value.textContent).toBe("+123°");
    expect(view.attRoll.marker.style.transform).toBe(`translateX(${(5.25 / 20) * 50}cqw)`);
    expect(view.attPitch.marker.style.transform).toBe("translateX(-50cqw)");
    expect(view.compassNeedle.style.transform).toBe("rotate(-123.4deg)");
  });

  test.each([
    [8, "ok"],
    [8.01, "warn"],
    [15, "warn"],
    [15.01, "crit"],
    [-16, "crit"],
    [-9, "warn"],
  ])("inclinación de %s° → %s", async (deg, level) => {
    const { frames } = await conGo2();
    view.update(withFrame(frames[0], { imu: { ...frames[0].imu, roll: deg, pitch: deg } }));
    expect(view.attRoll.cell.dataset.level).toBe(level);
    expect(view.attPitch.cell.dataset.level).toBe(level);
  });

  test("En marcha / Quieto según derived.isMoving", async () => {
    const quieto = await conGo2();
    view.update(quieto.frames[0]);
    expect(view.hudMoving.textContent).toBe("Quieto");
    expect(view.hudMoving.dataset.on).toBe("false");
    const marcha = paseo("go2", 1, { skip: 12 }).frames[0];
    expect(marcha.derived.isMoving).toBe(true);
    view.update(marcha);
    expect(view.hudMoving.textContent).toBe("En marcha");
    expect(view.hudMoving.dataset.on).toBe("true");
  });

  test("motor más caliente con su semáforo", async () => {
    const { frames } = await conGo2();
    const motores = frames[0].motores.map((m, i) => ({ ...m, temperatura: i === 4 ? 61.4 : 35 }));
    view.update(withFrame(frames[0], { motores }));
    expect(view.hotName.textContent).toBe("FL_thigh");
    expect(view.hotValue.textContent).toBe("61 °C");
    expect(view.hotValue.dataset.level).toBe("crit");
    expect(view.hotDot.dataset.level).toBe("crit");
  });

  test("sin motores no hay más caliente (queda el guion)", async () => {
    const { frames } = await conGo2();
    view.update(withFrame(frames[0], { motores: [] }));
    expect(view.hotName.textContent).toBe("—");
    expect(view.hotDot.dataset.level).toBe("unknown");
  });

  test("patas apoyadas: contador y pips encendidos", async () => {
    const { frames } = await conGo2();
    view.update(withFrame(frames[0], { fuerzas: { FR: 1, FL: 0, RR: 1, RL: 0 } }));
    expect(view.feetCount.textContent).toBe("2/4");
    expect($$(".tw-pip").map((p) => p.dataset.on)).toEqual(["true", "false", "true", "false"]);
  });

  test("conteo del semáforo: verde < 40, amarillo 40–60, rojo > 60", async () => {
    const { frames } = await conGo2();
    const temps = [39, 40, 60, 61, 20, 20, 20, 20, 20, 20, 20, 20];
    view.update(withFrame(frames[0], { motores: frames[0].motores.map((m, i) => ({ ...m, temperatura: temps[i] })) }));
    expect([view.semCounts.ok, view.semCounts.warn, view.semCounts.crit].map((b) => b.textContent)).toEqual(["9", "2", "1"]);
  });

  test("panel de motores: ángulo, temperatura y semáforo de cada uno", async () => {
    const { frames } = await conGo2();
    const motores = frames[0].motores.map((m, i) => ({ ...m, angulo: i === 0 ? -12.6 : 3, temperatura: i === 0 ? 45.5 : 30 }));
    view.update(withFrame(frames[0], { motores }));
    const chip = view.motorChips[0];
    expect(chip.ang.textContent).toBe("−13°");
    expect(chip.temp.textContent).toBe("46°C");
    expect(chip.dot.dataset.level).toBe("warn");
    expect(view.motorChips[1].ang.textContent).toBe("+3°");
    expect(view.motorChips[1].dot.dataset.level).toBe("ok");
  });

  test("motores de más en la muestra (sin fila en el panel) se ignoran", async () => {
    await montar();
    const { info, frames } = paseo("go2");
    view.setInfo({ ...info, motores_nombres: info.motores_nombres.slice(0, 2), patas: ["FR"] });
    expect(() => view.update(frames[0])).not.toThrow();
    expect($$(".tw-m")).toHaveLength(2);
    expect($$(".tw-pip")).toHaveLength(1);
  });

  test("info sin patas: los pips quedan vacíos sin fallar", async () => {
    await montar();
    const { info, frames } = paseo("go2");
    view.setInfo({ ...info, patas: undefined });
    view.update(frames[0]);
    expect(view.feetCount.textContent).toBe(`${frames[0].derived.contacts}/4`);
    expect($$(".tw-pip")).toHaveLength(0);
  });

  test("más patas en info que pips construidos no falla", async () => {
    const { frames } = await conGo2();
    view.info = { ...view.info, patas: [...view.info.patas, "extra"] };
    expect(() => view.update(frames[0])).not.toThrow();
  });
});

/* ================================================================== */

describe("estado, grabación, capturas y tema", () => {
  test("congelado: muestra el aviso y pausa el robot", async () => {
    await montar();
    view.onPause(true);
    expect(view.statusPaused.hidden).toBe(false);
    expect(r3d().setPaused).toHaveBeenLastCalledWith(true);
    view.onPause(false);
    expect(view.statusPaused.hidden).toBe(true);
  });

  test("si al montar ya estaba en pausa, arranca con el aviso", async () => {
    await montar(makeCtx({ paused: true }));
    expect(view.statusPaused.hidden).toBe(false);
    expect(r3d().setPaused).toHaveBeenCalledWith(true);
  });

  test.each([
    [{ state: "live" }, true],
    [{ state: "connecting" }, true],
    [null, true],
    [{ state: "reconnecting" }, false],
    [{ state: "stale" }, false],
    [{ state: "offline" }, false],
  ])("conexión %j → aviso 'Sin datos en vivo' oculto: %s", async (conn, hidden) => {
    await montar();
    view.onConnection(conn);
    expect(view.statusConn.hidden).toBe(hidden);
    expect(view.statusConn.textContent).toBe("Sin datos en vivo · última pose");
  });

  test("grabar: el botón cambia de texto y de estado", async () => {
    await montar();
    view.onRecording(true);
    expect(pressed(view.recBtn)).toBe("true");
    expect(view.recBtn.querySelector("span").textContent).toBe("Detener");
    view.onRecording(false);
    expect(pressed(view.recBtn)).toBe("false");
    expect(view.recBtn.querySelector("span").textContent).toBe("Grabar");
  });

  test("los botones de datos llaman a las acciones globales", async () => {
    await montar();
    const [cap, rec, exp] = $$(".tw-dock [aria-label=Datos] .tw-btn");
    cap.click();
    rec.click();
    exp.click();
    expect(ctx.actions.capture).toHaveBeenCalledOnce();
    expect(ctx.actions.toggleRecording).toHaveBeenCalledOnce();
    expect(ctx.actions.exportCsv).toHaveBeenCalledOnce();
    expect(exp.textContent).toContain("Exportar CSV");
  });

  test("el contador de capturas se actualiza con cada captura", async () => {
    await montar();
    expect(view.capCount.textContent).toBe("0");
    const f = paseo("go2").frames[0];
    ctx.captures.add(f);
    ctx.captures.add(f);
    expect(view.capCount.textContent).toBe("2");
  });

  test("capturas sin subscribe ni size: muestra 0 y no se suscribe", async () => {
    await montar({ ...ctx, captures: {} });
    expect(view.capCount.textContent).toBe("0");
    expect(view._cleanups).toHaveLength(0);
  });

  test("un subscribe que no devuelve función no se guarda como limpieza", async () => {
    await montar({ ...ctx, captures: { size: 3, subscribe: () => undefined } });
    expect(view.capCount.textContent).toBe("3");
    expect(view._cleanups).toHaveLength(0);
  });

  test("onTheme vuelve a leer los colores del 3D", async () => {
    await montar();
    view.onTheme("light");
    expect(r3d().applyTheme).toHaveBeenCalledOnce();
  });

  test("mapeo por índice: lo avisa y marca los motores sin articulación", async () => {
    await montar();
    view.setInfo(paseo("go2").info);
    const motors = view.info.motores_nombres.map((nombre, i) => ({ index: i, nombre, joint: i === 1 ? null : `${nombre}_joint` }));
    r3d().opts.onStatus({ kind: "mapped", motors, mapping: "indice" });
    expect(view.statusMap.hidden).toBe(false);
    expect(view.motorChips[1].btn.hasAttribute("data-unmapped")).toBe(true);
    expect(view.motorChips[0].btn.hasAttribute("data-unmapped")).toBe(false);
    r3d().opts.onStatus({ kind: "mapped", motors: [...motors, { index: 12, nombre: "cola", joint: null }].map((m) => ({ ...m, joint: "x" })), mapping: "nombre" });
    expect(view.statusMap.hidden).toBe(true);
    expect(view.motorChips[1].btn.hasAttribute("data-unmapped")).toBe(false);
  });

  test("otros avisos del 3D (cargando, listo) no tocan el panel", async () => {
    await montar();
    r3d().opts.onStatus({ kind: "loading", progress: 0.4 });
    r3d().opts.onStatus({ kind: "ready", motors: [] });
    expect(view.statusMap.hidden).toBe(true);
  });
});

/* ================================================================== */

describe("cámara, toggles y teclado", () => {
  test("botones de vista: marca la elegida y mueve la cámara", async () => {
    await montar();
    const btns = $$(".tw-btn[data-preset]");
    expect(btns.map(pressed)).toEqual(["true", "false", "false", "false"]);
    btns[2].click();
    expect(btns.map(pressed)).toEqual(["false", "false", "true", "false"]);
    expect(r3d().setPreset).toHaveBeenLastCalledWith("lateral");
    expect(view.presetIndex).toBe(2);
    $(".tw-btn[aria-label='Restablecer cámara']").click();
    expect(r3d().setPreset).toHaveBeenLastCalledWith("perspectiva");
    expect(btns.map(pressed)).toEqual(["true", "false", "false", "false"]);
  });

  test("V recorre las vistas en orden y vuelve al principio; 0 restablece", async () => {
    await montar();
    const vistas = [];
    for (let i = 0; i < 5; i++) {
      expect(key("v")).toBe(true);
      vistas.push(r3d().setPreset.mock.lastCall[0]);
    }
    expect(vistas).toEqual(["arriba", "lateral", "frente", "perspectiva", "arriba"]);
    expect(key("V")).toBe(true);
    expect(view.presetIndex).toBe(2);
    expect(key("0")).toBe(true);
    expect(view.presetIndex).toBe(0);
  });

  test("seguir al robot (F o botón): alterna, se recuerda y se avisa al 3D", async () => {
    await montar();
    expect(pressed(view.followBtn)).toBe("true");
    expect(key("f")).toBe(true);
    expect(view.follow).toBe(false);
    expect(pressed(view.followBtn)).toBe("false");
    expect(r3d().setFollow).toHaveBeenLastCalledWith(false);
    expect(localStorage.getItem("tp05:twin:follow")).toBe("false");
    view.followBtn.click();
    expect(view.follow).toBe(true);
    expect(localStorage.getItem("tp05:twin:follow")).toBe("true");
  });

  test("articulaciones (J o botón): alterna los anillos y se recuerda", async () => {
    await montar();
    expect(key("j")).toBe(true);
    expect(r3d().setMarkers).toHaveBeenLastCalledWith(false);
    expect(pressed(view.jointsBtn)).toBe("false");
    expect(localStorage.getItem("tp05:twin:joints")).toBe("false");
    view.jointsBtn.click();
    expect(r3d().setMarkers).toHaveBeenLastCalledWith(true);
  });

  test("panel de motores (M, botón y cruz): abre, cierra y se recuerda", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    await montar();
    expect(view.panel.dataset.open).toBe("true");
    expect(view.panelBtn.getAttribute("aria-expanded")).toBe("true");
    expect(key("m")).toBe(true);
    expect(view.panel.dataset.open).toBe("false");
    expect(view.panelBtn.getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem("tp05:twin:panel")).toBe("false");
    view.panelBtn.click();
    expect(view.panel.dataset.open).toBe("true");
    $(".tw-panel [aria-label='Cerrar panel de motores']").click();
    expect(view.panel.dataset.open).toBe("false");
    $(".tw-panel [aria-label='Cerrar panel de motores']").click();
    expect(view.panel.dataset.open).toBe("false"); // la cruz siempre cierra
  });

  test("en el celular (< 900 px) el panel arranca cerrado; sin matchMedia, abierto", async () => {
    vi.stubGlobal("matchMedia", (q) => ({ matches: q !== "(min-width: 900px)" }));
    await montar();
    expect(view.panel.dataset.open).toBe("false");
    view.destroy();
    vi.stubGlobal("matchMedia", undefined);
    await montar();
    expect(view.panel.dataset.open).toBe("true");
  });

  test("las preferencias guardadas ganan sobre las de fábrica", async () => {
    localStorage.setItem("tp05:twin:follow", "false");
    localStorage.setItem("tp05:twin:joints", "false");
    localStorage.setItem("tp05:twin:panel", "true");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    await montar();
    expect(r3d().opts).toMatchObject({ follow: false, markers: false });
    expect(pressed(view.followBtn)).toBe("false");
    expect(pressed(view.jointsBtn)).toBe("false");
    expect(view.panel.dataset.open).toBe("true");
  });

  test("si el almacenamiento falla o tiene basura, usa los valores de fábrica y no rompe", async () => {
    localStorage.setItem("tp05:twin:follow", "{no es json");
    await montar();
    expect(view.follow).toBe(true);
    view.destroy();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("lleno");
    });
    await montar();
    expect(view.showJoints).toBe(true);
    expect(() => key("f")).not.toThrow();
    expect(view.follow).toBe(false);
  });

  test("Esc cierra la etiqueta fijada; si no hay ninguna no consume la tecla", async () => {
    await montar();
    expect(key("Escape")).toBe(false);
    r3d().activeMotor = 4;
    expect(key("Escape")).toBe(true);
    expect(r3d().pinMotor).toHaveBeenLastCalledWith(null);
  });

  test("Esc sin robot 3D no consume la tecla", () => {
    view = new TwinView(ctx);
    view.mount(container);
    expect(key("Escape")).toBe(false);
  });

  test("con Ctrl, Cmd o Alt no consume teclas (son del navegador)", async () => {
    await montar();
    expect(key("v", { ctrlKey: true })).toBe(false);
    expect(key("f", { metaKey: true })).toBe(false);
    expect(key("j", { altKey: true })).toBe(false);
    expect(r3d().setPreset).not.toHaveBeenCalled();
    expect(view.follow).toBe(true);
  });

  test("otras teclas no se consumen", async () => {
    await montar();
    expect(key("x")).toBe(false);
    expect(key("ArrowUp")).toBe(false);
    expect(key(" ")).toBe(false);
  });

  test("los toggles antes de que cargue el 3D no fallan", () => {
    view = new TwinView(ctx);
    view.mount(container);
    expect(key("f")).toBe(true);
    expect(key("j")).toBe(true);
    expect(key("v")).toBe(true);
    expect(view.follow).toBe(false);
  });
});

/* ================================================================== */

describe("panel de motores ↔ robot 3D", () => {
  async function conLista() {
    await montar();
    view.setInfo(paseo("go2").info);
    return view.motorChips;
  }

  test("señalar un motor (mouse, foco o clic) lo fija en el robot", async () => {
    const chips = await conLista();
    chips[3].btn.dispatchEvent(new Event("mouseenter"));
    expect(r3d().pinMotor).toHaveBeenLastCalledWith(3);
    chips[5].btn.dispatchEvent(new Event("focus"));
    expect(r3d().pinMotor).toHaveBeenLastCalledWith(5);
    chips[7].btn.click();
    expect(r3d().pinMotor).toHaveBeenLastCalledWith(7);
  });

  test("al salir el mouse se cierra, salvo que el botón tenga el foco", async () => {
    const chips = await conLista();
    chips[3].btn.dispatchEvent(new Event("mouseleave"));
    expect(r3d().pinMotor).toHaveBeenLastCalledWith(null);
    r3d().pinMotor.mockClear();
    chips[4].btn.focus();
    r3d().pinMotor.mockClear();
    chips[4].btn.dispatchEvent(new Event("mouseleave"));
    expect(r3d().pinMotor).not.toHaveBeenCalled();
  });

  test("al perder el foco se cierra solo si ese motor seguía fijado", async () => {
    const chips = await conLista();
    r3d().activeMotor = 2;
    r3d().pinMotor.mockClear();
    chips[1].btn.dispatchEvent(new Event("blur"));
    expect(r3d().pinMotor).not.toHaveBeenCalled();
    chips[2].btn.dispatchEvent(new Event("blur"));
    expect(r3d().pinMotor).toHaveBeenCalledWith(null);
  });

  test("los eventos del panel antes de que cargue el 3D no fallan", () => {
    view = new TwinView(ctx);
    view.mount(container);
    view.setInfo(paseo("go2").info);
    const b = view.motorChips[0].btn;
    for (const ev of ["mouseenter", "focus", "mouseleave", "blur"]) expect(() => b.dispatchEvent(new Event(ev))).not.toThrow();
  });

  test("el motor señalado en el robot se resalta en el panel", async () => {
    const chips = await conLista();
    r3d().opts.onHover(6);
    expect(chips.map((c) => c.btn.hasAttribute("data-active"))).toEqual(chips.map((_, i) => i === 6));
    r3d().opts.onHover(null);
    expect(chips.some((c) => c.btn.hasAttribute("data-active"))).toBe(false);
  });
});

/* ================================================================== */

describe("centro óptico (focusOffset)", () => {
  const rect = (el, r) => (el.getBoundingClientRect = () => ({ left: 0, width: 0, height: 0, top: 0, bottom: 0, ...r }));

  test("sin tamaño todavía: sin corrimiento", async () => {
    await montar();
    expect(r3d().opts.focusOffset()).toEqual({ x: 0, y: 0 });
  });

  test("escritorio: el HUD es angosto, se centra entre el borde de arriba y la barra inferior", async () => {
    await montar();
    rect(view.stage, { top: 50, height: 800, width: 1200 });
    rect(view.hud, { width: 320, bottom: 300 });
    rect(view.dock, { top: 770 });
    // top 0, bottom 720 → centro 360 vs 400
    expect(r3d().opts.focusOffset()).toEqual({ x: 0, y: -40 });
  });

  test("celular: el HUD ocupa el ancho, se centra entre el HUD y la barra inferior", async () => {
    await montar();
    rect(view.stage, { top: 0, height: 800, width: 390 });
    rect(view.hud, { width: 380, bottom: 260 });
    rect(view.dock, { top: 700 });
    expect(r3d().opts.focusOffset()).toEqual({ x: 0, y: 80 });
  });

  test("HUD justo al 60 % del ancho todavía no cuenta como ancho completo", async () => {
    await montar();
    rect(view.stage, { top: 0, height: 800, width: 1000 });
    rect(view.hud, { width: 600, bottom: 260 });
    rect(view.dock, { top: 800 });
    expect(r3d().opts.focusOffset()).toEqual({ x: 0, y: 0 });
  });
});
