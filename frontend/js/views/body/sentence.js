/**
 * La frase de arriba: el estado del robot en lenguaje natural.
 *
 * Es una función pura (muestra → textos) para poder probarla sin DOM. Devuelve
 * cuatro tramos fijos en lugar de HTML: la vista los escribe en cuatro <span>
 * creados una sola vez, así `update()` solo cambia textContent.
 */
import { fmt } from "../../ui/dom.js";
import { tempLevel, TEMP_THRESHOLDS } from "../../core/telemetryModel.js";
import { wrap360 } from "./format.js";

/** Velocidad de giro (°/s) a partir de la cual decimos que "dobla". */
export const TURN_THRESHOLD = 8;

/**
 * Velocidad de giro media en °/s de las últimas muestras. Desenrolla el salto
 * 359° → 0° para que cruzar el norte no parezca un giro de 359°.
 * @param {object[]} frames muestras en orden cronológico (≥ 2)
 */
export function yawRate(frames) {
  if (frames.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < frames.length; i++) {
    let d = wrap360(frames[i].imu.yaw) - wrap360(frames[i - 1].imu.yaw);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    total += d;
  }
  const dt = (frames.at(-1).receivedAt - frames[0].receivedAt) / 1000;
  return dt > 0 ? total / dt : 0;
}

/** "4 patas apoyadas", "1 de 2 pies apoyado"… según el robot. */
function contactsText(frame) {
  const { contacts, legs } = frame.derived;
  if (!legs) return "sin datos de contacto";
  // El G1 informa pies (R_foot, L_foot); el Go2, patas. Cambia el género.
  const feet = Object.keys(frame.fuerzas).some((k) => k.endsWith("_foot"));
  const one = contacts === 1;
  const noun = feet ? (one ? "pie" : "pies") : one ? "pata" : "patas";
  const adj = (feet ? "apoyado" : "apoyada") + (one ? "" : "s");
  if (contacts === 0) return feet ? "ningún pie apoyado" : "ninguna pata apoyada";
  if (contacts === legs) {
    const all = { 2: feet ? "los dos" : "las dos", 4: "las cuatro" }[legs] ?? `${feet ? "los" : "las"} ${legs}`;
    return `${all} ${noun} ${adj}`;
  }
  return `${contacts} de ${legs} ${noun} ${adj}`;
}

/**
 * @param {object} frame   muestra normalizada
 * @param {number} turn    velocidad de giro en °/s (ver yawRate)
 * @returns {{action:string, contacts:string, heat:string, heatLevel:string, battery:string}}
 */
export function describe(frame, turn = 0) {
  const moving = frame.derived.isMoving;
  const turning = Math.abs(turn) > TURN_THRESHOLD;
  const action = moving ? (turning ? "Caminando y doblando" : "Caminando derecho") : turning ? "Girando en el lugar" : "Quieto";

  const hot = frame.motores.filter((m) => m.temperatura > TEMP_THRESHOLDS.crit).sort((a, b) => b.temperatura - a.temperatura);
  const top = frame.derived.tempMax;
  let heat = "";
  let heatLevel = "ok";
  if (hot.length) {
    heatLevel = "crit";
    heat = `${hot[0].nombre} a ${fmt(hot[0].temperatura, 1)} °C`;
    heat += hot.length > 1 ? ` y ${hot.length - 1} más sobre ${TEMP_THRESHOLDS.crit} °C` : ` (más de ${TEMP_THRESHOLDS.crit} °C)`;
  } else if (top) {
    heatLevel = tempLevel(top.value);
    heat = `el más caliente: ${top.motor} a ${fmt(top.value, 1)} °C`;
  }

  return {
    action,
    contacts: contactsText(frame),
    heat,
    heatLevel,
    battery: `batería ${fmt(frame.bms.soc, 0)} %`,
  };
}
