import { describe, test, expect, vi, beforeEach } from "vitest";
import { muestras, infoDe, historial, conCambios, crearCtx } from "./helpers.js";

// FigureSwitch (ui/) carga el 3D: acá alcanza con un doble que registre lo que se le pide.
const figuras = vi.hoisted(() => ({ switches: [], toggles: [] }));
vi.mock("../../js/ui/FigureSwitch.js", () => {
  class FigureSwitch {
    constructor(ctx, opts) {
      this.ctx = ctx;
      this.args = opts;
      this.opts = { preset: opts.preset, interactive: opts.interactive, labels: opts.labels };
      for (const m of ["setMode", "setInfo", "update", "setPaused", "applyTheme", "destroy"]) this[m] = vi.fn();
      figuras.switches.push(this);
    }
  }
  function figureToggle(ctx, opts) {
    const el = document.createElement("div");
    el.className = "fig-toggle-falso";
    el.set = vi.fn();
    figuras.toggles.push({ el, ctx, opts });
    return el;
  }
  return { FigureSwitch, figureToggle };
});

const { FeetPanel, spatialOrder } = await import("../../js/views/console/FeetPanel.js");

const GO2 = infoDe("go2");
const G1 = infoDe("g1");

let ctx;
let panel;
beforeEach(() => {
  figuras.switches.length = 0;
  figuras.toggles.length = 0;
  ctx = crearCtx();
  panel = new FeetPanel(ctx);
});

const filas = () => [...panel.legsEl.querySelectorAll(".cv-legrow")];

describe("spatialOrder", () => {
  test("ordena las patas como en el dibujo sin tocar la lista original", () => {
    const patas = ["FR", "FL", "RR", "RL"];
    expect(spatialOrder(patas)).toEqual(["FL", "FR", "RL", "RR"]);
    expect(patas).toEqual(["FR", "FL", "RR", "RL"]);
    expect(spatialOrder(["L_foot", "R_foot"])).toEqual(["R_foot", "L_foot"]);
    expect(spatialOrder([])).toEqual([]);
  });
});

describe("FeetPanel: construcción", () => {
  test("arma la sección Patas con el botón Esquema | 3D compacto", () => {
    expect(panel.el.querySelector("#cv-feet-title").textContent).toBe("Patas");
    expect(figuras.toggles).toHaveLength(1);
    expect(figuras.toggles[0].ctx).toBe(ctx);
    expect(figuras.toggles[0].opts).toEqual({ compact: true });
    expect(panel.el.querySelector("header .fig-toggle-falso")).toBe(panel.toggle);
    expect(panel.figure.firstChild).toBe(panel.schematic);
    expect(panel.fig).toBeNull();
    expect(panel.mode).toBe("esquema");
  });

  test("toma el modo de la ilustración del estado, o esquema si no hay", () => {
    expect(new FeetPanel(crearCtx({ state: { figure: "3d" } })).mode).toBe("3d");
    expect(new FeetPanel(crearCtx({ state: { figure: undefined } })).mode).toBe("esquema");
  });

  test("sin build ni figura, los métodos no fallan", () => {
    expect(() => {
      panel.setPaused(true);
      panel.applyTheme();
      panel.setFigureMode("3d");
      panel.update(muestras("go2", 1)[0], historial());
      panel.destroy();
    }).not.toThrow();
    expect(panel.mode).toBe("3d");
    expect(panel.toggle.set).toHaveBeenCalledWith("3d");
  });
});

