import { describe, test, expect, vi } from "vitest";
import { Callouts } from "../../js/views/body/callouts.js";
import { RobotFigure } from "../../js/views/body/robotFigure.js";
import { frame, infoFor, setRect, simFrames } from "./helpers.js";

function setup(info = infoFor("go2"), { scale = 20 } = {}) {
  const onSelect = vi.fn();
  const figure = new RobotFigure({ onSelect: vi.fn() });
  figure.build(info);
  const c = new Callouts({ figure, onSelect, torqueScale: () => scale });
  c.build(info, figure.kind);
  return { c, figure, onSelect };
}

const titles = (col) => [...col.querySelectorAll(".bd-group__title > span:first-child")].map((s) => s.textContent);
const cardNames = (group) => [...group.querySelectorAll(".bd-card__name")].map((s) => s.textContent);
const attrs = (line, ...names) => names.map((n) => line.getAttribute(n));

/** Deja el escenario "visible" y con medidas fijas. */
function layout(c, figure, { visible = true, stageWidth = 800 } = {}) {
  const stage = document.createElement("section");
  setRect(stage, { left: 10, top: 20, width: stageWidth, height: 600 });
  setRect(figure.el, { left: 210, top: 70, width: 430, height: 430 });
  setRect(c.lines, { left: 10, top: 20, width: stageWidth, height: 600 });
  Object.defineProperty(c.colL, "offsetParent", { value: visible ? stage : null, configurable: true });
  c.leaders.forEach((L, i) => setRect(L.el, { left: 100 + i, top: 100 + 10 * i, width: 80, height: 20 }));
  return stage;
}

describe("Callouts › Go2", () => {
  test("una tarjeta por motor, agrupadas por pata en las cuatro esquinas", () => {
    const { c } = setup();
    expect(c.nodes).toEqual([c.lines, c.colL, c.colR]);
    expect(c.colL.dataset.kind).toBe("quad");
    expect(c.colR.dataset.kind).toBe("quad");
    expect(titles(c.colL)).toEqual(["FL · Delantera izq.", "RL · Trasera izq."]);
    expect(titles(c.colR)).toEqual(["FR · Delantera der.", "RR · Trasera der."]);
    expect(c.cards.size).toBe(12);
  });

  test("en las delanteras la pantorrilla va arriba para que las líneas no se crucen", () => {
    const { c } = setup();
    const [fl, rl] = c.colL.querySelectorAll(".bd-group");
    expect(cardNames(fl)).toEqual(["FL_calf", "FL_thigh", "FL_hip"]);
    expect(cardNames(rl)).toEqual(["RL_hip", "RL_thigh", "RL_calf"]);
  });

  test("una línea guía por motor, del lado de su columna, y la de la selección al final", () => {
    const { c } = setup();
    expect(c.leaders).toHaveLength(12);
    expect(c.leaders.filter((L) => L.side === "l").map((L) => L.joint)).toEqual(["FL_calf", "FL_thigh", "FL_hip", "RL_hip", "RL_thigh", "RL_calf"]);
    expect(c.leaders.every((L) => L.el === c.cards.get(L.joint).el)).toBe(true);
    expect(c.lines.children).toHaveLength(13);
    expect(c.lines.lastChild).toBe(c.selectedLine);
  });

  test("cada pata muestra su estado de apoyo", () => {
    const { c } = setup();
    expect([...c.legStatus.keys()]).toEqual(["FL", "RL", "FR", "RR"]);
    c.update(frame({ fuerzas: { FL: 1, RL: 0, FR: 1, RR: 0 } }));
    expect(c.legStatus.get("FL").el.textContent).toBe("apoyada");
    expect(c.legStatus.get("FL").el.dataset.down).toBe("true");
    expect(c.legStatus.get("RL").el.textContent).toBe("en el aire");
    expect(c.legStatus.get("RL").el.dataset.down).toBe("false");
    // sin cambios no reescribe
    c.legStatus.get("FL").el.textContent = "marca";
    c.update(frame({ fuerzas: { FL: 1, RL: 0, FR: 1, RR: 0 } }));
    expect(c.legStatus.get("FL").el.textContent).toBe("marca");
  });

  test("solo arma las patas que informa el robot", () => {
    const { c } = setup({ patas: ["FR"], motores_nombres: ["FR_hip", "FL_hip"] });
    expect(titles(c.colL)).toEqual([]);
    expect(titles(c.colR)).toEqual(["FR · Delantera der."]);
    expect([...c.cards.keys()]).toEqual(["FR_hip"]);
  });

  test("la tarjeta lleva el nombre completo y al tocarla elige el motor", () => {
    const { c, onSelect } = setup();
    const card = c.cards.get("RR_calf").el;
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("title")).toBe("RR_calf: ver el detalle");
    expect(card.querySelector(".bd-card__name").textContent).toBe("RR_calf");
    expect(card.className).toBe("bd-card bd-card--card");
    card.click();
    expect(onSelect).toHaveBeenCalledWith("RR_calf");
  });
});

