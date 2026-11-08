// Anillo de motores (SVG) con /info y muestras reales del Go2 y del G1.
import { describe, test, expect, vi } from "vitest";
import { MotorRing } from "../../js/views/pilot/MotorRing.js";
import { infoDe, muestra, simular, temperaturas } from "./helpers.js";

const GO2 = infoDe("go2");
const G1 = infoDe("g1");

function anillo(info = GO2) {
  const onSelect = vi.fn();
  const ring = new MotorRing({ onSelect });
  ring.build(info);
  return { ring, onSelect };
}
const segEl = (ring, name) => ring.svg.querySelector(`.pv-seg[data-name="${name}"]`);
const visibles = (ring) => [...ring.byName].filter(([, e]) => e.callout.g.getAttribute("visibility") === "visible").map(([n]) => n);
const quieto = (raw) => raw.motores.forEach((m) => (m.velocidad = 0));

describe("construcción", () => {
  test("el SVG tiene viewBox centrado, rol de imagen y descripción", () => {
    const ring = new MotorRing({ onSelect: () => {} });
    expect(ring.svg.getAttribute("viewBox")).toBe("-250 -250 500 500");
    expect(ring.svg.getAttribute("role")).toBe("img");
    expect(ring.svg.getAttribute("aria-label")).toMatch(/^Anillo de motores/);
    expect(ring.figure.getAttribute("class")).toBe("pv-ring__figure");
  });

  test("con el Go2 crea 12 segmentos, 4 patas y la silueta vista desde arriba", () => {
    const { ring } = anillo(GO2);
    expect(ring.kind).toBe("cuadrupedo");
    expect(ring.svg.querySelectorAll(".pv-seg")).toHaveLength(12);
    expect(ring.svg.querySelectorAll(".pv-callout")).toHaveLength(12);
    expect(ring.svg.querySelectorAll(".pv-foot")).toHaveLength(4);
    expect(ring.svg.querySelectorAll(".pv-silhouette__leg")).toHaveLength(4);
    expect(ring.svg.querySelectorAll("rect.pv-silhouette__body")).toHaveLength(2);
    expect(ring.svg.querySelector(".pv-ring__groups").children).toHaveLength(0);
    expect(ring.stateText.getAttribute("y")).toBe("4");
    expect(ring.stateText.textContent).toBe("—");
  });

  test("cada segmento arranca sin nivel, con su nombre y sus cuatro trazos", () => {
    const { ring } = anillo(GO2);
    const g = segEl(ring, "FR_hip");
    expect(g.getAttribute("data-level")).toBe("unknown");
    expect(g.querySelector("title").textContent).toBe("FR_hip");
    expect(g.querySelector(".pv-seg__main").getAttribute("d")).toMatch(/^M\S+ \S+A180 180 0 0 1 /);
    expect(g.querySelector(".pv-seg__glow").getAttribute("d")).toBe(g.querySelector(".pv-seg__main").getAttribute("d"));
    expect(g.querySelector(".pv-seg__torque").getAttribute("d")).toMatch(/A162 162 /);
    expect(g.querySelector(".pv-seg__pick").getAttribute("d")).toMatch(/A202 202 /);
  });

  test("las patas del Go2 van afuera del anillo, en las diagonales", () => {
    const { ring } = anillo(GO2);
    const fr = ring.feet.get("FR").g;
    expect(fr.getAttribute("data-contact")).toBe("0");
    expect(fr.querySelector("title").textContent).toBe("Delantera derecha");
    const dot = fr.querySelector(".pv-foot__dot");
    expect([dot.getAttribute("cx"), dot.getAttribute("cy"), dot.getAttribute("r")]).toEqual(["155.6", "-155.6", "11"]);
    const label = fr.querySelector("text");
    expect([label.textContent, label.getAttribute("x"), label.getAttribute("y")]).toEqual(["FR", "173.9", "-168.9"]);
    const line = ring.feet.get("FR").line;
    expect([line.getAttribute("x1"), line.getAttribute("y1"), line.getAttribute("x2"), line.getAttribute("y2")]).toEqual(["26", "-54", "96.2", "-96.2"]);
  });

  test("con el G1 crea 29 segmentos, rótulos de grupo y los pies adentro", () => {
    const { ring } = anillo(G1);
    expect(ring.kind).toBe("humanoide");
    expect(ring.svg.querySelectorAll(".pv-seg")).toHaveLength(29);
    const labels = [...ring.svg.querySelector(".pv-ring__groups").children];
    expect(labels.map((t) => t.textContent)).toEqual(["TORSO", "BRAZO D", "PIERNA D", "PIERNA I", "BRAZO I"]);
    expect([labels[0].getAttribute("x"), labels[0].getAttribute("y")]).toEqual(["0.0", "-130.0"]);
    expect([labels[1].getAttribute("x"), labels[1].getAttribute("y")]).toEqual(["119.3", "-57.1"]);
    expect(ring.stateText.getAttribute("y")).toBe("-6");
    expect(ring.svg.querySelectorAll("circle.pv-silhouette__body")).toHaveLength(1);
    expect(ring.svg.querySelectorAll(".pv-silhouette__limb")).toHaveLength(2);
  });

  test("los pies del G1 quedan al final de las piernas, con el rótulo debajo", () => {
    const { ring } = anillo(G1);
    const r = ring.feet.get("R_foot");
    const dot = r.g.querySelector(".pv-foot__dot");
    expect([dot.getAttribute("cx"), dot.getAttribute("cy")]).toEqual(["34.6", "106.5"]);
    const label = r.g.querySelector("text");
    expect([label.textContent, label.getAttribute("x"), label.getAttribute("y")]).toEqual(["PIE D", "34.6", "137.5"]);
    expect(r.g.querySelector("title").textContent).toBe("Pie derecho");
    expect([r.line.getAttribute("x1"), r.line.getAttribute("x2"), r.line.getAttribute("y2")]).toEqual(["14", "34.6", "106.5"]);
  });

  test("un humanoide sin pies dibuja las piernas igual, hasta abajo", () => {
    const { ring } = anillo({ ...G1, patas: [] });
    const left = ring.svg.querySelector('[data-leg="L_foot"]');
    expect([left.getAttribute("x2"), left.getAttribute("y2")]).toEqual(["-18.0", "100.0"]);
    expect(ring.svg.querySelector(".pv-ring__nofeet").textContent).toBe("G1 · SIN DATOS DE PATAS");
  });

  test("un cuadrúpedo sin patas dibuja las patas en las diagonales y avisa", () => {
    const { ring } = anillo({ ...GO2, patas: [] });
    const rr = ring.svg.querySelector('[data-leg="RR"]');
    expect([rr.getAttribute("x2"), rr.getAttribute("y2")]).toEqual(["96.2", "96.2"]);
    const fl = ring.svg.querySelector('[data-leg="FL"]');
    expect([fl.getAttribute("x2"), fl.getAttribute("y2")]).toEqual(["-96.2", "-96.2"]);
    const aviso = ring.svg.querySelector(".pv-ring__nofeet");
    expect(aviso.textContent).toBe("GO2 · SIN DATOS DE PATAS");
    expect(aviso.getAttribute("y")).toBe("236");
    expect(ring.feet.size).toBe(0);
  });

  test("sin info no hay motores ni patas, y el aviso no tiene modelo", () => {
    const { ring } = anillo(null);
    expect(ring.byName.size).toBe(0);
    expect(ring.svg.querySelector(".pv-ring__nofeet").textContent).toBe(" · SIN DATOS DE PATAS");
  });

  test("una pata desconocida se dibuja con su nombre y sin línea en la silueta", () => {
    const { ring } = anillo({ ...GO2, patas: [...GO2.patas, "XX"] });
    const xx = ring.feet.get("XX");
    expect(xx.line).toBeNull();
    expect(xx.g.querySelector("title").textContent).toBe("XX");
    expect(ring.svg.querySelector(".pv-ring__nofeet")).toBeNull();
  });

  test("reconstruir cambia de Go2 a G1 y conserva el nodo de la silueta", () => {
    const { ring } = anillo(GO2);
    const figure = ring.figure;
    ring.build(G1);
    expect(ring.figure).toBe(figure);
    expect(ring.svg.contains(figure)).toBe(true);
    expect(ring.byName.size).toBe(29);
    expect(ring.feet.size).toBe(2);
    expect(ring.byName.has("FR_hip")).toBe(false);
  });

  test("tocar un segmento avisa qué motor se eligió", () => {
    const { ring, onSelect } = anillo(GO2);
    segEl(ring, "RL_thigh").dispatchEvent(new Event("click"));
    expect(onSelect).toHaveBeenCalledWith("RL_thigh");
  });
});

