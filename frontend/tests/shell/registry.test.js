import { test, expect, vi } from "vitest";

// Las vistas reales son de otras áreas (y traen three.js): acá solo importa que
// cada entrada del registro cargue SU módulo.
vi.mock("../../js/views/console/ConsoleView.js", () => ({ default: "ConsoleView" }));
vi.mock("../../js/views/body/BodyView.js", () => ({ default: "BodyView" }));
vi.mock("../../js/views/pilot/PilotView.js", () => ({ default: "PilotView" }));
vi.mock("../../js/views/twin/TwinView.js", () => ({ default: "TwinView" }));
vi.mock("../../js/views/manual/ManualView.js", () => ({ default: "ManualView" }));

const { VIEWS, viewById } = await import("../../js/views/registry.js");

test("el registro tiene las cinco vistas en el orden de las teclas 1 a 5", () => {
  expect(VIEWS.map((v) => [v.id, v.key])).toEqual([
    ["console", "1"],
    ["body", "2"],
    ["pilot", "3"],
    ["twin", "4"],
    ["manual", "5"],
  ]);
});

test("cada vista tiene etiqueta, pista, ícono y tema preferido", () => {
  expect(VIEWS.map((v) => [v.label, v.icon, v.theme])).toEqual([
    ["Consola", "list", "dark"],
    ["Cuerpo", "robot", "light"],
    ["Piloto", "compass", "dark"],
    ["Gemelo 3D", "cube", "dark"],
    ["Manual", "book", "light"],
  ]);
  for (const v of VIEWS) expect(v.hint.length, v.id).toBeGreaterThan(10);
});

test("cada vista carga su propio módulo de forma diferida", async () => {
  const loaded = await Promise.all(VIEWS.map((v) => v.load()));
  expect(loaded.map((m) => m.default)).toEqual(["ConsoleView", "BodyView", "PilotView", "TwinView", "ManualView"]);
});

test("viewById() busca por id", () => {
  expect(viewById("pilot")).toBe(VIEWS[2]);
  expect(viewById("manual")).toBe(VIEWS[4]);
});

test("viewById() con un id desconocido o vacío devuelve la Consola", () => {
  expect(viewById("nada")).toBe(VIEWS[0]);
  expect(viewById(undefined)).toBe(VIEWS[0]);
});
