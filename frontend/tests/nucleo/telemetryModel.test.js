// telemetryModel (Adapter): normalización, métricas derivadas y nombres legibles.
import { describe, it, expect } from "vitest";
import {
  TEMP_THRESHOLDS,
  MOVING_THRESHOLD,
  LEG_LABELS,
  tempLevel,
  socLevel,
  normalizeFrame,
  deriveMetrics,
  jointLabel,
  motorGroup,
} from "../../js/core/telemetryModel.js";
import { ROBOTS } from "../../js/core/paseoSim.js";
import { rawFrame } from "./helpers.js";

describe("umbrales", () => {
  it("son los de electroSim y no se pueden modificar", () => {
    expect(TEMP_THRESHOLDS).toEqual({ warn: 40, crit: 60 });
    expect(Object.isFrozen(TEMP_THRESHOLDS)).toBe(true);
    expect(MOVING_THRESHOLD).toBe(0.35);
    expect(Object.isFrozen(LEG_LABELS)).toBe(true);
  });
});

describe("tempLevel", () => {
  it.each([
    [39.99, "ok"],
    [-5, "ok"],
    [40, "warn"],
    [60, "warn"],
    [60.01, "crit"],
    [61, "crit"],
    [Number.NaN, "unknown"],
    [Infinity, "unknown"],
    [null, "unknown"],
    ["50", "unknown"],
  ])("%s °C → %s", (t, nivel) => {
    expect(tempLevel(t)).toBe(nivel);
  });
});

describe("socLevel", () => {
  it.each([
    [19.9, "crit"],
    [0, "crit"],
    [20, "warn"],
    [49.9, "warn"],
    [50, "ok"],
    [100, "ok"],
    [undefined, "unknown"],
    [Number.NaN, "unknown"],
  ])("%s %% → %s", (soc, nivel) => {
    expect(socLevel(soc)).toBe(nivel);
  });
});

describe("normalizeFrame", () => {
  it.each([null, undefined, 0, "texto", true])("rechaza %s", (raw) => {
    expect(() => normalizeFrame(raw)).toThrow(new TypeError("Telemetría vacía o inválida"));
  });

  it("un objeto vacío da valores por defecto seguros", () => {
    const f = normalizeFrame({}, 123);
    expect(f).toEqual({
      modelo: "desconocido",
      ts: 0,
      receivedAt: 123,
      motores: [],
      imu: { roll: 0, pitch: 0, yaw: 0, ax: 0, ay: 0, az: 0 },
      bms: { soc: 0, corriente: 0, temperatura: 0, celdas: [] },
      fuerzas: {},
      derived: expect.any(Object),
    });
  });

  it("receivedAt por defecto es la hora local", () => {
    const antes = Date.now();
    const f = normalizeFrame({});
    expect(f.receivedAt).toBeGreaterThanOrEqual(antes);
    expect(f.receivedAt).toBeLessThanOrEqual(Date.now());
  });

  it("convierte strings numéricos, descarta basura y completa motores nulos", () => {
    const f = normalizeFrame(
      {
        modelo: 7,
        ts: "16.24",
        motores: [
          { id: "3", nombre: "FR_hip", angulo: "45.5", velocidad: "x", torque: Infinity, temperatura: "61" },
          null,
          { nombre: undefined },
        ],
        imu: { roll: "1.5", pitch: null, yaw: undefined, ax: "a", ay: 2, az: "9.81" },
        bms: { soc: "86", corriente: "-1200", temperatura: "31.5", celdas: ["3.9", "nada", 4.1] },
        fuerzas: { FR: 1, FL: 0, RR: "35.2", RL: -3 },
      },
      0,
    );
    expect(f.modelo).toBe("7");
    expect(f.ts).toBe(16.24);
    expect(f.motores).toEqual([
      { id: 3, nombre: "FR_hip", angulo: 45.5, velocidad: 0, torque: 0, temperatura: 61 },
      { id: 1, nombre: "motor_1", angulo: 0, velocidad: 0, torque: 0, temperatura: 0 },
      { id: 2, nombre: "motor_2", angulo: 0, velocidad: 0, torque: 0, temperatura: 0 },
    ]);
    expect(f.imu).toEqual({ roll: 1.5, pitch: 0, yaw: 0, ax: 0, ay: 2, az: 9.81 });
    expect(f.bms).toEqual({ soc: 86, corriente: -1200, temperatura: 31.5, celdas: [3.9, 0, 4.1] });
    expect(f.fuerzas).toEqual({ FR: 1, FL: 0, RR: 1, RL: 0 });
  });

  it("motores y celdas que no son listas quedan como listas vacías", () => {
    const f = normalizeFrame({ motores: { a: 1 }, bms: { celdas: "3.9" } });
    expect(f.motores).toEqual([]);
    expect(f.bms.celdas).toEqual([]);
  });

  it.each([
    ["go2", 12, 4],
    ["g1", 29, 2],
  ])("normaliza un %s con %i motores y %i patas", (modelo, n, patas) => {
    const f = normalizeFrame(rawFrame(modelo), 5);
    expect(f.modelo).toBe(modelo);
    expect(f.motores).toHaveLength(n);
    expect(f.motores.map((m) => m.nombre)).toEqual(ROBOTS[modelo].motores_nombres);
    expect(f.derived.legs).toBe(patas);
    expect(f.derived.contacts).toBe(patas);
    expect(f.derived.tempLevels).toEqual({ ok: n, warn: 0, crit: 0 });
  });
});

