// Pruebas de las secciones que explican cada vista (js/views/manual/views-content.js).
import { describe, test, expect } from "vitest";
import { existsSync } from "node:fs";

import { VIEW_SECTIONS } from "../../js/views/manual/views-content.js";
import { VIEWS } from "../../js/views/registry.js";
import { FRONTEND, MARCAS } from "./helpers.js";

const VISTAS = [
  ["vista-consola", "console", "Consola"],
  ["vista-cuerpo", "body", "Cuerpo"],
  ["vista-piloto", "pilot", "Piloto"],
  ["vista-gemelo", "twin", "Gemelo 3D"],
];
const seccion = (id) => VIEW_SECTIONS.find((s) => s.id === id);
const figura = (s) => s.blocks.find((b) => b.type === "figure");

describe("estructura", () => {
  test("abre con el capítulo 3 y sigue con una subsección por vista, en el orden de las teclas", () => {
    expect(VIEW_SECTIONS.map((s) => s.id)).toEqual(["vistas", ...VISTAS.map(([id]) => id)]);
    const [intro, ...subs] = VIEW_SECTIONS;
    expect(intro.kicker).toBe("3");
    expect(intro.toc).toBe("Las vistas");
    expect(intro.title).toBe("Las cuatro vistas, una por una");
    expect(intro.level).toBeUndefined();
    expect(subs.every((s) => s.level === 2)).toBe(true);
  });

  test("la introducción explica el botón Esquema | 3D y la tecla G", () => {
    const [aviso] = seccion("vistas").blocks;
    expect(aviso.type).toBe("callout");
    expect(aviso.kind).toBe("tip");
    expect(aviso.html).toContain("<kbd>G</kbd>");
    expect(aviso.html).toContain("<i>Esquema | 3D</i>");
  });

  test.each(VISTAS)("%s se llama como la vista en el índice", (id, _vista, label) => {
    expect(seccion(id).toc).toBe(label);
    expect(seccion(id).title.startsWith(`${label}:`)).toBe(true);
  });
});

describe.each(VISTAS)("%s", (id, vista) => {
  const s = seccion(id);
  const fig = figura(s);

  test("tiene su captura anotada, que existe en assets/manual", () => {
    expect(s.blocks.filter((b) => b.type === "figure")).toHaveLength(1);
    expect(fig.src).toBe(`assets/manual/${vista}-desktop.png`);
    expect(existsSync(`${FRONTEND}${fig.src}`)).toBe(true);
    expect(fig.alt.length).toBeGreaterThan(0);
  });

  test("toma las marcas de marcas.json y la leyenda tiene una entrada por marca", () => {
    expect(fig.marks).toBe(vista);
    expect(fig.markers).toBeUndefined();
    expect(Array.isArray(MARCAS[vista])).toBe(true);
    expect(fig.legend).toHaveLength(MARCAS[vista].length);
    for (const [titulo, texto] of fig.legend) {
      expect(titulo.length).toBeGreaterThan(0);
      expect(texto.length).toBeGreaterThan(0);
    }
  });

  test("las marcas medidas caen dentro de la captura", () => {
    for (const p of MARCAS[vista].filter(Boolean)) {
      expect(p).toHaveLength(2);
      for (const v of p) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  test("termina con un botón para abrir la vista, con la tecla del registro", () => {
    const ultimo = s.blocks.at(-1);
    const registrada = VIEWS.find((v) => v.id === vista);
    expect(ultimo.type).toBe("try");
    expect(ultimo.view).toBe(vista);
    expect(ultimo.key).toBe(registrada.key);
    expect(ultimo.label).toMatch(new RegExp(`^Abrir (la|el) ${registrada.label}$`));
  });

  test("empieza diciendo para qué sirve", () => {
    expect(s.blocks[0].type).toBe("p");
    expect(s.blocks[0].html.startsWith("<b>Para qué sirve:</b>")).toBe(true);
  });
});

describe("leyendas concretas", () => {
  test("la Consola numera sus cuatro paneles de la consigna", () => {
    const titulos = figura(seccion("vista-consola")).legend.map(([t]) => t);
    expect(titulos[0]).toBe("Franja de estado");
    for (const n of ["①", "②", "③", "④"]) expect(titulos.some((t) => t.startsWith(n))).toBe(true);
    expect(titulos.at(-1)).toBe("Barra inferior");
  });

  test("la Consola explica el semáforo con los umbrales de 40 y 60 °C", () => {
    const [, texto] = figura(seccion("vista-consola")).legend.find(([t]) => t === "Temperatura con semáforo");
    expect(texto).toContain("<b>Verde</b> &lt; 40 °C");
    expect(texto).toContain("<b>amarillo</b> 40–60 °C");
    expect(texto).toContain("<b>rojo</b> &gt; 60 °C");
  });
});
