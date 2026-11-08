import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { AppBar } from "../../js/shell/AppBar.js";
import { VIEWS } from "../../js/views/registry.js";
import { icon } from "../../js/ui/icons.js";
import { rastrearListeners, conTamano, flush } from "./helpers.js";

let root, state, actions, bar, limpiar;

const crear = () => (bar = new AppBar(root, { state, actions }));
const $ = (sel) => root.querySelector(sel);
const $$ = (sel) => [...root.querySelectorAll(sel)];
const svgDe = (name) => {
  const d = document.createElement("div");
  d.innerHTML = icon(name);
  return d.innerHTML;
};
const clickEn = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const tecla = (key) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

const FUENTES = [
  { modo: "real", nombre: "Robot real", medido: true, disponible: true, descripcion: "El Go2 de la facultad", motivo: "" },
  { modo: "simulador", nombre: "Simulador MuJoCo", medido: false, disponible: false, descripcion: "MuJoCo", motivo: "No está instalado" },
  { modo: "demo", nombre: "Demo", medido: false, disponible: true, descripcion: "Pasea solo", motivo: "" },
];
const fuentes = (over = {}) => ({
  actual: { modo: "demo", robot: "go2" },
  cambiable: true,
  fuentes: FUENTES,
  backendUrl: "http://localhost:8001",
  error: "",
  interfaces: [],
  interfazSugerida: null,
  ...over,
});

beforeEach(() => {
  limpiar = rastrearListeners();
  document.documentElement.dataset.theme = "dark";
  root = document.createElement("header");
  document.body.append(root);
  state = { baseUrl: "http://10.0.0.5:8001", transport: "websocket", intervalMs: 250, info: null };
  actions = {
    switchView: vi.fn(),
    toggleTheme: vi.fn(),
    openHelp: vi.fn(),
    setTransport: vi.fn(),
    connect: vi.fn(() => Promise.resolve()),
    loadSources: vi.fn(),
    setSource: vi.fn(() => Promise.resolve(true)),
    openManual: vi.fn(),
  };
  Element.prototype.scrollIntoView ??= function () {};
});
afterEach(() => {
  limpiar();
  document.body.replaceChildren();
});

