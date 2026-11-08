// Geometría del anillo de motores: funciones puras, con los nombres reales de /info.
import { describe, test, expect } from "vitest";
import { RING_R, layoutRing, layoutFeet, polar, arcPath } from "../../js/views/pilot/ringLayout.js";
import { infoDe } from "./helpers.js";

const GO2 = infoDe("go2");
const G1 = infoDe("g1");
const seg = (layout, name) => layout.segments.find((s) => s.name === name);

describe("layoutRing con el Go2 (12 motores)", () => {
  const ring = layoutRing(GO2.motores_nombres);

  test("es un cuadrúpedo con un segmento por motor", () => {
    expect(RING_R).toBe(180);
    expect(ring.kind).toBe("cuadrupedo");
    expect(ring.segments).toHaveLength(12);
    expect(new Set(ring.segments.map((s) => s.name))).toEqual(new Set(GO2.motores_nombres));
  });

  test("ordena las patas en sentido horario desde arriba: FR, RR, RL, FL", () => {
    expect(ring.groups.map((g) => g.key)).toEqual(["FR", "RR", "RL", "FL"]);
    expect(ring.groups.map((g) => g.short)).toEqual(["FR", "RR", "RL", "FL"]);
    expect(ring.groups[0].label).toBe("FR · Delantera derecha");
  });

  test("la primera separación cae justo arriba y cada pata ocupa 84°", () => {
    expect(ring.groups[0]).toMatchObject({ a0: -87, a1: -3, mid: -45 });
    expect(ring.groups[1]).toMatchObject({ a0: 3, a1: 87, mid: 45 });
    expect(ring.groups[2]).toMatchObject({ a0: 93, a1: 177, mid: 135 });
    expect(ring.groups[3]).toMatchObject({ a0: 183, a1: 267, mid: 225 });
  });

  test("cada segmento mide 28° menos 1.5° de margen de cada lado", () => {
    expect(seg(ring, "FR_hip")).toEqual({ name: "FR_hip", group: "FR", a0: -85.5, a1: -60.5, mid: -73 });
    expect(seg(ring, "FR_calf")).toMatchObject({ a0: -29.5, a1: -4.5 });
  });

  test("invierte RR y FL para que la cadera quede siempre del lado del eje", () => {
    const rr = ring.segments.filter((s) => s.group === "RR").map((s) => s.name);
    const fl = ring.segments.filter((s) => s.group === "FL").map((s) => s.name);
    expect(rr).toEqual(["RR_calf", "RR_thigh", "RR_hip"]);
    expect(fl).toEqual(["FL_calf", "FL_thigh", "FL_hip"]);
    expect(ring.segments.filter((s) => s.group === "RL").map((s) => s.name)).toEqual(["RL_hip", "RL_thigh", "RL_calf"]);
  });

  test("la izquierda es el espejo de la derecha respecto del eje vertical", () => {
    for (const joint of ["hip", "thigh", "calf"]) {
      expect(seg(ring, `FR_${joint}`).mid + seg(ring, `FL_${joint}`).mid).toBeCloseTo(180, 6);
      expect(seg(ring, `RR_${joint}`).mid + seg(ring, `RL_${joint}`).mid).toBeCloseTo(180, 6);
    }
  });
});

describe("layoutRing con el G1 (29 motores)", () => {
  const ring = layoutRing(G1.motores_nombres);
  const step = 330 / 29;

  test("es un humanoide con 29 segmentos en cinco grupos", () => {
    expect(ring.kind).toBe("humanoide");
    expect(ring.segments).toHaveLength(29);
    expect(ring.groups.map((g) => g.key)).toEqual(["torso", "R_brazo", "R_pierna", "L_pierna", "L_brazo"]);
    expect(ring.groups.map((g) => g.short)).toEqual(["TORSO", "BRAZO D", "PIERNA D", "PIERNA I", "BRAZO I"]);
    expect(ring.groups.map((g) => g.label)).toEqual(["Torso", "Brazo derecho", "Pierna derecha", "Pierna izquierda", "Brazo izquierdo"]);
  });

  test("el torso queda centrado arriba", () => {
    const torso = ring.groups[0];
    expect(torso.mid).toBeCloseTo(-90, 6);
    expect(torso.a1 - torso.a0).toBeCloseTo(3 * step, 6);
    expect(seg(ring, "torso_roll").mid).toBeCloseTo(-90, 6);
  });

  test("el margen entre segmentos es el 12 % del paso cuando el paso es chico", () => {
    const s = seg(ring, "torso_yaw");
    expect(s.a1 - s.a0).toBeCloseTo(step - 2 * step * 0.12, 6);
  });

  test("deja 6° entre grupos consecutivos", () => {
    for (let i = 1; i < ring.groups.length; i++) expect(ring.groups[i].a0 - ring.groups[i - 1].a1).toBeCloseTo(6, 6);
  });

  test("cada articulación izquierda es el espejo de la derecha", () => {
    for (const name of G1.motores_nombres.filter((n) => n.startsWith("R_"))) {
      const left = `L_${name.slice(2)}`;
      expect(seg(ring, name).mid + seg(ring, left).mid).toBeCloseTo(180, 6);
    }
  });

  test("invierte la pierna y el brazo izquierdos", () => {
    const lp = ring.segments.filter((s) => s.group === "L_pierna").map((s) => s.name);
    expect(lp[0]).toBe("L_ankle_roll");
    expect(lp.at(-1)).toBe("L_hip_pitch");
    expect(ring.segments.filter((s) => s.group === "R_pierna")[0].name).toBe("R_hip_pitch");
  });
});

