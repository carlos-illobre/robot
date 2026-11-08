import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { RobotScene, PRESETS, placeLabel } from "../../js/views/twin/RobotScene.js";
import { RobotRig, SEM_COLORS } from "../../js/views/twin/RobotRig.js";
import { releaseIdleRenderers } from "../../js/views/twin/Stage3D.js";
import {
  FakeResizeObserver,
  FakeRenderer,
  stubCanvas,
  fakeClock,
  stubHidden,
  restoreHidden,
  setSize,
  stubFetchGlb,
  paseo,
  withFrame,
} from "./helpers.js";

vi.mock("three", async (orig) => (await import("./helpers.js")).threeSinGpu(orig));

let clock, container;
const scenes = [];
const realLoad = RobotRig.prototype.load;

beforeEach(() => {
  FakeRenderer.instances.length = 0;
  stubCanvas();
  clock = fakeClock();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  stubHidden(false);
  stubFetchGlb();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  for (const s of scenes.splice(0)) s.destroy();
  releaseIdleRenderers();
  restoreHidden();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

/** Crea el componente; `ready()` espera a que el modelo termine de cargar (o falle). */
function crear(opts = {}) {
  const statuses = [];
  const terminals = [];
  const waiters = [];
  let consumed = 0;
  const flush = () => {
    while (waiters.length && consumed < terminals.length) waiters.shift()(terminals[consumed++]);
  };
  const scene = new RobotScene(container, {
    ...opts,
    onStatus: (s) => {
      statuses.push(s);
      opts.onStatus?.(s);
      if (["ready", "error", "missing"].includes(s.kind)) {
        terminals.push(s);
        flush();
      }
    },
  });
  scenes.push(scene);
  setSize(scene.el, 1000, 600);
  setSize(scene.stage?.renderer.domElement ?? document.createElement("i"), 1000, 600);
  scene.resize();
  const ready = () =>
    new Promise((r) => {
      waiters.push(r);
      flush();
    });
  return { scene, statuses, ready, kinds: () => statuses.map((s) => s.kind) };
}

async function cargado(modelo = "go2", opts = {}) {
  const { info, frames } = paseo(modelo, opts.n ?? 3, { skip: opts.skip ?? 0 });
  const c = crear(opts.scene);
  c.scene.setInfo(info);
  await c.ready();
  return { ...c, info, frames };
}

/** Joint → posición en pantalla (px dentro del canvas). */
function screenOf(scene, obj) {
  scene.rig.root.updateMatrixWorld(true);
  scene.stage.camera.updateMatrixWorld(true);
  const v = obj.getWorldPosition(new THREE.Vector3()).project(scene.stage.camera);
  return { x: ((v.x + 1) / 2) * 1000, y: ((1 - v.y) / 2) * 600 };
}

function pointer(el, type, { x = 0, y = 0, pointerType = "mouse" } = {}) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  el.dispatchEvent(e);
}

function tap(scene, at, { dt = 100, move = 0 } = {}) {
  const canvas = scene.stage.renderer.domElement;
  pointer(canvas, "pointerdown", at);
  clock.advance(dt);
  pointer(canvas, "pointerup", { x: at.x + move, y: at.y });
}

const sizeTip = (scene, w, h) => {
  Object.defineProperty(scene.tip, "offsetWidth", { configurable: true, get: () => w });
  Object.defineProperty(scene.tip, "offsetHeight", { configurable: true, get: () => h });
};
const tipText = (scene) => [scene.tipTitle.textContent, scene.tipSub.textContent];
const tipRows = (scene) => [...scene.tipRows.children].map((c) => c.textContent);

/* ================================================================== */

describe("placeLabel (ubicación de la etiqueta)", () => {
  const box = { minX: 400, maxX: 600, minY: 200, maxY: 400 };

  test("articulación del lado derecho y hay lugar: al costado derecho, centrada en altura", () => {
    expect(placeLabel(box, 550, 300, 1000, 600, 150, 80)).toEqual({ side: "right", x: 628, y: 260, ex: 628, ey: 300 });
  });

  test("articulación en el centro exacto cuenta como derecha", () => {
    expect(placeLabel(box, 500, 300, 1000, 600, 150, 80).side).toBe("right");
  });

  test("articulación del lado izquierdo: al costado izquierdo, la línea llega al borde derecho de la etiqueta", () => {
    expect(placeLabel(box, 450, 300, 1000, 600, 150, 80)).toEqual({ side: "left", x: 222, y: 260, ex: 372, ey: 300 });
  });

  test("prefiere la derecha pero no entra: va a la izquierda", () => {
    const b = { minX: 400, maxX: 850, minY: 200, maxY: 400 };
    expect(placeLabel(b, 800, 300, 1000, 600, 150, 80).side).toBe("left");
  });

  test("prefiere la izquierda pero no entra: va a la derecha", () => {
    const b = { minX: 100, maxX: 500, minY: 200, maxY: 400 };
    expect(placeLabel(b, 150, 300, 1000, 600, 150, 80)).toMatchObject({ side: "right", x: 528 });
  });

  test("bordes justos: entra a la derecha si llega a W − 8 y a la izquierda si queda a 8 px", () => {
    // 600 + 28 + 364 = 992 = 1000 − 8
    expect(placeLabel(box, 550, 300, 1000, 600, 364, 80).side).toBe("right");
    expect(placeLabel(box, 550, 300, 1000, 600, 365, 80).side).toBe("top");
    expect(placeLabel({ ...box, minX: 401 }, 550, 300, 1000, 600, 365, 80).side).toBe("left");
    // 400 − 28 − 364 = 8
    expect(placeLabel(box, 450, 300, 1000, 600, 364, 80).side).toBe("left");
    expect(placeLabel({ ...box, maxX: 999 }, 450, 300, 1000, 600, 365, 80).side).toBe("top");
  });

  test("si no entra a los costados va arriba, con la línea al borde de abajo", () => {
    const r = placeLabel(box, 450, 300, 1000, 600, 500, 80);
    expect(r).toEqual({ side: "top", x: 200, y: 92, ex: 450, ey: 172 });
  });

  test("arriba justo a 8 px del borde", () => {
    expect(placeLabel(box, 450, 300, 1000, 600, 500, 164).side).toBe("top");
    // 165 px ya no entra arriba, y abajo tampoco (400 + 28 + 165 > 592): lo mejor posible
    expect(placeLabel(box, 450, 300, 1000, 600, 500, 165).side).toBe("right");
  });

  test("si arriba no entra va abajo, con la línea al borde de arriba", () => {
    const b = { minX: 400, maxX: 600, minY: 50, maxY: 250 };
    expect(placeLabel(b, 450, 100, 1000, 600, 500, 80)).toEqual({ side: "bottom", x: 200, y: 278, ex: 450, ey: 278 });
  });

  test("abajo justo hasta H − 8", () => {
    const b = { minX: 400, maxX: 600, minY: 50, maxY: 250 };
    // 250 + 28 + 314 = 592
    expect(placeLabel(b, 450, 100, 1000, 600, 500, 314).side).toBe("bottom");
  });

  test("si no entra en ningún lado: al lado opuesto de la mitad de la pantalla donde está la articulación", () => {
    const big = { minX: 10, maxX: 990, minY: 10, maxY: 590 };
    const der = placeLabel(big, 300, 300, 1000, 600, 200, 100);
    expect(der).toEqual({ side: "right", x: 328, y: 250, ex: 328, ey: 300 });
    const izq = placeLabel(big, 500, 300, 1000, 600, 200, 100);
    expect(izq).toEqual({ side: "left", x: 272, y: 250, ex: 472, ey: 300 });
  });

  test("la etiqueta nunca sale de la pantalla (margen de 8 px)", () => {
    const big = { minX: 10, maxX: 990, minY: 10, maxY: 590 };
    expect(placeLabel(big, 990, 595, 1000, 600, 200, 100)).toMatchObject({ x: 762, y: 492 });
    expect(placeLabel(big, 0, 0, 1000, 600, 200, 100)).toMatchObject({ x: 28, y: 8 });
    // etiqueta más grande que la pantalla: pegada al margen
    expect(placeLabel(big, 500, 300, 100, 100, 200, 300)).toMatchObject({ x: 8, y: 8 });
  });

  test("arriba o abajo, la línea llega al punto del borde más cercano (a 12 px de las esquinas)", () => {
    expect(placeLabel(box, 450, 300, 1000, 600, 500, 80).ex).toBe(450);
    const b = { minX: 400, maxX: 600, minY: 200, maxY: 400 };
    // etiqueta corrida por el margen: la articulación queda fuera de su ancho
    const r = placeLabel(b, 20, 300, 1000, 600, 980, 80);
    expect(r.side).toBe("top");
    expect(r.x).toBe(8);
    expect(r.ex).toBe(20);
    const r2 = placeLabel(b, 995, 300, 1000, 600, 980, 80);
    expect(r2.x).toBe(12);
    expect(r2.ex).toBe(12 + 980 - 12);
  });

  test("a los costados, la línea llega a la altura de la articulación (a 14 px de las esquinas)", () => {
    const r = placeLabel(box, 550, 590, 1000, 600, 150, 80);
    expect(r.y).toBe(512);
    expect(r.ey).toBe(578);
    const r2 = placeLabel(box, 550, 0, 1000, 600, 150, 80);
    expect(r2.y).toBe(8);
    expect(r2.ey).toBe(22);
  });
});

/* ================================================================== */

describe("soporte de WebGL", () => {
  test("isSupported es true si hay WebGL", () => {
    expect(RobotScene.isSupported()).toBe(true);
  });

  test("sin WebGL: mensaje claro, sin canvas y sin descargar el modelo", async () => {
    vi.restoreAllMocks();
    stubCanvas({ webgl: null });
    const fetch = stubFetchGlb();
    clock = fakeClock();
    vi.resetModules();
    const { RobotScene: Fresh } = await import("../../js/views/twin/RobotScene.js");
    expect(Fresh.isSupported()).toBe(false);
    const onStatus = vi.fn();
    const scene = new Fresh(container, { onStatus });
    scene.setInfo(paseo("go2").info);
    expect(scene.overlay.dataset.kind).toBe("error");
    expect(scene.ovTitle.textContent).toBe("Este navegador no puede mostrar gráficos 3D");
    expect(scene.ovText.textContent).toMatch(/^WebGL está desactivado/);
    expect(scene.ovRetry.hidden).toBe(true);
    expect(scene.ovBar.hidden).toBe(true);
    expect(onStatus).toHaveBeenCalledWith({ kind: "webgl", error: undefined });
    expect(scene.el.querySelector("canvas")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(scene.quality).toBeNull();
    expect(() => {
      scene.applyTheme();
      scene.resize();
      scene.setMarkers(false);
      scene.setPreset("arriba");
      scene.pinMotor(0);
    }).not.toThrow();
    scene.destroy();
    expect(container.children).toHaveLength(0);
  });

  test("si el escenario no se puede crear muestra el error y lo registra en la consola", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { scene, statuses } = crear();
    expect(scene.stage).toBeNull();
    expect(scene.ovTitle.textContent).toBe("No se pudo cargar el modelo 3D");
    expect(scene.ovText.textContent).toMatch(/ResizeObserver/);
    expect(scene.ovRetry.hidden).toBe(false);
    expect(err).toHaveBeenCalledOnce();
    expect(statuses[0].kind).toBe("error");
    expect(statuses[0].error).toBeInstanceOf(Error);
  });

  test("si la placa pierde el contexto avisa y evita el comportamiento por defecto", () => {
    const { scene, statuses } = crear();
    const e = new Event("webglcontextlost", { cancelable: true });
    scene.stage.renderer.domElement.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(scene.ovTitle.textContent).toBe("Se perdió el contexto 3D");
    expect(scene.ovText.textContent).toBe("La placa de video reinició el dibujo. Cambiá de vista y volvé.");
    expect(scene.ovRetry.hidden).toBe(true);
    expect(statuses.at(-1).kind).toBe("lost");
  });
});

/* ================================================================== */

describe("construcción", () => {
  test("arma el contenedor con el canvas, la pantalla de carga y la etiqueta", () => {
    const { scene } = crear();
    expect(scene.el.parentNode).toBe(container);
    expect(scene.el.className).toBe("r3d");
    expect(scene.el.dataset.bg).toBe("theme");
    expect(scene.el.firstChild).toBe(scene.stage.renderer.domElement);
    expect(scene.overlay.getAttribute("role")).toBe("status");
    expect(scene.overlay.dataset.kind).toBe("boot");
    expect(scene.ovTitle.textContent).toBe("Preparando el robot 3D…");
    expect(scene.ovText.textContent).toBe("Esperando los datos del robot.");
    expect(scene.ovBar.getAttribute("role")).toBe("progressbar");
    expect(scene.ovBar.getAttribute("aria-label")).toBe("Descarga del modelo 3D");
    expect(scene.overlay.querySelector(".r3d-overlay__icon svg")).not.toBeNull();
    expect(scene.tip.parentNode).toBe(scene.el);
    expect(scene.tip.getAttribute("role")).toBe("tooltip");
    expect(scene.tip.hidden).toBe(true);
    expect(scene.lead.style.display).toBe("none");
    expect(scene.portal).toBeUndefined();
    expect(clock.raf).toHaveBeenCalled(); // el bucle propio arrancó
    expect(scene.quality).toBe("alta");
  });

  test("opciones por defecto", () => {
    const { scene } = crear();
    expect(scene.opts).toMatchObject({ interactive: true, background: "theme", labels: true, markers: true, follow: true, preset: "perspectiva", quality: "auto" });
    expect(scene.opts.torqueAlarm()).toBe(Infinity);
    expect(scene.mapping).toBe("nombre");
    expect(scene.reducedMotion).toBe(false);
    expect(scene.activeMotor).toBeNull();
  });

  test("sin etiquetas no crea la etiqueta flotante", () => {
    const { scene } = crear({ labels: false });
    expect(scene.tip).toBeUndefined();
    expect(scene.el.querySelector(".r3d-tip")).toBeNull();
  });

  test("con fondo transparente la etiqueta va en una capa sobre toda la página", () => {
    const { scene } = crear({ background: "transparent" });
    expect(scene.el.dataset.bg).toBe("transparent");
    expect(scene.portal.parentNode).toBe(document.body);
    expect(scene.portal.className).toBe("r3d r3d-portal");
    expect(scene.portal.contains(scene.tip)).toBe(true);
    expect(scene.portal.contains(scene.lead)).toBe(true);
    expect(scene.stage.transparent).toBe(true);
    scene.destroy();
    expect(scene.portal.isConnected).toBe(false);
  });

  test("respeta prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", vi.fn((q) => ({ matches: q === "(prefers-reduced-motion: reduce)" })));
    const { scene } = crear();
    expect(scene.reducedMotion).toBe(true);
    expect(scene.stage.controls.enableDamping).toBe(false);
  });

  test("sin matchMedia asume movimiento normal", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(crear().scene.reducedMotion).toBe(false);
  });

  test.each([
    ["?calidad=minima", "mínima"],
    ["?calidad=baja", "baja"],
    ["?calidad=media", "media"],
  ])("la calidad se puede forzar por URL (%s)", (search, quality) => {
    history.replaceState(null, "", `/${search}`);
    const { scene } = crear();
    expect(scene.opts.quality).toBe(quality);
    expect(scene.quality).toBe(quality);
    expect(scene.stage.adaptive).toBe(false);
  });

  test("sin location (p. ej. en un worker) la calidad es automática", () => {
    vi.stubGlobal("location", undefined);
    const scene = new RobotScene(container, { interactive: false });
    scenes.push(scene);
    expect(scene.opts.quality).toBe("auto");
  });

  test("la calidad de las opciones gana sobre la de la URL", () => {
    history.replaceState(null, "", "/?calidad=alta");
    expect(crear({ quality: "baja" }).scene.quality).toBe("baja");
  });

  test("focusOffset corre el centro óptico del escenario", () => {
    const focusOffset = () => ({ x: 0, y: 30 });
    const { scene } = crear({ focusOffset });
    expect(scene.stage.getFocusOffset).toBe(focusOffset);
    expect(scene.stage.camera.view.offsetY).toBe(-30);
  });

  test("sin interacción no escucha el puntero", () => {
    const add = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");
    crear({ interactive: false });
    expect(add.mock.calls.map((c) => c[0])).toEqual(["webglcontextlost"]);
  });

  test("applyTheme lee los colores de las variables CSS (o usa los de fábrica)", () => {
    const { scene } = crear();
    const spy = vi.spyOn(scene.stage, "applyTheme");
    scene.applyTheme();
    expect(spy).toHaveBeenLastCalledWith({
      bg: "#0b0e14",
      floor: "#10141b",
      minor: "#1a2029",
      major: "#2a3342",
      sky: "#dfe9ff",
      ground: "#1a1e26",
      light: false,
    });
    scene.el.style.setProperty("--r3d-scene-bg", " #ffffff ");
    scene.el.style.setProperty("--r3d-scene-grid", "#cccccc");
    document.documentElement.dataset.theme = "light";
    scene.applyTheme();
    expect(spy.mock.lastCall[0]).toMatchObject({ bg: "#ffffff", minor: "#cccccc", light: true });
    expect(scene.stage.scene.background.getHexString()).toBe("ffffff");
  });
});

