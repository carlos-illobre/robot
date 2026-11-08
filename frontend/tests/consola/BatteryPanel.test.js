import { describe, test, expect, beforeEach } from "vitest";
import { BatteryPanel } from "../../js/views/console/BatteryPanel.js";
import { muestras, conCambios } from "./helpers.js";

const RING_LEN = 2 * Math.PI * 44;
const [base] = muestras("go2", 1);

/** Muestra con la batería indicada (el resto del paseo real). */
const conBms = (bms) => conCambios(base, { bms: { ...base.bms, ...bms } });

let panel;
beforeEach(() => {
  panel = new BatteryPanel();
});

const kv = () => Object.fromEntries(Object.entries(panel.kv).map(([k, el]) => [k, el.textContent]));
const celdasDom = () => [...panel.cells.querySelectorAll(".cv-cell")];

describe("BatteryPanel: construcción", () => {
  test("arma la sección Batería con valores vacíos", () => {
    const el = panel.el;
    expect(el.tagName).toBe("SECTION");
    expect(el.getAttribute("aria-labelledby")).toBe("cv-bms-title");
    expect(el.querySelector("#cv-bms-title").textContent).toBe("Batería");
    expect(el.querySelector(".cv-ph__icon svg")).not.toBeNull();
    expect(panel.soc.textContent).toBe("—");
    expect(kv()).toEqual({ cur: "—", temp: "—", volt: "—", power: "—" });
    expect([...el.querySelectorAll("dt")].map((d) => [d.textContent, d.title])).toEqual([
      ["Corriente", "Positiva = descargando"],
      ["Temperatura", "Temperatura de la batería"],
      ["Tensión", "Suma de las tensiones de las celdas"],
      ["Potencia", "Tensión × corriente"],
    ]);
    expect(panel.arc.getAttribute("stroke-dasharray")).toBe(RING_LEN.toFixed(1));
    expect(panel.arc.getAttribute("stroke-dashoffset")).toBe(RING_LEN.toFixed(1));
    expect(panel.ring.getAttribute("data-level")).toBe("ok");
    expect(panel.noCells.hidden).toBe(true);
    expect(panel.cellEls).toEqual([]);
  });
});

describe("BatteryPanel: update", () => {
  test("muestra carga, corriente, temperatura, tensión y potencia de una muestra real del Go2", () => {
    const f = conBms({ soc: 75, corriente: 4234, temperatura: 31.26 });
    panel.update(f);
    expect(panel.soc.textContent).toBe("75");
    expect(panel.ring.getAttribute("data-level")).toBe("ok");
    expect(panel.arc.getAttribute("stroke-dashoffset")).toBe((RING_LEN * 0.25).toFixed(1));
    expect(panel.sub.textContent).toBe("descargando");
    expect(kv()).toEqual({
      cur: "4 234 mA",
      temp: "31.3 °C",
      volt: `${f.derived.packVoltage.toFixed(1)} V`,
      power: `${f.derived.powerW.toFixed(0)} W`,
    });
  });

  test.each([
    [0, "sin consumo"],
    [49, "sin consumo"],
    [-49, "sin consumo"],
    [50, "descargando"],
    [-50, "cargando"],
    [-3000, "cargando"],
  ])("con %s mA dice «%s»", (corriente, texto) => {
    panel.update(conBms({ corriente }));
    expect(panel.sub.textContent).toBe(texto);
  });

  test.each([
    [10, "crit"],
    [35, "warn"],
    [90, "ok"],
  ])("el anillo con %s %% queda en nivel %s", (soc, nivel) => {
    panel.update(conBms({ soc }));
    expect(panel.ring.getAttribute("data-level")).toBe(nivel);
    expect(panel.arc.getAttribute("stroke-dashoffset")).toBe((RING_LEN * (1 - soc / 100)).toFixed(1));
  });

  test("el anillo se limita entre 0 y 100 %", () => {
    panel.update(conBms({ soc: 130 }));
    expect(panel.arc.getAttribute("stroke-dashoffset")).toBe("0.0");
    panel.update(conBms({ soc: -5 }));
    expect(panel.arc.getAttribute("stroke-dashoffset")).toBe(RING_LEN.toFixed(1));
  });

  test("dibuja una barra por celda con su tensión", () => {
    const celdas = [4.2, 3.75, 3.3, 3.0];
    panel.update(conBms({ celdas }));
    const els = celdasDom();
    expect(els).toHaveLength(4);
    expect(panel.cellTitle.textContent).toBe("Celdas · 4");
    expect(panel.cells.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(panel.cells.hidden).toBe(false);
    expect(panel.noCells.hidden).toBe(true);
    expect(els.map((e) => e.querySelector(".num").textContent)).toEqual(["4.20", "3.75", "3.30", "3.00"]);
    expect(panel.cellEls.map((c) => c.bar.style.transform)).toEqual(["scaleY(1.000)", "scaleY(0.500)", "scaleY(0.040)", "scaleY(0.040)"]);
  });

  test("una celda por encima de 4,2 V no pasa la barra llena", () => {
    panel.update(conBms({ celdas: [4.5] }));
    expect(panel.cellEls[0].bar.style.transform).toBe("scaleY(1.000)");
  });

  test("con las celdas reales del paseo informa la mínima y la diferencia", () => {
    panel.update(base);
    const d = base.derived;
    expect(celdasDom()).toHaveLength(base.bms.celdas.length);
    expect(panel.cellDelta.textContent).toBe(`mín. ${d.cellMin.toFixed(2)} V · Δ ${d.cellDeltaMv} mV`);
  });

  test("reusa las barras si no cambia la cantidad de celdas y las rehace si cambia", () => {
    panel.update(conBms({ celdas: [3.9, 3.9, 3.9] }));
    const antes = celdasDom();
    panel.update(conBms({ celdas: [3.8, 3.8, 3.8] }));
    expect(celdasDom()).toEqual(antes);
    expect(celdasDom()[0]).toBe(antes[0]);
    panel.update(conBms({ celdas: [3.8, 3.8] }));
    expect(celdasDom()).toHaveLength(2);
    expect(celdasDom()[0]).not.toBe(antes[0]);
    expect(panel.cellTitle.textContent).toBe("Celdas · 2");
  });

  test("resalta la celda más baja si la diferencia supera 25 mV", () => {
    panel.update(conBms({ celdas: [3.9, 3.874, 3.9] }));
    expect(celdasDom().map((c) => c.getAttribute("data-min"))).toEqual(["false", "true", "false"]);
    expect(panel.cellDelta.textContent).toBe("mín. 3.87 V · Δ 26 mV");
  });

  test("con 25 mV justos no resalta ninguna celda", () => {
    panel.update(conBms({ celdas: [3.9, 3.875, 3.9] }));
    expect(celdasDom().map((c) => c.getAttribute("data-min"))).toEqual(["false", "false", "false"]);
  });

  test("si el BMS no informa celdas lo dice en vez de dibujar barras vacías", () => {
    panel.update(conBms({ celdas: [3.9, 3.9] }));
    panel.update(conBms({ celdas: [] }));
    expect(celdasDom()).toHaveLength(0);
    expect(panel.cells.hidden).toBe(true);
    expect(panel.noCells.hidden).toBe(false);
    expect(panel.noCells.textContent).toBe("El BMS no informa la tensión de cada celda.");
    expect(panel.cellTitle.textContent).toBe("Celdas");
    expect(panel.cellDelta.textContent).toBe("");
    expect(kv().volt).toBe("—");
    expect(kv().power).toBe("—");
  });
});
