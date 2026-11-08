import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { instalarChart, movimientoReducido, muestras, infoDe, historial, conCambios, crearCtx } from "./helpers.js";
import { clock } from "../../js/ui/dom.js";

// FeetPanel usa FigureSwitch (ui/, carga el 3D): un doble que registra las llamadas.
const figuras = vi.hoisted(() => ({ switches: [] }));
vi.mock("../../js/ui/FigureSwitch.js", () => {
  class FigureSwitch {
    constructor(ctx, opts) {
      this.opts = { preset: opts.preset };
      for (const m of ["setMode", "setInfo", "update", "setPaused", "applyTheme", "destroy"]) this[m] = vi.fn();
      figuras.switches.push(this);
    }
  }
  function figureToggle() {
    const el = document.createElement("div");
    el.set = vi.fn();
    return el;
  }
  return { FigureSwitch, figureToggle };
});

const { default: ConsoleView } = await import("../../js/views/console/ConsoleView.js");

const GO2 = infoDe("go2");
const G1 = infoDe("g1");
const go2 = muestras("go2", 30, { desde: 8 });
const g1 = muestras("g1", 30, { desde: 8 });

/** Muestra del Go2 con los motores tocados: `motores(m)` devuelve los campos a pisar. */
function conMotores(base, motores) {
  return conCambios(base, { motores: base.motores.map((m) => ({ ...m, ...motores(m) })) });
}
/** Muestra "tranquila": todo frío, sin torque, sin movimiento. */
const tranquila = (base = go2.at(-1)) => conMotores(base, () => ({ temperatura: 35, torque: 1, velocidad: 0 }));

let creados;
let ctx;
let view;
let container;

function montar(opts = {}) {
  ctx = crearCtx({ frames: go2, ...opts });
  view = new ConsoleView(ctx);
  container = document.createElement("div");
  document.body.append(container);
  view.mount(container);
  return view;
}