describe("Callouts › G1", () => {
  test("filas compactas por grupo: el lado derecho del robot a la izquierda de la pantalla", () => {
    const { c } = setup(infoFor("g1"));
    expect(c.kind).toBe("humanoid");
    expect(titles(c.colL)).toEqual(["Brazo derecho", "Pierna derecha"]);
    expect(titles(c.colR)).toEqual(["Torso", "Brazo izquierdo", "Pierna izquierda"]);
    expect(c.cards.size).toBe(29);
    expect(c.cards.get("L_knee").el.className).toBe("bd-card bd-card--row");
  });

  test("los nombres de las filas se acortan", () => {
    const { c } = setup(infoFor("g1"));
    const short = (n) => c.cards.get(n).el.querySelector(".bd-card__name").textContent;
    expect(short("L_shoulder_pitch")).toBe("sh_pitch");
    expect(short("R_wrist_yaw")).toBe("wr_yaw");
    expect(short("L_ankle_roll")).toBe("ank_roll");
    expect(short("torso_yaw")).toBe("yaw");
    expect(short("R_knee")).toBe("knee");
  });

  test("una línea por grupo, al motor del medio", () => {
    const { c } = setup(infoFor("g1"));
    expect(c.leaders.map((L) => [L.side, L.joint])).toEqual([
      ["l", "R_elbow"], ["l", "R_knee"], ["r", "torso_roll"], ["r", "L_elbow"], ["r", "L_knee"],
    ]);
    expect(c.leaders.every((L) => L.el.classList.contains("bd-group__title"))).toBe(true);
  });

  test("solo las piernas llevan el estado del pie", () => {
    const { c } = setup(infoFor("g1"));
    expect([...c.legStatus.keys()]).toEqual(["R_foot", "L_foot"]);
    c.update(frame({ fuerzas: { R_foot: 1, L_foot: 0 } }));
    expect(c.legStatus.get("R_foot").el.textContent).toBe("pie apoyado");
    expect(c.legStatus.get("L_foot").el.textContent).toBe("en el aire");
  });

  test("sin patas informadas no hay estado de pie; los grupos desconocidos van a la derecha al final", () => {
    const info = { tipo: "humanoide", motores_nombres: ["aux_a", "L_knee", "otro_b", "R_knee"] };
    const { c } = setup(info);
    expect(c.legStatus.size).toBe(0);
    expect(titles(c.colL)).toEqual(["Pierna derecha"]);
    expect(titles(c.colR)).toEqual(["Pierna izquierda", "Otros"]);
    expect(cardNames(c.colR.lastChild)).toEqual(["aux_a", "otro_b"]);
  });

  test("los desconocidos quedan al final aunque aparezcan últimos en la lista", () => {
    const { c } = setup({ tipo: "humanoide", motores_nombres: ["L_knee", "R_knee", "aux_a"] });
    expect(titles(c.colR)).toEqual(["Pierna izquierda", "Otros"]);
  });
});

describe("Callouts › otros robots", () => {
  test("un robot genérico no tiene tarjetas, solo la línea de selección", () => {
    const { c } = setup({ motores_nombres: ["a"] });
    expect(c.cards.size).toBe(0);
    expect([...c.lines.children]).toEqual([c.selectedLine]);
  });

  test("sin info tampoco falla", () => {
    const figure = new RobotFigure({ onSelect: vi.fn() });
    const c = new Callouts({ figure, onSelect: vi.fn(), torqueScale: () => 10 });
    c.build(null, "generic");
    expect(c.cards.size).toBe(0);
  });

  test("reconstruir limpia columnas, líneas y estados", () => {
    const { c } = setup();
    c.build(infoFor("g1"), "humanoid");
    expect(c.cards.has("FR_hip")).toBe(false);
    expect(c.leaders).toHaveLength(5);
    expect(c.lines.children).toHaveLength(6);
    expect(c.colL.dataset.kind).toBe("humanoid");
  });
});

