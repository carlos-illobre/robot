import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { FigureSwitch, figureToggle } from "../../js/ui/FigureSwitch.js";

// RobotScene (Gemelo 3D, three.js) es de otra área: se reemplaza por un doble.
const escena = vi.hoisted(() => ({ soportado: true, completa: true, instancias: [] }));
vi.mock("../../js/views/twin/RobotScene.js", () => ({
  RobotScene: class {
    static isSupported() {
      return escena.soportado;
    }
    constructor(layer, opts) {
      this.layer = layer;
      this.opts = opts;
      this.calls = [];
      const rec = (name) => (...args) => this.calls.push([name, ...args]);
      this.setInfo = rec("setInfo");
      this.update = rec("update");
      this.destroy = rec("destroy");
      if (escena.completa) {
        this.setPaused = rec("setPaused");
        this.resize = rec("resize");
        this.applyTheme = rec("applyTheme");
      }
      escena.instancias.push(this);
    }
  },
}));

const toastSpy = vi.hoisted(() => ({ calls: [] }));
vi.mock("../../js/ui/toast.js", () => ({ toast: (...args) => toastSpy.calls.push(args) }));

let host, schematic, ctx;
const nuevo = (opts = {}) => new FigureSwitch(ctx, { host, schematic, ...opts });