describe("etiquetas de motor caliente (callouts)", () => {
  const callout = (ring, name) => ring.byName.get(name).callout;

  test("arrancan ocultas, con el nombre del motor", () => {
    const { ring } = anillo(GO2);
    const c = callout(ring, "FR_calf");
    expect(c.g.getAttribute("visibility")).toBe("hidden");
    expect(c.g.getAttribute("data-level")).toBe("unknown");
    expect(c.g.querySelector(".pv-callout__name").textContent).toBe("FR_calf");
  });

  test("a la derecha del robot se rotulan hacia la derecha", () => {
    const { ring } = anillo(GO2);
    const c = callout(ring, "FR_calf");
    expect(c.g.querySelector("polyline").getAttribute("points")).toBe("197.0,-60.2 231.4,-70.8 253.4,-70.8");
    expect([c.temp.getAttribute("x"), c.temp.getAttribute("y"), c.temp.getAttribute("text-anchor")]).toEqual(["259.4", "-67.8", "start"]);
    expect(c.g.querySelector(".pv-callout__name").getAttribute("y")).toBe("-48.8");
  });

  test("a la izquierda se rotulan hacia la izquierda", () => {
    const { ring } = anillo(GO2);
    const c = callout(ring, "FL_calf");
    expect(c.g.querySelector("polyline").getAttribute("points")).toBe("-197.0,-60.2 -231.4,-70.8 -253.4,-70.8");
    expect([c.temp.getAttribute("x"), c.temp.getAttribute("text-anchor")]).toEqual(["-259.4", "end"]);
  });

  test("los motores de arriba se rotulan hacia el costado, sin pasar del 72 % del radio", () => {
    const { ring } = anillo(GO2);
    const right = callout(ring, "FR_hip");
    expect(right.g.querySelector("polyline").getAttribute("points")).toBe("60.2,-197.0 182.7,-129.6 204.7,-129.6");
    expect([right.temp.getAttribute("x"), right.temp.getAttribute("y")]).toEqual(["210.7", "-126.6"]);
    expect(right.g.querySelector(".pv-callout__name").getAttribute("y")).toBe("-107.6");
    const left = callout(ring, "FL_hip");
    expect(left.g.querySelector("polyline").getAttribute("points")).toBe("-60.2,-197.0 -182.7,-129.6 -204.7,-129.6");
    expect(left.temp.getAttribute("text-anchor")).toBe("end");
  });

  test("abajo también se recortan (rodilla del G1)", () => {
    const { ring } = anillo(G1);
    const pts = callout(ring, "L_knee").g.querySelector("polyline").getAttribute("points").split(" ");
    expect(pts[1].split(",")[1]).toBe("129.6");
    expect(pts[2].split(",")[1]).toBe("129.6");
  });
});

