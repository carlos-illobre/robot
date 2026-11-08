import { describe, test, expect } from "vitest";
import { describe as describeFrame, yawRate, TURN_THRESHOLD } from "../../js/views/body/sentence.js";
import { frame, simFrames } from "./helpers.js";

const yawFrames = (pairs) => pairs.map(([yaw, t]) => frame({ imu: { yaw }, receivedAt: t }));

describe("yawRate", () => {
  test("sin muestras suficientes da 0", () => {
    expect(yawRate([])).toBe(0);
    expect(yawRate(yawFrames([[10, 0]]))).toBe(0);
  });

  test("promedia el giro sobre el tiempo transcurrido", () => {
    expect(yawRate(yawFrames([[0, 0], [5, 500], [20, 1000]]))).toBe(20);
    expect(yawRate(yawFrames([[30, 0], [10, 2000]]))).toBe(-10);
  });

  test("cruzar el norte hacia la izquierda no parece un giro de 359°", () => {
    expect(yawRate(yawFrames([[350, 0], [10, 1000]]))).toBe(20);
  });

  test("cruzar el norte hacia la derecha tampoco", () => {
    expect(yawRate(yawFrames([[10, 0], [350, 1000]]))).toBe(-20);
  });

  test("con yaw en −180…180 cruza el sur sin saltos", () => {
    expect(yawRate(yawFrames([[170, 0], [-170, 1000]]))).toBe(20);
  });

  test("un giro de exactamente 180° no se desenrolla", () => {
    expect(yawRate(yawFrames([[0, 0], [180, 1000]]))).toBe(180);
    expect(yawRate(yawFrames([[180, 0], [0, 1000]]))).toBe(-180);
  });

  test("si todas las muestras tienen la misma hora da 0 (no divide por cero)", () => {
    expect(yawRate(yawFrames([[0, 500], [40, 500]]))).toBe(0);
  });

  test("con muestras reales del simulador da un número finito", () => {
    expect(Number.isFinite(yawRate(simFrames("go2", 12)))).toBe(true);
  });
});

const go2Legs = (n) => Object.fromEntries(["FR", "FL", "RR", "RL"].map((l, i) => [l, i < n ? 1 : 0]));
const g1Feet = (n) => ({ R_foot: n >= 1 ? 1 : 0, L_foot: n >= 2 ? 1 : 0 });

describe("describe › acción", () => {
  const moving = (isMoving) => frame({ motores: [["FR_hip", 30, { velocidad: isMoving ? 2 : 0 }]] });

  test("quieto y sin giro", () => {
    expect(describeFrame(moving(false)).action).toBe("Quieto");
    expect(describeFrame(moving(false), 0).action).toBe("Quieto");
  });
  test("quieto pero girando es girar en el lugar", () => {
    expect(describeFrame(moving(false), 12).action).toBe("Girando en el lugar");
    expect(describeFrame(moving(false), -12).action).toBe("Girando en el lugar");
  });
  test("caminando sin giro es caminar derecho", () => {
    expect(describeFrame(moving(true), 3).action).toBe("Caminando derecho");
  });
  test("caminando y girando", () => {
    expect(describeFrame(moving(true), -20).action).toBe("Caminando y doblando");
  });
  test("el umbral de giro es estricto: 8 °/s todavía es derecho", () => {
    expect(TURN_THRESHOLD).toBe(8);
    expect(describeFrame(moving(true), 8).action).toBe("Caminando derecho");
    expect(describeFrame(moving(true), -8).action).toBe("Caminando derecho");
    expect(describeFrame(moving(true), 8.01).action).toBe("Caminando y doblando");
  });
});

describe("describe › apoyos", () => {
  const contacts = (fuerzas) => describeFrame(frame({ fuerzas })).contacts;

  test("sin patas informadas", () => {
    expect(contacts({})).toBe("sin datos de contacto");
  });
  test.each([
    [0, "ninguna pata apoyada"],
    [1, "una sola pata apoyada"],
    [2, "2 de 4 patas apoyadas"],
    [3, "3 de 4 patas apoyadas"],
    [4, "las cuatro patas apoyadas"],
  ])("Go2 con %d patas abajo: %s", (n, txt) => {
    expect(contacts(go2Legs(n))).toBe(txt);
  });
  test.each([
    [0, "ningún pie apoyado"],
    [1, "un solo pie apoyado"],
    [2, "los dos pies apoyados"],
  ])("G1 con %d pies abajo: %s", (n, txt) => {
    expect(contacts(g1Feet(n))).toBe(txt);
  });
  test("dos patas (no pies) todas abajo", () => {
    expect(contacts({ FR: 1, FL: 1 })).toBe("las dos patas apoyadas");
  });
  test("cantidades sin nombre propio usan el número", () => {
    expect(contacts({ FR: 1, FL: 1, RR: 1 })).toBe("las 3 patas apoyadas");
    expect(contacts({ R_foot: 1, L_foot: 1, X_foot: 1 })).toBe("los 3 pies apoyados");
    expect(contacts({ R_foot: 1, L_foot: 1, X_foot: 0 })).toBe("2 de 3 pies apoyados");
  });
  test("una sola pata en total y apoyada", () => {
    expect(contacts({ FR: 1 })).toBe("las 1 pata apoyada");
    expect(contacts({ R_foot: 1 })).toBe("los 1 pie apoyado");
  });
});

describe("describe › temperatura", () => {
  test("un motor sobre 60 °C es crítico y se nombra", () => {
    const d = describeFrame(frame({ motores: [["FR_hip", 30], ["FR_calf", 61]] }));
    expect(d.heat).toBe("FR_calf a 61.0 °C (más de 60 °C)");
    expect(d.heatLevel).toBe("crit");
  });
  test("con varios sobre 60 °C se nombra el más caliente y se cuentan los otros", () => {
    const d = describeFrame(frame({ motores: [["A", 62], ["B", 75.25], ["C", 61], ["D", 59]] }));
    expect(d.heat).toBe("B a 75.3 °C y 2 más sobre 60 °C");
    expect(d.heatLevel).toBe("crit");
  });
  test("a 60 °C justos no es crítico: se informa el más caliente en amarillo", () => {
    const d = describeFrame(frame({ motores: [["A", 30], ["B", 60]] }));
    expect(d.heat).toBe("el más caliente: B a 60.0 °C");
    expect(d.heatLevel).toBe("warn");
  });
  test("todo frío: el más caliente en verde", () => {
    const d = describeFrame(frame({ motores: [["A", 39.9], ["B", 22]] }));
    expect(d.heat).toBe("el más caliente: A a 39.9 °C");
    expect(d.heatLevel).toBe("ok");
  });
  test("sin motores no hay frase de temperatura", () => {
    const d = describeFrame(frame());
    expect(d.heat).toBe("");
    expect(d.heatLevel).toBe("ok");
  });
});

describe("describe › batería", () => {
  test("redondea el SOC sin decimales", () => {
    expect(describeFrame(frame({ bms: { soc: 87.6 } })).battery).toBe("batería 88 %");
  });
  test("con el G1 del simulador arma los cinco tramos", () => {
    const f = simFrames("g1", 5).at(-1);
    const d = describeFrame(f);
    expect(Object.keys(d).sort()).toEqual(["action", "battery", "contacts", "heat", "heatLevel"]);
    expect(d.contacts).toMatch(/pie/);
    expect(d.battery).toBe(`batería ${Math.round(f.bms.soc)} %`);
  });
});
