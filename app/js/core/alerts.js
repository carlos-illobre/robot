/**
 * Reglas de alarma. Funciones puras (sin DOM) para poder testearlas.
 *
 * `evaluateAlerts` dice qué condiciones están activas en una muestra.
 * `AlertTracker` compara con la muestra anterior y solo informa los CAMBIOS
 * (se activó / se normalizó). Sin eso, un motor a 61 °C dispararía 10
 * notificaciones por segundo.
 *
 * Histéresis: una alarma se activa al pasar el umbral, pero se apaga recién
 * un poco por debajo (60 °C → 58 °C; torque → 90 % del umbral). Así un motor
 * que oscila entre 59,9 y 60,1 °C no prende y apaga el aviso sin parar, igual
 * que un termostato.
 */

export const HYSTERESIS = Object.freeze({ tempC: 2, torqueRatio: 0.9, socPct: 2 });
import { TEMP_THRESHOLDS } from "./telemetryModel.js";

/**
 * @param {object} frame muestra normalizada
 * @param {object} opts  umbrales
 * @param {Set<string>} [wasActive] claves activas en la muestra anterior (para la histéresis)
 */
export function evaluateAlerts(frame, { torqueAlarm = 18, socAlarm = 20 } = {}, wasActive = new Set()) {
  const active = [];
  const on = (key, value, threshold, release, above = true) =>
    wasActive.has(key) ? (above ? value > release : value < release) : above ? value > threshold : value < threshold;

  for (const m of frame.motores) {
    if (on(`temp:${m.nombre}`, m.temperatura, TEMP_THRESHOLDS.crit, TEMP_THRESHOLDS.crit - HYSTERESIS.tempC)) {
      active.push({ key: `temp:${m.nombre}`, level: "crit", message: `${m.nombre} a ${m.temperatura.toFixed(0)} °C (> ${TEMP_THRESHOLDS.crit} °C)` });
    }
    if (on(`tau:${m.nombre}`, Math.abs(m.torque), torqueAlarm, torqueAlarm * HYSTERESIS.torqueRatio)) {
      active.push({ key: `tau:${m.nombre}`, level: "warn", message: `Torque de ${m.nombre}: ${Math.abs(m.torque).toFixed(1)} N·m (> ${torqueAlarm} N·m)` });
    }
  }
  if (frame.bms.soc > 0 && on("soc", frame.bms.soc, socAlarm, socAlarm + HYSTERESIS.socPct, false)) {
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

  /** Claves activas, para pasarle a evaluateAlerts (histéresis). */
  get keys() {
    return new Set(this.#active.keys());
  }

  reset() {
    this.#active.clear();
  }
}