describe("deriveMetrics", () => {
  const base = { motores: [], bms: { celdas: [], corriente: 0 }, fuerzas: {}, imu: { roll: 0, pitch: 0 } };

  it("sin motores ni celdas devuelve nulos y ceros", () => {
    expect(deriveMetrics(base)).toEqual({
      tempMax: null,
      torqueMax: null,
      tempLevels: { ok: 0, warn: 0, crit: 0 },
      meanSpeed: 0,
      isMoving: false,
      contacts: 0,
      legs: 0,
      packVoltage: 0,
      powerW: 0,
      cellMin: null,
      cellMax: null,
      cellDeltaMv: null,
      tilt: 0,
    });
  });

  it("encuentra el motor más caliente y el de mayor torque en valor absoluto", () => {
    const d = deriveMetrics({
      ...base,
      motores: [
        { nombre: "a", temperatura: 35, torque: 5, velocidad: 0 },
        { nombre: "b", temperatura: 61, torque: -12, velocidad: 0 },
        { nombre: "c", temperatura: 61, torque: 12, velocidad: 0 },
        { nombre: "d", temperatura: 45, torque: 3, velocidad: 0 },
      ],
    });
    expect(d.tempMax).toEqual({ value: 61, motor: "b" }); // empate: queda el primero
    expect(d.torqueMax).toEqual({ value: -12, motor: "b" });
    expect(d.tempLevels).toEqual({ ok: 1, warn: 1, crit: 2 });
  });

  it("toma el primer motor aunque su temperatura y su torque sean cero", () => {
    const d = deriveMetrics({ ...base, motores: [{ nombre: "x", temperatura: 0, torque: 0, velocidad: 0 }, { nombre: "y", temperatura: -1, torque: 0, velocidad: 0 }] });
    expect(d.tempMax).toEqual({ value: 0, motor: "x" });
    expect(d.torqueMax).toEqual({ value: 0, motor: "x" });
  });

  it("una temperatura no numérica no cuenta en ningún color del semáforo", () => {
    const d = deriveMetrics({ ...base, motores: [{ nombre: "x", temperatura: Number.NaN, torque: 0, velocidad: 0 }] });
    expect(d.tempLevels).toEqual({ ok: 0, warn: 0, crit: 0 });
  });

  it("considera que camina solo si la velocidad media absoluta supera 0,35 rad/s", () => {
    const con = (vels) => deriveMetrics({ ...base, motores: vels.map((velocidad, i) => ({ nombre: `m${i}`, temperatura: 30, torque: 0, velocidad })) });
    expect(con([0.35, -0.35]).meanSpeed).toBe(0.35);
    expect(con([0.35, -0.35]).isMoving).toBe(false);
    expect(con([0.4, -0.3]).meanSpeed).toBeCloseTo(0.35);
    expect(con([0.5, -0.3]).meanSpeed).toBeCloseTo(0.4);
    expect(con([0.5, -0.3]).isMoving).toBe(true);
  });

  it("calcula tensión del pack, potencia, dispersión de celdas, contactos e inclinación", () => {
    const d = deriveMetrics({
      motores: [],
      bms: { celdas: [3.9, 4.05, 3.95], corriente: -2000 },
      fuerzas: { FR: 1, FL: 0, RR: 1, RL: 1 },
      imu: { roll: -7, pitch: 4 },
    });
    expect(d.packVoltage).toBeCloseTo(11.9);
    expect(d.powerW).toBeCloseTo(-23.8);
    expect(d.cellMin).toBe(3.9);
    expect(d.cellMax).toBe(4.05);
    expect(d.cellDeltaMv).toBe(150);
    expect(d.contacts).toBe(3);
    expect(d.legs).toBe(4);
    expect(d.tilt).toBe(7);
    expect(deriveMetrics({ ...base, imu: { roll: 2, pitch: -9 } }).tilt).toBe(9);
  });
});