describe("FeetPanel: build", () => {
  test("Go2: dibuja el robot desde arriba y una fila por pata en orden espacial", () => {
    panel.build(GO2);
    const svg = panel.schematic.querySelector("svg");
    expect(svg.getAttribute("aria-label")).toBe("Go2 visto desde arriba, con la cabeza hacia arriba");
    expect(svg.querySelectorAll(".cv-foot")).toHaveLength(4);
    expect(filas().map((r) => [r.querySelector("b").textContent, r.title])).toEqual([
      ["FL", "Delantera izquierda"],
      ["FR", "Delantera derecha"],
      ["RL", "Trasera izquierda"],
      ["RR", "Trasera derecha"],
    ]);
    expect(filas()[0].querySelectorAll(".cv-steps i")).toHaveLength(40);
    expect(panel.legs.map((l) => l.foot.tagName.toLowerCase())).toEqual(["circle", "circle", "circle", "circle"]);
    expect(panel.legs[0].foot.getAttribute("cx")).toBe("22");
    expect(panel.legs[0].state.getAttribute("data-down")).toBe("false");
  });

  test("Go2: monta la figura 3D con la cámara de arriba, sin interacción ni etiquetas", () => {
    panel.build(GO2);
    expect(figuras.switches).toHaveLength(1);
    const fig = figuras.switches[0];
    expect(fig.ctx).toBe(ctx);
    expect(fig.args).toEqual({ host: panel.figure, schematic: panel.schematic, preset: "arriba", interactive: false, labels: false });
    expect(fig.setMode).toHaveBeenCalledExactlyOnceWith("esquema");
    expect(fig.setInfo).toHaveBeenCalledExactlyOnceWith(GO2);
  });

  test("G1: lo dibuja de frente, con pie derecho e izquierdo", () => {
    panel.build(G1);
    const svg = panel.schematic.querySelector("svg");
    expect(svg.getAttribute("aria-label")).toBe("G1 visto de frente: su pie derecho está a la izquierda del dibujo");
    expect(filas().map((r) => [r.querySelector("b").textContent, r.title])).toEqual([
      ["Der.", "Pie derecho"],
      ["Izq.", "Pie izquierdo"],
    ]);
    expect(panel.legs.map((l) => [l.pata, l.foot.tagName.toLowerCase(), l.foot.getAttribute("x")])).toEqual([
      ["R_foot", "rect", "34"],
      ["L_foot", "rect", "70"],
    ]);
    expect(figuras.switches[0].opts.preset).toBe("frente");
  });

  test("al cambiar de robot rehace la escena 3D; con el mismo robot la reusa", () => {
    panel.build(GO2);
    panel.build(GO2);
    expect(figuras.switches).toHaveLength(1);
    expect(figuras.switches[0].setInfo).toHaveBeenCalledTimes(2);

    panel.setFigureMode("3d");
    panel.build(G1);
    expect(figuras.switches).toHaveLength(2);
    expect(figuras.switches[0].destroy).toHaveBeenCalledOnce();
    expect(figuras.switches[1].setMode).toHaveBeenCalledExactlyOnceWith("3d");
    expect(figuras.switches[1].setInfo).toHaveBeenCalledExactlyOnceWith(G1);
    expect(panel.fig).toBe(figuras.switches[1]);
  });

  test("un cuadrúpedo sin patas se dibuja igual y avisa que no informa el contacto", () => {
    panel.build({ tipo: "cuadrupedo", patas: [] });
    expect(panel.schematic.querySelector("svg").getAttribute("aria-label")).toContain("Go2");
    expect(panel.legs).toEqual([]);
    expect(panel.legsEl.textContent).toBe("Este robot no informa el contacto de las patas.");
    expect(figuras.switches[0].opts.preset).toBe("arriba");
  });

  test("sin patas ni tipo se dibuja el bípedo", () => {
    panel.build({});
    expect(panel.schematic.querySelector("svg").getAttribute("aria-label")).toContain("G1");
    expect(panel.legsEl.querySelector(".cv-empty")).not.toBeNull();
  });

  test("cuatro patas alcanzan para dibujar el cuadrúpedo aunque el tipo diga otra cosa", () => {
    panel.build({ tipo: "humanoide", patas: ["FR", "FL", "RR", "RL"] });
    expect(panel.schematic.querySelector("svg").getAttribute("aria-label")).toContain("Go2");
  });

  test("una pata desconocida usa su nombre y no tiene pie en el dibujo", () => {
    panel.build({ tipo: "humanoide", patas: ["cola"] });
    expect(filas().map((r) => [r.querySelector("b").textContent, r.title])).toEqual([["cola", "cola"]]);
    expect(panel.legs[0].foot).toBeUndefined();
  });
});

