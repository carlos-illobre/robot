import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { MotorTable } from "../../js/views/console/MotorTable.js";
import { muestras, infoDe, conCambios, movimientoReducido } from "./helpers.js";

const GO2 = infoDe("go2");
const G1 = infoDe("g1");
const [go2Frame] = muestras("go2", 1);
const [g1Frame] = muestras("g1", 1);

/** Muestra del Go2 con temperatura/torque fijados por motor. */
function conMotores(base, cambios) {
  return conCambios(base, { motores: base.motores.map((m) => ({ ...m, ...(cambios[m.nombre] ?? {}) })) });
}

let onToggle;
let tabla;
beforeEach(() => {
  onToggle = vi.fn();
  tabla = new MotorTable({ onToggle });
});
afterEach(() => vi.unstubAllGlobals());

const filas = () => [...tabla.tbody.querySelectorAll("tr.cv-row")].map((tr) => tr.dataset.motor);
const grupos = () => [...tabla.tbody.querySelectorAll("tr.cv-grp")];

describe("MotorTable: construcción", () => {
  test("arma la tabla con su encabezado y sin filas", () => {
    expect(tabla.el.className).toBe("cv-tablewrap");
    expect([...tabla.el.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Motor", "Temperatura °C", "Ángulo °", "Vel. rad/s", "Torque N·m"]);
    expect(tabla.el.querySelector("caption").textContent).toContain("Estado de cada motor");
    expect(tabla.sort).toBe("body");
    expect(tabla.tbody.children).toHaveLength(0);
  });

  test("el Go2 tiene 12 filas en 4 grupos por pata, cada uno con su contacto", () => {
    tabla.build(GO2);
    expect(filas()).toEqual(GO2.motores_nombres);
    expect(tabla.rows.size).toBe(12);
    expect(grupos().map((g) => g.querySelector("th").firstChild.textContent)).toEqual([
      "FR · Delantera derecha",
      "FL · Delantera izquierda",
      "RR · Trasera derecha",
      "RL · Trasera izquierda",
    ]);
    expect(tabla.groups.map((g) => g.foot)).toEqual(["FR", "FL", "RR", "RL"]);
    expect(grupos().every((g) => g.querySelector(".cv-contact")?.getAttribute("data-down") === "false")).toBe(true);
    expect(grupos()[0].querySelector("th").getAttribute("colspan")).toBe("5");
    expect(tabla.order).toHaveLength(16);
  });

  test("el G1 tiene 29 filas; las piernas muestran el pie y el torso y los brazos no", () => {
    tabla.build(G1);
    expect(filas()).toHaveLength(29);
    expect(tabla.rows.size).toBe(29);
    const etiquetas = grupos().map((g) => g.querySelector("th").firstChild.textContent);
    expect(etiquetas).toEqual(["Pierna izquierda · pie izquierdo", "Pierna derecha · pie derecho", "Torso", "Brazo izquierdo", "Brazo derecho"]);
    expect(tabla.groups.map((g) => g.foot)).toEqual(["L_foot", "R_foot", undefined, undefined, undefined]);
    expect(tabla.groups.map((g) => Boolean(g.contact))).toEqual([true, true, false, false, false]);
  });

  test("sin patas no hay contacto en los grupos del Go2", () => {
    tabla.build({ motores_nombres: ["FR_hip", "FR_calf"] });
    expect(tabla.groups).toHaveLength(1);
    expect(tabla.groups[0].contact).toBeNull();
    expect(grupos()[0].querySelector(".cv-contact")).toBeNull();
  });

  test("sin motores_nombres queda vacía", () => {
    tabla.build({});
    expect(tabla.tbody.children).toHaveLength(0);
    expect(tabla.rows.size).toBe(0);
  });

  test("al reconstruir (Go2 → G1) no quedan filas del robot anterior", () => {
    tabla.build(GO2);
    tabla.lastSort = 99;
    tabla.build(G1);
    expect(filas()).toEqual(G1.motores_nombres);
    expect(tabla.rows.has("FR_hip")).toBe(false);
    expect(tabla.groups).toHaveLength(5);
    expect(tabla.lastSort).toBe(0);
  });

  test("cada fila tiene un botón con la articulación y al tocarla avisa el motor", () => {
    tabla.build(GO2);
    const r = tabla.rows.get("FR_calf");
    expect(r.pick.tagName).toBe("BUTTON");
    expect(r.pick.title).toBe("pantorrilla · clic para graficarlo");
    expect(r.pick.getAttribute("aria-pressed")).toBe("false");
    expect(r.pick.textContent).toBe("Graficar FR_calf");
    expect(r.tempCell.getAttribute("data-level")).toBe("ok");
    r.tr.click();
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("FR_calf");
  });
});

describe("MotorTable: update", () => {
  beforeEach(() => tabla.build(GO2));

  test("escribe temperatura, ángulo, velocidad y torque de cada motor", () => {
    tabla.update(go2Frame, 18);
    for (const m of go2Frame.motores) {
      const r = tabla.rows.get(m.nombre);
      expect(r.temp.textContent).toBe(m.temperatura.toFixed(1));
      expect(r.ang.textContent.replace("−", "-")).toBe(m.angulo.toFixed(1).replace(/^-0\.0$/, "0.0"));
      expect(r.vel.textContent.replace("−", "-")).toBe(m.velocidad.toFixed(2).replace(/^-0\.00$/, "0.00"));
      expect(r.tq.textContent.replace("−", "-")).toBe(m.torque.toFixed(1).replace(/^-0\.0$/, "0.0"));
    }
  });

  test.each([
    [39.9, "ok", "false"],
    [40, "warn", "false"],
    [60, "warn", "false"],
    [61, "crit", "true"],
  ])("un motor a %s °C queda en %s (fila caliente: %s)", (temperatura, nivel, hot) => {
    tabla.update(conMotores(go2Frame, { FR_hip: { temperatura } }), 18);
    const r = tabla.rows.get("FR_hip");
    expect(r.tempCell.getAttribute("data-level")).toBe(nivel);
    expect(r.tr.getAttribute("data-hot")).toBe(hot);
  });

  test("la barra de temperatura va de 25 °C (casi vacía) a 75 °C (llena)", () => {
    tabla.update(conMotores(go2Frame, { FR_hip: { temperatura: 50 }, FR_thigh: { temperatura: 20 }, FR_calf: { temperatura: 90 } }), 18);
    expect(tabla.rows.get("FR_hip").tbar.style.transform).toBe("scaleX(0.500)");
    expect(tabla.rows.get("FR_thigh").tbar.style.transform).toBe("scaleX(0.030)");
    expect(tabla.rows.get("FR_calf").tbar.style.transform).toBe("scaleX(1.000)");
  });

  test("el torque se compara en módulo con la alarma: igual no alcanza, más sí", () => {
    tabla.update(conMotores(go2Frame, { FR_hip: { torque: -18 }, FR_thigh: { torque: 18.1 }, FR_calf: { torque: -9 }, FL_hip: { torque: 40 } }), 18);
    const r = (n) => tabla.rows.get(n);
    expect(r("FR_hip").tr.getAttribute("data-over")).toBe("false");
    expect(r("FR_hip").tqBar.style.transform).toBe("scaleX(1.000)");
    expect(r("FR_hip").tq.textContent).toBe("−18.0");
    expect(r("FR_thigh").tr.getAttribute("data-over")).toBe("true");
    expect(r("FR_calf").tqBar.style.transform).toBe("scaleX(0.500)");
    expect(r("FL_hip").tqBar.style.transform).toBe("scaleX(1.000)");
    expect(r("FL_hip").tr.getAttribute("data-over")).toBe("true");
  });

  test("ignora los motores que no están en la tabla", () => {
    const f = conCambios(go2Frame, { motores: [...go2Frame.motores, { id: 99, nombre: "extra", temperatura: 80 }] });
    expect(() => tabla.update(f, 18)).not.toThrow();
    expect(tabla.rows.has("extra")).toBe(false);
  });

  test("los grupos dicen si su pata está apoyada o en el aire", () => {
    tabla.update(conCambios(go2Frame, { fuerzas: { FR: 1, FL: 0, RR: 0, RL: 1 } }), 18);
    expect(tabla.groups.map((g) => [g.contact.getAttribute("data-down"), g.contact.textContent])).toEqual([
      ["true", "apoyada"],
      ["false", "en el aire"],
      ["false", "en el aire"],
      ["true", "apoyada"],
    ]);
  });

  test("en el G1 solo las piernas muestran contacto", () => {
    tabla.build(G1);
    tabla.update(conCambios(g1Frame, { fuerzas: { R_foot: 1, L_foot: 0 } }), 18);
    expect(tabla.groups[0].contact.textContent).toBe("en el aire");
    expect(tabla.groups[1].contact.textContent).toBe("apoyada");
  });
});

describe("MotorTable: selección", () => {
  test("marca los elegidos con el color de su serie y desmarca el resto", () => {
    tabla.build(GO2);
    tabla.setSelection(["RL_calf", "FR_calf"]);
    expect(tabla.rows.get("RL_calf").pick.getAttribute("aria-pressed")).toBe("true");
    expect(tabla.rows.get("RL_calf").tr.style.getPropertyValue("--pick")).toBe("var(--cv-s1)");
    expect(tabla.rows.get("FR_calf").tr.style.getPropertyValue("--pick")).toBe("var(--cv-s2)");
    expect(tabla.rows.get("FR_hip").pick.getAttribute("aria-pressed")).toBe("false");
    tabla.setSelection(["FR_calf"]);
    expect(tabla.rows.get("RL_calf").pick.getAttribute("aria-pressed")).toBe("false");
    expect(tabla.rows.get("RL_calf").tr.style.getPropertyValue("--pick")).toBe("");
    expect(tabla.rows.get("FR_calf").tr.style.getPropertyValue("--pick")).toBe("var(--cv-s1)");
  });
});

describe("MotorTable: orden", () => {
  const calor = conMotores(go2Frame, { RL_calf: { temperatura: 70 }, FR_hip: { temperatura: 65 }, FL_thigh: { temperatura: 62 } });
  const porCalor = [...calor.motores].sort((a, b) => b.temperatura - a.temperatura).map((m) => m.nombre);

  beforeEach(() => tabla.build(GO2));

  test("por calor oculta los grupos y ordena de la más caliente a la más fría", () => {
    vi.spyOn(performance, "now").mockReturnValue(5000);
    tabla.setSort("heat", calor);
    expect(tabla.sort).toBe("heat");
    expect(grupos().every((g) => g.hidden)).toBe(true);
    expect(filas()).toEqual(porCalor);
    expect(filas().slice(0, 3)).toEqual(["RL_calf", "FR_hip", "FL_thigh"]);
    expect(tabla.lastSort).toBe(5000);
  });

  test("por pata vuelve al orden original con los grupos visibles", () => {
    tabla.setSort("heat", calor);
    tabla.setSort("body", calor);
    expect(tabla.sort).toBe("body");
    expect(grupos().every((g) => !g.hidden)).toBe(true);
    expect([...tabla.tbody.children]).toEqual(tabla.order);
  });

  test("por calor sin muestra solo oculta los grupos", () => {
    tabla.setSort("heat", null);
    expect(grupos().every((g) => g.hidden)).toBe(true);
    expect(filas()).toEqual(GO2.motores_nombres);
  });

  test("en modo calor reordena como mucho una vez por segundo", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    tabla.setSort("heat", go2Frame);
    tabla.update(calor, 18);
    now.mockReturnValue(11_000); // pasó 1 s justo: todavía no
    tabla.update(calor, 18);
    expect(filas()[0]).not.toBe("RL_calf");
    now.mockReturnValue(11_001);
    tabla.update(calor, 18);
    expect(filas()).toEqual(porCalor);
    expect(tabla.lastSort).toBe(11_001);
  });

  test("en modo por pata no reordena aunque pase el tiempo", () => {
    vi.spyOn(performance, "now").mockReturnValue(1e9);
    tabla.update(calor, 18);
    expect(filas()).toEqual(GO2.motores_nombres);
  });

  test("si el orden no cambió no toca el DOM", () => {
    tabla.setSort("heat", calor);
    const append = vi.spyOn(tabla.tbody, "append");
    tabla.setSort("heat", calor);
    expect(append).not.toHaveBeenCalled();
  });

  test("ignora en el orden los motores que no tienen fila", () => {
    const f = conCambios(calor, { motores: [{ id: 99, nombre: "extra", temperatura: 99 }, ...calor.motores] });
    tabla.setSort("heat", f);
    expect(filas()).toEqual(porCalor);
  });
});

describe("MotorTable: reveal", () => {
  beforeEach(() => tabla.build(GO2));

  test("lleva la fila al centro con animación suave y la hace destellar", () => {
    movimientoReducido(false);
    const r = tabla.rows.get("RR_thigh");
    const scroll = vi.spyOn(r.tr, "scrollIntoView").mockImplementation(() => {});
    const focus = vi.spyOn(r.pick, "focus");
    const animate = vi.spyOn(r.tr, "animate").mockImplementation(() => {});
    tabla.reveal("RR_thigh");
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "center", behavior: "smooth" });
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 900 });
  });

  test("con movimiento reducido salta sin animar", () => {
    movimientoReducido(true);
    const r = tabla.rows.get("RR_thigh");
    const scroll = vi.spyOn(r.tr, "scrollIntoView").mockImplementation(() => {});
    const animate = vi.spyOn(r.tr, "animate").mockImplementation(() => {});
    tabla.reveal("RR_thigh");
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "center", behavior: "auto" });
    expect(animate).not.toHaveBeenCalled();
  });

  test("un motor que no existe no hace nada", () => {
    const mm = movimientoReducido(false);
    expect(() => tabla.reveal("no_existe")).not.toThrow();
    expect(mm).not.toHaveBeenCalled();
  });
});
