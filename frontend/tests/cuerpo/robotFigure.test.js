import { describe, test, expect, vi } from "vitest";
import { RobotFigure, bodyKind, TILT_GAIN } from "../../js/views/body/robotFigure.js";
import { frame, infoFor, simFrames } from "./helpers.js";

const VB = 430;

function figure(info = infoFor("go2")) {
  const onSelect = vi.fn();
  const fig = new RobotFigure({ onSelect });
  fig.build(info);
  return { fig, onSelect };
}

/** Centro del punto de un motor (cx, cy del círculo principal). */
const dot = (fig, n) => {
  const c = fig.joints.get(n).g.querySelector(".bd-joint__dot");
  return [Number(c.getAttribute("cx")), Number(c.getAttribute("cy")), Number(c.getAttribute("r"))];
};

describe("bodyKind", () => {
  test("patas FR/FL/RR/RL → cuadrúpedo", () => {
    expect(bodyKind(infoFor("go2"))).toBe("quad");
    expect(bodyKind({ patas: ["RL"] })).toBe("quad");
  });
  test("tipo humanoide o pies → humanoide", () => {
    expect(bodyKind(infoFor("g1"))).toBe("humanoid");
    expect(bodyKind({ tipo: "humanoide" })).toBe("humanoid");
    expect(bodyKind({ patas: ["X_foot"] })).toBe("humanoid");
  });
  test("cualquier otra cosa → genérico", () => {
    expect(bodyKind(null)).toBe("generic");
    expect(bodyKind(undefined)).toBe("generic");
    expect(bodyKind({})).toBe("generic");
    expect(bodyKind({ tipo: "brazo", patas: ["FRX", "pie"] })).toBe("generic");
  });
});

