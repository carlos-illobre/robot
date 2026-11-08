// Instrumentos DOM de la cabina: horizonte, rumbo, batería y escala térmica.
import { describe, test, expect, vi } from "vitest";
import { Horizon, HeadingTape, BatteryTape, ThermalScale, HORIZON_GAIN, THERMO_MIN, THERMO_MAX } from "../../js/views/pilot/instruments.js";
import { infoDe, muestra, simular, temperaturas } from "./helpers.js";

const derivedBat = (over = {}) => ({ cellMin: 3.7, cellDeltaMv: 10, ...over });
const bms = (over = {}) => ({ soc: 80, corriente: 4237, temperatura: 31.26, celdas: [3.7, 3.71, 3.72], ...over });

describe("Horizon", () => {
  test("exagera ×4 y dibuja cuatro peldaños a 24 px por grado", () => {
    expect(HORIZON_GAIN).toBe(4);
    const hz = new Horizon();
    expect(hz.el.getAttribute("aria-hidden")).toBe("true");
    const rungs = [...hz.plane.querySelectorAll(".pv-ladder")];
    expect(rungs.map((r) => r.style.top)).toEqual(["calc(50% - -240px)", "calc(50% - -120px)", "calc(50% - 120px)", "calc(50% - 240px)"]);
    expect(rungs.map((r) => r.hasAttribute("data-major"))).toEqual([true, false, false, true]);
    expect(hz.plane.querySelector(".pv-horizon__line")).not.toBeNull();
  });

  test("solo los peldaños de ±5° llevan rótulo, de los dos lados", () => {
    const rungs = [...new Horizon().plane.querySelectorAll(".pv-ladder")];
    expect(rungs.map((r) => r.textContent)).toEqual(["", "55", "55", ""]);
    expect(rungs[1].querySelector(".pv-ladder__l b").textContent).toBe("5");
    expect(rungs[1].querySelector(".pv-ladder__r b").textContent).toBe("5");
  });

  test("gira al revés del roll y baja con el pitch, exagerados", () => {
    const hz = new Horizon();
    hz.update({ roll: 2, pitch: -1 });
    expect(hz.plane.style.transform).toBe("rotate(-8.00deg) translateY(-24.0px)");
    hz.update({ roll: -0.125, pitch: 0.5 });
    expect(hz.plane.style.transform).toBe("rotate(0.50deg) translateY(12.0px)");
  });

  test("sigue a una muestra real del Go2", () => {
    const hz = new Horizon();
    const { imu } = muestra("go2");
    hz.update(imu);
    expect(hz.plane.style.transform).toBe(`rotate(${(-imu.roll * 4).toFixed(2)}deg) translateY(${(imu.pitch * 24).toFixed(1)}px)`);
  });
});

describe("HeadingTape", () => {
  test("dibuja una marca cada 5° de −180° a 540°, con rótulo cada 30°", () => {
    const tape = new HeadingTape();
    const ticks = tape.strip.querySelectorAll(".pv-heading__tick");
    expect(ticks).toHaveLength(145);
    expect(ticks[0].style.left).toBe("calc(-180 * var(--ppd))");
    expect(ticks[144].style.left).toBe("calc(540 * var(--ppd))");
    expect(tape.strip.querySelectorAll("[data-major]")).toHaveLength(25);
    expect(tape.strip.querySelectorAll(".pv-heading__label")).toHaveLength(25);
    expect(ticks[1].hasAttribute("data-major")).toBe(false);
    expect(ticks[1].textContent).toBe("");
  });

  test("los cardinales llevan letra (N, E, S, O) y el resto el número", () => {
    const tape = new HeadingTape();
    const labels = [...tape.strip.querySelectorAll(".pv-heading__label")];
    const cardinals = labels.filter((l) => l.hasAttribute("data-cardinal")).map((l) => l.textContent);
    expect(cardinals).toEqual(["S", "O", "N", "E", "S", "O", "N", "E", "S"]);
    expect(labels[1].textContent).toBe("210");
    expect(labels[1].hasAttribute("data-cardinal")).toBe(false);
  });

  test("desplaza la cinta y escribe el rumbo de tres cifras", () => {
    const tape = new HeadingTape();
    expect(tape.value.textContent).toBe("—");
    tape.update(10);
    expect(tape.strip.style.transform).toBe("translateX(calc(-10.00 * var(--ppd)))");
    expect(tape.value.textContent).toBe("010°");
    expect(tape.strip.hasAttribute("data-jump")).toBe(false);
  });

  test("un yaw negativo se muestra como rumbo positivo", () => {
    const tape = new HeadingTape();
    tape.update(-90);
    expect(tape.strip.style.transform).toBe("translateX(calc(-270.00 * var(--ppd)))");
    expect(tape.value.textContent).toBe("270°");
  });

  test("al cruzar 0°/360° ese cuadro va sin transición, y el siguiente vuelve a tenerla", () => {
    const tape = new HeadingTape();
    tape.update(10);
    tape.update(-5);
    expect(tape.strip.hasAttribute("data-jump")).toBe(true);
    tape.update(-6);
    expect(tape.strip.hasAttribute("data-jump")).toBe(false);
  });

  test("un giro de exactamente 180° no cuenta como salto; 181° sí", () => {
    const tape = new HeadingTape();
    tape.update(0);
    tape.update(180);
    expect(tape.strip.hasAttribute("data-jump")).toBe(false);
    tape.update(359);
    expect(tape.strip.hasAttribute("data-jump")).toBe(false);
    tape.update(178);
    expect(tape.strip.hasAttribute("data-jump")).toBe(true);
  });
});

