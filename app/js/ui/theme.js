/**
 * Tema claro / oscuro.
 *
 * Cada vista tiene su tema preferido (la Consola y el Piloto nacieron
 * oscuros; el Cuerpo, claro). Si el usuario cambia el tema en una vista, se
 * recuerda para esa vista.
 */
import { settings } from "../config.js";

const listeners = new Set();

export function currentTheme() {
  return document.documentElement.dataset.theme;
}

export function applyTheme(theme) {
  if (theme === currentTheme()) return;
  document.documentElement.dataset.theme = theme;
  for (const fn of listeners) fn(theme);
}

/** Tema a usar al entrar a una vista: lo que eligió el usuario, o el preferido de la vista. */
export function themeForView(viewId, preferred = "dark") {
  return settings.get(`theme:${viewId}`) ?? preferred;
}

export function rememberTheme(viewId, theme) {
  settings.set(`theme:${viewId}`, theme);
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
