/** Utilidades chicas que comparten los paneles de la Consola. */

/** Cambia un atributo solo si su valor es distinto: a 10 Hz evita recalcular estilos de gusto. */
export function setAttr(el, name, value) {
  const v = String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

/**
 * Entero con separador de miles: −4234 → "−4 234". Se usa un espacio fino y no
 * un punto porque en todo el dashboard el punto es el separador decimal.
 */
export function grouped(n) {
  const digits = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n <= -0.5 ? `−${digits}` : digits;
}

/** true si el usuario pidió menos movimiento en el sistema operativo. */
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