describe("BatteryTape", () => {
  test("arranca con rayas y una escala de 0 a 100 %", () => {
    const bat = new BatteryTape();
    expect(bat.value.textContent).toBe("—");
    expect(bat.current.textContent).toBe("—");
    const ticks = [...bat.el.querySelectorAll(".pv-tape__tick")];
    expect(ticks.map((t) => [t.textContent, t.style.bottom])).toEqual([["0", "0%"], ["25", "25%"], ["50", "50%"], ["75", "75%"], ["100", "100%"]]);
  });

  test("muestra carga, corriente, sentido y temperatura", () => {
    const bat = new BatteryTape();
    bat.update(bms({ soc: 80.6 }), derivedBat());
    expect(bat.value.textContent).toBe("81%");
    expect(bat.fill.style.transform).toBe("scaleY(0.806)");
    expect(bat.current.textContent).toBe("4 237 mA");
    expect(bat.sense.textContent).toBe("descarga");
    expect(bat.temp.textContent).toBe("31.3 °C");
    expect(bat.el.getAttribute("data-level")).toBe("ok");
  });

  test("la carga se recorta entre 0 y 100 %", () => {
    const bat = new BatteryTape();
    bat.update(bms({ soc: 120 }), derivedBat());
    expect(bat.value.textContent).toBe("100%");
    expect(bat.fill.style.transform).toBe("scaleY(1.000)");
    bat.update(bms({ soc: -5 }), derivedBat());
    expect(bat.value.textContent).toBe("0%");
    expect(bat.fill.style.transform).toBe("scaleY(0.000)");
  });

  test("pinta el nivel de batería y solo lo reescribe cuando cambia", () => {
    const bat = new BatteryTape();
    const spy = vi.spyOn(bat.el, "setAttribute");
    bat.update(bms({ soc: 49 }), derivedBat());
    expect(bat.el.getAttribute("data-level")).toBe("warn");
    bat.update(bms({ soc: 30 }), derivedBat());
    expect(spy.mock.calls.filter(([k]) => k === "data-level")).toHaveLength(1);
    bat.update(bms({ soc: 19 }), derivedBat());
    expect(bat.el.getAttribute("data-level")).toBe("crit");
    expect(spy.mock.calls.filter(([k]) => k === "data-level")).toHaveLength(2);
  });

  test("con corriente negativa dice que está cargando", () => {
    const bat = new BatteryTape();
    bat.update(bms({ corriente: -1500 }), derivedBat());
    expect(bat.current.textContent).toBe("−1 500 mA");
    expect(bat.sense.textContent).toBe("carga");
  });

  test("una mini-barra por celda, llena entre 3.3 V y 4.2 V con un mínimo visible", () => {
    const bat = new BatteryTape();
    bat.update(bms({ celdas: [3.3, 3.75, 4.2, 4.5, 3.0] }), derivedBat({ cellMin: 3.0, cellDeltaMv: 1500 }));
    const bars = [...bat.cells.children];
    expect(bars).toHaveLength(5);
    expect(bars.map((b) => b.firstChild.style.transform)).toEqual(["scaleY(0.080)", "scaleY(0.500)", "scaleY(1.000)", "scaleY(1.000)", "scaleY(0.080)"]);
  });

  test("resalta la celda más baja solo si el desbalance pasa de 25 mV", () => {
    const bat = new BatteryTape();
    const celdas = [3.7, 3.726, 3.72];
    bat.update(bms({ celdas }), derivedBat({ cellMin: 3.7, cellDeltaMv: 26 }));
    expect([...bat.cells.children].map((b) => b.hasAttribute("data-low"))).toEqual([true, false, false]);
    bat.update(bms({ celdas }), derivedBat({ cellMin: 3.7, cellDeltaMv: 25 }));
    expect([...bat.cells.children].map((b) => b.hasAttribute("data-low"))).toEqual([false, false, false]);
  });

  test("resume las celdas: cantidad, mínima y desbalance", () => {
    const bat = new BatteryTape();
    bat.update(bms(), derivedBat({ cellMin: 3.7049, cellDeltaMv: 20 }));
    expect(bat.cellsText.textContent).toBe("3 celdas · mín 3.70 V · Δ 20 mV");
  });

  test("recrea las barras solo si cambia la cantidad de celdas", () => {
    const bat = new BatteryTape();
    bat.update(bms(), derivedBat());
    const first = bat.cells.firstChild;
    bat.update(bms({ celdas: [3.8, 3.9, 4.0] }), derivedBat());
    expect(bat.cells.firstChild).toBe(first);
    bat.update(bms({ celdas: [3.8, 3.9] }), derivedBat());
    expect(bat.cells.children).toHaveLength(2);
    expect(bat.cells.firstChild).not.toBe(first);
  });

  test("sin celdas lo dice y no deja barras", () => {
    const bat = new BatteryTape();
    bat.update(bms(), derivedBat());
    bat.update(bms({ celdas: [] }), { cellMin: null, cellDeltaMv: null });
    expect(bat.cells.children).toHaveLength(0);
    expect(bat.cellsText.textContent).toBe("sin datos de celdas");
  });

  test("con una muestra real del simulador muestra sus 8 celdas", () => {
    const bat = new BatteryTape();
    const f = muestra("go2");
    bat.update(f.bms, f.derived);
    expect(bat.cells.children).toHaveLength(8);
    expect(bat.cellsText.textContent).toMatch(/^8 celdas · mín \d\.\d\d V · Δ \d+ mV$/);
    expect(bat.value.textContent).toBe(`${Math.round(f.bms.soc)}%`);
  });
});

