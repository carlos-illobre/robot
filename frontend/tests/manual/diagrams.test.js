// Pruebas de los diagramas SVG del manual (js/views/manual/diagrams.js).
import { describe, test, expect } from "vitest";

import { LEG, RPY, SEMAFORO, CELLS, GAIT } from "../../js/views/manual/diagrams.js";

/** Convierte el texto SVG en un elemento para consultarlo como DOM. */
function svg(markup) {
  const div = document.createElement("div");
  div.innerHTML = markup;
  expect(div.children).toHaveLength(1);
  return div.firstElementChild;
}
const textos = (el) => [...el.querySelectorAll("text")].map((t) => t.textContent);
const num = (el, attr) => Number(el.getAttribute(attr));

describe("todos los diagramas", () => {
  test.each([
    ["LEG", LEG, "0 0 520 260", "Pata del Go2 con sus tres articulaciones"],
    ["RPY", RPY, "0 0 660 230", "Roll, pitch y yaw"],
    ["SEMAFORO", SEMAFORO, "0 0 660 120", "Semáforo de temperatura"],
    ["CELLS", CELLS, "0 0 520 200", "Voltajes de celdas"],
    ["GAIT", GAIT, "0 0 580 200", "Diagrama de marcha al trote"],
  ])("%s es un <svg> accesible con su viewBox y descripción", (_, markup, viewBox, label) => {
    const el = svg(markup);
    expect(el.tagName.toLowerCase()).toBe("svg");
    expect(el.getAttribute("viewBox")).toBe(viewBox);
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toBe(label);
  });
});

describe("LEG: pata del Go2", () => {
  test("tiene cadera, rodilla y pie unidos por dos huesos", () => {
    const el = svg(LEG);
    const joints = [...el.querySelectorAll("circle.d-joint")];
    expect(joints.map((c) => [num(c, "cx"), num(c, "cy")])).toEqual([[290, 96], [350, 170]]);
    const pie = el.querySelector("circle.d-foot");
    expect([num(pie, "cx"), num(pie, "cy")]).toEqual([300, 238]);
    expect(el.querySelectorAll("line.d-bone")).toHaveLength(2);
    expect(el.querySelectorAll("path.d-arrow")).toHaveLength(2);
  });

  test("nombra las tres articulaciones y cuenta los 12 motores", () => {
    const el = svg(LEG);
    expect(textos(el)).toEqual([
      "cuerpo",
      "hip · cadera",
      "abre la pata al costado",
      "thigh · muslo",
      "adelante y atrás",
      "calf · pantorrilla",
      "dobla la rodilla",
      "Cada pata: FR, FL, RR, RL",
      "× 3 articulaciones = 12 motores",
    ]);
    const cuerpo = el.querySelector("text");
    expect([num(cuerpo, "x"), num(cuerpo, "y")]).toEqual([190, 74]);
    expect(cuerpo.getAttribute("text-anchor")).toBe("middle");
    expect(cuerpo.getAttribute("class")).toBe("d-label");
    expect(el.querySelectorAll("text.d-strong")).toHaveLength(4);
  });
});

describe("RPY: roll, pitch y yaw", () => {
  test("dibuja las tres viñetas en orden, con título y explicación", () => {
    const el = svg(RPY);
    const grupos = [...el.querySelectorAll(":scope > g")];
    expect(grupos.map((g) => g.getAttribute("transform"))).toEqual(["translate(110 105)", "translate(330 105)", "translate(550 95)"]);
    expect([...el.querySelectorAll("text.d-title")].map((t) => t.textContent)).toEqual(["ROLL", "PITCH", "YAW"]);
    expect(textos(el)).toContain("visto de frente: se inclina al costado");
    expect(textos(el)).toContain("de costado: sube o baja la cabeza");
    expect(textos(el)).toContain("desde arriba: hacia dónde mira");
    expect(textos(el)).toContain("N");
  });

  test("el cuerpo aparece rotado en cada viñeta y el yaw tiene una brújula", () => {
    const el = svg(RPY);
    const rot = [...el.querySelectorAll(":scope > g > g")].map((g) => g.getAttribute("transform"));
    expect(rot).toEqual(["rotate(-14)", "rotate(-10)", "rotate(35)"]);
    expect(el.querySelectorAll("rect.d-body")).toHaveLength(3);
    expect(num(el.querySelector("circle.d-ring"), "r")).toBe(66);
  });
});