beforeEach(() => {
  escena.soportado = true;
  escena.completa = true;
  escena.instancias.length = 0;
  toastSpy.calls.length = 0;
  host = document.createElement("div");
  schematic = document.createElement("svg");
  host.append(schematic);
  document.body.append(host);
  ctx = { state: { torqueAlarm: 18, latest: null, paused: false, figure: "esquema" }, actions: { setFigureMode: vi.fn() } };
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("FigureSwitch", () => {
  test("arranca en esquema con una capa 3D oculta dentro del contenedor", () => {
    const fig = nuevo();
    expect(fig.mode).toBe("esquema");
    expect(fig.is3D).toBe(false);
    expect(fig.scene).toBeNull();
    expect(fig.layer.className).toBe("fig3d");
    expect(fig.layer.hidden).toBe(true);
    expect(fig.layer.parentNode).toBe(host);
    expect(fig.opts).toEqual({ preset: "perspectiva", interactive: true, labels: true });
  });

  test("pasar a 3D crea la escena con las opciones, la muestra y oculta el esquema", async () => {
    const fig = nuevo({ preset: "arriba", interactive: false, labels: false });
    await fig.setMode("3d");
    expect(fig.is3D).toBe(true);
    expect(escena.instancias).toHaveLength(1);
    const sc = fig.scene;
    expect(sc.layer).toBe(fig.layer);
    expect(sc.opts).toMatchObject({ background: "transparent", interactive: false, labels: false, preset: "arriba", follow: true });
    ctx.state.torqueAlarm = 25;
    expect(sc.opts.torqueAlarm()).toBe(25);
    expect(sc.calls).toEqual([["setPaused", false]]);
    expect(fig.layer.hidden).toBe(false);
    expect(schematic.style.visibility).toBe("hidden");
    expect(host.classList.contains("is-3d")).toBe(true);
    vi.advanceTimersByTime(20);
    expect(sc.calls.at(-1)).toEqual(["resize"]);
  });

  test("al pasar a 3D le da a la escena la info y la última muestra que ya había", async () => {
    const fig = nuevo();
    const info = { modelo: "g1", n_motores: 29 };
    const frame = { modelo: "g1" };
    fig.setInfo(info);
    ctx.state.latest = frame;
    ctx.state.paused = true;
    await fig.setMode("3d");
    expect(fig.scene.calls).toEqual([["setInfo", info], ["update", frame], ["setPaused", true]]);
  });

  test("volver al esquema oculta el 3D y reusa la misma escena después", async () => {
    const fig = nuevo();
    await fig.setMode("3d");
    const sc = fig.scene;
    await fig.setMode("esquema");
    expect(fig.is3D).toBe(false);
    expect(fig.layer.hidden).toBe(true);
    expect(schematic.style.visibility).toBe("");
    expect(host.classList.contains("is-3d")).toBe(false);
    await fig.setMode("3d");
    expect(fig.scene).toBe(sc);
    expect(escena.instancias).toHaveLength(1);
  });

  test("pedir el modo actual no hace nada", async () => {
    const fig = nuevo();
    await fig.setMode("esquema");
    expect(fig.token).toBe(0);
    await fig.setMode("3d");
    await fig.setMode("3d");
    expect(fig.token).toBe(1);
    expect(escena.instancias).toHaveLength(1);
  });

  test("si cambia de idea mientras carga el 3D, no lo muestra", async () => {
    const fig = nuevo();
    const carga = fig.setMode("3d");
    await fig.setMode("esquema");
    await carga;
    expect(fig.mode).toBe("esquema");
    expect(fig.scene).toBeNull();
    expect(fig.layer.hidden).toBe(true);
    expect(escena.instancias).toHaveLength(0);
  });

  test("sin WebGL avisa y se queda en el esquema", async () => {
    escena.soportado = false;
    const fig = nuevo();
    await fig.setMode("3d");
    expect(fig.mode).toBe("esquema");
    expect(fig.scene).toBeNull();
    expect(fig.layer.hidden).toBe(true);
    expect(toastSpy.calls).toEqual([["Este navegador no puede mostrar 3D (WebGL): se muestra el esquema", { kind: "warn" }]]);
  });

  test("sin esquema (schematic) también alterna la capa", async () => {
    const fig = new FigureSwitch(ctx, { host });
    expect(fig.schematic).toBeNull();
    await fig.setMode("3d");
    expect(fig.layer.hidden).toBe(false);
    await fig.setMode("esquema");
    expect(fig.layer.hidden).toBe(true);
    fig.destroy();
    expect(fig.layer.isConnected).toBe(false);
  });

  test("update() solo llega a la escena en modo 3D", async () => {
    const fig = nuevo();
    fig.update({ ts: 1 });
    await fig.setMode("3d");
    fig.update({ ts: 2 });
    await fig.setMode("esquema");
    fig.update({ ts: 3 });
    expect(fig.scene.calls.filter(([n]) => n === "update")).toEqual([["update", { ts: 2 }]]);
  });

  test("update() en 3D mientras la escena todavía carga no falla", () => {
    const fig = nuevo();
    fig.setMode("3d");
    expect(fig.is3D).toBe(true);
    expect(() => fig.update({ ts: 1 })).not.toThrow();
  });

  test("setInfo(), setPaused() y applyTheme() se reenvían a la escena", async () => {
    const fig = nuevo();
    fig.setInfo({ modelo: "go2" });
    fig.setPaused(true);
    fig.applyTheme();
    expect(fig.info).toEqual({ modelo: "go2" });
    await fig.setMode("3d");
    const sc = fig.scene;
    sc.calls.length = 0;
    fig.setInfo({ modelo: "g1" });
    fig.setPaused(true);
    fig.applyTheme();
    expect(sc.calls).toEqual([["setInfo", { modelo: "g1" }], ["setPaused", true], ["applyTheme"]]);
  });

  test("tolera escenas sin setPaused, resize ni applyTheme", async () => {
    escena.completa = false;
    const fig = nuevo();
    await fig.setMode("3d");
    vi.advanceTimersByTime(20);
    fig.setPaused(true);
    fig.applyTheme();
    expect(fig.scene.calls).toEqual([]);
  });

  test("si se destruye antes del cuadro siguiente, no redimensiona", async () => {
    const fig = nuevo();
    await fig.setMode("3d");
    const sc = fig.scene;
    fig.destroy();
    vi.advanceTimersByTime(20);
    expect(sc.calls.map(([n]) => n)).toEqual(["setPaused", "destroy"]);
  });

  test("destroy() destruye la escena, saca la capa y restaura el esquema", async () => {
    const fig = nuevo();
    await fig.setMode("3d");
    const sc = fig.scene;
    const token = fig.token;
    fig.destroy();
    expect(sc.calls.at(-1)).toEqual(["destroy"]);
    expect(fig.scene).toBeNull();
    expect(fig.token).toBe(token + 1);
    expect(fig.layer.isConnected).toBe(false);
    expect(schematic.style.visibility).toBe("");
  });

  test("destroy() durante la carga cancela el 3D", async () => {
    const fig = nuevo();
    const carga = fig.setMode("3d");
    fig.destroy();
    await carga;
    expect(escena.instancias).toHaveLength(0);
  });
});

describe("figureToggle()", () => {
  const radios = (el) => [...el.querySelectorAll("button")].map((b) => [b.dataset.mode, b.textContent, b.getAttribute("aria-checked")]);

  test("arma el botón segmentado Esquema | 3D real marcando la preferencia", () => {
    ctx.state.figure = "3d";
    const el = figureToggle(ctx);
    expect(el.className).toBe("fig-toggle");
    expect(el.getAttribute("role")).toBe("radiogroup");
    expect(el.getAttribute("aria-label")).toBe("Ilustración del robot (tecla G)");
    expect(el.title).toBe("Esquema simplificado o modelo 3D real (tecla G)");
    expect(radios(el)).toEqual([["esquema", "Esquema", "false"], ["3d", "3D real", "true"]]);
    for (const b of el.querySelectorAll("button")) {
      expect(b.type).toBe("button");
      expect(b.getAttribute("role")).toBe("radio");
    }
  });

  test("en versión compacta dice solo 3D", () => {
    const el = figureToggle(ctx, { compact: true });
    expect(el.className).toBe("fig-toggle fig-toggle--compact");
    expect(radios(el)).toEqual([["esquema", "Esquema", "true"], ["3d", "3D", "false"]]);
  });

  test("al hacer clic pide el modo y set() marca el elegido", () => {
    const el = figureToggle(ctx);
    el.querySelector('[data-mode="3d"]').click();
    expect(ctx.actions.setFigureMode).toHaveBeenCalledExactlyOnceWith("3d");
    el.querySelector('[data-mode="esquema"]').click();
    expect(ctx.actions.setFigureMode).toHaveBeenLastCalledWith("esquema");
    el.set("3d");
    expect(radios(el).map((r) => r[2])).toEqual(["false", "true"]);
    el.set("esquema");
    expect(radios(el).map((r) => r[2])).toEqual(["true", "false"]);
  });
});
