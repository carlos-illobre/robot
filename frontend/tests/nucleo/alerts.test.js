// Reglas de alarma: umbrales, histéresis y seguimiento de cambios.
import { describe, it, expect } from "vitest";
import { evaluateAlerts, AlertTracker, HYSTERESIS } from "../../js/core/alerts.js";
import { normalizeFrame } from "../../js/core/telemetryModel.js";
import { rawFrame } from "./helpers.js";

const frame = ({ motores = [], soc = 80 } = {}) => ({ motores, bms: { soc } });
const m = (nombre, temperatura = 30, torque = 0) => ({ nombre, temperatura, torque });
const keys = (alerts) => alerts.map((a) => a.key);

describe("HYSTERESIS", () => {
  it("apaga 2 °C abajo, al 90 % del torque y 2 % arriba en batería", () => {
    expect(HYSTERESIS).toEqual({ tempC: 2, torqueRatio: 0.9, socPct: 2 });
    expect(Object.isFrozen(HYSTERESIS)).toBe(true);
  });
});

describe("evaluateAlerts: temperatura", () => {
  it("un motor a 61 °C dispara una alarma crítica con su mensaje", () => {
    expect(evaluateAlerts(frame({ motores: [m("FR_calf", 61.4)] }))).toEqual([
      { key: "temp:FR_calf", level: "crit", message: "FR_calf a 61 °C (> 60 °C)" },
    ]);
  });

  it("a 60 °C justos todavía no hay alarma", () => {
    expect(evaluateAlerts(frame({ motores: [m("FR_calf", 60)] }))).toEqual([]);
  });

  it("si ya estaba activa sigue encendida hasta bajar de 58 °C", () => {
    const antes = new Set(["temp:FR_calf"]);
    expect(keys(evaluateAlerts(frame({ motores: [m("FR_calf", 58.1)] }), {}, antes))).toEqual(["temp:FR_calf"]);
    expect(evaluateAlerts(frame({ motores: [m("FR_calf", 58)] }), {}, antes)).toEqual([]);
  });

  it("la histéresis es por motor: otro motor a 59 °C no queda encendido", () => {
    const antes = new Set(["temp:FR_calf"]);
    expect(keys(evaluateAlerts(frame({ motores: [m("FR_calf", 59), m("FL_calf", 59)] }), {}, antes))).toEqual(["temp:FR_calf"]);
  });
});

describe("evaluateAlerts: torque", () => {
  it("usa 18 N·m por defecto y compara el valor absoluto", () => {
    expect(evaluateAlerts(frame({ motores: [m("L_knee", 30, -18.25)] }))).toEqual([
      { key: "tau:L_knee", level: "warn", message: "Torque de L_knee: 18.3 N·m (> 18 N·m)" },
    ]);
    expect(evaluateAlerts(frame({ motores: [m("L_knee", 30, 18)] }))).toEqual([]);
  });

  it("respeta un umbral propio", () => {
    expect(keys(evaluateAlerts(frame({ motores: [m("L_knee", 30, 10.5)] }), { torqueAlarm: 10 }))).toEqual(["tau:L_knee"]);
    expect(evaluateAlerts(frame({ motores: [m("L_knee", 30, 10.5)] }), { torqueAlarm: 10 })[0].message).toBe(
      "Torque de L_knee: 10.5 N·m (> 10 N·m)",
    );
  });

  it("encendida, se apaga recién al bajar del 90 % del umbral", () => {
    const antes = new Set(["tau:L_knee"]);
    expect(keys(evaluateAlerts(frame({ motores: [m("L_knee", 30, 16.3)] }), { torqueAlarm: 18 }, antes))).toEqual(["tau:L_knee"]);
    expect(evaluateAlerts(frame({ motores: [m("L_knee", 30, -16.2)] }), { torqueAlarm: 18 }, antes)).toEqual([]);
  });

  it("un motor caliente y con mucho torque dispara las dos alarmas, en orden", () => {
    expect(keys(evaluateAlerts(frame({ motores: [m("R_knee", 70, 30)] })))).toEqual(["temp:R_knee", "tau:R_knee"]);
  });
});

describe("evaluateAlerts: batería", () => {
  it("por debajo del 20 % avisa batería baja", () => {
    expect(evaluateAlerts(frame({ soc: 19 }))).toEqual([{ key: "soc", level: "crit", message: "Batería baja: 19 %" }]);
    expect(evaluateAlerts(frame({ soc: 20 }))).toEqual([]);
  });

  it("respeta un umbral propio", () => {
    expect(keys(evaluateAlerts(frame({ soc: 29 }), { socAlarm: 30 }))).toEqual(["soc"]);
  });

  it("encendida, se apaga recién por encima del 22 %", () => {
    const antes = new Set(["soc"]);
    expect(keys(evaluateAlerts(frame({ soc: 21.9 }), {}, antes))).toEqual(["soc"]);
    expect(keys(evaluateAlerts(frame({ soc: 22 }), {}, antes))).toEqual([]);
  });

  it("soc 0 significa 'sin dato' (simulador sin batería) y no alarma", () => {
    expect(evaluateAlerts(frame({ soc: 0 }))).toEqual([]);
    expect(evaluateAlerts(frame({ soc: 0 }), {}, new Set(["soc"]))).toEqual([]);
  });
});

describe("evaluateAlerts con robots completos", () => {
  it("Go2 sano (12 motores) no tiene alarmas; G1 (29) con un motor a 61 °C tiene una", () => {
    expect(evaluateAlerts(normalizeFrame(rawFrame("go2")))).toEqual([]);
    const g1 = normalizeFrame(rawFrame("g1", { motores: { R_wrist_yaw: { temperatura: 61 } } }));
    expect(keys(evaluateAlerts(g1))).toEqual(["temp:R_wrist_yaw"]);
  });
});

describe("AlertTracker", () => {
  const a = { key: "temp:FR_calf", level: "crit", message: "x" };
  const b = { key: "soc", level: "crit", message: "y" };

  it("arranca sin claves activas", () => {
    expect(new AlertTracker().keys).toEqual(new Set());
  });

  it("informa solo lo que se activó y lo que se normalizó", () => {
    const t = new AlertTracker();
    expect(t.update([a])).toEqual({ raised: [a], cleared: [], active: [a] });
    expect(t.update([a, b])).toEqual({ raised: [b], cleared: [], active: [a, b] });
    expect(t.update([b])).toEqual({ raised: [], cleared: [a], active: [b] });
    expect(t.keys).toEqual(new Set(["soc"]));
    expect(t.update([])).toEqual({ raised: [], cleared: [b], active: [] });
  });

  it("keys devuelve una copia: modificarla no cambia el estado", () => {
    const t = new AlertTracker();
    t.update([a]);
    t.keys.clear();
    expect(t.keys).toEqual(new Set(["temp:FR_calf"]));
  });

  it("reset olvida todo: la misma alarma vuelve a informarse como nueva", () => {
    const t = new AlertTracker();
    t.update([a]);
    t.reset();
    expect(t.keys.size).toBe(0);
    expect(t.update([a]).raised).toEqual([a]);
  });
});