describe("SEMAFORO: escala de temperatura", () => {
  test("las tres zonas cubren 20–40, 40–60 y 60–80 °C con los colores del semáforo", () => {
    const el = svg(SEMAFORO);
    const zonas = [...el.querySelectorAll("rect")];
    expect(zonas.map((r) => [num(r, "x"), num(r, "width"), r.getAttribute("fill")])).toEqual([
      [30, 200, "var(--sem-ok)"],
      [230, 200, "var(--sem-warn)"],
      [430, 200, "var(--sem-crit)"],
    ]);
    expect(zonas.every((r) => num(r, "y") === 36 && num(r, "height") === 22)).toBe(true);
    // Solo las puntas son redondeadas.
    expect(zonas.map((r) => r.getAttribute("rx"))).toEqual(["6", null, "6"]);
  });

  test("tiene una marca cada 10 °C, de 20 a 80", () => {
    const el = svg(SEMAFORO);
    const ticks = [...el.querySelectorAll("line.d-axis")];
    expect(ticks.map((l) => num(l, "x1"))).toEqual([30, 130, 230, 330, 430, 530, 630]);
    expect(ticks.every((l) => num(l, "x1") === num(l, "x2") && num(l, "y1") === 58 && num(l, "y2") === 66)).toBe(true);
    const etiquetas = [...el.querySelectorAll("text")].filter((t) => t.textContent.endsWith(" °C") && !t.textContent.includes("·"));
    expect(etiquetas.map((t) => t.textContent)).toEqual(["20 °C", "30 °C", "40 °C", "50 °C", "60 °C", "70 °C", "80 °C"]);
    expect(etiquetas.map((t) => num(t, "x"))).toEqual([30, 130, 230, 330, 430, 530, 630]);
  });

  test("cada zona está explicada arriba y abajo, centrada sobre ella", () => {
    const el = svg(SEMAFORO);
    const fuertes = [...el.querySelectorAll("text.d-strong")];
    expect(fuertes.map((t) => [t.textContent, num(t, "x"), num(t, "y")])).toEqual([
      ["VERDE · menos de 40 °C", 130, 26],
      ["AMARILLO · 40 a 60 °C", 330, 26],
      ["ROJO · más de 60 °C", 530, 26],
    ]);
    const abajo = [...el.querySelectorAll("text")].filter((t) => num(t, "y") === 106);
    expect(abajo.map((t) => [t.textContent, num(t, "x")])).toEqual([
      ["normal", 130],
      ["trabajando, vigilar", 330],
      ["frenar para que enfríe", 530],
    ]);
  });
});

