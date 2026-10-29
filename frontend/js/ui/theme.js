/** Tema claro / oscuro. Se recuerda en localStorage y respeta la preferencia del sistema. */
import { settings } from "../config.js";

const listeners = new Set();

export function currentTheme() {
  return document.documentElement.dataset.theme;
}

export function initTheme() {
  const saved = settings.get("theme");
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  applyTheme(saved ?? (prefersLight ? "light" : "dark"));
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  settings.set("theme", theme);
  for (const fn of listeners) fn(theme);
}

export function toggleTheme() {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
}

export function onThemeChange(fn) {
  listeners.add(fn);
}
