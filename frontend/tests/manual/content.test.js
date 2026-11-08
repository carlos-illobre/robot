// Pruebas del contenido del manual (js/views/manual/content.js): que los datos
// estén bien formados y que lo que el texto promete exista de verdad.
import { describe, test, expect } from "vitest";
import { existsSync } from "node:fs";

import { SECTIONS } from "../../js/views/manual/content.js";
import { VIEW_SECTIONS } from "../../js/views/manual/views-content.js";
import * as D from "../../js/views/manual/diagrams.js";
import { VIEWS } from "../../js/views/registry.js";
import { FRONTEND } from "./helpers.js";

const TIPOS = ["p", "callout", "list", "steps", "table", "diagram", "cards", "figure", "try"];
const bloques = (tipo) => SECTIONS.flatMap((s) => (s.blocks ?? []).filter((b) => b.type === tipo));
const ids = SECTIONS.map((s) => s.id);
const seccion = (id) => SECTIONS.find((s) => s.id === id);

/** Todos los textos (HTML) de una sección, para buscar enlaces. */
function textos(s) {
  const out = [s.lead ?? ""];
  for (const b of s.blocks ?? []) {
    if (b.html) out.push(b.html);
    if (b.items) out.push(...b.items.map((i) => (typeof i === "string" ? i : i.text)));
    if (b.rows) out.push(...b.rows.flat().map(String));
    if (b.legend) out.push(...b.legend.map(([, t]) => t));
    if (b.caption) out.push(b.caption);
  }
  return out;
}