describe("ThermalScale", () => {
  test("la escala va de 25 a 75 °C con las zonas del semáforo a su altura", () => {
    expect([THERMO_MIN, THERMO_MAX]).toEqual([25, 75]);
    const th = new ThermalScale();
    const zones = [...th.el.querySelectorAll(".pv-thermo__zone")];
    expect(zones.map((z) => [z.dataset.level, z.style.height])).toEqual([["crit", "30%"], ["warn", "40%"], ["ok", "30%"]]);
    const ticks = [...th.el.querySelectorAll(".pv-tape__tick")];
    expect(ticks.map((t) => [t.textContent, t.style.bottom])).toEqual([["30", "10%"], ["40", "30%"], ["50", "50%"], ["60", "70%"], ["70", "90%"]]);
  });

  test("build crea una marca por motor del Go2 y del G1", () => {
    const th = new ThermalScale();
    th.build(infoDe("go2"));
    expect(th.marks.children).toHaveLength(12);
    expect(th.marks.firstChild.getAttribute("title")).toBe("FR_hip");
    th.build(infoDe("g1"));
    expect(th.marks.children).toHaveLength(29);
    expect(th.byName.has("FR_hip")).toBe(false);
    expect(th.byName.get("R_wrist_yaw").className).toBe("pv-thermo__mark");
  });

  test("build sin info deja la escala vacía", () => {
    const th = new ThermalScale();
    th.build(infoDe("go2"));
    th.build(null);
    expect(th.marks.children).toHaveLength(0);
    expect(th.byName.size).toBe(0);
  });

  test("marca solo el motor elegido", () => {
    const th = new ThermalScale();
    th.build(infoDe("go2"));
    th.setSelected("FL_calf");
    expect([...th.marks.querySelectorAll("[data-selected]")].map((m) => m.title)).toEqual(["FL_calf"]);
    th.setSelected(null);
    expect(th.marks.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  test("ubica cada marca según su temperatura, recortada a la escala", () => {
    const th = new ThermalScale();
    th.build(infoDe("go2"));
    const f = muestra("go2", (raw) => temperaturas(raw, { FR_hip: 50, FR_thigh: 80, FR_calf: 10, FL_hip: 61.5 }));
    th.update(f);
    expect(th.byName.get("FR_hip").style.transform).toBe("translateY(50.00%)");
    expect(th.byName.get("FR_thigh").style.transform).toBe("translateY(0.00%)");
    expect(th.byName.get("FR_calf").style.transform).toBe("translateY(100.00%)");
    expect(th.byName.get("FL_hip").style.transform).toBe("translateY(27.00%)");
  });

  test("muestra el motor más caliente, los conteos y el torque máximo", () => {
    const th = new ThermalScale();
    th.build(infoDe("go2"));
    const f = muestra("go2", (raw) => {
      temperaturas(raw, { RL_calf: 62.4, FR_hip: 45, FL_hip: 41 });
      raw.motores.forEach((m) => (m.torque = 1));
      raw.motores[4].torque = -12.34;
    });
    th.update(f);
    expect(th.value.textContent).toBe("62.4°");
    expect(th.name.textContent).toBe("RL_calf");
    expect(th.counts.textContent).toBe("12 motores · 2 tibios · 1 caliente");
    expect(th.torque.textContent).toBe("torque máx 12.3 N·m · FL_thigh");
    expect(th.el.getAttribute("data-level")).toBe("crit");
  });

  test("FR-006: con un motor tibio y uno caliente, la escala dice «1 tibio · 1 caliente»", () => {
    const th = new ThermalScale();
    th.build(infoDe("go2"));
    th.update(muestra("go2", (raw) => temperaturas(raw, { RL_calf: 62, FR_hip: 45 })));
    expect(th.counts.textContent).toBe("12 motores · 1 tibio · 1 caliente");
    th.update(muestra("go2", (raw) => temperaturas(raw, { RL_calf: 62, FL_calf: 63, FR_hip: 45, FL_hip: 41 })));
    expect(th.counts.textContent).toBe("12 motores · 2 tibios · 2 calientes");
  });

  test("cambia el nivel solo cuando cambia el motor más caliente de zona", () => {
    const th = new ThermalScale();
    th.build(infoDe("g1"));
    const spy = vi.spyOn(th.el, "setAttribute");
    th.update(muestra("g1", (raw) => temperaturas(raw, { L_knee: 39 })));
    expect(th.el.getAttribute("data-level")).toBe("ok");
    th.update(muestra("g1", (raw) => temperaturas(raw, { L_knee: 35 })));
    expect(spy).toHaveBeenCalledTimes(1);
    th.update(muestra("g1", (raw) => temperaturas(raw, { L_knee: 40 })));
    expect(th.el.getAttribute("data-level")).toBe("warn");
    expect(th.counts.textContent).toBe("29 motores · 1 tibio · 0 calientes");
  });

  test("ignora motores que no estaban en /info", () => {
    const th = new ThermalScale();
    th.build({ motores_nombres: ["FR_hip"] });
    const f = muestra("go2", (raw) => temperaturas(raw, {}, 50));
    expect(() => th.update(f)).not.toThrow();
    expect(th.byName.get("FR_hip").style.transform).toBe("translateY(50.00%)");
    expect(th.marks.children).toHaveLength(1);
  });

  test("sin motores muestra rayas", () => {
    const th = new ThermalScale();
    th.build(null);
    const f = muestra("go2", (raw) => (raw.motores = []));
    th.update(f);
    expect(th.value.textContent).toBe("—°");
    expect(th.name.textContent).toBe("—");
    expect(th.torque.textContent).toBe("torque máx — N·m · —");
    expect(th.counts.textContent).toBe("0 motores · 0 tibios · 0 calientes");
    expect(th.el.getAttribute("data-level")).toBe("unknown");
  });

  test("con el paseo real del G1 cada marca tiene su posición", () => {
    const th = new ThermalScale();
    const { info, frames } = simular("g1", 3);
    th.build(info);
    th.update(frames.at(-1));
    for (const el of th.byName.values()) expect(el.style.transform).toMatch(/^translateY\(\d+\.\d\d%\)$/);
    expect(th.counts.textContent).toMatch(/^29 motores · /);
  });
});
