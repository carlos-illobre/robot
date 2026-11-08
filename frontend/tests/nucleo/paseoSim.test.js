// PaseoSim: simulador del navegador (port de backend/api/demo_paseo.py).
import { describe, it, expect } from "vitest";
import { PaseoSim, ROBOTS, GUION } from "../../js/core/paseoSim.js";

const DEG = 180 / Math.PI;
const CICLO = GUION.reduce((a, [d]) => a + d, 0);
const motorDe = (t, nombre) => t.motores.find((m) => m.nombre === nombre);
const cerca = (valor, esperado, tol = 1) => Math.abs(valor - esperado) < tol;

describe("configuración", () => {
  it("Go2 tiene 12 motores y 4 patas; G1, 29 motores y 2 pies", () => {
    expect(ROBOTS.go2.motores_nombres).toHaveLength(12);
    expect(ROBOTS.go2.patas).toEqual(["FR", "FL", "RR", "RL"]);
    expect(ROBOTS.g1.motores_nombres).toHaveLength(29);
    expect(ROBOTS.g1.patas).toEqual(["R_foot", "L_foot"]);
  });

  it("el guion dura 63 s y termina quieto", () => {
    expect(CICLO).toBe(63);
    expect(GUION.at(-1)).toEqual([5, 0, 0, "quieto"]);
  });
});

describe("constructor e info", () => {
  it("rechaza un modelo desconocido", () => {
    expect(() => new PaseoSim("b2")).toThrow("Modelo desconocido: b2");
  });

  it("por defecto simula un Go2", () => {
    expect(new PaseoSim().modelo).toBe("go2");
  });

  it.each([
    ["go2", { nombre: "Unitree Go2 EDU", tipo: "cuadrupedo", n_motores: 12 }],
    ["g1", { nombre: "Unitree G1 EDU", tipo: "humanoide", n_motores: 29 }],
  ])("info() de %s tiene el formato de GET /info", (modelo, esperado) => {
    const info = new PaseoSim(modelo).info();
    expect(info).toEqual({
      modelo,
      ...esperado,
      motores_nombres: ROBOTS[modelo].motores_nombres,
      patas: ROBOTS[modelo].patas,
      frecuencia_hz: 10,
      modo: "demo",
    });
  });

  it("info() devuelve copias: modificarlas no cambia la configuración", () => {
    const info = new PaseoSim("go2").info();
    info.motores_nombres.push("x");
    info.patas.pop();
    expect(ROBOTS.go2.motores_nombres).toHaveLength(12);
    expect(ROBOTS.go2.patas).toHaveLength(4);
  });

  it("arranca en t = 0, quieto, con la batería al 92 %", () => {
    const sim = new PaseoSim("go2");
    expect(sim.t).toBe(0);
    expect(sim.steps).toBe(0);
    expect(sim.vel).toBe(0);
    expect(sim.soc).toBe(92);
    expect(sim.cellOffset).toHaveLength(8);
    expect(sim.qPrev).toEqual(new Array(12).fill(0));
  });

  it("la misma semilla da la misma simulación y otra semilla, otra", () => {
    const correr = (seed) => {
      const sim = new PaseoSim("g1", { seed });
      sim.advance(8);
      return sim.telemetria();
    };
    expect(correr(3)).toEqual(correr(3));
    expect(correr(3)).not.toEqual(correr(4));
  });

  it("la semilla por defecto es 7", () => {
    const a = new PaseoSim("go2");
    const b = new PaseoSim("go2", { seed: 7 });
    a.advance(2);
    b.advance(2);
    expect(a.telemetria()).toEqual(b.telemetria());
  });
});