describe("update", () => {
  test("pinta cada segmento con el semáforo de su temperatura", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 39.9, FR_thigh: 40, FR_calf: 60, FL_hip: 61 })), { torqueRef: 18 });
    expect(segEl(ring, "FR_hip").getAttribute("data-level")).toBe("ok");
    expect(segEl(ring, "FR_thigh").getAttribute("data-level")).toBe("warn");
    expect(segEl(ring, "FR_calf").getAttribute("data-level")).toBe("warn");
    expect(segEl(ring, "FL_hip").getAttribute("data-level")).toBe("crit");
  });

  test("el arco de torque engrosa de 2 a 10 según el umbral de alarma", () => {
    const { ring } = anillo(GO2);
    const f = muestra("go2", (raw) => {
      raw.motores.forEach((m) => (m.torque = 0));
      raw.motores[0].torque = -10;
      raw.motores[1].torque = 20;
      raw.motores[2].torque = 40;
    });
    ring.update(f, { torqueRef: 20 });
    const w = (n) => ring.byName.get(n).torque.getAttribute("stroke-width");
    expect([w("FR_hip"), w("FR_thigh"), w("FR_calf"), w("FL_hip")]).toEqual(["6.0", "10.0", "10.0", "2.0"]);
  });

  test("FR-008: con umbral de torque 0 el ancho es válido (escala con umbral mínimo de 1 N·m)", () => {
    const { ring } = anillo(GO2);
    const f = muestra("go2", (raw) => {
      raw.motores.forEach((m) => (m.torque = 0));
      raw.motores[1].torque = 0.5;
    });
    ring.update(f, { torqueRef: 0 });
    const w = (n) => ring.byName.get(n).torque.getAttribute("stroke-width");
    expect([w("FR_hip"), w("FR_thigh")]).toEqual(["2.0", "6.0"]);
    expect([...ring.byName.values()].every((e) => e.torque.getAttribute("stroke-width") !== "NaN")).toBe(true);
    expect(segEl(ring, "FR_thigh").hasAttribute("data-torque-alarm")).toBe(true); // 0,5 N·m supera el umbral 0
  });

  test("marca alarma de torque solo por encima del umbral", () => {
    const { ring } = anillo(GO2);
    const f = muestra("go2", (raw) => {
      raw.motores.forEach((m) => (m.torque = 0));
      raw.motores[1].torque = 20;
      raw.motores[2].torque = -20.01;
    });
    ring.update(f, { torqueRef: 20 });
    expect(segEl(ring, "FR_thigh").hasAttribute("data-torque-alarm")).toBe(false);
    expect(segEl(ring, "FR_calf").hasAttribute("data-torque-alarm")).toBe(true);
    ring.update(muestra("go2", (raw) => raw.motores.forEach((m) => (m.torque = 0))), { torqueRef: 20 });
    expect(segEl(ring, "FR_calf").hasAttribute("data-torque-alarm")).toBe(false);
  });

  test("no reescribe atributos que no cambiaron", () => {
    const { ring } = anillo(GO2);
    const f = muestra("go2");
    ring.update(f, { torqueRef: 18 });
    const g = segEl(ring, "FR_hip");
    const torque = ring.byName.get("FR_hip").torque;
    const s1 = vi.spyOn(g, "setAttribute");
    const s2 = vi.spyOn(g, "toggleAttribute");
    const s3 = vi.spyOn(torque, "setAttribute");
    const s4 = vi.spyOn(ring.feet.get("FR").g, "setAttribute");
    ring.update(f, { torqueRef: 18 });
    expect(s1).not.toHaveBeenCalled();
    expect(s2).not.toHaveBeenCalled();
    expect(s3).not.toHaveBeenCalled();
    expect(s4).not.toHaveBeenCalled();
  });

  test("ignora motores que no están en el anillo", () => {
    const { ring } = anillo({ ...GO2, motores_nombres: ["FR_hip"] });
    expect(() => ring.update(muestra("go2"), { torqueRef: 18 })).not.toThrow();
    expect(ring.byName.size).toBe(1);
    expect(segEl(ring, "FR_hip").getAttribute("data-level")).not.toBe("unknown");
  });

  test("enciende las patas apoyadas, en el círculo y en la silueta", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", (raw) => (raw.fuerzas = { FR: 80, FL: 0, RR: 0, RL: 50 })), { torqueRef: 18 });
    const contact = (leg) => [ring.feet.get(leg).g.getAttribute("data-contact"), ring.feet.get(leg).line.getAttribute("data-contact")];
    expect(contact("FR")).toEqual(["1", "1"]);
    expect(contact("FL")).toEqual(["0", "0"]);
    expect(contact("RL")).toEqual(["1", "1"]);
    ring.update(muestra("go2", (raw) => (raw.fuerzas = { FR: 0, FL: 10, RR: 0, RL: 50 })), { torqueRef: 18 });
    expect(contact("FR")).toEqual(["0", "0"]);
    expect(contact("FL")).toEqual(["1", "1"]);
  });

  test("una pata sin dato en la muestra cuenta como en el aire; una desconocida no necesita línea", () => {
    const { ring } = anillo({ ...GO2, patas: [...GO2.patas, "XX"] });
    ring.update(muestra("go2", (raw) => (raw.fuerzas = { XX: 1 })), { torqueRef: 18 });
    expect(ring.feet.get("XX").g.getAttribute("data-contact")).toBe("1");
    expect(ring.feet.get("FR").g.getAttribute("data-contact")).toBe("0");
  });

  test("en el centro dice si el robot camina o está quieto", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", quieto), { torqueRef: 18 });
    expect(ring.stateText.textContent).toBe("QUIETO");
    ring.update(muestra("go2", (raw) => raw.motores.forEach((m) => (m.velocidad = 2))), { torqueRef: 18 });
    expect(ring.stateText.textContent).toBe("CAMINA");
  });

  test("con el paseo real del G1 pinta los 29 segmentos y los dos pies", () => {
    const { info, frames } = simular("g1", 20, { dt: 0.1, desde: 8 });
    const { ring } = anillo(info);
    for (const f of frames) ring.update(f, { torqueRef: 18 });
    expect(ring.svg.querySelectorAll('.pv-seg[data-level="unknown"]')).toHaveLength(0);
    const last = frames.at(-1);
    for (const leg of info.patas) expect(ring.feet.get(leg).g.getAttribute("data-contact")).toBe(String(last.fuerzas[leg]));
  });
});