/* ================================================================== */

describe("carga del modelo", () => {
  test("muestra el progreso de la descarga con el nombre del robot", async () => {
    let gate;
    vi.spyOn(RobotRig.prototype, "load").mockImplementation(async function (onProgress) {
      onProgress(0.5);
      await new Promise((r) => (gate = r));
      return realLoad.call(this, onProgress);
    });
    const { scene, statuses, ready } = crear();
    scene.setInfo(paseo("go2").info);
    await vi.waitFor(() => expect(gate).toBeTypeOf("function"));
    expect(scene.overlay.dataset.kind).toBe("loading");
    expect(scene.overlay.hidden).toBe(false);
    expect(scene.ovBar.hidden).toBe(false);
    expect(scene.ovRetry.hidden).toBe(true);
    expect(scene.ovBar.getAttribute("aria-valuenow")).toBe("50");
    expect(scene.ovFill.style.transform).toBe("scaleX(0.5)");
    expect(scene.ovTitle.textContent).toBe("Cargando el modelo 3D del Unitree Go2…");
    expect(scene.ovText.textContent).toBe("50 % · modelo oficial de Unitree, simplificado para la web");
    expect(statuses.filter((s) => s.kind === "loading").map((s) => s.progress)).toEqual([0, 0.5]);
    gate();
    await ready();
  });

  test("al terminar: robot en la escena, motores asignados y aviso 'ready'", async () => {
    const { scene, statuses, info } = await cargado("go2");
    expect(scene.stage.scene.children).toContain(scene.rig.root);
    expect(scene.stage.cam).toBe(scene.profile.camera);
    const mapped = statuses.find((s) => s.kind === "mapped");
    expect(mapped.mapping).toBe("nombre");
    expect(mapped.motors.map((m) => m.nombre)).toEqual(info.motores_nombres);
    const ready = statuses.at(-1);
    expect(ready).toEqual({ kind: "ready", motors: scene.rig.motors, quality: "alta" });
    expect(scene.jointByMotor).toHaveLength(12);
    expect(scene.jointByMotor[2]).toBe(scene.rig.joints.get("FR_calf_joint"));
    // cámara en el preset inicial, sin transición
    const pose = scene.stage.presetPose("perspectiva", 0);
    expect(scene.stage.camera.position.distanceTo(pose.position)).toBeLessThan(1e-6);
    expect(scene.stage._tween).toBeNull();
  });

  test("G1: 29 motores con su articulación", async () => {
    const { scene } = await cargado("g1");
    expect(scene.jointByMotor.every(Boolean)).toBe(true);
    expect(scene.jointByMotor).toHaveLength(29);
    expect(scene.profile.label).toBe("Unitree G1");
  });

  test("la pantalla de carga se desvanece y se oculta a los 350 ms", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { scene } = await cargado("go2");
    expect(scene.overlay.classList.contains("is-out")).toBe(true);
    expect(scene.overlay.hidden).toBe(false);
    vi.advanceTimersByTime(349);
    expect(scene.overlay.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(scene.overlay.hidden).toBe(true);
  });

  test("con menos movimiento se oculta en el acto", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { scene } = await cargado("go2");
    vi.advanceTimersByTime(0);
    expect(scene.overlay.hidden).toBe(true);
  });

  test("si vuelve a cargar antes de ocultarse, la pantalla de carga sigue visible", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { scene, ready } = await cargado("go2");
    scene.setInfo(paseo("g1").info);
    vi.advanceTimersByTime(400);
    expect(scene.overlay.hidden).toBe(false);
    expect(scene.overlay.dataset.kind).toBe("loading");
    await ready();
  });

  test("con markers: false los anillos arrancan ocultos", async () => {
    const { scene } = await cargado("go2", { scene: { markers: false } });
    expect(scene.rig.markerGroup.every((r) => !r.visible)).toBe(true);
  });

  test("robot sin modelo 3D: avisa y no descarga nada", async () => {
    const fetch = stubFetchGlb();
    const { scene, statuses, ready } = crear();
    scene.setInfo({ modelo: "h1", motores_nombres: ["a"] });
    await ready();
    expect(scene.ovTitle.textContent).toBe("No hay modelo 3D para «h1»");
    expect(scene.ovText.textContent).toBe("Los datos siguen llegando: usá las otras vistas.");
    expect(statuses.at(-1)).toEqual({ kind: "missing", error: undefined });
    expect(fetch).not.toHaveBeenCalled();
    expect(scene.rig).toBeNull();
  });

  test("si falla la carga ofrece reintentar, y reintentar la vuelve a hacer", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.spyOn(RobotRig.prototype, "load").mockRejectedValueOnce(new Error("No se pudo descargar el modelo (500)"));
    const { scene, ready, kinds } = crear();
    scene.setInfo(paseo("go2").info);
    await ready();
    expect(scene.ovTitle.textContent).toBe("No se pudo cargar el modelo 3D");
    expect(scene.ovText.textContent).toBe("No se pudo descargar el modelo (500)");
    expect(scene.ovRetry.hidden).toBe(false);
    expect(scene.ovBar.hidden).toBe(true);
    expect(err).toHaveBeenCalledOnce();
    scene.ovRetry.click();
    await ready();
    expect(load).toHaveBeenCalledTimes(2);
    expect(kinds().at(-1)).toBe("ready");
    expect(scene.rig).not.toBeNull();
  });

  test("un error sin mensaje muestra un texto genérico", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(RobotRig.prototype, "load").mockRejectedValueOnce({});
    const { scene, ready } = crear();
    scene.setInfo(paseo("go2").info);
    await ready();
    expect(scene.ovText.textContent).toBe("Error desconocido. Probá de nuevo.");
  });

  test("si se destruye mientras baja, el robot cargado se descarta", async () => {
    let gate;
    vi.spyOn(RobotRig.prototype, "load").mockImplementation(async function () {
      await new Promise((r) => (gate = r));
      return realLoad.call(this);
    });
    const dispose = vi.spyOn(RobotRig.prototype, "dispose");
    const { scene, kinds } = crear();
    scene.setInfo(paseo("go2").info);
    await vi.waitFor(() => expect(gate).toBeTypeOf("function"));
    scene.destroy();
    gate();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalled());
    expect(scene.rig).toBeNull();
    expect(kinds()).not.toContain("ready");
  });

  test("si falla después de destruirse no muestra nada", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let fail;
    vi.spyOn(RobotRig.prototype, "load").mockImplementation(() => new Promise((_, rej) => (fail = rej)));
    const { scene, kinds } = crear();
    scene.setInfo(paseo("go2").info);
    scene.destroy();
    fail(new Error("tarde"));
    await new Promise((r) => setTimeout(r, 0));
    expect(err).not.toHaveBeenCalled();
    expect(kinds()).not.toContain("error");
  });

  test("al cambiar de robot mientras baja gana el último y se ignora el progreso del anterior", async () => {
    const gates = [];
    const progress = [];
    vi.spyOn(RobotRig.prototype, "load").mockImplementation(async function (onProgress) {
      progress.push(onProgress);
      await new Promise((r) => gates.push(r));
      return realLoad.call(this);
    });
    const { scene, statuses, ready } = crear();
    scene.setInfo(paseo("go2").info);
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    scene.setInfo(paseo("g1").info);
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    const antes = statuses.length;
    progress[0](0.7); // del Go2: ya no corresponde
    expect(statuses.length).toBe(antes);
    progress[1](0.3);
    expect(statuses.at(-1)).toEqual({ kind: "loading", progress: 0.3 });
    gates[0]();
    gates[1]();
    await ready();
    expect(scene.profile.label).toBe("Unitree G1");
    expect(scene.rig.joints.size).toBe(29);
    expect(statuses.filter((s) => s.kind === "ready")).toHaveLength(1);
  });

  test("setInfo con el mismo robot solo reasigna motores (no descarga de nuevo)", async () => {
    const load = vi.spyOn(RobotRig.prototype, "load");
    const { scene, statuses, info } = await cargado("go2");
    const rig = scene.rig;
    scene.setInfo({ ...info, motores_nombres: ["RL_calf"] });
    expect(scene.rig).toBe(rig);
    expect(load).toHaveBeenCalledOnce();
    expect(statuses.at(-1).kind).toBe("mapped");
    expect(scene.jointByMotor).toEqual([rig.joints.get("RL_calf_joint")]);
  });

  test("setInfo sin motores_nombres deja la lista vacía", async () => {
    const { scene, info } = await cargado("go2");
    scene.setInfo({ ...info, motores_nombres: undefined });
    expect(scene.jointByMotor).toEqual([]);
  });

  test("avisa por consola los motores que no tienen articulación en el modelo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scene, info } = await cargado("go2");
    scene.setInfo({ ...info, motores_nombres: [...info.motores_nombres, "cola", "oreja"] });
    expect(warn).toHaveBeenCalledWith("[Gemelo 3D] Motores sin articulación en el modelo: cola, oreja");
    expect(scene.jointByMotor.slice(-2)).toEqual([null, null]);
  });

  test("con ?mapeo=indice asigna por posición y lo informa", async () => {
    history.replaceState(null, "", "/?mapeo=indice");
    const { statuses } = await cargado("g1");
    const mapped = statuses.find((s) => s.kind === "mapped");
    expect(mapped.mapping).toBe("indice");
    expect(mapped.motors[0].joint).toBe("left_hip_pitch_joint");
  });

  test("setInfo(null) no descarga nada", () => {
    const load = vi.spyOn(RobotRig.prototype, "load");
    const { scene } = crear();
    scene.setInfo(null);
    expect(load).not.toHaveBeenCalled();
    expect(scene.overlay.dataset.kind).toBe("boot");
  });

  test("si ya había una muestra, el robot aparece directamente en esa pose", async () => {
    let gate;
    vi.spyOn(RobotRig.prototype, "load").mockImplementation(async function () {
      await new Promise((r) => (gate = r));
      return realLoad.call(this);
    });
    const { info, frames } = paseo("go2", 1, { skip: 8 });
    const { scene, ready } = crear();
    scene.setInfo(info);
    scene.update(frames[0]);
    await vi.waitFor(() => expect(gate).toBeTypeOf("function"));
    gate();
    await ready();
    expect(scene.shown.ready).toBe(true);
    expect(scene.shown.q[2]).toBeCloseTo((frames[0].motores[2].angulo * Math.PI) / 180);
  });
});

