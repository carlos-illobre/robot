/**
 * Reglas de alarma. Funciones puras (sin DOM) para poder testearlas.
 *
 * `evaluateAlerts` dice qué condiciones están activas en una muestra.
 * `AlertTracker` compara con la muestra anterior y solo informa los CAMBIOS
 * (se activó / se normalizó). Sin eso, un motor a 61 °C dispararía 10
 * notificaciones por segundo.
 */
import { TEMP_THRESHOLDS } from "./telemetryModel.js";

export function evaluateAlerts(frame, { torqueAlarm = 18, socAlarm = 20 } = {}) {
  const active = [];
  for (const m of frame.motores) {
    if (m.temperatura > TEMP_THRESHOLDS.crit) {
      active.push({ key: `temp:${m.nombre}`, level: "crit", message: `${m.nombre} a ${m.temperatura.toFixed(0)} °C (> ${TEMP_THRESHOLDS.crit} °C)` });
    }
    if (Math.abs(m.torque) > torqueAlarm) {
      active.push({ key: `tau:${m.nombre}`, level: "warn", message: `Torque de ${m.nombre}: ${Math.abs(m.torque).toFixed(1)} N·m (> ${torqueAlarm} N·m)` });
    }
  }
  if (frame.bms.soc > 0 && frame.bms.soc < socAlarm) {
    active.push({ key: "soc", level: "crit", message: `Batería baja: ${frame.bms.soc} %` });
  }
  return active;
}

export class AlertTracker {
  #active = new Map();

  /** @returns {{raised: object[], cleared: object[], active: object[]}} */
  update(alerts) {
    const next = new Map(alerts.map((a) => [a.key, a]));
    const raised = alerts.filter((a) => !this.#active.has(a.key));
    const cleared = [...this.#active.values()].filter((a) => !next.has(a.key));
    this.#active = next;
    return { raised, cleared, active: alerts };
  }

  reset() {
    this.#active.clear();
  }
}