describe("qué motores se rotulan", () => {
  test("sin motores calientes se rotula solo el más caliente", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", (raw) => temperaturas(raw, { RR_thigh: 45.25 })), { torqueRef: 18 });
    expect(visibles(ring)).toEqual(["RR_thigh"]);
    const c = ring.byName.get("RR_thigh").callout;
    expect(c.temp.textContent).toBe("45.3°");
    expect(c.g.getAttribute("data-level")).toBe("warn");
  });

  test("con varios sobre 60 °C se rotulan todos, hasta tres, los más calientes primero", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 64, RR_hip: 66, RL_hip: 68, FL_hip: 70 })), { torqueRef: 18 });
    expect(visibles(ring).sort()).toEqual(["FL_hip", "RL_hip", "RR_hip"]);
    expect(ring.byName.get("FL_hip").callout.g.getAttribute("data-level")).toBe("crit");
  });

  test("de dos vecinos calientes se rotula solo el peor", () => {
    const { ring } = anillo(G1);
    ring.update(muestra("g1", (raw) => temperaturas(raw, { L_knee: 70, L_hip_yaw: 65, R_knee: 63 })), { torqueRef: 18 });
    expect(visibles(ring).sort()).toEqual(["L_knee", "R_knee"]);
  });

  test("a 28° de distancia ya no se consideran vecinos", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 65, FR_thigh: 64 })), { torqueRef: 18 });
    expect(visibles(ring).sort()).toEqual(["FR_hip", "FR_thigh"]);
  });

  test("el motor elegido se rotula siempre, aunque esté frío", () => {
    const { ring } = anillo(GO2);
    ring.setSelected("RL_calf");
    ring.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 65, RL_calf: 31 })), { torqueRef: 18 });
    expect(visibles(ring).sort()).toEqual(["FR_hip", "RL_calf"]);
    expect(ring.byName.get("RL_calf").callout.temp.textContent).toBe("31.0°");
  });

  test("al enfriarse, la etiqueta se oculta y deja de actualizarse", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 65, RR_hip: 64 })), { torqueRef: 18 });
    ring.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 66, RR_hip: 50 })), { torqueRef: 18 });
    expect(visibles(ring)).toEqual(["FR_hip"]);
    const rr = ring.byName.get("RR_hip").callout;
    expect(rr.g.getAttribute("visibility")).toBe("hidden");
    expect(rr.temp.textContent).toBe("64.0°");
    expect(rr.g.getAttribute("data-level")).toBe("crit");
  });

  test("una muestra sin motores no rotula nada", () => {
    const { ring } = anillo(GO2);
    ring.update(muestra("go2", (raw) => (raw.motores = [])), { torqueRef: 18 });
    expect(visibles(ring)).toEqual([]);
  });
});

describe("setSelected", () => {
  test("marca el segmento y su etiqueta; null desmarca", () => {
    const { ring } = anillo(GO2);
    ring.setSelected("FR_thigh");
    expect(ring.selected).toBe("FR_thigh");
    expect([...ring.svg.querySelectorAll(".pv-seg[data-selected]")].map((g) => g.dataset.name)).toEqual(["FR_thigh"]);
    expect(ring.svg.querySelectorAll(".pv-callout[data-selected]")).toHaveLength(1);
    ring.setSelected(null);
    expect(ring.svg.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  test("reconstruir conserva el elegido si sigue existiendo, y lo suelta si no", () => {
    const { ring } = anillo(GO2);
    ring.setSelected("FR_thigh");
    ring.build(GO2);
    expect(ring.selected).toBe("FR_thigh");
    expect(segEl(ring, "FR_thigh").hasAttribute("data-selected")).toBe(true);
    ring.build(G1);
    expect(ring.selected).toBeNull();
    expect(ring.svg.querySelectorAll("[data-selected]")).toHaveLength(0);
  });
});