describe("estructura", () => {
  test("los ids de sección son únicos y sirven como ancla (#man-<id>)", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("el manual arranca en la bienvenida y termina en el glosario", () => {
    expect(ids[0]).toBe("inicio");
    expect(seccion("inicio").toc).toBe("Bienvenida");
    expect(ids.at(-1)).toBe("glosario");
  });

  test("el orden de los capítulos es el del índice pensado", () => {
    expect(ids).toEqual([
      "inicio",
      "robot-real",
      "primeros-pasos",
      "fuentes",
      "conceptos",
      "motores",
      "magnitudes",
      "imu",
      "bateria",
      "patas",
      "real-derivado",
      ...VIEW_SECTIONS.map((s) => s.id),
      "capturas",
      "alarmas",
      "atajos",
      "problemas",
      "glosario",
    ]);
  });

  test("las secciones de las vistas se insertan tal cual, en orden y juntas", () => {
    const i = SECTIONS.indexOf(VIEW_SECTIONS[0]);
    expect(i).toBeGreaterThan(0);
    expect(SECTIONS.slice(i, i + VIEW_SECTIONS.length)).toEqual(VIEW_SECTIONS);
    VIEW_SECTIONS.forEach((s, k) => expect(SECTIONS[i + k]).toBe(s));
  });

  test("cada sección tiene título y solo usa niveles 1 y 2; ninguna subsección abre el manual", () => {
    for (const s of SECTIONS) {
      expect(typeof s.title).toBe("string");
      expect(s.title.length).toBeGreaterThan(0);
      expect([undefined, 1, 2]).toContain(s.level);
    }
    expect(SECTIONS[0].level).toBeUndefined();
  });

  test("los capítulos principales están numerados del 1 al 8 en orden", () => {
    const numerados = SECTIONS.filter((s) => /^\d+$/.test(s.kicker ?? ""));
    expect(numerados.map((s) => s.kicker)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(numerados.every((s) => s.level === undefined)).toBe(true);
  });

  test("todos los bloques son de un tipo que la vista sabe dibujar", () => {
    for (const s of SECTIONS) for (const b of s.blocks ?? []) expect(TIPOS).toContain(b.type);
  });
});

describe("enlaces y referencias", () => {
  test("todo enlace interno #man-… del texto apunta a una sección existente", () => {
    const destinos = SECTIONS.flatMap((s) => textos(s).flatMap((t) => [...t.matchAll(/href=['"]#man-([^'"]+)['"]/g)].map((m) => m[1])));
    expect(destinos.length).toBeGreaterThan(0);
    for (const d of destinos) expect(ids).toContain(d);
  });

  test("las tarjetas y los botones 'Probar' llevan a vistas registradas", () => {
    const vistas = VIEWS.map((v) => v.id);
    const cards = bloques("cards").flatMap((b) => b.items);
    expect(cards.length).toBe(4);
    for (const c of cards) {
      if (c.view) expect(vistas).toContain(c.view);
      else expect(ids).toContain(c.section);
    }
    for (const t of bloques("try")) expect(vistas).toContain(t.view);
  });

  test("la tecla de cada tarjeta es la misma que la del registro de vistas", () => {
    for (const c of bloques("cards").flatMap((b) => b.items)) {
      const v = VIEWS.find((x) => x.id === c.view);
      expect(c.key).toBe(v.key);
      expect(c.title).toBe(v.label);
    }
  });

  test("las imágenes de tarjetas y figuras existen en assets/manual", () => {
    const rutas = [...bloques("cards").flatMap((b) => b.items.map((c) => c.img)), ...bloques("figure").map((f) => f.src)].filter(Boolean);
    expect(rutas.length).toBeGreaterThanOrEqual(8);
    for (const r of rutas) {
      expect(r.startsWith("assets/manual/")).toBe(true);
      expect(existsSync(`${FRONTEND}${r}`)).toBe(true);
    }
  });
});

describe("bloques", () => {
  test("cada tabla tiene encabezado y todas sus filas tienen la misma cantidad de columnas", () => {
    const tablas = bloques("table");
    expect(tablas.length).toBeGreaterThan(5);
    for (const t of tablas) {
      expect(t.head.length).toBeGreaterThan(1);
      expect(t.rows.length).toBeGreaterThan(0);
      for (const r of t.rows) expect(r).toHaveLength(t.head.length);
    }
  });

  test("los diagramas son los de diagrams.js, cada uno una sola vez y con epígrafe", () => {
    const svgs = bloques("diagram").map((b) => b.svg);
    expect(svgs).toEqual([D.LEG, D.SEMAFORO, D.RPY, D.CELLS, D.GAIT]);
    for (const b of bloques("diagram")) expect(b.caption.length).toBeGreaterThan(0);
  });

  test("las figuras con marcas fijas tienen una entrada de leyenda por marca y quedan dentro de la imagen", () => {
    const fijas = bloques("figure").filter((f) => f.markers);
    expect(fijas).toHaveLength(3);
    for (const f of fijas) {
      expect(f.legend).toHaveLength(f.markers.length);
      for (const [x, y] of f.markers) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
      expect(f.alt.length).toBeGreaterThan(0);
    }
  });

  test("los avisos usan solo los tipos info, tip y warn", () => {
    for (const b of bloques("callout")) expect(["info", "tip", "warn"]).toContain(b.kind);
  });

  test("los pasos del laboratorio siguen la numeración: el segundo bloque arranca en 3", () => {
    const pasos = seccion("robot-real").blocks.filter((b) => b.type === "steps");
    expect(pasos).toHaveLength(2);
    expect(pasos[0].start).toBeUndefined();
    expect(pasos[0].items).toHaveLength(2);
    expect(pasos[1].start).toBe(3);
  });
});

describe("lo que el manual afirma coincide con el resto del dashboard", () => {
  test("el semáforo explicado es el de la consigna: verde < 40, amarillo 40–60, rojo > 60", () => {
    expect(D.SEMAFORO).toContain("VERDE · menos de 40 °C");
    expect(D.SEMAFORO).toContain("AMARILLO · 40 a 60 °C");
    expect(D.SEMAFORO).toContain("ROJO · más de 60 °C");
  });

  test("los atajos listan las cinco vistas con sus teclas del 1 al 5", () => {
    const tabla = seccion("atajos").blocks.find((b) => b.type === "table");
    const fila = tabla.rows[0];
    expect(fila[0]).toBe(VIEWS.map((v) => `<kbd>${v.key}</kbd>`).join(" "));
    expect(fila[1]).toBe(VIEWS.map((v) => v.label).join(" · "));
  });

  test("la sección de motores dice 12 motores para el Go2 y 29 para el G1", () => {
    const p = seccion("motores").blocks[0].html;
    expect(p).toContain("<b>Go2</b> (perro) tiene <b>12</b>");
    expect(p).toContain("<b>G1</b> (humanoide) tiene <b>29</b>");
  });
});