describe("modelo térmico de cada motor", () => {
  it("Go2: pantorrilla 22 N·m nominales, muslo 20 y cadera 9; la pantorrilla calienta 25 % más", () => {
    const sim = new PaseoSim("go2");
    ROBOTS.go2.motores_nombres.forEach((n, i) => {
      const m = sim.motors[i];
      const nominal = n.includes("calf") ? 22 : n.includes("thigh") ? 20 : 9;
      const factor = n.includes("calf") ? 1.25 : 1;
      expect(m.nominal).toBe(nominal);
      expect(m.k).toBeGreaterThanOrEqual(1.75 * factor * 0.85);
      expect(m.k).toBeLessThanOrEqual(1.75 * factor * 1.2);
      expect(m.tauTh).toBeGreaterThanOrEqual(35);
      expect(m.tauTh).toBeLessThanOrEqual(50);
      expect(m.temp).toBeGreaterThanOrEqual(31);
      expect(m.temp).toBeLessThanOrEqual(34);
    });
  });

  it("G1: rodilla 36, cadera-cabeceo 26, tobillo 20 y el resto 9; la rodilla calienta 25 % más", () => {
    const sim = new PaseoSim("g1");
    const nominal = Object.fromEntries(ROBOTS.g1.motores_nombres.map((n, i) => [n, sim.motors[i].nominal]));
    expect(nominal).toMatchObject({ L_knee: 36, R_knee: 36, L_hip_pitch: 26, R_ankle_pitch: 20, L_ankle_roll: 20, L_hip_roll: 9, torso_yaw: 9, R_elbow: 9 });
    const k = (n) => sim.motors[ROBOTS.g1.motores_nombres.indexOf(n)].k;
    expect(k("L_knee")).toBeGreaterThanOrEqual(1.75 * 1.25 * 0.85);
    expect(k("L_hip_pitch")).toBeLessThanOrEqual(1.75 * 1.2);
  });

  it("trotar un rato calienta los motores más que quedarse quieto", () => {
    const quieto = new PaseoSim("go2");
    quieto.advance(5);
    const trota = new PaseoSim("go2");
    trota.t = 21;
    trota.advance(10);
    const prom = (sim) => sim.motors.reduce((a, m) => a + m.temp, 0) / sim.motors.length;
    expect(prom(trota)).toBeGreaterThan(prom(quieto) + 1);
  });
});

describe("tramo del guion", () => {
  it.each([
    [0, { v: 0, g: 0, label: "quieto" }],
    [5.99, { v: 0, g: 0, label: "quieto" }],
    [6, { v: 0.55, g: 0, label: "camina" }],
    [16, { v: 0.55, g: 18, label: "curva izquierda" }],
    [21, { v: 1, g: 0, label: "trota" }],
    [33, { v: 0.3, g: -30, label: "gira derecha" }],
    [37, { v: 0, g: 0, label: "quieto" }],
    [44, { v: 0.85, g: 6, label: "camina rápido" }],
    [57.99, { v: 0.85, g: 6, label: "camina rápido" }],
    [58, { v: 0, g: 0, label: "quieto" }],
    [62.99, { v: 0, g: 0, label: "quieto" }],
    [63, { v: 0, g: 0, label: "quieto" }],
    [69, { v: 0.55, g: 0, label: "camina" }],
  ])("en t = %s s es %o", (t, tramo) => {
    const sim = new PaseoSim("go2");
    sim.t = t;
    expect(sim.tramo).toEqual(tramo);
  });
});

