import { test, expect } from "vitest";
import { icon } from "../../js/ui/icons.js";

const parse = (markup) => {
  const div = document.createElement("div");
  div.innerHTML = markup;
  return div.firstElementChild;
};

test("icon() arma un <svg> de 18 px con los trazos del ícono", () => {
  const svg = parse(icon("check"));
  expect(svg.tagName.toLowerCase()).toBe("svg");
  expect(svg.getAttribute("class")).toBe("icon ");
  expect(svg.getAttribute("width")).toBe("18");
  expect(svg.getAttribute("height")).toBe("18");
  expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.getAttribute("stroke")).toBe("currentColor");
  expect(svg.innerHTML).toBe('<path d="M20 6 9 17l-5-5"></path>');
});

test("icon() respeta el tamaño y la clase pedidos", () => {
  const svg = parse(icon("x", { size: 15, cls: "rojo" }));
  expect(svg.getAttribute("class")).toBe("icon rojo");
  expect(svg.getAttribute("width")).toBe("15");
  expect(svg.getAttribute("height")).toBe("15");
  expect(svg.innerHTML).toContain("M18 6 6 18");
});

test("un ícono desconocido es un <svg> vacío", () => {
  expect(parse(icon("no-existe")).innerHTML).toBe("");
});

test("están los íconos que usan la barra y las vistas", () => {
  for (const name of ["robot", "list", "compass", "cube", "book", "activity", "keyboard", "sun", "moon", "alert", "info", "check", "x"]) {
    expect(parse(icon(name)).children.length, name).toBeGreaterThan(0);
  }
});