describe("CELLS: celdas de batería", () => {
  const VOLTS = [4.06, 4.05, 4.06, 4.05, 4.06, 4.01, 4.05, 4.06];
  const y = (v) => 150 - ((v - 3.9) / 0.2) * 120;

  test("dibuja ocho barras con alto proporcional al voltaje, apoyadas en la base", () => {
    const el = svg(CELLS);
    const barras = [...el.querySelectorAll("rect")];
    expect(barras).toHaveLength(8);
    barras.forEach((r, i) => {
      expect(num(r, "x")).toBe(40 + i * 52);
      expect(num(r, "width")).toBe(34);
      expect(num(r, "y")).toBeCloseTo(y(VOLTS[i]), 6);
      expect(num(r, "y") + num(r, "height")).toBeCloseTo(150, 6);
    });
    expect(num(barras[0], "y")).toBeCloseTo(54, 6);
    expect(num(barras[5], "height")).toBeCloseTo(66, 6);
  });

  test("solo la celda desbalanceada (4,01 V) se pinta de amarillo y opaca", () => {
    const el = svg(CELLS);
    const barras = [...el.querySelectorAll("rect")];
    expect(barras.map((r) => r.getAttribute("fill"))).toEqual(VOLTS.map((v, i) => (i === 5 ? "var(--sem-warn)" : "var(--m-muted)")));
    expect(barras.map((r) => r.getAttribute("opacity"))).toEqual(VOLTS.map((v, i) => (i === 5 ? "1" : "0.55")));
  });

  test("rotula cada celda con su voltaje y marca la diferencia de 50 mV", () => {
    const el = svg(CELLS);
    const t = textos(el);
    expect(t.slice(0, 8)).toEqual(["4.06", "4.05", "4.06", "4.05", "4.06", "4.01", "4.05", "4.06"]);
    expect(t).toContain("Δ 50 mV");
    expect(t.at(-1)).toBe("8 celdas en serie · V");
    const guias = [...el.querySelectorAll("line.d-axis")];
    expect(guias.map((l) => num(l, "y1"))).toEqual([y(4.06), y(4.01)]);
    const delta = el.querySelector("line.d-accent-line");
    expect([num(delta, "y1"), num(delta, "y2")]).toEqual([y(4.06), y(4.01)]);
    const rotulo = [...el.querySelectorAll("text")].find((x) => x.textContent === "Δ 50 mV");
    expect(num(rotulo, "y")).toBeCloseTo((y(4.06) + y(4.01)) / 2 + 4, 6);
  });
});

describe("GAIT: diagrama de marcha del trote", () => {
  /** Matriz [pata][columna] → true si está apoyada. */
  function apoyos(el) {
    const rects = [...el.querySelectorAll("rect")];
    expect(rects).toHaveLength(4 * 20);
    return [0, 1, 2, 3].map((r) => rects.slice(r * 20, r * 20 + 20).map((x) => x.getAttribute("fill") === "var(--m-accent)"));
  }

  test("tiene una fila por pata, en el orden FR, FL, RR, RL", () => {
    const el = svg(GAIT);
    const filas = [...el.querySelectorAll("text.d-strong")];
    expect(filas.map((t) => [t.textContent, num(t, "x"), num(t, "y")])).toEqual([
      ["FR", 30, 54],
      ["FL", 30, 88],
      ["RR", 30, 122],
      ["RL", 30, 156],
    ]);
    expect(filas.every((t) => t.getAttribute("text-anchor") === "end")).toBe(true);
  });

  test("las celdas forman una grilla de 20 columnas por 4 filas", () => {
    const el = svg(GAIT);
    const rects = [...el.querySelectorAll("rect")];
    rects.forEach((r, k) => {
      const fila = Math.floor(k / 20);
      const col = k % 20;
      expect(num(r, "x")).toBe(44 + col * 26);
      expect(num(r, "y")).toBe(38 + fila * 34);
      expect(num(r, "width")).toBe(22);
      expect(num(r, "height")).toBe(22);
    });
  });

  test("FR y RL apoyan juntas, FL y RR también, y las dos diagonales se alternan cada 3 columnas", () => {
    const [fr, fl, rr, rl] = apoyos(svg(GAIT));
    expect(fr).toEqual(rl);
    expect(fl).toEqual(rr);
    expect(fr.map((v, i) => v !== fl[i])).toEqual(Array(20).fill(true));
    expect(fr.slice(0, 7)).toEqual([true, true, true, false, false, false, true]);
  });

  test("las celdas en el aire usan la clase d-empty", () => {
    const el = svg(GAIT);
    const vacias = [...el.querySelectorAll("rect.d-empty")];
    expect(vacias).toHaveLength(40);
    expect(vacias.every((r) => !r.hasAttribute("fill"))).toBe(true);
  });

  test("explica el eje del tiempo y la leyenda", () => {
    const t = textos(svg(GAIT));
    expect(t[0]).toBe("tiempo →");
    expect(t.at(-1)).toBe("■ apoyada   □ en el aire   ·   FR + RL juntas, FL + RR juntas");
  });
});
