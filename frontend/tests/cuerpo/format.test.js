import { describe, test, expect } from "vitest";
import { wrap360, cardinal, milliamps, currentSense, degrees } from "../../js/views/body/format.js";

describe("wrap360", () => {
  test.each([
    [0, 0], [45, 45], [359, 359], [360, 0], [720, 0], [-90, 270], [-180, 180], [-360, 0], [-450, 270], [400, 40],
  ])("lleva %d° a %d°", (input, out) => {
    expect(wrap360(input)).toBe(out);
  });
});

describe("cardinal", () => {
  test.each([
    [0, "N"], [22, "N"], [23, "NE"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"],
    [225, "SO"], [270, "O"], [315, "NO"], [337, "NO"], [338, "N"], [339, "N"], [359, "N"], [-90, "O"], [-45, "NO"], [450, "E"],
  ])("un rumbo de %d° es %s", (deg, dir) => {
    expect(cardinal(deg)).toBe(dir);
  });
});

describe("milliamps", () => {
  test.each([
    [0, "0 mA"],
    [999, "999 mA"],
    [1000, "1\u202f000 mA"],
    [4201, "4\u202f201 mA"],
    [4201.6, "4\u202f202 mA"],
    [1234567, "1\u202f234\u202f567 mA"],
    [-1234, "−1\u202f234 mA"],
    [-0.4, "−0 mA"],
  ])("%d → %s", (v, txt) => {
    expect(milliamps(v)).toBe(txt);
  });

  test.each([NaN, Infinity, -Infinity, undefined, null, "12"])("un valor no numérico (%s) se muestra como raya", (v) => {
    expect(milliamps(v)).toBe("—");
  });
});

describe("currentSense", () => {
  test.each([
    [1, "descargando"], [4200, "descargando"], [-1, "cargando"], [-3000, "cargando"],
    [0, "en reposo"], [0.99, "en reposo"], [-0.99, "en reposo"],
    [NaN, "en reposo"], [Infinity, "en reposo"], [undefined, "en reposo"],
  ])("una corriente de %s mA está %s", (v, txt) => {
    expect(currentSense(v)).toBe(txt);
  });
});

describe("degrees", () => {
  test("negativo con un decimal y signo menos tipográfico", () => {
    expect(degrees(-2.14)).toBe("−2.1°");
  });
  test("positivo lleva signo +", () => {
    expect(degrees(3.46)).toBe("+3.5°");
  });
  test("el cero va sin signo ni espacio", () => {
    expect(degrees(0)).toBe("0.0°");
    expect(degrees(-0.01)).toBe("0.0°");
  });
  test("acepta otra cantidad de decimales", () => {
    expect(degrees(3.456, 2)).toBe("+3.46°");
    expect(degrees(-10, 0)).toBe("−10°");
  });
  test("sin dato muestra raya", () => {
    expect(degrees(NaN)).toBe("—°");
  });
});
