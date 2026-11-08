import { describe, test, expect, vi, afterEach } from "vitest";
import { setAttr, grouped, reducedMotion } from "../../js/views/console/util.js";
import { movimientoReducido } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("setAttr", () => {
  test("escribe el atributo convertido a texto", () => {
    const el = document.createElement("div");
    setAttr(el, "data-on", true);
    expect(el.getAttribute("data-on")).toBe("true");
    setAttr(el, "data-n", 3);
    expect(el.getAttribute("data-n")).toBe("3");
  });

  test("no vuelve a escribir si el valor no cambió", () => {
    const el = document.createElement("div");
    el.setAttribute("data-level", "ok");
    const spy = vi.spyOn(el, "setAttribute");
    setAttr(el, "data-level", "ok");
    expect(spy).not.toHaveBeenCalled();
    setAttr(el, "data-level", "crit");
    expect(spy).toHaveBeenCalledExactlyOnceWith("data-level", "crit");
    expect(el.getAttribute("data-level")).toBe("crit");
  });
});

describe("grouped", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [1000, "1\u202F000"],
    [4234, "4\u202F234"],
    [1234567, "1\u202F234\u202F567"],
    [12.6, "13"],
    [-4234, "−4\u202F234"],
    [-0.6, "−1"],
    [-0.4, "0"],
    [0.4, "0"],
  ])("grouped(%s) → %s", (n, esperado) => {
    expect(grouped(n)).toBe(esperado);
  });

  test("separa los miles con un espacio fino irrompible (U+202F), no con punto", () => {
    expect(grouped(1500)).toBe("1\u202F500");
    expect(grouped(1500)).not.toContain(".");
  });

  test("usa el signo menos tipográfico y no el guion", () => {
    expect(grouped(-1500)).not.toContain("-");
    expect(grouped(-1500).startsWith("−")).toBe(true);
  });
});

describe("reducedMotion", () => {
  test("consulta prefers-reduced-motion y devuelve su resultado", () => {
    const mm = movimientoReducido(true);
    expect(reducedMotion()).toBe(true);
    expect(mm).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    movimientoReducido(false);
    expect(reducedMotion()).toBe(false);
  });
});