/* ================================================================== */

describe("muestras e interpolación", () => {
  test("update antes de setInfo o de otro robot se ignora", async () => {
    const { scene, info } = await cargado("go2");
    const g1 = paseo("g1").frames[0];
    scene.update(g1);
    expect(scene.frame).toBeNull();
    const vacia = new RobotScene(container, {});
    scenes.push(vacia);
    vacia.update(paseo("go2").frames[0]);
    expect(vacia.frame).toBeNull();
    expect(info.modelo).toBe("go2");
  });

  test("guarda el objetivo en radianes y la primera muestra salta sin animar", async () => {
    const { scene, frames } = await cargado("go2", { skip: 8 });
    const f = frames[0];
    scene.update(f);
    const DEG = Math.PI / 180;
    expect(scene.target.q).toHaveLength(12);
    expect(scene.target.q[1]).toBeCloseTo(f.motores[1].angulo * DEG);
    expect(scene.target.roll).toBeCloseTo(f.imu.roll * DEG);
    expect(scene.target.pitch).toBeCloseTo(f.imu.pitch * DEG);
    expect(scene.target.yaw).toBeCloseTo(f.imu.yaw * DEG);
    expect(scene.target.fuerzas).toBe(f.fuerzas);
    expect(scene.shown.q).toEqual(scene.target.q);
    expect(scene.shown.q).not.toBe(scene.target.q);
    expect(scene.shown.ready).toBe(true);
    expect(scene.frame).toBe(f);
  });

  test("la velocidad del piso sale de la marcha (velocidad articular × perfil), con tope", async () => {
    const { scene, frames } = await cargado("go2", { skip: 12 });
    const f = frames[0];
    expect(f.derived.isMoving).toBe(true);
    scene.update(f);
    expect(scene.target.speed).toBeCloseTo(Math.min(1.6, f.derived.meanSpeed * 0.45));
    scene.update({ ...f, derived: { ...f.derived, meanSpeed: 100 } });
    expect(scene.target.speed).toBe(1.6);
    scene.update({ ...f, derived: { ...f.derived, isMoving: false } });
    expect(scene.target.speed).toBe(0);
    scene.update({ ...f, derived: undefined });
    expect(scene.target.speed).toBe(0);
  });

  test("sin perfil 3D la velocidad usa el factor por defecto (0,4)", async () => {
    const { scene, ready } = crear();
    const f = paseo("go2", 1, { skip: 12 }).frames[0];
    scene.setInfo({ modelo: "h1", motores_nombres: [] });
    await ready();
    scene.update({ ...f, modelo: "h1" });
    expect(scene.target.speed).toBeCloseTo(f.derived.meanSpeed * 0.4);
  });

  test("con menos motores en la muestra, el objetivo se recorta", async () => {
    const { scene, frames } = await cargado("go2");
    scene.update(frames[0]);
    scene.update({ ...frames[1], motores: frames[1].motores.slice(0, 3) });
    expect(scene.target.q).toHaveLength(3);
  });

  test("si la primera muestra trae menos motores, los que faltan no se mueven hasta que lleguen", async () => {
    const { scene, frames } = await cargado("go2", { skip: 8 });
    const calf = scene.jointByMotor[11];
    const reposo = calf.angle;
    scene.update({ ...frames[0], motores: frames[0].motores.slice(0, 3) });
    clock.frame(17);
    expect(scene.shown.q).toHaveLength(3);
    expect(calf.angle).toBe(reposo);
    scene.update(frames[1]);
    clock.frame(17);
    // el motor nuevo arranca directamente en su valor (no interpola desde undefined)
    expect(scene.shown.q[11]).toBeCloseTo(scene.target.q[11], 12);
    expect(calf.angle).toBe(scene.shown.q[11]);
  });

  test("semáforo: el anillo del motor caliente se pinta de rojo", async () => {
    const { scene, frames } = await cargado("go2");
    const f = frames[0];
    const motores = f.motores.map((m, i) => ({ ...m, temperatura: i === 2 ? 65 : i === 1 ? 45 : 30 }));
    scene.update(withFrame(f, { motores }));
    expect(scene.levels.slice(0, 4)).toEqual(["ok", "warn", "crit", "ok"]);
    expect(scene.jointByMotor[2].marker.material.color.getHex()).toBe(SEM_COLORS.crit);
    expect(scene.jointByMotor[1].marker.material.color.getHex()).toBe(SEM_COLORS.warn);
    expect(scene.jointByMotor[0].marker.material.color.getHex()).toBe(SEM_COLORS.ok);
  });

  test("articulaciones sin motor o sin dato quedan en gris", async () => {
    const { scene, info, frames } = await cargado("go2");
    scene.setInfo({ ...info, motores_nombres: ["FR_hip", "FR_thigh"] });
    scene.update({ ...frames[0], motores: frames[0].motores.slice(0, 1) });
    expect(scene.rig.joints.get("FR_thigh_joint").marker.material.color.getHex()).toBe(SEM_COLORS.unknown);
    expect(scene.rig.joints.get("RL_calf_joint").marker.material.color.getHex()).toBe(SEM_COLORS.unknown);
    expect(scene.rig.joints.get("FR_hip_joint").marker.material.color.getHex()).toBe(SEM_COLORS.ok);
  });

  test("en cada cuadro se acerca al objetivo con suavizado exponencial (τ = 75 ms)", async () => {
    const { scene, frames } = await cargado("go2", { skip: 8 });
    scene.update(frames[0]);
    const desde = scene.shown.q[2];
    scene.update(frames[2]);
    const hasta = scene.target.q[2];
    expect(Math.abs(hasta - desde)).toBeGreaterThan(0.01);
    clock.frame(20); // primer cuadro: 20 ms desde que arrancó el bucle
    const dt = 0.02;
    const k = 1 - Math.exp(-dt / 0.075);
    expect(scene.shown.q[2]).toBeCloseTo(desde + (hasta - desde) * k, 6);
    expect(scene.jointByMotor[2].angle).toBe(scene.shown.q[2]);
    clock.frames(60, 17);
    expect(scene.shown.q[2]).toBeCloseTo(hasta, 4);
  });

  test("pausado, el robot no se mueve (la cámara sí)", async () => {
    const { scene, frames } = await cargado("go2", { skip: 8 });
    scene.update(frames[0]);
    scene.update(frames[2]);
    scene.setPaused(1);
    expect(scene.paused).toBe(true);
    const antes = scene.shown.q.slice();
    clock.frames(5, 17);
    expect(scene.shown.q).toEqual(antes);
    scene.setPaused(0);
    expect(scene.paused).toBe(false);
    clock.frame(17);
    expect(scene.shown.q).not.toEqual(antes);
  });

  test("sin datos nuevos por más de 0,6 s deja de animar y de redibujar", async () => {
    const { scene, frames } = await cargado("go2");
    scene.update(frames[0]);
    clock.frames(40, 17);
    const renders = scene.stage.renderer.render.mock.calls.length;
    clock.frames(10, 17);
    expect(scene.stage.renderer.render.mock.calls.length).toBe(renders);
  });

  test("el rumbo va por el camino corto entre −180° y 180°", async () => {
    const { scene, frames } = await cargado("go2", { scene: { follow: false } });
    scene.update(withFrame(frames[0], { imu: { ...frames[0].imu, yaw: -179 } }));
    scene.update(withFrame(frames[1], { imu: { ...frames[1].imu, yaw: 179 } }));
    clock.frame(17);
    expect(Math.abs(scene.shown.yaw)).toBeGreaterThan((179 * Math.PI) / 180);
    expect(Math.abs(scene.shown.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  test("en cada cuadro orienta, apoya y enciende las patas del robot", async () => {
    const { scene, frames } = await cargado("go2", { skip: 8 });
    const att = vi.spyOn(scene.rig, "setAttitude");
    const ground = vi.spyOn(scene.rig, "ground");
    const feet = vi.spyOn(scene.rig, "updateFeet");
    scene.update(frames[0]);
    clock.frame(17);
    expect(att).toHaveBeenCalledWith(scene.shown.roll, scene.shown.pitch, scene.shown.yaw);
    expect(ground.mock.calls[0][0]).toBeGreaterThan(0);
    expect(ground.mock.calls[0][0]).toBeLessThan(1);
    expect(feet).toHaveBeenCalledWith(frames[0].fuerzas, expect.any(Number));
  });

  test("si el robot camina el piso se desplaza en la dirección del rumbo", async () => {
    const { scene, frames } = await cargado("go2", { skip: 12 });
    const scroll = vi.spyOn(scene.stage, "scrollFloor");
    scene.update(frames[0]);
    clock.frame(17);
    expect(scroll).toHaveBeenCalled();
    const [dx, dz] = scroll.mock.calls[0];
    const yaw = scene.shown.yaw;
    expect(Math.atan2(-dz, dx)).toBeCloseTo(yaw, 6);
  });

  test("quieto, el piso no se desplaza", async () => {
    const { scene, frames } = await cargado("go2");
    const scroll = vi.spyOn(scene.stage, "scrollFloor");
    expect(frames[0].derived.isMoving).toBe(false);
    scene.update(frames[0]);
    clock.frame(17);
    expect(scroll).not.toHaveBeenCalled();
  });

  test("seguir al robot: la cámara gira lo mismo que el rumbo; sin seguir, no", async () => {
    const { scene, frames } = await cargado("go2");
    const orbit = vi.spyOn(scene.stage, "orbitBy");
    scene.update(withFrame(frames[0], { imu: { ...frames[0].imu, yaw: 0 } }));
    scene.update(withFrame(frames[1], { imu: { ...frames[1].imu, yaw: 30 } }));
    const antes = scene.shown.yaw;
    clock.frame(17);
    expect(orbit).toHaveBeenCalledOnce();
    expect(orbit.mock.calls[0][0]).toBeCloseTo(scene.shown.yaw - antes, 9);
    scene.setFollow(0);
    expect(scene.follow).toBe(false);
    clock.frame(17);
    expect(orbit).toHaveBeenCalledOnce();
  });

  test("antes de tener robot el cuadro no hace nada", () => {
    const { scene } = crear();
    clock.frame(17);
    expect(scene.stage.renderer.render).toHaveBeenCalledOnce(); // el primer cuadro de la escena vacía
    clock.frame(17);
    expect(scene.stage.renderer.render).toHaveBeenCalledOnce();
  });
});

/* ================================================================== */

describe("selección con mouse y toque", () => {
  async function listo(modelo = "go2", opts) {
    const c = await cargado(modelo, { scene: opts });
    c.scene.update(c.frames[0]);
    clock.frame(17);
    return c;
  }

  test("tocar una articulación fija su etiqueta; tocarla de nuevo la cierra", async () => {
    const onHover = vi.fn();
    const { scene } = await listo("go2", { onHover });
    const j = scene.rig.joints.get("FL_hip_joint");
    const at = screenOf(scene, j.body);
    tap(scene, at);
    expect(scene.pinned).toBe(j);
    expect(scene.activeMotor).toBe(3);
    expect(onHover).toHaveBeenLastCalledWith(3);
    expect(j.marker.scale.x).toBe(1.35);
    tap(scene, at);
    expect(scene.pinned).toBeNull();
    expect(scene.activeMotor).toBeNull();
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(j.marker.scale.x).toBe(1);
  });

  test("arrastrar (más de 6 px) o mantener apretado (más de 450 ms) no es un toque", async () => {
    const { scene } = await listo();
    const at = screenOf(scene, scene.rig.joints.get("FL_hip_joint").body);
    tap(scene, at, { move: 6 });
    expect(scene.pinned).toBeNull();
    tap(scene, at, { dt: 450 });
    expect(scene.pinned).toBeNull();
    tap(scene, at, { move: 5, dt: 449 });
    expect(scene.pinned).not.toBeNull();
  });

  test("soltar sin haber apretado no hace nada", async () => {
    const { scene } = await listo();
    const at = screenOf(scene, scene.rig.joints.get("FL_hip_joint").body);
    pointer(scene.stage.renderer.domElement, "pointerup", at);
    expect(scene.pinned).toBeNull();
  });

  test("tocar el vacío cierra la etiqueta", async () => {
    const { scene } = await listo();
    scene.pinMotor(0);
    tap(scene, { x: 2, y: 2 });
    expect(scene.pinned).toBeNull();
  });

  test("tocar el cuerpo fija la base del robot", async () => {
    const { scene } = await listo();
    const base = scene.rig.attitude.getObjectByName("base_link");
    tap(scene, screenOf(scene, base));
    expect(scene.pinned?.base).toBe(true);
    expect(scene.activeMotor).toBeNull();
  });

  test("tocar antes de que cargue el robot no hace nada", () => {
    const { scene } = crear();
    tap(scene, { x: 500, y: 300 });
    expect(scene.pinned).toBeNull();
  });

  test("el mouse señala (a lo sumo un raycast por cuadro) y al salir se limpia", async () => {
    const onHover = vi.fn();
    const { scene } = await listo("go2", { onHover });
    const pick = vi.spyOn(scene.rig, "pick");
    const j = scene.rig.joints.get("FL_hip_joint");
    const at = screenOf(scene, j.body);
    const canvas = scene.stage.renderer.domElement;
    pointer(canvas, "pointermove", at);
    pointer(canvas, "pointermove", at);
    expect(pick).not.toHaveBeenCalled();
    clock.frame(17);
    expect(pick).toHaveBeenCalledOnce();
    expect(scene.hover).toBe(j);
    expect(scene.el.style.cursor).toBe("pointer");
    expect(onHover).toHaveBeenLastCalledWith(3);
    clock.frame(17);
    expect(pick).toHaveBeenCalledOnce(); // el puntero no se movió
    pointer(canvas, "pointerleave");
    expect(scene.hover).toBeNull();
    expect(scene.el.style.cursor).toBe("");
    expect(onHover).toHaveBeenLastCalledWith(null);
    pointer(canvas, "pointermove", at);
    pointer(canvas, "pointerleave");
    clock.frame(17);
    expect(pick).toHaveBeenCalledOnce(); // fuera del canvas no se busca
  });

  test("el dedo que se arrastra no señala", async () => {
    const { scene } = await listo();
    const at = screenOf(scene, scene.rig.joints.get("FL_hip_joint").body);
    pointer(scene.stage.renderer.domElement, "pointermove", { ...at, pointerType: "touch" });
    clock.frame(17);
    expect(scene.hover).toBeNull();
  });

  test("lo fijado gana sobre lo señalado con el mouse", async () => {
    const { scene } = await listo();
    const at = screenOf(scene, scene.rig.joints.get("FL_hip_joint").body);
    scene.pinMotor(11);
    pointer(scene.stage.renderer.domElement, "pointermove", at);
    clock.frame(17);
    expect(scene.hover).toBe(scene.rig.joints.get("FL_hip_joint"));
    expect(scene.activeMotor).toBe(11);
  });

  test("pinMotor: índice, null, undefined y fuera de rango", async () => {
    const onHover = vi.fn();
    const { scene } = await listo("go2", { onHover });
    scene.pinMotor(5);
    expect(scene.pinned).toBe(scene.jointByMotor[5]);
    expect(onHover).toHaveBeenCalledTimes(1);
    scene.pinMotor(5);
    expect(onHover).toHaveBeenCalledTimes(1); // sin cambios no avisa
    scene.pinMotor(undefined);
    expect(scene.pinned).toBeNull();
    scene.pinMotor(5);
    scene.pinMotor(null);
    expect(scene.pinned).toBeNull();
    scene.pinMotor(99);
    expect(scene.pinned).toBeNull();
  });

  test("después de destruirse, el puntero ya no se escucha", async () => {
    const { scene } = await listo();
    const canvas = scene.stage.renderer.domElement;
    const at = screenOf(scene, scene.rig.joints.get("FL_hip_joint").body);
    scene.destroy();
    pointer(canvas, "pointerdown", at);
    pointer(canvas, "pointerup", at);
    expect(scene.pinned).toBeNull();
    expect(() => scene.pinMotor(0)).not.toThrow();
  });
});

/* ================================================================== */

describe("etiqueta flotante", () => {
  async function conMotor(modelo = "go2", { index = 2, motores, opts } = {}) {
    const c = await cargado(modelo, { scene: opts, skip: 8 });
    const f = motores ? withFrame(c.frames[0], { motores: motores(c.frames[0].motores) }) : c.frames[0];
    c.scene.update(f);
    c.scene.pinMotor(index);
    return { ...c, f };
  }

  test("motor del Go2: grupo, articulación y los cuatro datos con su semáforo", async () => {
    const { scene, f } = await conMotor("go2", { motores: (ms) => ms.map((m, i) => (i === 2 ? { ...m, temperatura: 41.25 } : m)) });
    const m = f.motores[2];
    expect(scene.tip.hidden).toBe(false);
    expect(tipText(scene)).toEqual(["Delantera derecha · pantorrilla", "FR_calf → FR_calf_joint"]);
    expect(tipRows(scene)).toEqual([
      "Temperatura",
      "41.3 °C · tibio (40–60 °C)",
      "Ángulo",
      `${m.angulo < 0 ? "−" : "+"}${Math.abs(m.angulo).toFixed(1)}°`,
      "Torque",
      `${m.torque < 0 ? "−" : "+"}${Math.abs(m.torque).toFixed(2)} N·m`,
      "Velocidad",
      `${m.velocidad < 0 ? "−" : "+"}${Math.abs(m.velocidad).toFixed(2)} rad/s`,
    ]);
    expect(scene.tipRows.children[1].dataset.level).toBe("warn");
    expect(scene.tipRows.children[5].dataset.level).toBeUndefined();
    expect(scene.lead.dataset.level).toBe("warn");
  });

  test.each([
    [30, "normal (< 40 °C)", "ok"],
    [61, "caliente (> 60 °C)", "crit"],
  ])("texto del semáforo a %s °C", async (t, texto, nivel) => {
    const { scene } = await conMotor("go2", { motores: (ms) => ms.map((m) => ({ ...m, temperatura: t })) });
    expect(tipRows(scene)[1]).toBe(`${t}.0 °C · ${texto}`);
    expect(scene.lead.dataset.level).toBe(nivel);
  });

  test("marca el torque que supera la alarma", async () => {
    const { scene } = await conMotor("go2", {
      motores: (ms) => ms.map((m) => ({ ...m, torque: -12.5 })),
      opts: { torqueAlarm: () => 12 },
    });
    expect(tipRows(scene)[5]).toBe("−12.50 N·m · sobre la alarma");
    expect(scene.tipRows.children[5].dataset.level).toBe("crit");
  });

  test("con el torque justo en la alarma no la marca", async () => {
    const { scene } = await conMotor("go2", {
      motores: (ms) => ms.map((m) => ({ ...m, torque: 12 })),
      opts: { torqueAlarm: () => 12 },
    });
    expect(tipRows(scene)[5]).toBe("+12.00 N·m");
  });

  test("G1: brazo izquierdo · codo", async () => {
    const { scene } = await conMotor("g1", { index: 18 });
    expect(tipText(scene)).toEqual(["Brazo izquierdo · codo", "L_elbow → left_elbow_joint"]);
  });

  test("la base muestra la orientación de la IMU", async () => {
    const c = await cargado("go2");
    const f = withFrame(c.frames[0], { imu: { ...c.frames[0].imu, roll: 1.25, pitch: -2, yaw: 0 } });
    c.scene.update(f);
    clock.frame(17);
    tap(c.scene, screenOf(c.scene, c.scene.rig.attitude.getObjectByName("base_link")));
    expect(tipText(c.scene)).toEqual(["Base del robot", "sin motor · orientación de la IMU"]);
    expect(tipRows(c.scene)).toEqual(["Roll", "+1.3°", "Pitch", "−2.0°", "Yaw", " 0.0°"]);
    expect(c.scene.lead.dataset.level).toBe("base");
  });

  test("una articulación sin motor en la telemetría lo dice", async () => {
    const c = await cargado("go2");
    c.scene.setInfo({ ...c.info, motores_nombres: ["RL_calf"] });
    c.scene.update({ ...c.frames[0], motores: c.frames[0].motores.slice(11) });
    clock.frame(17);
    c.scene.pinMotor(0);
    expect(tipRows(c.scene)).toHaveLength(8);
    tap(c.scene, screenOf(c.scene, c.scene.rig.joints.get("FL_hip_joint").body));
    expect(tipText(c.scene)).toEqual(["FL_hip_joint", "articulación sin motor en la telemetría"]);
    expect(c.scene.tipRows.children).toHaveLength(0);
    expect(c.scene.lead.dataset.level).toBe("base");
  });

  test("si la muestra no trae el dato de ese motor, deja la etiqueta como estaba", async () => {
    const c = await conMotor("go2", { index: 2 });
    const antes = tipRows(c.scene);
    c.scene.update({ ...c.f, motores: c.f.motores.slice(0, 2) });
    expect(tipRows(c.scene)).toEqual(antes);
  });

  test("a 10 Hz reutiliza las filas: solo cambia el texto", async () => {
    const c = await conMotor("go2");
    const dd = c.scene.tipRows.children[1];
    c.scene.update(c.frames[1]);
    expect(c.scene.tipRows.children[1]).toBe(dd);
  });

  test("sin muestra no hay etiqueta, aunque haya un motor fijado", async () => {
    const { scene } = await cargado("go2");
    scene.pinMotor(0);
    expect(scene.tip.hidden).toBe(true);
    expect(scene.lead.style.display).toBe("none");
  });

  test("al cerrar se oculta la etiqueta y la línea guía", async () => {
    const { scene } = await conMotor();
    clock.frame(17);
    expect(scene.lead.style.display).toBe("");
    scene.pinMotor(null);
    expect(scene.tip.hidden).toBe(true);
    expect(scene.lead.style.display).toBe("none");
  });

  test("se ubica al costado del robot y la línea guía une la articulación con la etiqueta", async () => {
    const { scene } = await conMotor("go2", { index: 3, opts: { follow: false } });
    sizeTip(scene, 160, 90);
    clock.frames(2, 17);
    const j = scene.jointByMotor[3];
    const p = screenOf(scene, j.body);
    const line = scene.leadLine;
    expect(+line.getAttribute("x1")).toBeCloseTo(p.x, 0);
    expect(+line.getAttribute("y1")).toBeCloseTo(p.y, 0);
    expect(scene.leadDot.getAttribute("cx")).toBe(line.getAttribute("x1"));
    expect(scene.leadDot.getAttribute("cy")).toBe(line.getAttribute("y1"));
    expect(scene.lead.getAttribute("viewBox")).toBe("0 0 1000 600");
    const [, tx, ty] = scene.tip.style.transform.match(/translate3d\((-?\d+)px, (-?\d+)px, 0\)/).map(Number);
    const x2 = +line.getAttribute("x2");
    // La línea llega a un borde vertical de la etiqueta (va al costado)…
    expect([tx, tx + 160].some((e) => Math.abs(e - x2) <= 1)).toBe(true);
    // …que queda fuera del rectángulo de las articulaciones.
    const xs = [...scene.rig.joints.values()].map((jt) => screenOf(scene, jt.body).x);
    expect(tx >= Math.max(...xs) || tx + 160 <= Math.min(...xs)).toBe(true);
    expect(ty).toBe(Math.round(Math.max(8, Math.min(p.y - 45, 600 - 90 - 8))));
  });

  test("incrustada, la etiqueta se ubica en coordenadas de la ventana", async () => {
    vi.stubGlobal("innerWidth", 1600);
    vi.stubGlobal("innerHeight", 900);
    const { scene } = await conMotor("go2", { index: 3, opts: { background: "transparent", follow: false } });
    scene.el.getBoundingClientRect = () => ({ left: 200, top: 100, width: 1000, height: 600 });
    sizeTip(scene, 160, 90);
    clock.frames(2, 17);
    const p = screenOf(scene, scene.jointByMotor[3].body);
    expect(+scene.leadLine.getAttribute("x1")).toBeCloseTo(p.x + 200, 0);
    expect(+scene.leadLine.getAttribute("y1")).toBeCloseTo(p.y + 100, 0);
    expect(scene.lead.getAttribute("viewBox")).toBe("0 0 1600 900");
  });

  test("si el robot no tiene puntos que proyectar, la etiqueta se ubica respecto de la articulación", async () => {
    const { scene } = await conMotor("go2", { index: 3, opts: { follow: false } });
    sizeTip(scene, 160, 90);
    clock.frame(17);
    const j = scene.jointByMotor[3];
    scene.rig.joints.clear();
    scene.rig.allContacts = [];
    clock.frame(17);
    const p = screenOf(scene, j.body);
    const r = placeLabel({ minX: p.x, maxX: p.x, minY: p.y, maxY: p.y }, p.x, p.y, 1000, 600, 160, 90);
    expect(scene.tip.style.transform).toBe(`translate3d(${Math.round(r.x)}px, ${Math.round(r.y)}px, 0)`);
  });

  test("sin etiquetas, fijar un motor solo lo resalta", async () => {
    const { scene, frames } = await cargado("go2", { scene: { labels: false } });
    scene.update(frames[0]);
    scene.pinMotor(0);
    clock.frame(17);
    expect(scene.jointByMotor[0].marker.scale.x).toBe(1.35);
  });
});

/* ================================================================== */

describe("cámara, anillos y ciclo de vida", () => {
  test("setPreset mueve la cámara con transición; un nombre desconocido es perspectiva", async () => {
    const { scene } = await cargado("go2");
    expect(PRESETS).toEqual(["perspectiva", "arriba", "lateral", "frente"]);
    const goTo = vi.spyOn(scene.stage, "goTo");
    scene.setPreset("arriba");
    expect(scene.preset).toBe("arriba");
    expect(goTo).toHaveBeenLastCalledWith(scene.stage.presetPose("arriba", 0), false);
    scene.setPreset("debajo", { instant: true });
    expect(scene.preset).toBe("perspectiva");
    expect(goTo).toHaveBeenLastCalledWith(scene.stage.presetPose("perspectiva", 0), true);
  });

  test("setPreset antes de cargar solo recuerda la vista", () => {
    const { scene } = crear();
    const goTo = vi.spyOn(scene.stage, "goTo");
    scene.setPreset("lateral");
    expect(scene.preset).toBe("lateral");
    expect(goTo).not.toHaveBeenCalled();
  });

  test("el preset inicial de las opciones se aplica al cargar", async () => {
    const { scene } = await cargado("go2", { scene: { preset: "frente" } });
    const pose = scene.stage.presetPose("frente", 0);
    expect(scene.stage.camera.position.distanceTo(pose.position)).toBeLessThan(1e-6);
  });

  test("setMarkers muestra u oculta los anillos y pide un cuadro", async () => {
    const { scene } = await cargado("go2");
    const inv = vi.spyOn(scene.stage, "invalidate");
    scene.setMarkers(0);
    expect(scene.showMarkers).toBe(false);
    expect(scene.rig.markerGroup.every((r) => !r.visible)).toBe(true);
    expect(inv).toHaveBeenCalled();
    scene.setMarkers("sí");
    expect(scene.rig.markerGroup.every((r) => r.visible)).toBe(true);
  });

  test("setMarkers antes de cargar no falla", () => {
    const { scene } = crear();
    scene.setMarkers(false);
    expect(scene.showMarkers).toBe(false);
  });

  test("resize recalcula el tamaño del escenario", () => {
    const { scene } = crear();
    const spy = vi.spyOn(scene.stage, "resize");
    scene.resize();
    expect(spy).toHaveBeenCalledOnce();
  });

  test("destroy libera robot, escenario, timers y DOM en el acto", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { scene } = await cargado("go2");
    const rig = vi.spyOn(scene.rig, "dispose");
    const stage = vi.spyOn(scene.stage, "dispose");
    const overlay = scene.overlay;
    scene.destroy();
    expect(rig).toHaveBeenCalledOnce();
    expect(stage).toHaveBeenCalledOnce();
    expect(scene.rig).toBeNull();
    expect(scene.stage).toBeNull();
    expect(scene.el.isConnected).toBe(false);
    expect(clock.pending).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(overlay.hidden).toBe(false); // el timer de la pantalla de carga se canceló
    expect(scene.quality).toBeNull();
    expect(() => scene.destroy()).not.toThrow();
  });
});
