/**
 * Formatos de la vista Piloto. Los genéricos (fmt, clamp) viven en ui/dom.js;
 * acá solo los que necesita la cabina.
 */
import { fmt } from "../../ui/dom.js";

/** Lleva cualquier ángulo a [0, 360): el yaw puede llegar como −180…180. */
export const wrap360 = (deg) => ((deg % 360) + 360) % 360;

/** Diferencia angular más corta de `from` a `to`, en (−180, 180]. */
export const angleDelta = (from, to) => ((to - from + 540) % 360) - 180;

/** Grados con signo explícito: −2.1° / +0.4°. Así el cero no "salta" de ancho. */
export const signedDeg = (v, decimals = 1) => `${fmt(v, decimals, { sign: true }).trim()}°`;

/** Rumbo de tres cifras, como en un avión: 8 → "008°". */
export const heading = (yaw) => `${String(Math.round(wrap360(yaw)) % 360).padStart(3, "0")}°`;

/**
 * Corriente en mA con separador de miles fino ("4 237 mA"). Se evita el punto
 * de miles porque el tablero usa punto decimal y "4.237" se leería como 4 A.
 */
export function milliamps(value) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "−" : ""}${abs} mA`;
}

/** La API entrega la corriente POSITIVA al descargar (el robot consume). */
export function currentSense(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 1) return "en reposo";
  return value > 0 ? "descarga" : "carga";
}
