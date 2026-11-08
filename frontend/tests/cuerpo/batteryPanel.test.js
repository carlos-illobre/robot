import { describe, test, expect } from "vitest";
import { BatteryPanel } from "../../js/views/body/batteryPanel.js";
import { frame, simFrames } from "./helpers.js";

const bat = (bms) => frame({ bms });
const cells = (p) => [...p.cells.children];
const bar = (p, i) => cells(p)[i].querySelector(".bd-cell__bar");
const volts = (p, i) => cells(p)[i].querySelector(".bd-cell__v").textContent;

describe("BatteryPanel", () => {
  test("arranca con rayas y una sección accesible con título", () => {
    const p = new BatteryPanel();
    expect(p.el.tagName).toBe("SECTION");
    expect(p.el.getAttribute("aria-labelledby")).toBe("bd-battery-title");
    expect(p.el.querySelector("#bd-battery-title").textContent).toBe("Batería (BMS)");
    expect(p.el.querySelector("#bd-battery-title svg")).not.toBeNull();
    expect(p.soc.textContent).toBe("—");
    expect(p.current.textContent).toBe("—");
    expect(p.temp.textContent).toBe("—");
    expect(p.pack.textContent).toBe("—");
    expect(p.cells.getAttribute("role")).toBe("list");
    expect(cells(p)).toHaveLength(0);
  });

  test("muestra SOC, corriente con su sentido y temperatura", () => {
    const p = new BatteryPanel();
    p.update(bat({ soc: 87.4, corriente: 4201, temperatura: 31.26 }));
    expect(p.soc.textContent).toBe("87");
    expect(p.soc.parentElement.dataset.level).toBe("ok");
    expect(p.current.textContent).toBe("4 201 mA");
    expect(p.sense.textContent).toBe("descargando");
    expect(p.temp.textContent).toBe("31.3 °C");
  });

  test("el nivel del SOC sigue el semáforo de batería", () => {
    const p = new BatteryPanel();
    p.update(bat({ soc: 19 }));
    expect(p.soc.parentElement.dataset.level).toBe("crit");
    p.update(bat({ soc: 49 }));
    expect(p.soc.parentElement.dataset.level).toBe("warn");
    p.update(bat({ soc: 50 }));
    expect(p.soc.parentElement.dataset.level).toBe("ok");
  });

  test("cargando y con temperatura 0 (sin dato) muestra raya", () => {
    const p = new BatteryPanel();
    p.update(bat({ corriente: -1500, temperatura: 0 }));
    expect(p.sense.textContent).toBe("cargando");
    expect(p.current.textContent).toBe("−1 500 mA");
    expect(p.temp.textContent).toBe("—");
  });

  test("sin celdas lo dice en lugar de dejar un hueco", () => {
    const p = new BatteryPanel();
    p.update(bat({ celdas: [] }));
    expect(cells(p)).toHaveLength(0);
    expect(p.cells.dataset.count).toBeUndefined();
    expect(p.pack.textContent).toBe("—");
    expect(p.caption.textContent).toBe("El robot no informa la tensión de las celdas");
    expect(p.delta.textContent).toBe("");
  });

  test("con las 8 celdas del simulador arma una barra por celda y el resumen", () => {
    const p = new BatteryPanel();
    const f = simFrames("go2", 3).at(-1);
    p.update(f);
    expect(cells(p)).toHaveLength(8);
    expect(p.cells.dataset.count).toBe("8");
    expect(cells(p)[0].getAttribute("title")).toBe("Celda 1");
    expect(cells(p)[7].textContent).toBe(`Celda 8: ${f.bms.celdas[7].toFixed(3)} V`);
    expect(p.pack.textContent).toBe(`${f.derived.packVoltage.toFixed(2)} V`);
    expect(p.caption.textContent).toBe(`8 celdas · ${f.derived.cellMin.toFixed(3)}–${f.derived.cellMax.toFixed(3)} V`);
    expect(p.delta.textContent).toBe(`Δ ${f.derived.cellDeltaMv} mV`);
  });

  test("la altura de cada barra va de 3.0 V a 4.25 V, con un mínimo visible", () => {
    const p = new BatteryPanel();
    p.update(bat({ celdas: [2.5, 3.0, 3.625, 4.25, 5] }));
    expect(bar(p, 0).style.transform).toBe("scaleY(0.050)");
    expect(bar(p, 1).style.transform).toBe("scaleY(0.050)");
    expect(bar(p, 2).style.transform).toBe("scaleY(0.500)");
    expect(bar(p, 3).style.transform).toBe("scaleY(1.000)");
    expect(bar(p, 4).style.transform).toBe("scaleY(1.000)");
    expect(volts(p, 2)).toBe("3.625");
  });

  test("con más de 30 mV de desbalance marca la celda más baja, y la desmarca al equilibrarse", () => {
    const p = new BatteryPanel();
    p.update(bat({ celdas: [3.9, 3.869, 3.9] })); // 31 mV
    expect(cells(p).map((c) => c.classList.contains("is-low"))).toEqual([false, true, false]);
    p.update(bat({ celdas: [3.9, 3.87, 3.9] })); // 30 mV justos: no alcanza
    expect(cells(p).some((c) => c.classList.contains("is-low"))).toBe(false);
  });

  test("no recrea las barras si la cantidad de celdas no cambia", () => {
    const p = new BatteryPanel();
    p.update(bat({ celdas: [3.9, 3.9] }));
    const first = cells(p)[0];
    p.update(bat({ celdas: [3.8, 3.7] }));
    expect(cells(p)[0]).toBe(first);
    p.update(bat({ celdas: [3.8, 3.7, 3.6] }));
    expect(cells(p)).toHaveLength(3);
    expect(cells(p)[0]).not.toBe(first);
    expect(p.cells.dataset.count).toBe("3");
  });

  test("al pasar de tener celdas a no tenerlas vacía la lista", () => {
    const p = new BatteryPanel();
    p.update(bat({ celdas: [3.9, 3.9] }));
    p.update(bat({ celdas: [] }));
    expect(cells(p)).toHaveLength(0);
    expect(p.cells.dataset.count).toBe("0");
    expect(p.pack.textContent).toBe("—");
  });
});
