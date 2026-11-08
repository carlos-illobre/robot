// Formatos propios de la cabina (vista Piloto).
import { describe, test, expect } from "vitest";
import { wrap360, signedDeg, heading, milliamps, currentSense } from "../../js/views/pilot/format.js";

describe("wrap360", () => {
  test("lleva un yaw negativo a [0, 360)", () => {
    expect(wrap360(-90)).toBe(270);
    expect(wrap360(-0.5)).toBe(359.5);
    expect(wrap360(-360)).toBe(0);
  });

  test("deja igual lo que ya está en rango y da la vuelta a lo que se pasa", () => {
    expect(wrap360(0)).toBe(0);
    expect(wrap360(123.5)).toBe(123.5);
    expect(wrap360(360)).toBe(0);
    expect(wrap360(725)).toBe(5);
  });
});

describe("signedDeg", () => {
  test("pone el signo explícito con un decimal por defecto", () => {
    expect(signedDeg(-2.14)).toBe("−2.1°");
    expect(signedDeg(0.4)).toBe("+0.4°");
  });

  test("el cero no lleva signo ni espacio de más", () => {
    expect(signedDeg(0)).toBe("0.0°");
    expect(signedDeg(-0.04)).toBe("0.0°");
  });

  test("respeta la cantidad de decimales pedida", () => {
    expect(signedDeg(5, 0)).toBe("+5°");
    expect(signedDeg(-10, 0)).toBe("−10°");
    expect(signedDeg(1.23456, 3)).toBe("+1.235°");
  });

  test("un valor no numérico se muestra como raya", () => {
    expect(signedDeg(Number.NaN)).toBe("—°");
  });
});

describe("heading", () => {
  test("rellena con ceros a tres cifras, como en un avión", () => {
    expect(heading(8)).toBe("008°");
    expect(heading(0)).toBe("000°");
    expect(heading(45)).toBe("045°");
    expect(heading(123.4)).toBe("123°");
  });

  test("convierte el yaw negativo en rumbo positivo", () => {
    expect(heading(-90)).toBe("270°");
    expect(heading(-180)).toBe("180°");
  });

  test("359.6° se redondea a 000° y no a 360°", () => {
    expect(heading(359.6)).toBe("000°");
    expect(heading(359.4)).toBe("359°");
  });
});

describe("milliamps", () => {
  /** Espacio fino (U+2009): separa los miles sin confundirse con el punto decimal. */
  const FINO = "\u2009";

  test("separa los miles con un espacio fino y no con punto", () => {
    expect(milliamps(4237)).toBe(`4${FINO}237 mA`);
    expect(milliamps(1000)).toBe(`1${FINO}000 mA`);
    expect(milliamps(1234567)).toBe(`1${FINO}234${FINO}567 mA`);
  });

  test("debajo de mil no hay separador", () => {
    expect(milliamps(999)).toBe("999 mA");
    expect(milliamps(4237)).not.toContain(".");
    expect(milliamps(0)).toBe("0 mA");
  });

  test("redondea y pone el signo menos tipográfico a la corriente negativa", () => {
    expect(milliamps(-1234.6)).toBe(`−1${FINO}235 mA`);
    expect(milliamps(12.4)).toBe("12 mA");
  });

  test.each([-0.4, -0.49, -0])("FR-005: %s mA, que redondea a cero, da «0 mA» sin signo", (v) => {
    expect(milliamps(v)).toBe("0 mA");
  });

  test("sin dato numérico devuelve una raya", () => {
    expect(milliamps(Number.NaN)).toBe("—");
    expect(milliamps(Infinity)).toBe("—");
    expect(milliamps(undefined)).toBe("—");
  });
});

describe("currentSense", () => {
  test("positiva es descarga y negativa es carga", () => {
    expect(currentSense(2500)).toBe("descarga");
    expect(currentSense(1)).toBe("descarga");
    expect(currentSense(-1)).toBe("carga");
    expect(currentSense(-800)).toBe("carga");
  });

  test("menos de 1 mA en valor absoluto es reposo", () => {
    expect(currentSense(0)).toBe("en reposo");
    expect(currentSense(0.99)).toBe("en reposo");
    expect(currentSense(-0.99)).toBe("en reposo");
  });

  test("sin dato numérico también es reposo", () => {
    expect(currentSense(Number.NaN)).toBe("en reposo");
    expect(currentSense(null)).toBe("en reposo");
  });
});
