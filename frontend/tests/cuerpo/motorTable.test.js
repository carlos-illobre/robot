import { describe, test, expect, vi } from "vitest";
import { MotorTable } from "../../js/views/body/motorTable.js";
import { frame, infoFor, simFrames } from "./helpers.js";

const rowNames = (t) => [...t.tbody.querySelectorAll("tr[data-name]")].map((r) => r.dataset.name);
const groupTitles = (t) => [...t.tbody.querySelectorAll("tr.bd-table__group")].map((r) => r.textContent);
const row = (t, n) => t.tbody.querySelector(`tr[data-name="${n}"]`);
const cellsOf = (t, n) => [...row(t, n).querySelectorAll("td")].map((c) => c.textContent);

function table(modelo = "go2") {
  const onSelect = vi.fn();
  const t = new MotorTable({ onSelect });
  if (modelo) t.build(infoFor(modelo));
  return { t, onSelect };
}

describe("MotorTable › estructura", () => {
  test("encabezado con unidades y un título por columna", () => {
    const { t } = table(null);
    const ths = [...t.el.querySelectorAll("thead th")];
    expect(ths.map((th) => th.textContent)).toEqual(["Motor", "Temp.°C", "Ángulo°", "Vel.rad/s", "TorqueN·m"]);
    expect(ths[0].querySelector("small")).toBeNull();
    expect(ths[1].getAttribute("title")).toMatch(/verde < 40 °C, amarillo 40–60 °C, rojo > 60 °C/);
    expect(ths.every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(t.sortBtn.getAttribute("aria-pressed")).toBe("false");
    expect(t.sortBtn.textContent).toBe("ordenar por temperatura");
  });

  test("Go2: 12 filas agrupadas por pata, en el orden de los ids", () => {
    const { t } = table("go2");
    expect(rowNames(t)).toEqual(infoFor("go2").motores_nombres);
    expect(groupTitles(t)).toEqual([
      "FR · Delantera derecha", "FL · Delantera izquierda", "RR · Trasera derecha", "RL · Trasera izquierda",
    ]);
    expect(t.count.textContent).toBe("· 12 motores");
    expect(row(t, "FR_hip").dataset.level).toBe("ok");
    expect(row(t, "FR_hip").querySelector("button").getAttribute("aria-label")).toBe("Ver detalle de FR_hip");
    expect(t.tbody.querySelector("tr.bd-table__group th").getAttribute("colspan")).toBe("5");
    expect(cellsOf(t, "FR_hip")).toEqual(["—", "—", "—", "—"]);
  });

  test("G1: 29 filas agrupadas por brazo, pierna y torso", () => {
    const { t } = table("g1");
    expect(rowNames(t)).toHaveLength(29);
    expect(t.count.textContent).toBe("· 29 motores");
    expect(groupTitles(t)).toEqual(["Pierna izquierda", "Pierna derecha", "Torso", "Brazo izquierdo", "Brazo derecho"]);
  });

  test("sin info queda vacía y dice 0 motores", () => {
    const { t } = table(null);
    t.build(null);
    expect(rowNames(t)).toEqual([]);
    expect(t.count.textContent).toBe("· 0 motores");
  });

  test("reconstruir para otro robot reemplaza las filas", () => {
    const { t } = table("go2");
    t.build(infoFor("g1"));
    expect(rowNames(t)).toHaveLength(29);
    expect(t.rows.has("FR_hip")).toBe(false);
  });
});

describe("MotorTable › datos", () => {
  test("escribe temperatura, ángulo, velocidad y torque con sus decimales", () => {
    const { t } = table("go2");
    t.update(frame({ motores: [["FR_hip", 41.26, { angulo: -12.34, velocidad: 1.234, torque: 3.06 }]] }));
    expect(cellsOf(t, "FR_hip")).toEqual(["41.3", "−12.3", "1.23", "3.1"]);
    expect(row(t, "FR_hip").dataset.level).toBe("warn");
    expect(t.rows.get("FR_hip").level).toBe("warn");
  });

  test("el semáforo de la fila: verde < 40, amarillo 40–60, rojo > 60 °C", () => {
    const { t } = table("go2");
    const level = (temp) => {
      t.update(frame({ motores: [["FR_calf", temp]] }));
      return row(t, "FR_calf").dataset.level;
    };
    expect(level(39.9)).toBe("ok");
    expect(level(40)).toBe("warn");
    expect(level(60)).toBe("warn");
    expect(level(61)).toBe("crit");
    expect(level(20)).toBe("ok");
  });

  test("ignora motores que no están en la tabla", () => {
    const { t } = table("go2");
    expect(() => t.update(frame({ motores: [["fantasma", 90]] }))).not.toThrow();
    expect(rowNames(t)).not.toContain("fantasma");
  });

  test("con datos reales del simulador llena las 29 filas del G1", () => {
    const { t } = table("g1");
    const f = simFrames("g1", 3).at(-1);
    t.update(f);
    for (const m of f.motores) expect(cellsOf(t, m.nombre)[0]).toBe(m.temperatura.toFixed(1));
  });
});

describe("MotorTable › selección", () => {
  test("tocar una fila elige ese motor; tocar el título de un grupo no", () => {
    const { t, onSelect } = table("go2");
    row(t, "RL_thigh").querySelector("button").click();
    expect(onSelect).toHaveBeenCalledWith("RL_thigh");
    t.tbody.querySelector("tr.bd-table__group th").click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("marca solo la fila elegida", () => {
    const { t } = table("go2");
    t.setSelected("FL_calf");
    expect([...t.tbody.querySelectorAll(".is-selected")].map((r) => r.dataset.name)).toEqual(["FL_calf"]);
    t.setSelected("RR_hip");
    expect([...t.tbody.querySelectorAll(".is-selected")].map((r) => r.dataset.name)).toEqual(["RR_hip"]);
  });

  test("reveal desplaza la fila a la vista y no falla con un motor desconocido", () => {
    const { t } = table("go2");
    const spy = vi.spyOn(row(t, "RR_calf"), "scrollIntoView");
    t.reveal("RR_calf");
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    expect(() => t.reveal("nada")).not.toThrow();
  });
});

describe("MotorTable › orden por temperatura", () => {
  // Todos los motores del Go2: los cuatro primeros son los más calientes.
  const temps = [["FR_hip", 30], ["FR_thigh", 70], ["FR_calf", 50], ["FL_hip", 45],
    ...infoFor("go2").motores_nombres.slice(4).map((n, i) => [n, 20 + i * 0.5])];

  test("ordena de la más caliente a la más fría y oculta los grupos", () => {
    const { t } = table("go2");
    t.update(frame({ motores: temps }));
    t.toggleSort();
    expect(t.sortBtn.getAttribute("aria-pressed")).toBe("true");
    expect(t.sortBtn.textContent).toBe("ordenar por grupo");
    expect(rowNames(t).slice(0, 4)).toEqual(["FR_thigh", "FR_calf", "FL_hip", "FR_hip"]);
    expect([...t.tbody.querySelectorAll("tr.bd-table__group")].every((g) => g.hidden)).toBe(true);
  });

  test("solo mueve filas cuando el orden cambia", () => {
    const { t } = table("go2");
    t.toggleSort();
    t.update(frame({ motores: temps }));
    const spy = vi.spyOn(t.tbody, "append");
    t.update(frame({ motores: temps.map(([n, v]) => [n, v + 0.1]) }));
    expect(spy).not.toHaveBeenCalled();
    t.update(frame({ motores: [["FR_hip", 99], ...temps.slice(1)] }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(rowNames(t)[0]).toBe("FR_hip");
  });

  test("un motor de la muestra que no tiene fila no rompe el orden", () => {
    const { t } = table("go2");
    t.toggleSort();
    t.update(frame({ motores: [["fantasma", 99], ...temps] }));
    expect(rowNames(t).slice(0, 4)).toEqual(["FR_thigh", "FR_calf", "FL_hip", "FR_hip"]);
  });

  test("volver al orden por grupo restaura el orden original y los títulos", () => {
    const { t } = table("go2");
    t.update(frame({ motores: temps }));
    t.toggleSort();
    t.toggleSort();
    expect(t.sortBtn.getAttribute("aria-pressed")).toBe("false");
    expect(t.sortBtn.textContent).toBe("ordenar por temperatura");
    expect(rowNames(t)).toEqual(infoFor("go2").motores_nombres);
    expect([...t.tbody.querySelectorAll("tr.bd-table__group")].some((g) => g.hidden)).toBe(false);
    expect(t.tbody.firstElementChild.classList.contains("bd-table__group")).toBe(true);
  });

  test("se puede alternar antes de construir y antes de recibir muestras", () => {
    const { t } = table(null);
    expect(() => t.toggleSort()).not.toThrow();
    expect(t.sortBtn.getAttribute("aria-pressed")).toBe("true");
    t.build(infoFor("go2"));
    expect(t.order).toBe("");
    // build respeta el modo vigente: los grupos quedan ocultos
    expect([...t.tbody.querySelectorAll("tr.bd-table__group")].every((g) => g.hidden)).toBe(true);
    t.sortBtn.click();
    expect(t.sortByTemp).toBe(false);
  });
});
