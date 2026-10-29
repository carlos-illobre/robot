/**
 * Helpers mínimos de DOM. Sin framework a propósito: el TP es sobre integrar
 * un backend con un frontend, y con JS "vanilla" se ve todo lo que pasa.
 */

/**
 * Crea un elemento: h("div", { class: "card", onclick: fn }, hijo1, "texto")
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else if (key === "html") el.innerHTML = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Igual que h() pero en el espacio de nombres SVG. */
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null) continue;
    el.setAttribute(key, value);
  }
  for (const child of children.flat()) if (child) el.append(child);
  return el;
}

/** Escribe texto solo si cambió: evita trabajo de layout innecesario a 10 Hz. */
export function setText(el, text) {
  const t = String(text);
  if (el.textContent !== t) el.textContent = t;
}

/** Formatea un número con signo fijo y decimales: fmt(-1.2345, 2) → "−1.23" */
export function fmt(value, decimals = 1, { sign = false } = {}) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value).toFixed(decimals);
  if (Number(abs) === 0) return (sign ? " " : "") + abs;
  if (value < 0) return `−${abs}`;
  return sign ? `+${abs}` : abs;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Hora local hh:mm:ss.mmm */
export function clock(date) {
  return date.toLocaleTimeString("es-AR", { hour12: false }) + "." + String(date.getMilliseconds()).padStart(3, "0");
}

/** Lee una variable CSS del tema actual. */
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