describe("Callouts › tarjetas", () => {
  test("temperatura con semáforo y torque con barra relativa a la escala", () => {
    const { c } = setup();
    c.update(frame({ motores: [["FR_hip", 45.26, { torque: 10 }], ["fantasma", 99]] }));
    const card = c.cards.get("FR_hip");
    expect(card.temp.textContent).toBe("45.3 °C");
    expect(card.tq.textContent).toBe("10.0 N·m");
    expect(card.el.dataset.level).toBe("warn");
    expect(card.bar.style.transform).toBe("scaleX(0.500)");
  });

  test("la barra solo se mueve con cambios mayores a 0,4 % y se satura en 100 %", () => {
    const { c } = setup();
    const bar = c.cards.get("FR_hip").bar;
    const tq = (torque) => {
      c.update(frame({ motores: [["FR_hip", 30, { torque }]] }));
      return bar.style.transform;
    };
    expect(tq(10)).toBe("scaleX(0.500)");
    expect(tq(10.06)).toBe("scaleX(0.500)");
    expect(tq(10.1)).toBe("scaleX(0.505)");
    expect(tq(-40)).toBe("scaleX(1.000)");
    expect(tq(0)).toBe("scaleX(0.000)");
  });

  test("un motor en rojo marca su línea guía, y se desmarca al enfriarse", () => {
    const { c } = setup();
    const line = c.leaders.find((L) => L.joint === "FR_calf").line;
    c.update(frame({ motores: [["FR_calf", 61]] }));
    expect(c.cards.get("FR_calf").el.dataset.level).toBe("crit");
    expect(line.classList.contains("is-hot")).toBe(true);
    c.update(frame({ motores: [["FR_calf", 50]] }));
    expect(line.classList.contains("is-hot")).toBe(false);
    c.cards.get("FR_calf").el.dataset.level = "marca";
    c.update(frame({ motores: [["FR_calf", 51]] }));
    expect(c.cards.get("FR_calf").el.dataset.level).toBe("marca");
  });

  test("en el G1 cambia el nivel de un motor sin línea propia", () => {
    const { c } = setup(infoFor("g1"));
    c.update(frame({ motores: [["L_wrist_yaw", 70]] }));
    expect(c.cards.get("L_wrist_yaw").el.dataset.level).toBe("crit");
    expect(c.lines.querySelector(".is-hot")).toBeNull();
  });

  test("marca solo la tarjeta elegida", () => {
    const { c } = setup();
    c.setSelected("RL_hip");
    expect([...c.cards].filter(([, x]) => x.el.classList.contains("is-selected")).map(([n]) => n)).toEqual(["RL_hip"]);
    expect(c.selected).toBe("RL_hip");
  });

  test("con datos reales del simulador llena todas las tarjetas", () => {
    for (const modelo of ["go2", "g1"]) {
      const { c } = setup(infoFor(modelo));
      const f = simFrames(modelo, 4).at(-1);
      c.update(f);
      for (const m of f.motores) expect(c.cards.get(m.nombre).temp.textContent).toBe(`${m.temperatura.toFixed(1)} °C`);
    }
  });
});