describe("construcción", () => {
  test("arma la marca, el selector de vistas, la conexión, el panel y el menú del robot", () => {
    root.append(document.createElement("p"));
    crear();
    expect([...root.children].map((c) => c.className)).toEqual(["brand", "views", "conn", "popover", "robot-menu"]);
    expect($(".brand__name").textContent).toBe("Telemetría Unitree");
    expect($(".brand__mark svg").getAttribute("width")).toBe("18");
    expect($(".brand__mark svg").innerHTML).toBe('<path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>');
    expect(bar.robotEl.textContent).toBe("Esperando /info…");
    expect(bar.robotEl.getAttribute("aria-haspopup")).toBe("menu");
    expect(bar.robotEl.getAttribute("aria-expanded")).toBe("false");
    expect(bar.modeEl.hidden).toBe(true);
    expect(bar.pill.getAttribute("aria-expanded")).toBe("false");
    expect(bar.pillLabel.textContent).toBe("Desconectado");
    expect(bar.pillStats.textContent).toBe("");
    expect(bar.popover.hidden).toBe(true);
    expect(bar.popover.getAttribute("role")).toBe("dialog");
    expect(bar.robotMenu.hidden).toBe(true);
    expect(bar.robotMenu.getAttribute("role")).toBe("menu");
  });

  test("hay un botón por vista con su ícono, nombre y tecla", () => {
    crear();
    expect(bar.viewButtons).toHaveLength(VIEWS.length);
    bar.viewButtons.forEach((b, i) => {
      const v = VIEWS[i];
      expect(b.dataset.view).toBe(v.id);
      expect(b.getAttribute("aria-pressed")).toBe("false");
      expect(b.title).toBe(`${v.label}: ${v.hint} (tecla ${v.key})`);
      expect(b.querySelector("span").textContent).toBe(v.label);
      expect(b.querySelector("kbd").textContent).toBe(v.key);
      expect(b.querySelector("svg").getAttribute("width")).toBe("15");
    });
    expect($("nav.views").getAttribute("aria-label")).toBe("Vista del dashboard");
    expect($("nav.views").firstElementChild).toBe(bar.thumb);
  });

  test("los botones de vista, tema y ayuda llaman a sus acciones", () => {
    crear();
    bar.viewButtons[2].click();
    expect(actions.switchView).toHaveBeenCalledExactlyOnceWith("pilot");
    bar.themeBtn.click();
    expect(actions.toggleTheme).toHaveBeenCalledTimes(1);
    $('[aria-label="Ayuda"]').click();
    expect(actions.openHelp).toHaveBeenCalledTimes(1);
    expect($('[aria-label="Ayuda"]').innerHTML).toBe(svgDe("keyboard"));
  });

  test("el ícono del tema muestra el sol en oscuro y la luna en claro", () => {
    crear();
    expect(bar.themeBtn.innerHTML).toBe(svgDe("sun"));
    bar.setTheme("light");
    expect(bar.themeBtn.innerHTML).toBe(svgDe("moon"));
    document.body.replaceChildren();
    document.documentElement.dataset.theme = "light";
    root = document.createElement("header");
    crear();
    expect(bar.themeBtn.innerHTML).toBe(svgDe("moon"));
  });

  test("el panel arranca con el servidor y el transporte del estado", () => {
    crear();
    expect(bar.urlInput.value).toBe("http://10.0.0.5:8001");
    expect(bar.urlInput.id).toBe("server-url");
    const checked = (seg) => [...seg.querySelectorAll("button")].map((b) => [b.dataset.v, b.getAttribute("aria-checked")]);
    expect(checked(bar.transportSeg)).toEqual([["websocket", "true"], ["polling", "false"]]);
    expect(checked(bar.intervalSeg)).toEqual([["100", "false"], ["250", "true"], ["500", "false"]]);
    expect(bar.intervalField.hidden).toBe(true);
    expect([bar.statHz, bar.statGap, bar.statFrames].map((e) => e.textContent)).toEqual(["—", "—", "0"]);
  });

  test("con polling, el campo del intervalo se ve desde el arranque", () => {
    state.transport = "polling";
    crear();
    expect(bar.intervalField.hidden).toBe(false);
  });
});