describe("advance", () => {
  it("integra a 50 Hz: 1 s son 50 pasos y un resto se integra en un paso más corto", () => {
    const sim = new PaseoSim("go2");
    sim.advance(1);
    expect(sim.steps).toBe(50);
    expect(sim.t).toBeCloseTo(1, 9);
    sim.advance(0.03);
    expect(sim.steps).toBe(52);
    expect(sim.t).toBeCloseTo(1.03, 9);
  });

  it("avanzar 0 s no hace nada", () => {
    const sim = new PaseoSim("go2");
    sim.advance(0);
    expect(sim.steps).toBe(0);
  });

  it("en el primer paso las velocidades articulares son 0; después, la derivada del ángulo", () => {
    const sim = new PaseoSim("go2");
    sim.t = 21; // trotando: los ángulos cambian
    sim.vel = 1;
    sim.advance(0.02);
    expect(sim.dq).toEqual(new Array(12).fill(0));
    const qAntes = [...sim.q];
    sim.advance(0.02);
    sim.q.forEach((q, i) => expect(sim.dq[i]).toBe((q - qAntes[i]) / 0.02));
    expect(sim.dq.some((v) => v !== 0)).toBe(true);
  });

  it("la fase de la marcha no avanza mientras está quieto y sí al caminar", () => {
    const sim = new PaseoSim("go2");
    sim.advance(5);
    expect(sim.fase).toBe(0);
    sim.advance(3);
    expect(sim.fase).toBeGreaterThan(0);
    expect(sim.fase).toBeLessThan(2 * Math.PI);
  });

  it("con velocidad apenas por encima de 0,02 la fase avanza", () => {
    const sim = new PaseoSim("go2");
    sim.t = 6;
    sim.vel = 0.0201; // tras el paso queda > 0,02 porque se acerca a 0,55
    sim.advance(0.02);
    expect(sim.fase).toBeCloseTo(2 * Math.PI * (1.6 + 0.9 * sim.vel) * 0.02, 9);
  });

  it("la guiñada se mantiene entre -180° y 180°", () => {
    const sim = new PaseoSim("go2");
    sim.yaw = 4; // > π
    sim.advance(0.02); // quieto: el giro es 0
    expect(sim.yaw).toBeCloseTo(4 - 2 * Math.PI, 9);
    sim.yaw = -4;
    sim.advance(0.02);
    expect(sim.yaw).toBeCloseTo(-4 + 2 * Math.PI, 9);
  });

  it("al girar a la izquierda (18 °/s) la guiñada aumenta", () => {
    const sim = new PaseoSim("go2");
    sim.t = 16;
    sim.giro = 18;
    sim.yaw = 0;
    sim.advance(1);
    expect(sim.yaw * DEG).toBeGreaterThan(15);
    expect(sim.yaw * DEG).toBeLessThan(20);
  });

  it("la batería se descarga y, al bajar del 12 %, vuelve al 96 %", () => {
    const sim = new PaseoSim("go2");
    sim.advance(10);
    expect(sim.soc).toBeLessThan(92);
    expect(sim.soc).toBeGreaterThan(91.5);
    sim.soc = 12.000001;
    sim.advance(0.02);
    expect(sim.soc).toBe(96);
    sim.soc = 12.5;
    sim.advance(0.02);
    expect(sim.soc).toBeLessThan(12.5);
    expect(sim.soc).toBeGreaterThan(12);
  });

  it("la corriente crece con el esfuerzo de los motores", () => {
    const sim = new PaseoSim("go2");
    sim.advance(1);
    const quieto = sim.current;
    sim.t = 21;
    sim.advance(5);
    expect(quieto).toBeGreaterThan(1400);
    expect(sim.current).toBeGreaterThan(quieto + 500);
  });
});

describe("Go2 quieto (a = 0)", () => {
  const sim = new PaseoSim("go2");
  sim.advance(2);
  const t = sim.telemetria();

  it("las caderas abren ±1,5°, los muslos a 45° y las pantorrillas a -88°", () => {
    expect(motorDe(t, "FR_hip").angulo).toBe(1.5);
    expect(motorDe(t, "RR_hip").angulo).toBe(1.5);
    expect(motorDe(t, "FL_hip").angulo).toBe(-1.5);
    expect(motorDe(t, "RL_hip").angulo).toBe(-1.5);
    expect(motorDe(t, "FL_thigh").angulo).toBe(45);
    expect(motorDe(t, "RL_calf").angulo).toBe(-88);
  });

  it("el torque refleja el peso: cadera ±1,2, muslo 6 y pantorrilla -9 N·m", () => {
    expect(cerca(motorDe(t, "FR_hip").torque, 1.2)).toBe(true);
    expect(cerca(motorDe(t, "FL_hip").torque, -1.2)).toBe(true);
    expect(cerca(motorDe(t, "RR_thigh").torque, 6)).toBe(true);
    expect(cerca(motorDe(t, "RL_calf").torque, -9)).toBe(true);
  });

  it("apoya las cuatro patas y el IMU marca la gravedad", () => {
    expect(t.fuerzas).toEqual({ FR: 1, FL: 1, RR: 1, RL: 1 });
    expect(cerca(t.imu.az, 9.81, 0.2)).toBe(true);
    expect(sim.feet).toEqual([60, 60, 60, 60]);
  });
});

describe("G1 quieto (a = 0)", () => {
  const sim = new PaseoSim("g1");
  sim.advance(2);
  const t = sim.telemetria();

  it.each([
    ["L_hip_pitch", -12, 8],
    ["R_knee", 28, 18],
    ["L_ankle_pitch", -14, 9],
    ["R_shoulder_pitch", 10, 1.5],
    ["L_elbow", 60, 1.2],
    ["torso_yaw", 0, 3],
    ["L_hip_roll", 0, 1],
    ["torso_pitch", 0, 1],
    ["R_wrist_yaw", 0, 1],
  ])("%s está a %s° con ~%s N·m", (nombre, angulo, torque) => {
    expect(motorDe(t, nombre).angulo + 0).toBe(angulo); // + 0: -0 y 0 son el mismo ángulo
    expect(cerca(motorDe(t, nombre).torque, torque)).toBe(true);
  });

  it("apoya los dos pies", () => {
    expect(t.fuerzas).toEqual({ R_foot: 1, L_foot: 1 });
    expect(sim.feet).toEqual([220, 220]);
  });
});