describe("FeetPanel: delegación en la figura", () => {
  beforeEach(() => panel.build(GO2));

  test("setFigureMode guarda el modo, marca el botón y se lo pasa a la figura", () => {
    panel.setFigureMode("3d");
    expect(panel.mode).toBe("3d");
    expect(panel.toggle.set).toHaveBeenCalledWith("3d");
    expect(panel.fig.setMode).toHaveBeenLastCalledWith("3d");
  });

  test("setPaused y applyTheme se pasan a la figura", () => {
    panel.setPaused(true);
    panel.applyTheme();
    expect(panel.fig.setPaused).toHaveBeenCalledExactlyOnceWith(true);
    expect(panel.fig.applyTheme).toHaveBeenCalledOnce();
  });

  test("destroy destruye la figura y la olvida", () => {
    const fig = panel.fig;
    panel.destroy();
    expect(fig.destroy).toHaveBeenCalledOnce();
    expect(panel.fig).toBeNull();
  });
});

describe("FeetPanel: update", () => {
  test("marca cada pata apoyada o en el aire, en la fila y en el dibujo", () => {
    panel.build(GO2);
    const [f0] = muestras("go2", 1);
    const f = conCambios(f0, { fuerzas: { FR: 1, FL: 0, RR: 0, RL: 1 } });
    panel.update(f, historial([f]));
    expect(panel.fig.update).toHaveBeenCalledExactlyOnceWith(f);
    expect(panel.legs.map((l) => [l.pata, l.state.textContent, l.state.getAttribute("data-down"), l.foot.getAttribute("data-down")])).toEqual([
      ["FL", "en el aire", "false", "false"],
      ["FR", "apoyada", "true", "true"],
      ["RL", "apoyada", "true", "true"],
      ["RR", "en el aire", "false", "false"],
    ]);
    expect(panel.sub.textContent).toBe("2 de 4 apoyadas · últimos 0 s");
  });

  test("con pocas muestras el diagrama de apoyos se alinea a la derecha", () => {
    panel.build(GO2);
    const base = muestras("go2", 3);
    const frames = [
      conCambios(base[0], { fuerzas: { FR: 1, FL: 1, RR: 1, RL: 1 } }),
      conCambios(base[1], { fuerzas: { FR: 0, FL: 1, RR: 1, RL: 0 } }),
      conCambios(base[2], { fuerzas: { FR: 1, FL: 0, RR: 0, RL: 1 } }),
    ];
    panel.update(frames[2], historial(frames));
    const fr = panel.legs.find((l) => l.pata === "FR").cells.map((c) => c.getAttribute("data-on"));
    expect(fr.slice(0, 37).every((v) => v === "false")).toBe(true);
    expect(fr.slice(37)).toEqual(["true", "false", "true"]);
    const fl = panel.legs.find((l) => l.pata === "FL").cells.map((c) => c.getAttribute("data-on"));
    expect(fl.slice(37)).toEqual(["true", "true", "false"]);
  });

  test("con 40 muestras o más usa las últimas 40 y dice cuántos segundos abarca", () => {
    panel.build(G1);
    const frames = muestras("g1", 60, { desde: 8 });
    panel.update(frames.at(-1), historial(frames));
    const ultimas = frames.slice(-40);
    const r = panel.legs.find((l) => l.pata === "R_foot").cells.map((c) => c.getAttribute("data-on"));
    expect(r).toEqual(ultimas.map((f) => String(f.fuerzas.R_foot === 1)));
    const span = ultimas.at(-1).ts - ultimas[0].ts;
    const d = frames.at(-1).derived;
    expect(panel.sub.textContent).toBe(`${d.contacts} de 2 apoyadas · últimos ${Math.round(span)} s`);
  });

  test("sin patas solo actualiza la figura", () => {
    panel.build({ tipo: "cuadrupedo", patas: [] });
    const history = { tail: vi.fn(() => []) };
    const [f] = muestras("go2", 1);
    panel.update(f, history);
    expect(panel.fig.update).toHaveBeenCalledExactlyOnceWith(f);
    expect(history.tail).not.toHaveBeenCalled();
    expect(panel.sub.textContent).toBe("");
  });

  test("una pata sin pie dibujado se actualiza igual en la lista", () => {
    panel.build({ tipo: "humanoide", patas: ["cola"] });
    const [f0] = muestras("go2", 1);
    const f = conCambios(f0, { fuerzas: { cola: 1 } });
    panel.update(f, historial([f]));
    expect(panel.legs[0].state.textContent).toBe("apoyada");
    expect(panel.sub.textContent).toBe("1 de 1 apoyadas · últimos 0 s");
  });
});
