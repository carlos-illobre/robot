import { test, expect, vi, beforeEach } from "vitest";
import { applyTheme, currentTheme, themeForView, rememberTheme, onThemeChange } from "../../js/ui/theme.js";
import { settings } from "../../js/config.js";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "dark";
});

test("currentTheme() lee data-theme del <html>", () => {
  expect(currentTheme()).toBe("dark");
  document.documentElement.dataset.theme = "light";
  expect(currentTheme()).toBe("light");
});

test("applyTheme() cambia el tema y avisa a los suscriptos", () => {
  const fn = vi.fn();
  const off = onThemeChange(fn);
  applyTheme("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(fn).toHaveBeenCalledExactlyOnceWith("light");
  off();
});

test("applyTheme() con el mismo tema no avisa a nadie", () => {
  const fn = vi.fn();
  const off = onThemeChange(fn);
  applyTheme("dark");
  expect(fn).not.toHaveBeenCalled();
  off();
});

test("la función que devuelve onThemeChange() desuscribe", () => {
  const fn = vi.fn();
  const otro = vi.fn();
  const off = onThemeChange(fn);
  const offOtro = onThemeChange(otro);
  expect(off()).toBe(true);
  expect(off()).toBe(false);
  applyTheme("light");
  expect(fn).not.toHaveBeenCalled();
  expect(otro).toHaveBeenCalledWith("light");
  offOtro();
});

test("themeForView() usa el tema preferido de la vista, o oscuro", () => {
  expect(themeForView("body", "light")).toBe("light");
  expect(themeForView("console")).toBe("dark");
});

test("rememberTheme() guarda el tema elegido para esa vista", () => {
  rememberTheme("body", "dark");
  expect(settings.get("theme:body")).toBe("dark");
  expect(themeForView("body", "light")).toBe("dark");
  expect(themeForView("pilot", "light")).toBe("light");
});