describe("panel de conexión", () => {
  test("el transporte elegido se marca y se pide a las acciones", () => {
    crear();
    const [ws, poll] = bar.transportSeg.querySelectorAll("button");
    poll.click();
    expect(actions.setTransport).toHaveBeenCalledExactlyOnceWith("polling");
    expect([ws, poll].map((b) => b.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    ws.click();
    expect(actions.setTransport).toHaveBeenLastCalledWith("websocket");
    expect([ws, poll].map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  test("el intervalo elegido pasa a polling con ese intervalo", () => {
    crear();
    // Sin burbujeo: happy-dom reenvía el clic de un botón dentro de un <label> a su
    // primer botón, cosa que el navegador no hace con contenido interactivo.
    bar.intervalSeg.querySelectorAll("button")[2].dispatchEvent(new MouseEvent("click", { bubbles: false }));
    expect(actions.setTransport).toHaveBeenCalledExactlyOnceWith("polling", 500);
  });

  test("enviar el formulario conecta a la dirección escrita y cierra el panel", async () => {
    crear();
    bar.togglePopover(true);
    bar.urlInput.value = "10.0.0.9:8001";
    const ev = new Event("submit", { cancelable: true });
    $("form").dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(actions.connect).toHaveBeenCalledExactlyOnceWith("10.0.0.9:8001");
    expect(bar.popover.hidden).toBe(false);
    await flush();
    expect(bar.popover.hidden).toBe(true);
  });

  test("togglePopover() abre recargando las fuentes y la dirección actual", () => {
    crear();
    bar.urlInput.value = "basura";
    state.baseUrl = "demo";
    const scroll = vi.spyOn(bar.sourceSection, "scrollIntoView");
    bar.togglePopover();
    expect(bar.popover.hidden).toBe(false);
    expect(bar.pill.getAttribute("aria-expanded")).toBe("true");
    expect(bar.urlInput.value).toBe("demo");
    expect(actions.loadSources).toHaveBeenCalledTimes(1);
    expect(scroll).not.toHaveBeenCalled();
    bar.togglePopover();
    expect(bar.popover.hidden).toBe(true);
    expect(bar.pill.getAttribute("aria-expanded")).toBe("false");
    expect(actions.loadSources).toHaveBeenCalledTimes(1);
  });

  test("abrir el panel en la fuente desplaza hasta esa sección", () => {
    crear();
    const scroll = vi.spyOn(bar.sourceSection, "scrollIntoView");
    bar.togglePopover(true, "source");
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest" });
  });

  test("la píldora y la etiqueta de la fuente abren el panel", () => {
    crear();
    bar.pill.click();
    expect(bar.popover.hidden).toBe(false);
    bar.pill.click();
    expect(bar.popover.hidden).toBe(true);
    const scroll = vi.spyOn(bar.sourceSection, "scrollIntoView");
    bar.modeEl.click();
    expect(bar.popover.hidden).toBe(false);
    bar.modeEl.click();
    expect(bar.popover.hidden).toBe(false);
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  test("un clic fuera del panel lo cierra; adentro, no", () => {
    crear();
    bar.togglePopover(true);
    clickEn(bar.detailEl);
    expect(bar.popover.hidden).toBe(false);
    clickEn(document.body);
    expect(bar.popover.hidden).toBe(true);
    clickEn(document.body);
    expect(bar.popover.hidden).toBe(true);
  });

  test("Escape cierra el panel abierto; otras teclas, no", () => {
    crear();
    bar.togglePopover(true);
    tecla("a");
    expect(bar.popover.hidden).toBe(false);
    tecla("Escape");
    expect(bar.popover.hidden).toBe(true);
    const spy = vi.spyOn(bar, "togglePopover");
    tecla("Escape");
    expect(spy).not.toHaveBeenCalled();
  });

  test("el enlace del manual cierra el panel y abre la sección de fuentes", () => {
    crear();
    bar.togglePopover(true);
    $(".link-btn").click();
    expect(bar.popover.hidden).toBe(true);
    expect(actions.openManual).toHaveBeenCalledExactlyOnceWith("fuentes");
  });
});

describe("menú del robot", () => {
  test("se abre debajo del robot marcando el modelo conectado", () => {
    crear();
    state.info = { modelo: "g1" };
    bar.robotEl.getBoundingClientRect = () => ({ left: 120.6 });
    bar.togglePopover(true);
    bar.robotEl.click();
    expect(bar.robotMenu.hidden).toBe(false);
    expect(bar.popover.hidden).toBe(true);
    expect(bar.robotEl.getAttribute("aria-expanded")).toBe("true");
    expect(bar.robotMenu.style.left).toBe("121px");
    const items = [...bar.robotMenu.querySelectorAll(".robot-menu__item")];
    expect(items.map((b) => [b.dataset.robot, b.getAttribute("aria-checked")])).toEqual([["go2", "false"], ["g1", "true"]]);
    expect(document.activeElement).toBe(items[1]);
    expect(items[1].textContent).toBe("✓Unitree G1humanoide · 29 motores · 2 pies");
    expect(items[0].textContent).toBe("✓Unitree Go2cuadrúpedo · 12 motores · 4 patas");
  });

  test("la fuente informada manda sobre /info para marcar el robot", () => {
    crear();
    state.info = { modelo: "g1" };
    bar.setSources(fuentes({ actual: { modo: "demo", robot: "go2" } }));
    bar.toggleRobotMenu(true);
    expect(bar.robotMenu.querySelector('[aria-checked="true"]').dataset.robot).toBe("go2");
  });

  test("sin robot conocido no marca ninguno", () => {
    crear();
    bar.toggleRobotMenu();
    expect(bar.robotMenu.querySelector('[aria-checked="true"]')).toBeNull();
    bar.toggleRobotMenu();
    expect(bar.robotMenu.hidden).toBe(true);
    expect(bar.robotEl.getAttribute("aria-expanded")).toBe("false");
  });

  test("elegir otro robot cambia la fuente manteniendo el modo y la placa", async () => {
    crear();
    bar.setSources(fuentes({ actual: { modo: "real", robot: "go2", interfaz: "eth0" } }));
    bar.toggleRobotMenu(true);
    bar.robotMenu.querySelector('[data-robot="g1"]').click();
    expect(bar.robotMenu.hidden).toBe(true);
    expect(actions.setSource).toHaveBeenCalledExactlyOnceWith({ modo: "real", robot: "g1", interfaz: "eth0" });
  });

  test("elegir el mismo robot no hace nada", () => {
    crear();
    bar.setSources(fuentes());
    bar.robotMenu.querySelector('[data-robot="go2"]').click();
    expect(actions.setSource).not.toHaveBeenCalled();
  });

  test("sin fuentes cargadas, el robot elegido va a la demo", () => {
    crear();
    bar.robotMenu.querySelector('[data-robot="go2"]').click();
    expect(actions.setSource).toHaveBeenCalledExactlyOnceWith({ modo: "demo", robot: "go2", interfaz: undefined });
  });

  test("«Fuente de datos…» cierra el menú y abre el panel en la fuente", () => {
    crear();
    const scroll = vi.spyOn(bar.sourceSection, "scrollIntoView");
    bar.toggleRobotMenu(true);
    // Sin burbujeo: con burbujeo, el listener de «clic fuera» del documento cierra
    // el panel recién abierto (posible bug, reportado en la spec 007).
    bar.robotMenu.querySelector(".robot-menu__more").dispatchEvent(new MouseEvent("click", { bubbles: false }));
    expect(bar.robotMenu.hidden).toBe(true);
    expect(bar.popover.hidden).toBe(false);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  test("un clic fuera del menú lo cierra; en el menú o en el robot, no", () => {
    crear();
    bar.toggleRobotMenu(true);
    clickEn(bar.robotMenu.querySelector(".robot-menu__head"));
    expect(bar.robotMenu.hidden).toBe(false);
    clickEn(bar.robotEl.firstChild ?? bar.robotEl);
    expect(bar.robotMenu.hidden).toBe(true); // el propio botón lo alterna
    bar.toggleRobotMenu(true);
    clickEn(document.body);
    expect(bar.robotMenu.hidden).toBe(true);
    const spy = vi.spyOn(bar, "toggleRobotMenu");
    clickEn(document.body);
    expect(spy).not.toHaveBeenCalled();
  });

  test("Escape cierra el menú abierto; otras teclas, no", () => {
    crear();
    bar.toggleRobotMenu(true);
    tecla("Enter");
    expect(bar.robotMenu.hidden).toBe(false);
    tecla("Escape");
    expect(bar.robotMenu.hidden).toBe(true);
  });
});

describe("selector de vista", () => {
  test("setView() marca el botón activo y mueve el pulgar", () => {
    crear();
    bar.viewButtons.forEach((b, i) => conTamano(b, { width: 80 + i, left: 100 * i }));
    bar.setView("twin");
    expect(bar.viewButtons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "true", "false"]);
    expect(bar.thumb.style.width).toBe("83px");
    expect(bar.thumb.style.transform).toBe("translateX(300px)");
  });

  test("con una vista desconocida no mueve el pulgar", () => {
    crear();
    bar.setView("nada");
    expect(bar.viewButtons.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(bar.thumb.style.width).toBe("");
  });

  test("al redimensionar la ventana se reubica el pulgar", () => {
    crear();
    bar.setView("body");
    conTamano(bar.viewButtons[1], { width: 70, left: 90 });
    window.dispatchEvent(new Event("resize"));
    expect(bar.thumb.style.width).toBe("70px");
    expect(bar.thumb.style.transform).toBe("translateX(90px)");
  });
});

describe("robot y etiqueta de fuente", () => {
  test("setInfo() muestra el nombre y los motores", () => {
    crear();
    bar.setInfo({ nombre: "Unitree Go2", modelo: "go2", n_motores: 12, modo: "demo" });
    expect(bar.robotEl.querySelector("b").textContent).toBe("Unitree Go2");
    expect(bar.robotEl.textContent).toBe("Unitree Go2 · 12 motores▾");
    expect(bar.robotEl.querySelector(".brand__caret").getAttribute("aria-hidden")).toBe("true");
  });

  test("setInfo() sin nombre usa el modelo, y con null no hace nada", () => {
    crear();
    bar.setInfo({ modelo: "g1", n_motores: 29 });
    expect(bar.robotEl.textContent).toBe("g1 · 29 motores▾");
    bar.setInfo(null);
    expect(bar.robotEl.textContent).toBe("g1 · 29 motores▾");
  });

  test("antes de conocer las fuentes, la etiqueta sale del modo de /info", () => {
    crear();
    bar.setInfo({ modelo: "go2", n_motores: 12, modo: "real" });
    expect(bar.modeEl.hidden).toBe(false);
    expect(bar.modeEl.dataset.mode).toBe("real");
    expect(bar.modeEl.textContent).toBe("Real▾");
    expect(bar.modeEl.title).toBe("Fuente de datos: Robot real (clic para cambiar)");
    expect(bar.modeEl.getAttribute("aria-label")).toBe("Fuente de datos: Robot real. Cambiar");
    bar.setInfo({ modelo: "go2", n_motores: 12, modo: "demo-catedra" });
    expect(bar.modeEl.dataset.mode).toBe("demo");
    expect(bar.modeEl.textContent).toBe("Simulado▾");
    expect(bar.modeEl.title).toBe("Fuente de datos: Demo de la cátedra (clic para cambiar)");
  });

  test("sin modo en /info la etiqueta queda oculta", () => {
    crear();
    bar.setInfo({ modelo: "go2", n_motores: 12 });
    expect(bar.modeEl.hidden).toBe(true);
  });

  test("con las fuentes ya cargadas, /info no pisa la etiqueta", () => {
    crear();
    bar.setSources(fuentes({ actual: { modo: "simulador", robot: "go2" } }));
    bar.setInfo({ modelo: "go2", n_motores: 12, modo: "real" });
    expect(bar.modeEl.title).toBe("Fuente de datos: Simulador MuJoCo (clic para cambiar)");
  });

  test.each([
    [{ modo: "demo", enNavegador: true }, "Demo (en el navegador)"],
    [{ modo: "demo" }, "Demo"],
    [{ modo: "otra-cosa" }, "otra-cosa"],
  ])("la etiqueta de la fuente %o dice «%s»", (actual, label) => {
    crear();
    bar.setSources(fuentes({ actual }));
    expect(bar.modeEl.title).toBe(`Fuente de datos: ${label} (clic para cambiar)`);
    expect(bar.modeEl.hidden).toBe(false);
  });
});

describe("selector de fuentes", () => {
  const filas = () => [...bar.sourceList.querySelectorAll("label.source")];
  const radio = (modo) => bar.sourceList.querySelector(`input[value="${modo}"]`);

  test("pinta cada fuente con su estado, la actual marcada y la nota del servidor", () => {
    crear();
    bar.setSources(fuentes());
    const [real, sim, demo] = filas();
    expect(filas().map((f) => [f.dataset.modo, f.className])).toEqual([
      ["real", "source"],
      ["simulador", "source is-disabled"],
      ["demo", "source is-current"],
    ]);
    expect(real.querySelector("b").textContent).toBe("Robot realdatos medidos");
    expect(real.querySelector(".source__real").textContent).toBe("datos medidos");
    expect(real.querySelector(".source__body > span").textContent).toBe("El Go2 de la facultad");
    expect(sim.querySelector(".source__body > span").textContent).toBe("No está instalado");
    expect(sim.querySelector("input").disabled).toBe(true);
    expect(demo.querySelector("em").textContent).toBe("en uso");
    expect(demo.querySelector("input").checked).toBe(true);
    expect(real.querySelector("input").checked).toBe(false);
    expect(real.querySelector("input").name).toBe("fuente");
    expect(bar.sourceNote.textContent).toBe("Servidor: http://localhost:8001. Cambiar la fuente del servidor afecta a todos los dashboards conectados a él.");
    expect(bar.applyBtn.disabled).toBe(true);
    expect(bar.applyBtn.textContent).toBe("Fuente en uso");
    expect(bar.ifaceField.hidden).toBe(true);
  });

  test("con un error, la nota muestra el error", () => {
    crear();
    bar.setSources(fuentes({ error: "No hay un servidor en http://x." }));
    expect(bar.sourceNote.textContent).toBe("No hay un servidor en http://x.");
  });

  test("si el servidor tiene la fuente fija, solo se puede elegir la actual", () => {
    crear();
    bar.setSources(fuentes({ cambiable: false }));
    const [real, , demo] = filas();
    expect(real.className).toBe("source is-disabled");
    expect(real.querySelector("input").disabled).toBe(true);
    expect(real.querySelector(".source__body > span").textContent).toBe("Este servidor tiene la fuente fija.");
    expect(demo.querySelector("input").disabled).toBe(false);
    expect(demo.querySelector(".source__body > span").textContent).toBe("Pasea solo");
  });

  test("elegir el robot real habilita el botón y muestra la placa de red", () => {
    crear();
    bar.setSources(fuentes());
    radio("real").dispatchEvent(new Event("change"));
    expect(bar.pickedSource).toBe("real");
    expect(bar.ifaceField.hidden).toBe(false);
    expect(bar.applyBtn.disabled).toBe(false);
    expect(bar.applyBtn.textContent).toBe("Usar esta fuente");
  });

  test("elegir otro robot en la misma fuente también habilita el botón", () => {
    crear();
    bar.setSources(fuentes());
    const [go2, g1] = bar.robotSeg.querySelectorAll("button");
    expect(go2.getAttribute("aria-checked")).toBe("true");
    g1.click();
    expect(bar.pickedRobot).toBe("g1");
    expect(bar.applyBtn.disabled).toBe(false);
    go2.click();
    expect(bar.applyBtn.disabled).toBe(true);
  });

  test("la fuente elegida se conserva al repintar si sigue disponible", () => {
    crear();
    bar.setSources(fuentes());
    radio("real").dispatchEvent(new Event("change"));
    bar.setSources(fuentes());
    expect(bar.pickedSource).toBe("real");
    expect(radio("real").checked).toBe(true);
    const sinReal = FUENTES.map((f) => (f.modo === "real" ? { ...f, disponible: false } : f));
    bar.setSources(fuentes({ fuentes: sinReal }));
    expect(bar.pickedSource).toBe("demo");
  });

  test("el robot del selector sigue al elegido, al actual o a Go2", () => {
    crear();
    const marcado = () => bar.robotSeg.querySelector('[aria-checked="true"]')?.dataset.v;
    bar.setSources(fuentes({ actual: { modo: "demo", robot: "g1" } }));
    expect(marcado()).toBe("g1");
    bar.setSources(fuentes({ actual: { modo: "demo" } }));
    expect(marcado()).toBe("go2");
    bar.robotSeg.querySelectorAll("button")[1].click();
    bar.setSources(fuentes());
    expect(marcado()).toBe("g1");
  });

  test("«Usar esta fuente» pide el cambio y vuelve a «Fuente en uso» si salió bien", async () => {
    crear();
    bar.setSources(fuentes());
    bar.robotSeg.querySelectorAll("button")[1].click();
    let resolver;
    actions.setSource = vi.fn(() => new Promise((r) => (resolver = r)));
    bar.applyBtn.click();
    expect(bar.applyBtn.disabled).toBe(true);
    expect(bar.applyBtn.textContent).toBe("Cambiando…");
    expect(actions.setSource).toHaveBeenCalledExactlyOnceWith({ modo: "demo", robot: "g1", interfaz: "" });
    bar.sources.actual = { modo: "demo", robot: "g1" };
    resolver(true);
    await flush();
    expect(bar.pickedRobot).toBeNull();
    expect(bar.applyBtn.textContent).toBe("Fuente en uso");
  });

  test("si el cambio falla conserva el robot elegido y el botón habilitado", async () => {
    crear();
    bar.setSources(fuentes());
    bar.robotSeg.querySelectorAll("button")[1].click();
    actions.setSource = vi.fn(() => Promise.resolve(false));
    bar.applyBtn.click();
    await flush();
    expect(bar.pickedRobot).toBe("g1");
    expect(bar.applyBtn.disabled).toBe(false);
    expect(bar.applyBtn.textContent).toBe("Usar esta fuente");
  });

  test("con el robot real dice «Conectando con el robot…» y manda la placa escrita", () => {
    crear();
    bar.setSources(fuentes());
    radio("real").dispatchEvent(new Event("change"));
    bar.ifaceInput.value = "  enp3s0 ";
    bar.applyBtn.click();
    expect(bar.applyBtn.textContent).toBe("Conectando con el robot…");
    expect(actions.setSource).toHaveBeenCalledExactlyOnceWith({ modo: "real", robot: "go2", interfaz: "enp3s0" });
  });

  test("sin robot en la fuente actual, pide Go2", () => {
    crear();
    bar.setSources(fuentes({ actual: { modo: "simulador" } }));
    radio("demo").dispatchEvent(new Event("change"));
    bar.applyBtn.click();
    expect(actions.setSource.mock.calls[0][0].robot).toBe("go2");
  });

  test("sin fuentes cargadas, el botón aplica con Go2", () => {
    crear();
    bar.pickedSource = "demo";
    bar.applyBtn.disabled = false;
    bar.applyBtn.click();
    expect(actions.setSource.mock.calls[0][0]).toMatchObject({ modo: "demo", robot: "go2" });
  });
});

describe("placa de red", () => {
  const IFACES = [
    { nombre: "eth0", ip: "192.168.123.99", robot: true },
    { nombre: "wlan0", ip: "10.0.0.2", robot: false },
  ];
  const opciones = () => [...bar.ifaceSelect.options].map((o) => [o.value, o.textContent]);

  test("lista las placas detectadas y preselecciona la de la red del robot", () => {
    crear();
    bar.setSources(fuentes({ interfaces: IFACES, interfazSugerida: "eth0" }));
    expect(opciones()).toEqual([
      ["eth0", "eth0 · 192.168.123.99  (red del robot)"],
      ["wlan0", "wlan0 · 10.0.0.2"],
      ["__auto", "Automática (que elija el SDK)"],
      ["__otra", "Otra (escribir el nombre)…"],
    ]);
    expect(bar.ifaceSelect.value).toBe("eth0");
    expect(bar.ifaceSelect.hidden).toBe(false);
    expect(bar.ifaceInput.hidden).toBe(true);
    expect(bar.ifaceHint.textContent).toBe("Detectada la red del robot (192.168.123.x) en eth0.");
  });

  test("si ninguna está en la red del robot, elige Automática y avisa del cable", () => {
    crear();
    bar.setSources(fuentes({ interfaces: IFACES.slice(1) }));
    expect(bar.ifaceSelect.value).toBe("__auto");
    expect(bar.ifaceInput.hidden).toBe(true);
    expect(bar.ifaceHint.textContent).toBe("Ninguna placa está en la red del robot (192.168.123.x): ¿está conectado el cable?");
  });

  test("sin placas detectadas, se escribe a mano", () => {
    crear();
    bar.setSources(fuentes({ interfaces: undefined }));
    expect(bar.ifaceSelect.hidden).toBe(true);
    expect(bar.ifaceInput.hidden).toBe(false);
    expect(bar.ifaceHint.textContent).toBe("");
  });

  test("al repintar conserva la placa elegida si sigue estando", () => {
    crear();
    bar.setSources(fuentes({ interfaces: IFACES, interfazSugerida: "eth0" }));
    bar.ifaceSelect.value = "wlan0";
    bar.setSources(fuentes({ interfaces: IFACES, interfazSugerida: "eth0" }));
    expect(bar.ifaceSelect.value).toBe("wlan0");
    bar.setSources(fuentes({ interfaces: IFACES.slice(0, 1), interfazSugerida: "eth0" }));
    expect(bar.ifaceSelect.value).toBe("eth0");
  });

  test("al repintar conserva Automática u Otra", () => {
    crear();
    bar.setSources(fuentes({ interfaces: IFACES, interfazSugerida: "eth0" }));
    bar.ifaceSelect.value = "__otra";
    bar.ifaceSelect.dispatchEvent(new Event("change"));
    bar.setSources(fuentes({ interfaces: IFACES, interfazSugerida: "eth0" }));
    expect(bar.ifaceSelect.value).toBe("__otra");
    expect(bar.ifaceInput.hidden).toBe(false);
  });

  test("elegir «Otra» muestra el campo de texto; otra placa lo oculta", () => {
    crear();
    bar.setSources(fuentes({ interfaces: IFACES, interfazSugerida: "eth0" }));
    bar.ifaceSelect.value = "__otra";
    bar.ifaceSelect.dispatchEvent(new Event("change"));
    expect(bar.ifaceInput.hidden).toBe(false);
    bar.ifaceSelect.value = "wlan0";
    bar.ifaceSelect.dispatchEvent(new Event("change"));
    expect(bar.ifaceInput.hidden).toBe(true);
  });

  test.each([
    ["wlan0", "", "wlan0"],
    ["__auto", "", ""],
    ["__otra", " eno1 ", "eno1"],
  ])("con %s elegida se pide la placa «%s»→«%s»", (value, escrito, esperado) => {
    crear();
    bar.setSources(fuentes({ interfaces: IFACES, interfazSugerida: "eth0" }));
    bar.robotSeg.querySelectorAll("button")[1].click();
    bar.ifaceSelect.value = value;
    bar.ifaceInput.value = escrito;
    bar.applyBtn.click();
    expect(actions.setSource.mock.calls[0][0].interfaz).toBe(esperado);
  });
});

describe("conexión y estadísticas", () => {
  test("setConnection() pinta la píldora y el detalle según el estado", () => {
    crear();
    bar.setConnection({ state: "live", detail: "ignorado", transport: "websocket" });
    expect(bar.pill.dataset.state).toBe("live");
    expect(bar.pillLabel.textContent).toBe("En vivo · WS");
    expect(bar.detailEl.textContent).toBe("En vivo por WebSocket.");
    bar.setConnection({ state: "reconnecting", detail: "timeout", transport: "websocket" });
    expect(bar.pillLabel.textContent).toBe("Reconectando… · WS");
    expect(bar.detailEl.textContent).toBe("timeout");
    bar.setConnection({ state: "connecting", detail: "", transport: "sim" });
    expect(bar.pillLabel.textContent).toBe("Conectando… · Simulado");
    expect(bar.detailEl.textContent).toBe("Conectando… por el simulador del navegador (sin servidor).");
    bar.setConnection({ state: "stale", transport: "polling" });
    expect(bar.pillLabel.textContent).toBe("Sin datos · Polling");
    expect(bar.detailEl.textContent).toBe("Sin datos por polling HTTP.");
    bar.setConnection({ state: "offline", transport: "websocket" });
    expect(bar.pillLabel.textContent).toBe("Desconectado · WS");
  });

  test("estados y transportes desconocidos se muestran tal cual", () => {
    crear();
    bar.setConnection({ state: "raro", detail: "", transport: "mqtt" });
    expect(bar.pillLabel.textContent).toBe("raro · mqtt");
    expect(bar.detailEl.textContent).toBe("raro por mqtt.");
  });

  test("setConnection() sincroniza el transporte y el intervalo del panel", () => {
    crear();
    state.intervalMs = 100;
    bar.setConnection({ state: "live", transport: "polling" });
    expect(bar.transportSeg.querySelector('[aria-checked="true"]').dataset.v).toBe("polling");
    expect(bar.intervalField.hidden).toBe(false);
    expect(bar.intervalSeg.querySelector('[aria-checked="true"]').dataset.v).toBe("100");
    bar.setConnection({ state: "live", transport: "websocket" });
    expect(bar.intervalField.hidden).toBe(true);
  });

  test("setStats() muestra frecuencia, latencia, separación y cantidad", () => {
    crear();
    bar.setStats({ hz: 9.96, rttMs: 12.4, gapMs: 101.6, frames: 42 });
    expect(bar.pillStats.textContent).toBe("10.0 Hz · 12 ms");
    expect(bar.statHz.textContent).toBe("10.0");
    expect(bar.statGap.textContent).toBe("102 ms");
    expect(bar.statFrames.textContent).toBe("42");
  });

  test("setStats() sin datos muestra guiones", () => {
    crear();
    bar.setStats({ hz: 0, rttMs: null, gapMs: null, frames: 0 });
    expect(bar.pillStats.textContent).toBe("");
    expect(bar.statHz.textContent).toBe("—");
    expect(bar.statGap.textContent).toBe("—");
    expect(bar.statFrames.textContent).toBe("0");
    bar.setStats({ hz: 0, rttMs: 0, gapMs: 0, frames: 1 });
    expect(bar.pillStats.textContent).toBe(" · 0 ms");
  });

  test("setPaused() marca la píldora", () => {
    crear();
    bar.setPaused(true);
    expect(bar.pill.dataset.paused).toBe("true");
    bar.setPaused(false);
    expect(bar.pill.dataset.paused).toBe("false");
  });
});