describe("RobotFigure › construcción", () => {
  test("la estructura base: sombra, caja inclinable y SVG con viewBox centrado", () => {
    const fig = new RobotFigure({ onSelect: vi.fn() });
    expect(fig.el.className).toBe("bd-robotbox");
    expect(fig.el.children[0]).toBe(fig.shadow);
    expect(fig.tilt.firstChild).toBe(fig.svg);
    expect(fig.svg.getAttribute("viewBox")).toBe("-215 -215 430 430");
    expect(fig.project("FR_hip")).toBeNull();
  });

  test("el anillo de rumbo: 36 marcas, 4 mayores y los puntos cardinales", () => {
    const { fig } = figure();
    expect(fig.ring.querySelectorAll("line")).toHaveLength(36);
    const majors = fig.ring.querySelectorAll(".bd-ring__tick--major");
    expect(majors).toHaveLength(4);
    const north = majors[0];
    expect([north.getAttribute("x1"), north.getAttribute("y1"), north.getAttribute("y2")].map(Number)).toEqual([0, -188, -200]);
    // a 30° la marca es mediana (r 192) y a 10° corta (r 195)
    const ticks = [...fig.ring.querySelectorAll("line")];
    expect(Math.hypot(Number(ticks[3].getAttribute("x1")), Number(ticks[3].getAttribute("y1")))).toBeCloseTo(192);
    expect(Math.hypot(Number(ticks[1].getAttribute("x1")), Number(ticks[1].getAttribute("y1")))).toBeCloseTo(195);
    expect([...fig.ring.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["N", "E", "S", "O"]);
    expect(fig.ring.querySelector(".bd-ring__label--north").textContent).toBe("N");
    expect(fig.svg.querySelector(".bd-ring__heading").getAttribute("d")).toBe("M0 -203 l-7 -10 h14 z");
  });

  test("Go2: 12 motores en las patas, 4 pies y el cuerpo-batería", () => {
    const { fig } = figure();
    expect(fig.kind).toBe("quad");
    expect(fig.el.dataset.kind).toBe("quad");
    expect(fig.svg.getAttribute("aria-label")).toMatch(/visto desde arriba/);
    expect(fig.joints.size).toBe(12);
    expect([...fig.feet.keys()]).toEqual(["FR", "FL", "RR", "RL"]);
    expect(fig.svg.querySelectorAll(".bd-limbs path")).toHaveLength(4);
    expect(fig.svg.querySelectorAll(".bd-eye")).toHaveLength(2);
    expect(fig.batSub.textContent).toBe("batería");
    expect(fig.batFill.getAttribute("x")).toBe("-54");
    // la batería está recortada por su clipPath
    const clipId = fig.svg.querySelector("clipPath").id;
    expect(fig.batFill.getAttribute("clip-path")).toBe(`url(#${clipId})`);
  });

  test("Go2: cadera, muslo y pantorrilla caen en los codos de cada pata", () => {
    const { fig } = figure();
    expect(dot(fig, "FR_hip")).toEqual([42, -85, 7.5]);
    expect(dot(fig, "FR_thigh")).toEqual([80, -105, 8.5]);
    expect(dot(fig, "FR_calf")).toEqual([104, -137, 8.5]);
    expect(dot(fig, "FL_hip")).toEqual([-42, -85, 7.5]);
    expect(dot(fig, "RR_calf")).toEqual([104, 137, 8.5]);
    expect(dot(fig, "RL_thigh")).toEqual([-80, 105, 8.5]);
  });

  test("Go2: el pie lleva su rótulo hacia afuera y el nombre en el title", () => {
    const { fig } = figure();
    const fr = fig.feet.get("FR").foot;
    expect([fr.getAttribute("cx"), fr.getAttribute("cy"), fr.getAttribute("r")].map(Number)).toEqual([118, -161, 13]);
    expect(fr.querySelector("title").textContent).toBe("FR");
    const labels = [...fig.svg.querySelectorAll(".bd-foot__label")];
    expect(labels.map((l) => [l.textContent, Number(l.getAttribute("x")), Number(l.getAttribute("y"))])).toEqual([
      ["FR", 145, -157], ["FL", -145, -157], ["RR", 145, 165], ["RL", -145, 165],
    ]);
  });

  test("con otra cantidad de motores por pata se reparten a lo largo de la pata", () => {
    const { fig } = figure({ patas: ["FR", "RL"], motores_nombres: ["FR_a", "FR_b", "FR_c", "FR_d", "RL_solo"] });
    expect(dot(fig, "FR_a").slice(0, 2)).toEqual([42, -85]);
    expect(dot(fig, "FR_d").slice(0, 2)).toEqual([104, -137]);
    // un tercio y dos tercios del recorrido de la pata
    const seg1 = Math.hypot(38, 20);
    const seg2 = Math.hypot(24, 32);
    const third = (seg1 + seg2) / 3;
    const [bx, by] = dot(fig, "FR_b");
    expect(bx).toBeCloseTo(42 + (38 * third) / seg1);
    expect(by).toBeCloseTo(-85 - (20 * third) / seg1);
    const rest = (2 * third) - seg1;
    const [cx, cy] = dot(fig, "FR_c");
    expect(cx).toBeCloseTo(80 + (24 * rest) / seg2);
    expect(cy).toBeCloseTo(-105 - (32 * rest) / seg2);
    // con un solo motor queda en la cadera
    expect(dot(fig, "RL_solo").slice(0, 2)).toEqual([-42, 85]);
    expect([...fig.feet.keys()]).toEqual(["FR", "RL"]);
  });

  test("los motores que no sabe ubicar van en ronda alrededor del cuerpo", () => {
    const { fig } = figure({ patas: ["FR", "pie"], motores_nombres: ["FR_hip", "extra1", "extra2"] });
    expect(fig.feet.has("pie")).toBe(false);
    const [x1, y1] = dot(fig, "extra1");
    const [x2, y2] = dot(fig, "extra2");
    expect(x1).toBeCloseTo(0);
    expect(y1).toBeCloseTo(-160);
    expect(x2).toBeCloseTo(0);
    expect(y2).toBeCloseTo(160);
  });

  test("G1: 29 motores de frente, con el lado izquierdo a la derecha de la pantalla", () => {
    const { fig } = figure(infoFor("g1"));
    expect(fig.kind).toBe("humanoid");
    expect(fig.svg.getAttribute("aria-label")).toMatch(/humanoide visto de frente/);
    expect(fig.joints.size).toBe(29);
    expect(dot(fig, "L_shoulder_pitch")).toEqual([62, -108, 6]);
    expect(dot(fig, "R_shoulder_pitch")).toEqual([-62, -108, 6]);
    expect(dot(fig, "R_knee")).toEqual([-31, 116, 6]);
    expect(dot(fig, "torso_yaw")).toEqual([-14, 32, 6]);
    expect(dot(fig, "torso_pitch")).toEqual([14, 32, 6]);
    expect(fig.batFill.getAttribute("y")).toBe("-124");
    expect(fig.batText.getAttribute("y")).toBe("-50");
    expect(fig.batSub.getAttribute("y")).toBe("-30");
  });

  test("G1: pies con rótulo en castellano y más separado", () => {
    const { fig } = figure(infoFor("g1"));
    const labels = [...fig.svg.querySelectorAll(".bd-foot__label")];
    expect(labels.map((l) => [l.textContent, Number(l.getAttribute("x"))])).toEqual([["pie der.", -90], ["pie izq.", 90]]);
    expect(Number(fig.feet.get("L_foot").foot.getAttribute("r"))).toBe(10);
  });

  test("humanoide sin patas ni nombres conocidos: todo en ronda y sin pies", () => {
    const { fig } = figure({ tipo: "humanoide", motores_nombres: ["L_antena", "cola", "R_foo_hip"] });
    expect(fig.feet.size).toBe(0);
    expect(dot(fig, "L_antena")[1]).toBeCloseTo(-160);
    // un nombre terminado en _hip lleva el punto un poco más chico
    expect(dot(fig, "R_foo_hip")[2]).toBe(5);
  });

  test("robot genérico: solo el cuerpo y los motores en ronda", () => {
    const { fig } = figure({ motores_nombres: ["a", "b", "c", "d"] });
    expect(fig.kind).toBe("generic");
    expect(fig.svg.getAttribute("aria-label")).toMatch(/desde arriba/);
    expect(fig.batFill.getAttribute("width")).toBe("120");
    expect(fig.feet.size).toBe(0);
    expect(dot(fig, "b").slice(0, 2).map((v) => Math.round(v))).toEqual([160, 0]);
  });

  test("sin info no dibuja motores", () => {
    const { fig } = figure(null);
    expect(fig.kind).toBe("generic");
    expect(fig.joints.size).toBe(0);
  });

  test("reconstruir para otro robot limpia el dibujo anterior", () => {
    const { fig } = figure();
    fig.build(infoFor("g1"));
    expect(fig.joints.has("FR_hip")).toBe(false);
    expect(fig.svg.querySelectorAll(".bd-joint")).toHaveLength(29);
    expect(fig.svg.querySelectorAll(".bd-ring")).toHaveLength(1);
  });
});

describe("RobotFigure › interacción", () => {
  test("tocar un motor lo elige", () => {
    const { fig, onSelect } = figure();
    const g = fig.joints.get("RR_thigh").g;
    expect(g.getAttribute("role")).toBe("button");
    expect(g.getAttribute("aria-label")).toBe("Motor RR_thigh");
    g.dispatchEvent(new Event("click"));
    expect(onSelect).toHaveBeenCalledWith("RR_thigh");
  });

  test("marca solo el motor elegido", () => {
    const { fig } = figure();
    fig.setSelected("FL_calf");
    expect([...fig.joints].filter(([, j]) => j.g.classList.contains("is-selected")).map(([n]) => n)).toEqual(["FL_calf"]);
    fig.setSelected(null);
    expect(fig.svg.querySelector(".is-selected")).toBeNull();
  });
});

describe("RobotFigure › proyección", () => {
  test("sin tamaño medido o con un motor desconocido no proyecta", () => {
    const { fig } = figure();
    expect(fig.project("FR_hip")).toBeNull();
    fig.resize(430);
    expect(fig.project("nada")).toBeNull();
  });

  test("sin inclinación, escala del viewBox al tamaño en px", () => {
    const { fig } = figure();
    fig.resize(215);
    expect(fig.sizePx).toBe(215);
    expect(fig.project("FR_hip")).toEqual([107.5 + 21, 107.5 - 42.5]);
  });

  test("con pitch, la nariz se aleja y se acerca al centro por la perspectiva", () => {
    const { fig } = figure();
    fig.resize(VB);
    fig.update(frame({ imu: { pitch: 10 } }), { reducedMotion: false });
    const a = (30 * Math.PI) / 180;
    const [x, y] = [42, -85];
    const z = y * Math.sin(a);
    const f = 900 / (900 - z);
    const [px, py] = fig.project("FR_hip");
    expect(px).toBeCloseTo(215 + x * f);
    expect(py).toBeCloseTo(215 + y * Math.cos(a) * f);
  });

  test("con roll, en el Go2 gira alrededor del eje Y", () => {
    const { fig } = figure();
    fig.resize(VB);
    fig.update(frame({ imu: { roll: 5 } }), { reducedMotion: false });
    const a = (15 * Math.PI) / 180;
    const [px, py] = fig.project("FR_calf");
    const f = 900 / (900 - (-104 * Math.sin(a)));
    expect(px).toBeCloseTo(215 + 104 * Math.cos(a) * f);
    expect(py).toBeCloseTo(215 - 137 * f);
  });

  test("en el G1 el roll inclina en el plano de la pantalla", () => {
    const { fig } = figure(infoFor("g1"));
    fig.resize(VB);
    fig.update(frame({ imu: { roll: 10 } }), { reducedMotion: false });
    const a = (-30 * Math.PI) / 180;
    const [x, y] = [62, -108];
    const [px, py] = fig.project("L_shoulder_pitch");
    expect(px).toBeCloseTo(215 + x * Math.cos(a) - y * Math.sin(a));
    expect(py).toBeCloseTo(215 + x * Math.sin(a) + y * Math.cos(a));
  });
});

describe("RobotFigure › update", () => {
  test("pinta cada motor con el semáforo y solo cambia el atributo si cambió el nivel", () => {
    const { fig } = figure();
    fig.update(frame({ motores: [["FR_hip", 30], ["FR_thigh", 45], ["FR_calf", 61], ["fantasma", 99]] }), { reducedMotion: false });
    expect(fig.joints.get("FR_hip").g.dataset.level).toBe("ok");
    expect(fig.joints.get("FR_thigh").g.dataset.level).toBe("warn");
    expect(fig.joints.get("FR_calf").g.dataset.level).toBe("crit");
    fig.joints.get("FR_calf").g.dataset.level = "marca";
    fig.update(frame({ motores: [["FR_calf", 62]] }), { reducedMotion: false });
    expect(fig.joints.get("FR_calf").g.dataset.level).toBe("marca");
  });

  test("los pies se rellenan al apoyar y sueltan una onda solo al volver a apoyar", () => {
    const { fig } = figure();
    const ripple = fig.feet.get("FR").ripple;
    const anim = vi.spyOn(ripple, "animate").mockReturnValue({});
    const foot = fig.feet.get("FR").foot;
    const step = (FR) => fig.update(frame({ fuerzas: { FR, FL: 1, RR: 1, RL: 1 } }), { reducedMotion: false });
    step(1);
    expect(foot.classList.contains("is-down")).toBe(true);
    expect(anim).not.toHaveBeenCalled(); // primera muestra: no hubo "apoyo"
    step(0);
    expect(foot.classList.contains("is-down")).toBe(false);
    step(0);
    expect(anim).not.toHaveBeenCalled();
    step(1);
    expect(anim).toHaveBeenCalledTimes(1);
    expect(anim).toHaveBeenCalledWith(
      [{ transform: "scale(1)", opacity: 0.6 }, { transform: "scale(2.4)", opacity: 0 }],
      { duration: 500, easing: "ease-out" },
    );
    step(1);
    expect(anim).toHaveBeenCalledTimes(1);
  });

  test("con movimiento reducido no hay onda ni inclinación", () => {
    const { fig } = figure();
    const anim = vi.spyOn(fig.feet.get("FL").ripple, "animate").mockReturnValue({});
    const opts = { reducedMotion: true };
    fig.update(frame({ fuerzas: { FL: 0 }, imu: { roll: 4, pitch: -3, yaw: 12.34 } }), opts);
    fig.update(frame({ fuerzas: { FL: 1 }, imu: { roll: 4, pitch: -3, yaw: 12.34 } }), opts);
    expect(anim).not.toHaveBeenCalled();
    expect(fig.feet.get("FL").foot.classList.contains("is-down")).toBe(true);
    expect(fig.tilt.style.transform).toBe("rotateX(0.00deg) rotateY(0.00deg)");
    expect(fig.shadow.style.transform).toBe("translate(0.0px, 8.0px)");
    expect(fig.ring.getAttribute("transform")).toBe("rotate(12.3)");
  });

  test("el cuerpo se llena con el SOC, acotado a 0–100 %", () => {
    const { fig } = figure();
    const soc = (v) => {
      fig.update(frame({ bms: { soc: v } }), { reducedMotion: false });
      return [fig.batFill.style.transform, fig.batFill.dataset.level, fig.batText.textContent];
    };
    expect(soc(87.5)).toEqual(["scaleY(0.875)", "ok", "88%"]);
    expect(soc(50)).toEqual(["scaleY(0.5)", "ok", "50%"]);
    expect(soc(35)).toEqual(["scaleY(0.35)", "warn", "35%"]);
    expect(soc(150)).toEqual(["scaleY(1)", "ok", "100%"]);
    expect(soc(-5)).toEqual(["scaleY(0)", "crit", "0%"]);
  });

  test("Go2: inclina en X con el pitch y en Y con el roll, y corre la sombra", () => {
    const { fig } = figure();
    fig.update(frame({ imu: { roll: 2, pitch: -1.5, yaw: -45 } }), { reducedMotion: false });
    expect(TILT_GAIN).toBe(3);
    expect(fig.tilt.style.transform).toBe("rotateX(-4.50deg) rotateY(6.00deg)");
    expect(fig.shadow.style.transform).toBe("translate(8.4px, 1.7px)");
    expect(fig.ring.getAttribute("transform")).toBe("rotate(-45.0)");
  });

  test("G1: el pitch acerca la cabeza y el roll inclina en el plano", () => {
    const { fig } = figure(infoFor("g1"));
    fig.update(frame({ imu: { roll: 2, pitch: 1 }, fuerzas: { R_foot: 1, L_foot: 0 } }), { reducedMotion: false });
    expect(fig.tilt.style.transform).toBe("rotateX(-3.00deg) rotateZ(-6.00deg)");
    expect(fig.feet.get("R_foot").foot.classList.contains("is-down")).toBe(true);
    expect(fig.feet.get("L_foot").foot.classList.contains("is-down")).toBe(false);
  });

  test("con muestras reales del simulador actualiza los 12 y los 29 motores", () => {
    for (const modelo of ["go2", "g1"]) {
      const { fig } = figure(infoFor(modelo));
      const f = simFrames(modelo, 5).at(-1);
      fig.update(f, { reducedMotion: false });
      for (const m of f.motores) {
        expect(fig.joints.get(m.nombre).level).toBe(m.temperatura > 60 ? "crit" : m.temperatura >= 40 ? "warn" : "ok");
      }
      expect(fig.batText.textContent).toBe(`${Math.round(f.bms.soc)}%`);
    }
  });
});