beforeEach(() => {
  figuras.switches.length = 0;
  creados = instalarChart();
  movimientoReducido(false);
});
afterEach(() => {
  view?.destroy();
  view = null;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const q = (sel) => container.querySelector(sel);
const strip = () => ({ kind: view.strip.getAttribute("data-kind"), strong: view.stripStrong.textContent, rest: view.stripRest.textContent, go: !view.stripGo.hidden });
const elegidos = () => [...view.table.rows].filter(([, r]) => r.pick.getAttribute("aria-pressed") === "true").map(([n]) => n);

describe("ConsoleView: identidad", () => {
  test("se registra como console con sus atajos propios", () => {
    expect(ConsoleView.id).toBe("console");
    expect(ConsoleView.shortcuts.map(([k]) => k)).toEqual(["S", "Clic en una fila"]);
  });

  test("al construirse no tiene robot, selección ni muestra", () => {
    const v = new ConsoleView(crearCtx());
    expect(v.info).toBeNull();
    expect(v.selected).toEqual([]);
    expect(v.lastFrame).toBeNull();
    expect(() => v.destroy()).not.toThrow();
  });
});

describe("ConsoleView: mount", () => {
  test("arma la franja, la grilla de paneles, el pie y el destello", () => {
    montar();
    expect([...container.children].map((c) => c.className)).toEqual(["cv-bar", "cv-grid", "cv-footer", "cv-flash"]);
    expect(q(".cv-grid > .cv-motors")).not.toBeNull();
    expect(q(".cv-grid > .cv-imu")).toBe(view.imu.el);
    expect(q(".cv-right2 > .cv-bms")).toBe(view.battery.el);
    expect(q(".cv-right2 > .cv-feet")).toBe(view.feet.el);
    expect(q(".cv-motors .cv-tablewrap")).toBe(view.table.el);
    expect(q(".cv-motors .cv-mchart")).toBe(view.motorChart.el);
    expect([...q(".cv-footer__keys").children].map((s) => s.textContent)).toEqual([
      "Ccapturar", "Rgrabar", "Eexportar", "Espaciopausar", "Wtransporte", "Gesquema/3D", "Sordenar", "Ttema", "?ayuda",
    ]);
    expect([...q(".cv-legend").children].map((s) => [s.textContent, s.querySelector("i").getAttribute("data-level")])).toEqual([
      ["< 40", "ok"],
      ["40–60", "warn"],
      ["> 60 °C", "crit"],
    ]);
    expect(view.tsEl.textContent).toBe("ts —");
    expect(view.gaitCells).toHaveLength(4);
  });

  test("crea los dos gráficos recién con el DOM armado", () => {
    montar();
    expect(creados).toHaveLength(2);
    expect(creados[0].canvas).toBe(view.motorChart.canvas);
    expect(creados[1].canvas).toBe(view.imu.canvas);
    expect(creados[0].canvas.isConnected).toBe(true);
  });

  test("sin capturas el contador está en 0 y no se puede borrar", () => {
    montar();
    expect(view.countEl.textContent).toBe("0");
    expect(view.clearBtn.textContent).toBe("No hay capturas para borrar");
    expect(view.clearBtn.disabled).toBe(true);
    expect(view.captureInfo.textContent).toBe("Sin muestras capturadas");
  });

  test("con WebSocket muestra la dirección ws del servidor", () => {
    montar();
    expect(view.endpointEl.textContent).toBe("ws://localhost:8001/ws");
  });

  test("con polling muestra el GET y el intervalo", () => {
    montar({ state: { connection: { state: "live", transport: "polling" }, intervalMs: 250, baseUrl: "10.0.0.5:8001/" } });
    expect(view.endpointEl.textContent).toBe("GET http://10.0.0.5:8001/telemetria · cada 250 ms");
  });

  test("si la conexión no dice el transporte usa el de la configuración", () => {
    montar({ state: { connection: { state: "connecting" }, transport: "polling" } });
    expect(view.endpointEl.textContent).toBe("GET http://localhost:8001/telemetria · cada 100 ms");
  });

  test("una dirección inválida se muestra tal cual", () => {
    montar({ state: { baseUrl: "http://[malformada" } });
    expect(view.endpointEl.textContent).toBe("http://[malformada");
  });

  test("el campo de alarma de torque arranca con el umbral del estado", () => {
    montar({ state: { torqueAlarm: 22.5 } });
    expect(view.alarmInput.value).toBe("22.5");
    expect(view.alarmInput.min).toBe("1");
  });
});

describe("ConsoleView: botones de acción", () => {
  beforeEach(() => montar());

  test("pausar, grabar, capturar y exportar piden su acción", () => {
    const [pausa, grabar, capturar, exportar] = container.querySelectorAll(".cv-actions > button, .cv-split > .cv-btn--export");
    pausa.click();
    grabar.click();
    capturar.click();
    exportar.click();
    expect(ctx.actions.togglePause).toHaveBeenCalledOnce();
    expect(ctx.actions.toggleRecording).toHaveBeenCalledOnce();
    expect(ctx.actions.capture).toHaveBeenCalledOnce();
    expect(ctx.actions.exportCsv).toHaveBeenCalledExactlyOnceWith();
    expect(capturar.textContent).toBe("Capturar0C");
    expect(exportar.textContent).toBe("Exportar CSVE");
    expect(pausa.querySelector("kbd")).toBeNull();
  });

  test("el contador va dentro del botón Capturar, antes de la tecla", () => {
    const capturar = q(".cv-btn--primary");
    expect(view.countEl.parentElement).toBe(capturar);
    expect(view.countEl.nextElementSibling.tagName).toBe("KBD");
  });
});

describe("ConsoleView: menú de exportación", () => {
  beforeEach(() => montar());

  test("el chevron abre y cierra el menú y sincroniza la casilla Excel", () => {
    expect(view.menu.hidden).toBe(true);
    ctx.state.excel = true;
    view.menuBtn.click();
    expect(view.menu.hidden).toBe(false);
    expect(view.menuBtn.getAttribute("aria-expanded")).toBe("true");
    expect(view.excelBox.checked).toBe(true);
    view.menuBtn.click();
    expect(view.menu.hidden).toBe(true);
    expect(view.menuBtn.getAttribute("aria-expanded")).toBe("false");
  });

  test("al cerrar no toca la casilla", () => {
    view.menuBtn.click();
    ctx.state.excel = true;
    view.menuBtn.click();
    expect(view.excelBox.checked).toBe(false);
  });

  test("la casilla Excel cambia la preferencia", () => {
    view.excelBox.checked = true;
    view.excelBox.dispatchEvent(new Event("change"));
    expect(ctx.actions.setExcel).toHaveBeenCalledExactlyOnceWith(true);
  });

  test("Exportar JSON exporta y cierra el menú", () => {
    view.menuBtn.click();
    const json = [...view.menu.querySelectorAll("button")].find((b) => b.textContent === "Exportar JSON");
    json.click();
    expect(ctx.actions.exportJson).toHaveBeenCalledOnce();
    expect(view.menu.hidden).toBe(true);
  });

  test("Borrar capturas borra y cierra el menú", () => {
    ctx.captures.add(go2.at(-1), "grabacion");
    view.menuBtn.click();
    view.clearBtn.click();
    expect(ctx.actions.clearCaptures).toHaveBeenCalledOnce();
    expect(view.menu.hidden).toBe(true);
  });

  test("Escape dentro del menú lo cierra y devuelve el foco al chevron", () => {
    view.menuBtn.click();
    view.excelBox.focus();
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    view.excelBox.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(view.menu.hidden).toBe(true);
    expect(document.activeElement).toBe(view.menuBtn);
  });

  test("otras teclas dentro del menú no lo cierran", () => {
    view.menuBtn.click();
    const ev = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    view.excelBox.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(view.menu.hidden).toBe(false);
  });

  test("tocar afuera lo cierra; tocar adentro o el chevron no", () => {
    const tocar = (el) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    view.menuBtn.click();
    tocar(view.excelBox);
    expect(view.menu.hidden).toBe(false);
    tocar(view.menuBtn);
    expect(view.menu.hidden).toBe(false);
    tocar(view.tsEl);
    expect(view.menu.hidden).toBe(true);
    expect(view.menuBtn.getAttribute("aria-expanded")).toBe("false");
  });

  test("tocar afuera con el menú cerrado no hace nada", () => {
    const spy = vi.spyOn(view.menuBtn, "setAttribute");
    view.tsEl.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ConsoleView: teclas propias", () => {
  beforeEach(() => montar());

  test("Escape con el menú abierto lo cierra y consume la tecla", () => {
    view.menuBtn.click();
    expect(view.onKey({ key: "Escape" })).toBe(true);
    expect(view.menu.hidden).toBe(true);
    expect(document.activeElement).toBe(view.menuBtn);
  });

  test("Escape con el menú cerrado no se consume", () => {
    expect(view.onKey({ key: "Escape" })).toBe(false);
  });

  test("S alterna el orden de la tabla entre por pata y por calor", () => {
    const checked = () => view.sortButtons.map((b) => b.getAttribute("aria-checked"));
    expect(checked()).toEqual(["true", "false"]);
    expect(view.onKey({ key: "s" })).toBe(true);
    expect(view.table.sort).toBe("heat");
    expect(checked()).toEqual(["false", "true"]);
    expect(view.onKey({ key: "S" })).toBe(true);
    expect(view.table.sort).toBe("body");
    expect(checked()).toEqual(["true", "false"]);
  });

  test("otras teclas no se consumen", () => {
    expect(view.onKey({ key: "x" })).toBe(false);
    expect(view.table.sort).toBe("body");
  });

  test("los botones Por pata / Por calor ordenan la tabla", () => {
    view.sortButtons[1].click();
    expect(view.table.sort).toBe("heat");
    view.sortButtons[0].click();
    expect(view.table.sort).toBe("body");
  });
});

describe("ConsoleView: setInfo", () => {
  test("Go2: 12 motores y los tres motores por defecto en el gráfico", () => {
    montar();
    view.setInfo(GO2);
    expect(view.info).toBe(GO2);
    expect(view.motorsSub.textContent).toBe("12 · Go2");
    expect(view.selected).toEqual(["RL_calf", "FR_calf", "FL_thigh"]);
    expect(elegidos().sort()).toEqual(["FL_thigh", "FR_calf", "RL_calf"]);
    expect(view.motorChart.selected).toEqual(["RL_calf", "FR_calf", "FL_thigh"]);
    expect(view.table.rows.size).toBe(12);
    expect(view.feet.legs).toHaveLength(4);
  });

  test("G1: 29 motores, rodillas y cadera por defecto", () => {
    montar({ frames: g1 });
    view.setInfo(G1);
    expect(view.motorsSub.textContent).toBe("29 · G1");
    expect(view.selected).toEqual(["L_knee", "R_knee", "L_hip_pitch"]);
    expect(view.table.rows.size).toBe(29);
    expect(view.feet.legs).toHaveLength(2);
  });

  test("un robot desconocido usa su nombre, sus primeros tres motores y cuenta los nombres", () => {
    montar();
    view.setInfo({ modelo: "b2", nombre: "Unitree B2", motores_nombres: ["FR_hip", "FR_thigh", "FR_calf", "FL_hip"] });
    expect(view.motorsSub.textContent).toBe("4 · Unitree B2");
    expect(view.selected).toEqual(["FR_hip", "FR_thigh", "FR_calf"]);
  });

  test("sin nombre usa el modelo, y sin motores no elige ninguno", () => {
    montar();
    view.setInfo({ modelo: "b2" });
    expect(view.motorsSub.textContent).toBe("0 · b2");
    expect(view.selected).toEqual([]);
  });

  test("si el Go2 no tiene alguno de los motores por defecto, elige los que haya", () => {
    montar();
    view.setInfo({ ...GO2, motores_nombres: ["FR_hip", "FR_calf", "FL_hip"] });
    expect(view.selected).toEqual(["FR_calf"]);
  });

  test("conserva el orden por calor si la última muestra es del mismo robot", () => {
    montar();
    view.setInfo(GO2);
    const caliente = conMotores(go2.at(-1), (m) => ({ temperatura: m.nombre === "RR_hip" ? 70 : 30 }));
    view.update(caliente);
    view.onKey({ key: "s" });
    view.setInfo(GO2);
    expect(view.table.sort).toBe("heat");
    expect(view.table.tbody.querySelector("tr.cv-row").dataset.motor).toBe("RR_hip");
  });

  test("al cambiar de robot no ordena con una muestra del robot anterior", () => {
    montar();
    view.setInfo(GO2);
    view.update(go2.at(-1));
    view.onKey({ key: "s" });
    view.setInfo(G1);
    expect(view.table.sort).toBe("heat");
    expect(view.table.tbody.querySelector("tr.cv-row").dataset.motor).toBe(G1.motores_nombres[0]);
  });
});

describe("ConsoleView: selección de motores y magnitud", () => {
  beforeEach(() => {
    montar();
    view.setInfo(GO2);
  });

  test("tocar una fila suma el motor y con más de tres sale el más viejo", () => {
    view.table.rows.get("RR_hip").tr.click();
    expect(view.selected).toEqual(["FR_calf", "FL_thigh", "RR_hip"]);
    expect(elegidos().sort()).toEqual(["FL_thigh", "FR_calf", "RR_hip"]);
    expect(view.motorChart.chart.data.datasets.slice(4).map((d) => d.label)).toEqual(["FR_calf", "FL_thigh", "RR_hip"]);
  });

  test("tocar un motor elegido lo saca del gráfico", () => {
    view.table.rows.get("FR_calf").tr.click();
    expect(view.selected).toEqual(["RL_calf", "FL_thigh"]);
    view.table.rows.get("FR_hip").tr.click();
    expect(view.selected).toEqual(["RL_calf", "FL_thigh", "FR_hip"]);
  });

  test("cambiar la magnitud vuelve a graficar con esa magnitud", () => {
    const chart = view.motorChart.chart;
    chart.update.mockClear();
    view.motorChart.metricButtons.find((b) => b.dataset.metric === "torque").click();
    expect(view.motorChart.metric).toBe("torque");
    expect(chart.options.scales.y.title.text).toBe("N·m");
    expect(chart.update).toHaveBeenCalledExactlyOnceWith("none");
    const idx = go2.at(-1).motores.findIndex((m) => m.nombre === "RL_calf");
    expect(chart.data.datasets[4].data.at(-1).y).toBe(go2.at(-1).motores[idx].torque);
  });
});

describe("ConsoleView: update", () => {
  beforeEach(() => {
    montar();
    view.setInfo(GO2);
  });

  test("actualiza todos los paneles y el ts del pie", () => {
    const f = go2.at(-1);
    view.update(f);
    expect(view.lastFrame).toBe(f);
    expect(view.tsEl.textContent).toBe(`ts ${f.ts.toFixed(2)} s`);
    const m = f.motores[0];
    expect(view.table.rows.get(m.nombre).temp.textContent).toBe(m.temperatura.toFixed(1));
    expect(view.battery.soc.textContent).toBe(String(f.bms.soc));
    expect(view.imu.points.roll).toHaveLength(30);
    expect(view.feet.legs[0].state.textContent).toMatch(/apoyada|en el aire/);
  });

  test("el ícono de marcha sigue a las patas en el orden del dibujo", () => {
    view.update(conCambios(go2.at(-1), { fuerzas: { FR: 1, FL: 0, RR: 1, RL: 0 } }));
    // orden espacial: FL FR RL RR
    expect(view.gaitCells.map((c) => c.getAttribute("data-on"))).toEqual(["false", "true", "false", "true"]);
    expect(view.gaitCells[0].parentElement.getAttribute("data-legs")).toBe("4");
  });

  test("sin info toma las patas de la muestra (G1: dos celdas)", () => {
    const v = new ConsoleView(crearCtx({ frames: g1 }));
    const c = document.createElement("div");
    document.body.append(c);
    v.mount(c);
    v.update(conCambios(g1.at(-1), { fuerzas: { R_foot: 0, L_foot: 1 } }));
    expect(v.gaitCells.map((x) => x.getAttribute("data-on"))).toEqual(["false", "true", "false", "false"]);
    expect(v.gaitCells[0].parentElement.getAttribute("data-legs")).toBe("2");
    v.destroy();
  });

  test("quieto: «Quieto · en reposo»", () => {
    view.update(tranquila());
    expect(view.gaitLabel.textContent).toBe("Quieto");
    expect(view.gaitSub.textContent).toBe("en reposo");
  });

  /** Historial de 11 muestras de 1 s con el yaw indicado, y la última muestra en movimiento. */
  function girando(yaw0, yaw1, { dt = 0.1 } = {}) {
    const frames = Array.from({ length: 11 }, (_, i) =>
      conCambios(go2[i], { ts: 100 + i * dt, imu: { ...go2[i].imu, yaw: yaw0 + ((yaw1 - yaw0) * i) / 10 } }),
    );
    ctx.history = historial(frames);
    const ultimo = conMotores(frames.at(-1), () => ({ velocidad: 1 }));
    view.update(ultimo);
  }

  test("caminando derecho cuando gira menos de 8 °/s", () => {
    girando(10, 17.9);
    expect(view.gaitLabel.textContent).toBe("Caminando");
    expect(view.gaitSub.textContent).toBe("en línea recta");
  });

  test.each([
    [10, 18, "doblando a la izquierda"],
    [10, 30, "doblando a la izquierda"],
    [10, 2, "doblando a la derecha"],
    [10, -10, "doblando a la derecha"],
  ])("de %s° a %s° en 1 s dice «%s»", (a, b, texto) => {
    girando(a, b);
    expect(view.gaitSub.textContent).toBe(texto);
  });

  test("al cruzar ±180° mide el giro por el camino corto", () => {
    // de 175° a −175° son +10° (a la izquierda), no −350°.
    const frames = [175, -175].map((yaw, i) => conCambios(go2[i], { ts: 50 + i, imu: { ...go2[i].imu, yaw } }));
    ctx.history = historial(frames);
    view.update(conMotores(frames[1], () => ({ velocidad: 1 })));
    expect(view.gaitSub.textContent).toBe("doblando a la izquierda");
    const vuelta = [-175, 175].map((yaw, i) => conCambios(go2[i], { ts: 50 + i, imu: { ...go2[i].imu, yaw } }));
    ctx.history = historial(vuelta);
    view.update(conMotores(vuelta[1], () => ({ velocidad: 1 })));
    expect(view.gaitSub.textContent).toBe("doblando a la derecha");
  });

  test("con menos de dos muestras o sin tiempo transcurrido se considera recto", () => {
    ctx.history = historial([conCambios(go2[0], { imu: { ...go2[0].imu, yaw: 90 } })]);
    view.update(conMotores(go2[0], () => ({ velocidad: 1 })));
    expect(view.gaitSub.textContent).toBe("en línea recta");

    const quietos = [0, 90].map((yaw, i) => conCambios(go2[i], { ts: 7, imu: { ...go2[i].imu, yaw } }));
    ctx.history = historial(quietos);
    view.update(conMotores(quietos[1], () => ({ velocidad: 1 })));
    expect(view.gaitSub.textContent).toBe("en línea recta");

    const atras = [0, 90].map((yaw, i) => conCambios(go2[i], { ts: 7 - i, imu: { ...go2[i].imu, yaw } }));
    ctx.history = historial(atras);
    view.update(conMotores(atras[1], () => ({ velocidad: 1 })));
    expect(view.gaitSub.textContent).toBe("en línea recta");
  });

  test("con el campo de alarma de torque se aplica el umbral y se repinta", () => {
    ctx.actions.setTorqueAlarm.mockImplementation((nm) => (ctx.state.torqueAlarm = nm));
    const f = conMotores(tranquila(), (m) => (m.nombre === "FR_hip" ? { torque: 20 } : {}));
    view.update(f);
    expect(view.table.rows.get("FR_hip").tr.getAttribute("data-over")).toBe("true");
    view.alarmInput.value = "25";
    view.alarmInput.dispatchEvent(new Event("change"));
    expect(ctx.actions.setTorqueAlarm).toHaveBeenCalledExactlyOnceWith(25);
    expect(view.alarmInput.value).toBe("25");
    expect(view.table.rows.get("FR_hip").tr.getAttribute("data-over")).toBe("false");
  });

  test.each(["abc", "0", "-3", ""])("un umbral inválido (%j) no se aplica y el campo vuelve al actual", (valor) => {
    view.alarmInput.value = valor;
    view.alarmInput.dispatchEvent(new Event("change"));
    expect(ctx.actions.setTorqueAlarm).not.toHaveBeenCalled();
    expect(view.alarmInput.value).toBe("18");
  });
});

describe("ConsoleView: cambio de umbral sin muestras", () => {
  test("aplica el umbral sin repintar si todavía no llegó ninguna muestra", () => {
    montar();
    const spy = vi.spyOn(view, "update");
    view.alarmInput.value = "30";
    view.alarmInput.dispatchEvent(new Event("change"));
    expect(ctx.actions.setTorqueAlarm).toHaveBeenCalledExactlyOnceWith(30);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ConsoleView: franja de estado", () => {
  beforeEach(() => {
    montar();
    view.setInfo(GO2);
  });

  test("en calma resume el motor más caliente y la batería", () => {
    const f = conMotores(tranquila(), (m) => (m.nombre === "RL_calf" ? { temperatura: 38.26 } : {}));
    view.update(f);
    expect(strip()).toEqual({ kind: "ok", strong: "Todo en rango", rest: ` · el motor más caliente es RL_calf a 38.3 °C · batería ${f.bms.soc} %`, go: false });
  });

  test("sin motores dice que está todo en rango sin más detalle", () => {
    view.update(conCambios(go2.at(-1), { motores: [] }));
    expect(strip()).toEqual({ kind: "ok", strong: "Todo en rango", rest: "", go: false });
  });

  test("un motor a más de 60 °C tiñe la franja y ofrece ir a su fila", () => {
    const f = conMotores(tranquila(), (m) => (m.nombre === "FL_calf" ? { temperatura: 61 } : {}));
    view.update(f);
    expect(strip()).toEqual({ kind: "hot", strong: "FL_calf a 61.0 °C", rest: " — supera 60 °C. Conviene frenar el robot para que enfríe.", go: true });
    expect(view.stripTarget).toBe("FL_calf");
  });

  test("a 60 °C justos todavía no es alarma", () => {
    view.update(conMotores(tranquila(), (m) => (m.nombre === "FL_calf" ? { temperatura: 60 } : {})));
    expect(strip().kind).toBe("ok");
  });

  test("con varios calientes nombra los dos peores y cuenta el resto de las alarmas", () => {
    const temps = { FR_hip: 62, FL_calf: 70, RR_calf: 65, RL_hip: 61 };
    ctx.state.alerts = [{ key: "soc", level: "crit", message: "batería" }];
    const f = conMotores(tranquila(), (m) => ({ temperatura: temps[m.nombre] ?? 35, torque: m.nombre === "FR_thigh" ? 30 : 1 }));
    view.update(f);
    expect(strip()).toEqual({
      kind: "hot",
      strong: "FL_calf a 70.0 °C · RR_calf a 65.0 °C",
      rest: " — supera 60 °C. Conviene frenar el robot para que enfríe · y 4 alarmas más.",
      go: true,
    });
    expect(view.stripTarget).toBe("FL_calf");
  });

  test("con un caliente y otra alarma usa el singular", () => {
    const f = conMotores(tranquila(), (m) => (m.nombre === "FR_hip" ? { temperatura: 62, torque: 25 } : {}));
    view.update(f);
    expect(strip().rest).toBe(" — supera 60 °C. Conviene frenar el robot para que enfríe · y 1 alarma más.");
  });

  test("con batería baja avisa que conviene cargarla", () => {
    ctx.state.alerts = [{ key: "soc", level: "crit", message: "batería" }];
    const f = conCambios(tranquila(), { bms: { ...go2.at(-1).bms, soc: 15 } });
    view.update(f);
    expect(strip()).toEqual({ kind: "hot", strong: "Batería baja: 15 %", rest: " — conviene cargarla pronto.", go: false });
  });

  test("otras alarmas activas que no son de batería no cuentan como batería baja", () => {
    ctx.state.alerts = [{ key: "temp:FR_hip", level: "warn", message: "x" }];
    view.update(tranquila());
    expect(strip().kind).toBe("ok");
  });

  test("con batería baja y torques altos los suma", () => {
    ctx.state.alerts = [{ key: "soc", level: "warn", message: "batería" }];
    const f = conMotores(tranquila(), (m) => (["FR_hip", "FL_hip"].includes(m.nombre) ? { torque: -30 } : {}));
    view.update(f);
    expect(strip().rest).toBe(" — conviene cargarla pronto · y 2 alarmas más.");
  });

  test("un torque por encima del umbral avisa con el peor y ofrece su fila", () => {
    const tq = { FR_hip: 19, RR_thigh: -24.04, RL_calf: 21 };
    const f = conMotores(tranquila(), (m) => (m.nombre in tq ? { torque: tq[m.nombre] } : {}));
    view.update(f);
    expect(strip()).toEqual({ kind: "warn", strong: "Torque de RR_thigh: 24.0 N·m", rest: " — supera el umbral de 18.0 N·m · y 2 alarmas más.", go: true });
    expect(view.stripTarget).toBe("RR_thigh");
  });

  test("un torque igual al umbral no es alarma; uno solo por encima va sin «más»", () => {
    view.update(conMotores(tranquila(), (m) => (m.nombre === "FR_hip" ? { torque: 18 } : {})));
    expect(strip().kind).toBe("ok");
    view.update(conMotores(tranquila(), (m) => (m.nombre === "FR_hip" ? { torque: 18.5 } : {})));
    expect(strip().rest).toBe(" — supera el umbral de 18.0 N·m.");
  });

  test("«Ver en la tabla» lleva a la fila del motor en alarma", () => {
    view.update(conMotores(tranquila(), (m) => (m.nombre === "RR_calf" ? { temperatura: 75 } : {})));
    const tr = view.table.rows.get("RR_calf").tr;
    const scroll = vi.spyOn(tr, "scrollIntoView").mockImplementation(() => {});
    vi.spyOn(tr, "animate").mockImplementation(() => {});
    view.stripGo.click();
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "center", behavior: "smooth" });
  });

  test("sin conexión avisa que los datos están congelados", () => {
    ctx.state.connection = { state: "stale" };
    view.update(conMotores(tranquila(), () => ({ temperatura: 80 })));
    expect(strip()).toEqual({ kind: "lost", strong: "Conexión perdida", rest: " — los datos que ves están congelados. Reintentando…", go: false });
  });
});

describe("ConsoleView: onConnection", () => {
  test.each(["reconnecting", "stale", "offline"])("con %s y datos viejos marca la vista como desactualizada", (state) => {
    montar();
    view.setInfo(GO2);
    view.update(tranquila());
    ctx.state.connection = { state };
    view.onConnection({ state, transport: "websocket" });
    expect(container.getAttribute("data-stale")).toBe("true");
    expect(strip().kind).toBe("lost");
  });

  test("al volver la conexión se quita la marca y se repinta la franja", () => {
    montar();
    view.setInfo(GO2);
    view.update(tranquila());
    ctx.state.connection = { state: "live" };
    view.onConnection({ state: "live", transport: "polling" });
    expect(container.getAttribute("data-stale")).toBe("false");
    expect(strip().kind).toBe("ok");
    expect(view.endpointEl.textContent).toBe("GET http://localhost:8001/telemetria · cada 100 ms");
  });

  test("sin datos todavía: «Conectando con el servidor…»", () => {
    montar();
    view.onConnection({ state: "connecting", detail: "" });
    expect(container.getAttribute("data-stale")).toBe("false");
    expect(strip()).toEqual({ kind: "lost", strong: "Conectando con el servidor…", rest: " — esperando datos", go: false });
  });

  test("sin datos y sin conexión muestra el detalle", () => {
    montar();
    view.onConnection({ state: "offline", detail: "ECONNREFUSED" });
    expect(container.getAttribute("data-stale")).toBe("false");
    expect(strip()).toEqual({ kind: "lost", strong: "Sin conexión", rest: " — ECONNREFUSED", go: false });
  });
});

describe("ConsoleView: pausa, grabación, tema e ilustración", () => {
  beforeEach(() => {
    montar();
    view.setInfo(GO2);
  });

  test("en pausa cambia el botón a Seguir con el ícono de play y lo dice en el pie", () => {
    ctx.state.paused = true;
    view.onPause(true);
    expect(container.getAttribute("data-paused")).toBe("true");
    expect(view.pauseBtn.getAttribute("aria-pressed")).toBe("true");
    expect(view.pauseLabel.textContent).toBe("Seguir");
    expect(view.pauseBtn.querySelector(".cv-btn__icon path")?.getAttribute("d")).toBe("m6 3 14 9-14 9V3z");
    expect(view.stateInfo.textContent).toBe("En pausa");
    expect(view.feet.fig.setPaused).toHaveBeenLastCalledWith(true);

    ctx.state.paused = false;
    view.onPause(false);
    expect(container.getAttribute("data-paused")).toBe("false");
    expect(view.pauseLabel.textContent).toBe("Pausar");
    expect(view.pauseBtn.querySelectorAll(".cv-btn__icon rect")).toHaveLength(2);
    expect(view.stateInfo.textContent).toBe("");
  });

  test("grabando cambia el botón a Detener y lo marca en el pie", () => {
    ctx.state.recording = true;
    view.onRecording(true);
    expect(view.recBtn.getAttribute("aria-pressed")).toBe("true");
    expect(view.recLabel.textContent).toBe("Detener");
    expect(view.stateInfo.textContent).toBe("● Grabando");
    expect(view.stateInfo.getAttribute("data-rec")).toBe("true");

    ctx.state.paused = true;
    view.onPause(true);
    expect(view.stateInfo.textContent).toBe("● Grabando · En pausa");

    ctx.state.recording = false;
    view.onRecording(false);
    expect(view.recLabel.textContent).toBe("Grabar");
    expect(view.stateInfo.getAttribute("data-rec")).toBe("false");
  });

  test("el cambio de ilustración y de tema llegan al panel de patas", () => {
    view.onFigureMode("3d");
    expect(view.feet.mode).toBe("3d");
    expect(view.feet.fig.setMode).toHaveBeenLastCalledWith("3d");
    view.onTheme("light");
    expect(view.feet.fig.applyTheme).toHaveBeenCalledOnce();
  });
});

describe("ConsoleView: capturas", () => {
  test("cuenta las capturas y describe la última", () => {
    montar();
    const f = go2.at(-1);
    ctx.captures.add(f, "manual");
    const s1 = ctx.captures.samples[0];
    expect(view.countEl.textContent).toBe("1");
    expect(view.clearBtn.textContent).toBe("Borrar las 1 capturas");
    expect(view.clearBtn.disabled).toBe(false);
    expect(view.captureInfo.textContent).toBe(`1 muestra capturada · última ${clock(s1.capturedAt).slice(0, 8)} (ts ${f.ts.toFixed(2)} s)`);
    ctx.captures.add(go2[0], "manual");
    expect(view.captureInfo.textContent).toBe(`2 muestras capturadas · última ${clock(ctx.captures.samples[1].capturedAt).slice(0, 8)} (ts ${go2[0].ts.toFixed(2)} s)`);
    expect(view.clearBtn.textContent).toBe("Borrar las 2 capturas");
  });

  test("muestra las capturas grabadas que ya había al montar, sin destello", () => {
    const pre = crearCtx({ frames: go2 });
    pre.captures.add(go2[0], "grabacion");
    pre.captures.add(go2[1], "grabacion");
    const animate = vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(() => {});
    ctx = pre;
    view = new ConsoleView(pre);
    container = document.createElement("div");
    document.body.append(container);
    view.mount(container);
    expect(view.countEl.textContent).toBe("2");
    expect(animate).not.toHaveBeenCalled();
  });

  test("una captura manual hace el destello de foto y late el contador", () => {
    montar();
    const flash = vi.spyOn(view.flash, "animate").mockImplementation(() => {});
    const count = vi.spyOn(view.countEl, "animate").mockImplementation(() => {});
    ctx.captures.add(go2.at(-1), "manual");
    expect(flash).toHaveBeenCalledExactlyOnceWith([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "ease-out" });
    expect(count).toHaveBeenCalledExactlyOnceWith(
      [{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
      { duration: 350, easing: "ease-out" },
    );
  });

  test("las muestras grabadas no destellan", () => {
    montar();
    const flash = vi.spyOn(view.flash, "animate").mockImplementation(() => {});
    ctx.captures.add(go2.at(-1), "grabacion");
    expect(flash).not.toHaveBeenCalled();
    expect(view.countEl.textContent).toBe("1");
  });

  test("con movimiento reducido no hay destello", () => {
    montar();
    movimientoReducido(true);
    const flash = vi.spyOn(view.flash, "animate").mockImplementation(() => {});
    ctx.captures.add(go2.at(-1), "manual");
    expect(flash).not.toHaveBeenCalled();
  });

  test("borrar las capturas vuelve todo a cero sin destello", () => {
    montar();
    ctx.captures.add(go2.at(-1), "manual");
    const flash = vi.spyOn(view.flash, "animate").mockImplementation(() => {});
    ctx.captures.clear();
    expect(flash).not.toHaveBeenCalled();
    expect(view.countEl.textContent).toBe("0");
    expect(view.captureInfo.textContent).toBe("Sin muestras capturadas");
    expect(view.clearBtn.disabled).toBe(true);
    ctx.captures.add(go2.at(-1), "manual");
    expect(flash).toHaveBeenCalledOnce();
  });
});

describe("ConsoleView: destroy", () => {
  test("se desuscribe, quita el listener del documento y destruye gráficos y figura", () => {
    montar();
    view.setInfo(GO2);
    const [c1, c2] = creados;
    const fig = view.feet.fig;
    view.menuBtn.click();
    view.destroy();

    expect(c1.destroy).toHaveBeenCalledOnce();
    expect(c2.destroy).toHaveBeenCalledOnce();
    expect(fig.destroy).toHaveBeenCalledOnce();
    expect(view.motorChart.chart).toBeNull();

    ctx.captures.add(go2.at(-1), "manual");
    expect(view.countEl.textContent).toBe("0");

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(view.menu.hidden).toBe(false);

    expect(() => view.destroy()).not.toThrow();
  });
});
