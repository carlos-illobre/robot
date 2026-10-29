/**
 * Formatos propios de la vista Cuerpo. Los genéricos (fmt, clamp) están en
 * ui/dom.js; acá van solo los que necesitan un criterio de esta vista.
 */
import { fmt } from "../../ui/dom.js";

const DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

/** Lleva cualquier ángulo a [0, 360). El yaw puede llegar como −180…180. */
export const wrap360 = (deg) => ((deg % 360) + 360) % 360;

/** Punto cardinal más cercano a un rumbo: 338° → "NO". */
export const cardinal = (deg) => DIRS[Math.round(wrap360(deg) / 45) % 8];

/**
 * Corriente en mA con separador de miles fino ("4 201 mA"). Se evita el
 * punto de miles del castellano porque el resto del tablero usa punto
 * decimal y "4.201" se leería como cuatro amperes.
 */
export function milliamps(value) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "−" : ""}${abs} mA`;
}

/**
 * Sentido de la corriente. La API la entrega POSITIVA al descargar (el
 * robot consume); negativa significa que entra carga.
 */
export function currentSense(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 1) return "en reposo";
  return value > 0 ? "descargando" : "cargando";
}

/** Grados con signo y un decimal: −2.1° */
export const degrees = (v, decimals = 1) => `${fmt(v, decimals, { sign: true }).trim()}°`;
