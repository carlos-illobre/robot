import { describe, test, expect, vi, afterEach } from "vitest";
import { h, s, setText, fmt, clamp, clock, cssVar } from "../../js/ui/dom.js";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
});

describe("h()", () => {
  test("crea el elemento con clase, atributos, dataset, estilo y html", () => {
    const el = h("div", { class: "card x", id: "a", "aria-hidden": true, dataset: { modo: "real" }, style: { color: "red" }, title: 0 });
    expect(el.tagName).toBe("DIV");
    expect(el.className).toBe("card x");
    expect(el.getAttribute("id")).toBe("a");
    expect(el.getAttribute("aria-hidden")).toBe("");
    expect(el.dataset.modo).toBe("real");
    expect(el.style.color).toBe("red");
    expect(el.getAttribute("title")).toBe("0");
    expect(h("p", { html: "<b>hola</b>" }).innerHTML).toBe("<b>hola</b>");
  });

  test("un style de texto se escribe como atributo", () => {
    expect(h("p", { style: "color: blue" }).getAttribute("style")).toBe("color: blue");
  });

  test("saltea atributos undefined, null y false", () => {
    const el = h("input", { a: undefined, b: null, disabled: false, c: "" });
    expect(el.hasAttribute("a")).toBe(false);
    expect(el.hasAttribute("b")).toBe(false);
    expect(el.hasAttribute("disabled")).toBe(false);
    expect(el.getAttribute("c")).toBe("");
  });

  test("las claves on* con función son listeners; con texto, atributos", () => {
    const fn = vi.fn();
    const el = h("button", { onclick: fn, onfoo: "x" });
    el.click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute("onclick")).toBe(false);
    expect(el.getAttribute("onfoo")).toBe("x");
  });

  test("acepta attrs null y sin attrs", () => {
    expect(h("span", null, "x").outerHTML).toBe("<span>x</span>");
    expect(h("span").outerHTML).toBe("<span></span>");
  });

  test("agrega hijos nodos y textos, aplana arrays y saltea null/undefined/false", () => {
    const b = document.createElement("b");
    const el = h("p", {}, "a", [b, "c", null], undefined, false, 0, 7);
    expect(el.innerHTML).toBe("a<b></b>c07");
    expect(el.childNodes[1]).toBe(b);
  });
});

describe("s()", () => {
  test("crea elementos SVG con atributos e hijos", () => {
    const child = s("circle", { r: 2 });
    const el = s("g", { fill: "red", stroke: undefined, x: null, hidden: false }, child, null, [0, ""]);
    expect(el.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(el.getAttribute("fill")).toBe("red");
    expect(el.hasAttribute("stroke")).toBe(false);
    expect(el.hasAttribute("x")).toBe(false);
    expect(el.getAttribute("hidden")).toBe("false");
    expect(el.childNodes).toHaveLength(1);
    expect(el.firstChild).toBe(child);
    expect(child.getAttribute("r")).toBe("2");
  });

  test("acepta attrs null y sin attrs", () => {
    expect(s("g", null).attributes).toHaveLength(0);
    expect(s("g").attributes).toHaveLength(0);
  });
});

describe("setText()", () => {
  test("escribe solo si el texto cambió", () => {
    const el = document.createElement("span");
    let value = "";
    const set = vi.fn((v) => (value = v));
    Object.defineProperty(el, "textContent", { get: () => value, set });
    setText(el, 12);
    expect(set).toHaveBeenCalledWith("12");
    setText(el, "12");
    expect(set).toHaveBeenCalledTimes(1);
    setText(el, "13");
    expect(set).toHaveBeenCalledTimes(2);
    expect(value).toBe("13");
  });
});

describe("fmt()", () => {
  test("los valores no finitos son un guion largo", () => {
    expect(fmt(NaN)).toBe("—");
    expect(fmt(Infinity)).toBe("—");
    expect(fmt(undefined)).toBe("—");
  });
  test("redondea a 1 decimal por defecto", () => {
    expect(fmt(1.26)).toBe("1.3");
    expect(fmt(3, 2)).toBe("3.00");
  });
  test("los negativos llevan el signo menos tipográfico", () => {
    expect(fmt(-1.2345, 2)).toBe("−1.23");
  });
  test("con sign, los positivos llevan + y el cero un espacio", () => {
    expect(fmt(1.5, 1, { sign: true })).toBe("+1.5");
    expect(fmt(0, 1, { sign: true })).toBe(" 0.0");
    expect(fmt(-0.04, 1, { sign: true })).toBe(" 0.0");
  });
  test("un negativo que redondea a cero no lleva signo", () => {
    expect(fmt(-0.04, 1)).toBe("0.0");
    expect(fmt(0)).toBe("0.0");
  });
});

test("clamp() limita al rango", () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-1, 0, 10)).toBe(0);
  expect(clamp(11, 0, 10)).toBe(10);
});

test("clock() da la hora local con milisegundos de tres cifras", () => {
  const d = new Date(2026, 0, 2, 3, 4, 5, 7);
  expect(clock(d)).toBe(`${d.toLocaleTimeString("es-AR", { hour12: false })}.007`);
  expect(clock(new Date(2026, 0, 2, 3, 4, 5, 123))).toMatch(/\.123$/);
});

describe("cssVar()", () => {
  test("lee una variable CSS del documento y la recorta", () => {
    document.documentElement.style.setProperty("--x", "  rojo ");
    expect(cssVar("--x")).toBe("rojo");
  });
  test("lee la variable del elemento pedido", () => {
    const el = h("div", { style: "--y: azul" });
    document.body.append(el);
    expect(cssVar("--y", el)).toBe("azul");
    expect(cssVar("--y")).toBe("");
  });
});