describe("layoutRing con listas raras", () => {
  test("sin motores no hay segmentos ni grupos", () => {
    expect(layoutRing([])).toEqual({ kind: "humanoide", segments: [], groups: [] });
  });

  test("un grupo desconocido va al final, rotulado en mayúsculas", () => {
    const ring = layoutRing(["head_cam", "FR_hip"]);
    expect(ring.kind).toBe("cuadrupedo");
    expect(ring.groups.map((g) => g.key)).toEqual(["FR", "otros"]);
    expect(ring.groups[1]).toMatchObject({ short: "OTROS", label: "Otros" });
    expect(ring.segments.map((s) => s.name)).toEqual(["FR_hip", "head_cam"]);
  });

  test("un humanoide con un único motor desconocido lo centra arriba, con margen máximo de 1.5°", () => {
    const ring = layoutRing(["cabeza"]);
    expect(ring.kind).toBe("humanoide");
    expect(ring.segments[0].mid).toBeCloseTo(-90, 6);
    expect(ring.segments[0].a0).toBeCloseTo(-90 - 177 + 1.5, 6);
    expect(ring.segments[0].a1).toBeCloseTo(-90 + 177 - 1.5, 6);
  });
});

describe("layoutFeet", () => {
  test("ubica las patas del Go2 en las diagonales", () => {
    expect(layoutFeet(GO2.patas)).toEqual([
      { leg: "FR", label: "FR", angle: -45 },
      { leg: "FL", label: "FL", angle: -135 },
      { leg: "RR", label: "RR", angle: 45 },
      { leg: "RL", label: "RL", angle: 135 },
    ]);
  });

  test("ubica los pies del G1 abajo, con rótulos en castellano", () => {
    expect(layoutFeet(G1.patas)).toEqual([
      { leg: "R_foot", label: "PIE D", angle: 72 },
      { leg: "L_foot", label: "PIE I", angle: 108 },
    ]);
  });

  test("reparte las patas desconocidas abajo, cada 24°, centradas en 90°", () => {
    expect(layoutFeet(["X", "FR", "Y", "Z"])).toEqual([
      { leg: "X", label: "X", angle: 66 },
      { leg: "FR", label: "FR", angle: -45 },
      { leg: "Y", label: "Y", angle: 90 },
      { leg: "Z", label: "Z", angle: 114 },
    ]);
    expect(layoutFeet(["sola"])[0].angle).toBe(90);
  });

  test("sin patas devuelve una lista vacía", () => {
    expect(layoutFeet([])).toEqual([]);
  });
});

describe("polar y arcPath", () => {
  test("polar usa 0° a la derecha y sentido horario (Y hacia abajo)", () => {
    expect(polar(10, 0)).toEqual([10, 0]);
    const [x, y] = polar(10, 90);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(10, 9);
    const [x2, y2] = polar(2, 180);
    expect(x2).toBeCloseTo(-2, 9);
    expect(y2).toBeCloseTo(0, 9);
  });

  test("arcPath arma un arco horario corto con dos decimales", () => {
    expect(arcPath(180, -90, 0)).toBe("M0.00 -180.00A180 180 0 0 1 180.00 0.00");
  });

  test("arcPath marca el arco grande solo si pasa de 180°", () => {
    expect(arcPath(10, 0, 180)).toMatch(/^M10\.00 0\.00A10 10 0 0 1 -10\.00 0\.00$/);
    expect(arcPath(10, 0, 181)).toMatch(/A10 10 0 1 1 /);
  });
});
