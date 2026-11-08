// Hoja de la tabla de motores y batería (<dialog>), con /info y muestras reales.
import { describe, test, expect, vi, afterEach } from "vitest";
import { MotorSheet } from "../../js/views/pilot/MotorSheet.js";
import { infoDe, muestra, simular, temperaturas } from "./helpers.js";

const GO2 = infoDe("go2");
const G1 = infoDe("g1");

afterEach(() => {
  document.body.replaceChildren();
});

function hoja(info = GO2) {
  const onSelect = vi.fn();
  const onToggle = vi.fn();
  const sheet = new MotorSheet({ onSelect, onToggle });
  document.body.append(sheet.dialog);
  sheet.build(info);
  return { sheet, onSelect, onToggle };
}
const fila = (sheet, name) => sheet.rows.get(name);
const celdas = (sheet, name) => fila(sheet, name).cells.map((c) => c.textContent);
const grupos = (sheet) => [...sheet.tbody.querySelectorAll(".pv-sheet__group th")];

describe("estructura", () => {
  test("es un diálogo con título, botón de cerrar y leyenda del semáforo", () => {
    const { sheet } = hoja();
    expect(sheet.dialog.tagName).toBe("DIALOG");
    expect(sheet.dialog.getAttribute("aria-labelledby")).toBe("pv-sheet-title");
    expect(sheet.dialog.querySelector("#pv-sheet-title").textContent).toBe("Motores");
    expect(sheet.dialog.querySelector('[aria-label="Cerrar la tabla"]').tagName).toBe("BUTTON");
    expect(sheet.dialog.querySelector(".pv-sheet__legend").textContent).toBe("< 40 °C 40–60 °C > 60 °C · Tocá un motor para marcarlo en el anillo.");
    expect([...sheet.dialog.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Motor", "Temp °C", "Ángulo °", "Vel rad/s", "Torque N·m"]);
    expect([...sheet.dialog.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["Carga", "Corriente", "Temperatura", "Pack", "Potencia"]);
    expect(sheet.open).toBe(false);
  });
});

describe("abrir y cerrar", () => {
  test("toggle abre como modal y avisa; otra vez la cierra y avisa", () => {
    const { sheet, onToggle } = hoja();
    sheet.toggle();
    expect(sheet.open).toBe(true);
    expect(onToggle).toHaveBeenLastCalledWith(true);
    sheet.toggle();
    expect(sheet.open).toBe(false);
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  test("forzar el estado en que ya está no hace nada", () => {
    const { sheet, onToggle } = hoja();
    sheet.toggle(false);
    expect(onToggle).not.toHaveBeenCalled();
    sheet.toggle(true);
    const show = vi.spyOn(sheet.dialog, "showModal");
    sheet.toggle(true);
    expect(show).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test("el botón de cerrar cierra la hoja", () => {
    const { sheet, onToggle } = hoja();
    sheet.toggle(true);
    sheet.dialog.querySelector('[aria-label="Cerrar la tabla"]').click();
    expect(sheet.open).toBe(false);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  test("un clic en el fondo cierra; uno en el contenido no", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.dialog.querySelector(".pv-sheet__inner").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sheet.open).toBe(true);
    sheet.dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(sheet.open).toBe(false);
  });

  test("cerrar con Esc (evento close del diálogo) también avisa", () => {
    const { sheet, onToggle } = hoja();
    sheet.toggle(true);
    sheet.dialog.dispatchEvent(new Event("close"));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  test("al abrir muestra enseguida la última muestra recibida con la hoja cerrada", () => {
    const { sheet } = hoja();
    sheet.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 42.26 })));
    expect(celdas(sheet, "FR_hip")[0]).toBe("");
    sheet.toggle(true);
    expect(celdas(sheet, "FR_hip")[0]).toBe("42.3");
  });

  test("abrir sin ninguna muestra deja las filas vacías", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    expect(celdas(sheet, "FR_hip")).toEqual(["", "", "", ""]);
  });
});

describe("build", () => {
  test("con el Go2 arma 4 grupos con su pata y 12 filas", () => {
    const { sheet } = hoja(GO2);
    expect(grupos(sheet).map((th) => th.firstChild.textContent)).toEqual(["FR · Delantera derecha", "FL · Delantera izquierda", "RR · Trasera derecha", "RL · Trasera izquierda"]);
    expect(grupos(sheet).every((th) => th.getAttribute("colspan") === "5")).toBe(true);
    expect(sheet.groupLegs.map((g) => g.leg)).toEqual(["FR", "FL", "RR", "RL"]);
    expect(sheet.rows.size).toBe(12);
    expect(sheet.tbody.children).toHaveLength(16);
    const contact = sheet.groupLegs[0].el;
    expect([contact.textContent, contact.getAttribute("data-contact")]).toEqual(["—", "0"]);
  });

  test("con el G1 solo las piernas muestran si el pie apoya", () => {
    const { sheet } = hoja(G1);
    expect(grupos(sheet).map((th) => th.firstChild.textContent)).toEqual(["Pierna izquierda", "Pierna derecha", "Torso", "Brazo izquierdo", "Brazo derecho"]);
    expect(sheet.groupLegs.map((g) => g.leg)).toEqual(["L_foot", "R_foot"]);
    expect(grupos(sheet)[2].querySelector(".pv-sheet__contact")).toBeNull();
    expect(sheet.rows.size).toBe(29);
  });

  test("cada fila tiene un botón con lámpara y el nombre, sin nivel todavía", () => {
    const { sheet } = hoja(GO2);
    const r = fila(sheet, "RL_calf");
    expect(r.tr.getAttribute("data-level")).toBe("unknown");
    expect(r.pick.tagName).toBe("BUTTON");
    expect(r.pick.textContent).toBe("RL_calf");
    expect(r.pick.getAttribute("aria-pressed")).toBe("false");
    expect(r.pick.querySelector(".pv-lamp")).not.toBeNull();
    expect(r.tr.firstChild.getAttribute("scope")).toBe("row");
  });

  test("sin patas en /info no hay indicadores de apoyo", () => {
    const { sheet } = hoja({ ...GO2, patas: undefined });
    expect(sheet.groupLegs).toEqual([]);
    expect(sheet.tbody.querySelectorAll(".pv-sheet__contact")).toHaveLength(0);
  });

  test("motores de un mismo grupo separados abren otro encabezado", () => {
    const { sheet } = hoja({ motores_nombres: ["FR_hip", "FL_hip", "FR_thigh"], patas: [] });
    expect(grupos(sheet).map((th) => th.textContent)).toEqual(["FR · Delantera derecha", "FL · Delantera izquierda", "FR · Delantera derecha"]);
  });

  test("sin info queda vacía; reconstruir reemplaza las filas", () => {
    const { sheet } = hoja(G1);
    sheet.build(null);
    expect(sheet.rows.size).toBe(0);
    expect(sheet.tbody.children).toHaveLength(0);
    sheet.build(GO2);
    expect(sheet.rows.has("L_knee")).toBe(false);
    expect(sheet.tbody.children).toHaveLength(16);
  });

  test("tocar un motor avisa cuál se eligió", () => {
    const { sheet, onSelect } = hoja(G1);
    fila(sheet, "torso_pitch").pick.click();
    expect(onSelect).toHaveBeenCalledWith("torso_pitch");
  });

  test("setSelected marca solo la fila elegida", () => {
    const { sheet } = hoja(GO2);
    sheet.setSelected("FL_thigh");
    const pressed = [...sheet.rows].filter(([, r]) => r.pick.getAttribute("aria-pressed") === "true").map(([n]) => n);
    expect(pressed).toEqual(["FL_thigh"]);
    sheet.setSelected(null);
    expect(sheet.tbody.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  });
});

describe("update", () => {
  test("con la hoja cerrada no escribe nada", () => {
    const { sheet } = hoja();
    const f = muestra("go2");
    sheet.update(f);
    expect(sheet.last).toBe(f);
    expect(fila(sheet, "FR_hip").tr.getAttribute("data-level")).toBe("unknown");
    expect(sheet.bat.soc.textContent).toBe("—");
  });

  test("escribe temperatura, ángulo, velocidad y torque de cada motor", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.update(muestra("go2", (raw) => Object.assign(raw.motores[1], { temperatura: 61.04, angulo: -45.26, velocidad: 1.2345, torque: -3.06 })));
    expect(celdas(sheet, "FR_thigh")).toEqual(["61.0", "−45.3", "1.23", "−3.1"]);
    expect(fila(sheet, "FR_thigh").tr.getAttribute("data-level")).toBe("crit");
  });

  test("pinta el semáforo y solo lo reescribe cuando cambia", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 40 })));
    expect(fila(sheet, "FR_hip").tr.getAttribute("data-level")).toBe("warn");
    expect(fila(sheet, "FR_thigh").tr.getAttribute("data-level")).toBe("ok");
    const spy = vi.spyOn(fila(sheet, "FR_hip").tr, "setAttribute");
    sheet.update(muestra("go2", (raw) => temperaturas(raw, { FR_hip: 59 })));
    expect(spy).not.toHaveBeenCalled();
  });

  test("dice qué patas apoyan y cuáles están en el aire", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.update(muestra("go2", (raw) => (raw.fuerzas = { FR: 50, FL: 0, RR: 0, RL: 80 })));
    expect(sheet.groupLegs.map(({ el }) => [el.textContent, el.getAttribute("data-contact")])).toEqual([
      ["apoyada", "1"],
      ["en el aire", "0"],
      ["en el aire", "0"],
      ["apoyada", "1"],
    ]);
  });

  test("ignora motores que no tiene en la tabla", () => {
    const { sheet } = hoja({ ...GO2, motores_nombres: ["FR_hip"] });
    sheet.toggle(true);
    expect(() => sheet.update(muestra("go2"))).not.toThrow();
    expect(sheet.rows.size).toBe(1);
  });

  test("muestra la batería completa: carga, corriente, temperatura, pack y potencia", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    const f = muestra("go2", (raw) => Object.assign(raw.bms, { soc: 45, corriente: 4237, temperatura: 33.27, celdas: [3.9, 3.8, 3.85, 3.81] }));
    sheet.update(f);
    expect(sheet.bat.soc.textContent).toBe("45 %");
    expect(sheet.bat.soc.getAttribute("data-level")).toBe("warn");
    expect(sheet.bat.current.textContent).toBe("4 237 mA · descarga");
    expect(sheet.bat.temp.textContent).toBe("33.3 °C");
    expect(sheet.bat.pack.textContent).toBe("15.36 V");
    expect(sheet.bat.power.textContent).toBe("65.1 W");
  });

  test("una chapita por celda con su tensión; marca la más baja", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.update(muestra("go2", (raw) => (raw.bms.celdas = [3.9, 3.8, 3.85])));
    const chips = [...sheet.cells.children];
    expect(chips.map((li) => li.textContent)).toEqual(["C13.900 V", "C23.800 V", "C33.850 V"]);
    expect(chips.map((li) => li.hasAttribute("data-low"))).toEqual([false, true, false]);
  });

  test("con una sola celda no hay ninguna 'más baja'", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.update(muestra("go2", (raw) => (raw.bms.celdas = [3.9])));
    expect(sheet.cells.children).toHaveLength(1);
    expect(sheet.cells.firstChild.hasAttribute("data-low")).toBe(false);
  });

  test("recrea las chapitas solo si cambia la cantidad de celdas", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.update(muestra("go2", (raw) => (raw.bms.celdas = [3.9, 3.8])));
    const first = sheet.cells.firstChild;
    sheet.update(muestra("go2", (raw) => (raw.bms.celdas = [3.7, 3.75])));
    expect(sheet.cells.firstChild).toBe(first);
    expect(first.lastChild.textContent).toBe("3.700 V");
    sheet.update(muestra("go2", (raw) => (raw.bms.celdas = [3.7, 3.75, 3.8])));
    expect(sheet.cells.firstChild).not.toBe(first);
  });

  test("sin celdas, pack y potencia quedan con raya y no hay chapitas", () => {
    const { sheet } = hoja();
    sheet.toggle(true);
    sheet.update(muestra("go2"));
    sheet.update(muestra("go2", (raw) => Object.assign(raw.bms, { celdas: [], corriente: -900, soc: 10 })));
    expect(sheet.bat.pack.textContent).toBe("—");
    expect(sheet.bat.power.textContent).toBe("—");
    expect(sheet.cells.children).toHaveLength(0);
    expect(sheet.bat.current.textContent).toBe("−900 mA · carga");
    expect(sheet.bat.soc.getAttribute("data-level")).toBe("crit");
  });

  test("con el paseo real del G1 llena las 29 filas y los dos pies", () => {
    const { info, frames } = simular("g1", 5, { desde: 8 });
    const { sheet } = hoja(info);
    sheet.toggle(true);
    for (const f of frames) sheet.update(f);
    for (const r of sheet.rows.values()) {
      expect(r.cells.every((c) => c.textContent !== "")).toBe(true);
      expect(r.tr.getAttribute("data-level")).not.toBe("unknown");
    }
    const last = frames.at(-1);
    for (const { leg, el } of sheet.groupLegs) expect(el.getAttribute("data-contact")).toBe(String(last.fuerzas[leg]));
    expect(sheet.cells.children).toHaveLength(8);
  });
});