describe("Callouts › líneas guía", () => {
  test("measure ubica el inicio de cada línea en el borde de su tarjeta y el final en la articulación", () => {
    const { c, figure } = setup();
    figure.resize(430);
    const stage = layout(c, figure);
    c.measure(stage);
    expect(c.origin).toEqual([200, 50]);
    expect(c.lines.style.display).toBe("");
    const left = c.leaders[0]; // FL_calf, columna izquierda: sale del borde derecho de la tarjeta
    expect(left.side).toBe("l");
    expect(attrs(left.line, "x1", "y1")).toEqual(["170.0", "90.0"]);
    const right = c.leaders.find((L) => L.side === "r"); // sale del borde izquierdo
    const i = c.leaders.indexOf(right);
    expect(attrs(right.line, "x1", "y1")).toEqual([(100 + i - 10).toFixed(1), (100 + 10 * i + 10 - 20).toFixed(1)]);
    const [px, py] = figure.project(left.joint);
    expect(attrs(left.line, "x2", "y2")).toEqual([(200 + px).toFixed(1), (50 + py).toFixed(1)]);
  });

  test("si las columnas no se ven (celular) oculta las líneas y no mide", () => {
    const { c, figure } = setup();
    figure.resize(430);
    const stage = layout(c, figure, { visible: false });
    c.measure(stage);
    expect(c.lines.style.display).toBe("none");
    expect(c.leaders[0].line.getAttribute("x1")).toBeNull();
    c.placeLines();
    expect(c.leaders[0].line.getAttribute("x2")).toBeNull();
  });

  test("con el escenario sin ancho tampoco se ven", () => {
    const { c, figure } = setup();
    const stage = layout(c, figure, { stageWidth: 0 });
    c.measure(stage);
    expect(c.visible).toBe(false);
    expect(c.lines.style.display).toBe("none");
  });

  test("placeLines antes de medir no hace nada", () => {
    const { c, figure } = setup();
    figure.resize(430);
    c.visible = true;
    c.placeLines();
    expect(c.leaders[0].line.getAttribute("x2")).toBeNull();
  });

  test("las líneas siguen al robot inclinado, pero no se reescriben por menos de 0,3 px", () => {
    const { c, figure } = setup();
    figure.resize(430);
    c.measure(layout(c, figure));
    const line = c.leaders[0].line;
    const spy = vi.spyOn(line, "setAttribute");
    c.update(frame());
    expect(spy).not.toHaveBeenCalled();
    figure.update(frame({ imu: { pitch: 8 } }), { reducedMotion: false });
    c.placeLines();
    const [px, py] = figure.project("FL_calf");
    expect(spy).toHaveBeenCalledWith("x2", (200 + px).toFixed(1));
    expect(spy).toHaveBeenCalledWith("y2", (50 + py).toFixed(1));
  });

  test("sin tamaño del dibujo no mueve el extremo de las líneas", () => {
    const { c, figure } = setup();
    c.measure(layout(c, figure));
    expect(c.leaders[0].line.getAttribute("x1")).toBe("170.0");
    expect(c.leaders[0].line.getAttribute("x2")).toBeNull();
  });

  test("Go2: la tarjeta elegida no lleva línea extra", () => {
    const { c, figure } = setup();
    figure.resize(430);
    c.measure(layout(c, figure));
    c.setSelected("FL_calf");
    expect(c.sel).toBeNull();
    expect(c.selectedLine.style.display).toBe("none");
  });

  test("G1: la fila elegida se une a su articulación", () => {
    const { c, figure } = setup(infoFor("g1"));
    figure.resize(430);
    c.measure(layout(c, figure));
    const card = c.cards.get("R_wrist_roll").el; // columna izquierda
    setRect(card, { left: 40, top: 300, width: 90, height: 16 });
    c.setSelected("R_wrist_roll");
    expect(c.selectedLine.style.display).toBe("");
    expect(attrs(c.selectedLine, "x1", "y1")).toEqual(["120.0", "288.0"]);
    const [px, py] = figure.project("R_wrist_roll");
    expect(attrs(c.selectedLine, "x2", "y2")).toEqual([(200 + px).toFixed(1), (50 + py).toFixed(1)]);

    const right = c.cards.get("L_knee").el; // columna derecha: sale del borde izquierdo
    setRect(right, { left: 700, top: 400, width: 90, height: 16 });
    c.setSelected("L_knee");
    expect(attrs(c.selectedLine, "x1", "y1")).toEqual(["690.0", "388.0"]);

    // al inclinarse el robot, el extremo de la línea de la selección también se mueve
    figure.update(frame({ imu: { roll: 6 } }), { reducedMotion: false });
    c.placeLines();
    const [qx, qy] = figure.project("L_knee");
    expect(attrs(c.selectedLine, "x2", "y2")).toEqual([(200 + qx).toFixed(1), (50 + qy).toFixed(1)]);
  });

  test("G1: al medir de nuevo recalcula el inicio de la línea de la selección", () => {
    const { c, figure } = setup(infoFor("g1"));
    figure.resize(430);
    const stage = layout(c, figure);
    c.measure(stage);
    setRect(c.cards.get("L_knee").el, { left: 700, top: 400, width: 90, height: 16 });
    c.setSelected("L_knee");
    setRect(c.cards.get("L_knee").el, { left: 600, top: 200, width: 90, height: 16 });
    c.measure(stage);
    expect(c.sel).toEqual({ x1: 590, y1: 188 });
  });

  test("G1: una selección desconocida, oculta o sin proyección no dibuja la línea", () => {
    const { c, figure } = setup(infoFor("g1"));
    figure.resize(430);
    c.measure(layout(c, figure));
    c.setSelected("nada");
    expect(c.sel).toBeNull();
    expect(c.selectedLine.style.display).toBe("none");

    c.setSelected("L_knee");
    expect(c.selectedLine.style.display).toBe("");
    figure.resize(0);
    c.setSelected("L_knee");
    expect(c.selectedLine.style.display).toBe("none");
    // con la selección medida pero sin proyección, placeLines no la toca
    c.selectedLine.setAttribute("x2", "marca");
    c.placeLines();
    expect(c.selectedLine.getAttribute("x2")).toBe("marca");

    figure.resize(430);
    c.measure(layout(c, figure, { visible: false }));
    c.setSelected("L_knee");
    expect(c.sel).toBeNull();
  });
});