describe("jointLabel", () => {
  it.each([
    ["FR_calf", "pantorrilla"],
    ["FL_thigh", "muslo"],
    ["RR_hip", "cadera"],
    ["RL_calf", "pantorrilla"],
    ["L_shoulder_pitch", "hombro · cabeceo"],
    ["R_hip_roll", "cadera · alabeo"],
    ["L_knee", "rodilla"],
    ["R_ankle_pitch", "tobillo · cabeceo"],
    ["L_elbow", "codo"],
    ["R_wrist_yaw", "muñeca · guiñada"],
    ["torso_yaw", "torso · guiñada"],
    ["motor_3", "motor · 3"],
  ])("%s → %s", (nombre, label) => {
    expect(jointLabel(nombre)).toBe(label);
  });
});

describe("motorGroup", () => {
  it.each([
    ["FR_hip", { key: "FR", label: "FR · Delantera derecha" }],
    ["FL_calf", { key: "FL", label: "FL · Delantera izquierda" }],
    ["RR_thigh", { key: "RR", label: "RR · Trasera derecha" }],
    ["RL_calf", { key: "RL", label: "RL · Trasera izquierda" }],
    ["torso_pitch", { key: "torso", label: "Torso" }],
    ["L_shoulder_roll", { key: "L_brazo", label: "Brazo izquierdo" }],
    ["R_elbow", { key: "R_brazo", label: "Brazo derecho" }],
    ["R_wrist_pitch", { key: "R_brazo", label: "Brazo derecho" }],
    ["L_knee", { key: "L_pierna", label: "Pierna izquierda" }],
    ["R_ankle_roll", { key: "R_pierna", label: "Pierna derecha" }],
    ["motor_0", { key: "otros", label: "Otros" }],
    ["singuion", { key: "otros", label: "Otros" }],
  ])("%s → %o", (nombre, grupo) => {
    expect(motorGroup(nombre)).toEqual(grupo);
  });

  it("agrupa los 29 motores del G1 en torso, dos brazos y dos piernas", () => {
    const grupos = new Map();
    for (const n of ROBOTS.g1.motores_nombres) {
      const { key } = motorGroup(n);
      grupos.set(key, (grupos.get(key) ?? 0) + 1);
    }
    expect(Object.fromEntries(grupos)).toEqual({ L_pierna: 6, R_pierna: 6, torso: 3, L_brazo: 7, R_brazo: 7 });
  });
});