describe("marcha", () => {
  const recorrer = (modelo, desde, segundos) => {
    const sim = new PaseoSim(modelo);
    sim.t = desde;
    const out = [];
    for (let i = 0; i < segundos * 10; i++) {
      sim.advance(0.1);
      out.push(sim.telemetria());
    }
    return out;
  };

  it("el G1 trotando alterna los pies y nunca levanta los dos a la vez", () => {
    const pies = recorrer("g1", 21, 6).map((t) => t.fuerzas);
    expect(pies.some((f) => f.R_foot === 0 && f.L_foot === 1)).toBe(true);
    expect(pies.some((f) => f.R_foot === 1 && f.L_foot === 0)).toBe(true);
    expect(pies.some((f) => f.R_foot === 0 && f.L_foot === 0)).toBe(false);
  });

  it("el Go2 trotando levanta patas y las que apoyan cargan más fuerza", () => {
    const sim = new PaseoSim("go2");
    sim.t = 21;
    sim.advance(6);
    const vistos = new Set();
    for (let i = 0; i < 40; i++) {
      sim.advance(0.02);
      sim.feet.forEach((f) => vistos.add(f === 0 ? "aire" : f > 60 ? "apoyo" : "otro"));
    }
    expect([...vistos].sort()).toEqual(["aire", "apoyo"]);
  });

  it("al caminar las piernas del G1 se mueven en espejo", () => {
    const sim = new PaseoSim("g1");
    sim.t = 21;
    sim.advance(5);
    const t = sim.telemetria();
    const l = motorDe(t, "L_hip_pitch").angulo + 12;
    const r = motorDe(t, "R_hip_pitch").angulo + 12;
    expect(l).toBeCloseTo(-r, 1);
  });
});

describe("telemetria()", () => {
  it.each([
    ["go2", 12, ["FR", "FL", "RR", "RL"]],
    ["g1", 29, ["R_foot", "L_foot"]],
  ])("%s respeta el contrato de /telemetria", (modelo, n, patas) => {
    const sim = new PaseoSim(modelo);
    sim.advance(30);
    const t = sim.telemetria();
    expect(t.modelo).toBe(modelo);
    expect(t.ts).toBe(Math.round(sim.t * 100) / 100);
    expect(t.motores).toHaveLength(n);
    t.motores.forEach((m, i) => {
      expect(m.id).toBe(i);
      expect(m.nombre).toBe(ROBOTS[modelo].motores_nombres[i]);
      expect(Number.isInteger(m.temperatura)).toBe(true);
      expect(m.temperatura).toBe(Math.round(sim.motors[i].temp));
      expect(m.torque).toBe(Math.round(sim.tau[i] * 100) / 100);
      expect(m.velocidad).toBe(Math.round(sim.dq[i] * 1000) / 1000);
    });
    expect(Object.keys(t.fuerzas)).toEqual(patas);
    expect(t.bms.soc).toBe(Math.trunc(sim.soc));
    expect(t.bms.corriente).toBe(Math.trunc(sim.current));
    expect(t.bms.temperatura).toBe(Math.round(sim.batTemp * 10) / 10);
    expect(t.bms.celdas).toHaveLength(8);
    expect(t.bms.celdas.every((v) => v > 3.5 && v < 4.3)).toBe(true);
    expect(t.imu.yaw).toBe(Math.round(sim.yaw * DEG * 100) / 100);
  });

  it("la celda 6 está unos mV por debajo del resto (celda débil)", () => {
    const sim = new PaseoSim("go2");
    sim.advance(1);
    const celdas = sim.telemetria().bms.celdas;
    expect(Math.min(...celdas)).toBe(celdas[5]);
  });

  it("quieto el robot no se inclina más de medio grado", () => {
    const sim = new PaseoSim("go2");
    sim.advance(3);
    const { imu } = sim.telemetria();
    expect(Math.abs(imu.roll)).toBeLessThan(0.5);
    expect(Math.abs(imu.pitch)).toBeLessThan(0.5);
  });
});
