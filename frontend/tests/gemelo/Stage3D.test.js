import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Stage3D, QUALITY, releaseIdleRenderers } from "../../js/views/twin/Stage3D.js";
import {
  FakeRenderer,
  FakePMREM,
  FakeResizeObserver,
  stubCanvas,
  fakeGL,
  fakeClock,
  stubHidden,
  restoreHidden,
  setSize,
} from "./helpers.js";

vi.mock("three", async (orig) => (await import("./helpers.js")).threeSinGpu(orig));

let clock, host, canvas, setHidden;
const stages = [];
const make = (opts) => {
  const s = new Stage3D(host, opts);
  stages.push(s);
  return s;
};

beforeEach(() => {
  FakeRenderer.instances.length = 0;
  FakePMREM.instances.length = 0;
  FakeResizeObserver.instances.length = 0;
  canvas = stubCanvas();
  clock = fakeClock();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("devicePixelRatio", 1);
  setHidden = stubHidden(false);
  host = document.createElement("div");
  setSize(host, 800, 600);
  document.body.append(host);
});

afterEach(() => {
  for (const s of stages.splice(0)) s.dispose();
  releaseIdleRenderers();
  restoreHidden();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const CAM_GO2 = { target: 0.17, distance: 1.3, minDistance: 0.45, maxDistance: 4 };
const THEME = { bg: "#0b0e14", floor: "#10141b", minor: "#1a2029", major: "#2a3342", sky: "#dfe9ff", ground: "#1a1e26", light: false };
const near = (a, b, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const nearVec = (v, arr, eps = 1e-9) => arr.forEach((x, i) => near(v.toArray()[i], x, eps));

/* ------------------------------------------------------------------ */

describe("probeWebGL", () => {
  async function freshProbe() {
    vi.resetModules();
    return (await import("../../js/views/twin/Stage3D.js")).probeWebGL;
  }

  test("con placa de video: ok, no es por software y guarda el nombre", async () => {
    const probeWebGL = await freshProbe();
    const r = probeWebGL();
    expect(r).toEqual({ ok: true, software: false, renderer: "ANGLE (NVIDIA GeForce)" });
    expect(canvas.spy).toHaveBeenCalledWith("webgl2");
  });

  test("se prueba una sola vez por página", async () => {
    const probeWebGL = await freshProbe();
    const a = probeWebGL();
    const calls = canvas.spy.mock.calls.length;
    expect(probeWebGL()).toBe(a);
    expect(canvas.spy.mock.calls.length).toBe(calls);
  });

  test.each(["Google SwiftShader", "llvmpipe (LLVM 15)", "softpipe", "Software Rasterizer", "Microsoft Basic Render Driver"])(
    "detecta renderizado por software: %s",
    async (name) => {
      canvas.spy.mockRestore();
      stubCanvas({ webgl: fakeGL(name) });
      const probeWebGL = await freshProbe();
      expect(probeWebGL()).toEqual({ ok: true, software: true, renderer: name });
    },
  );

  test("sin la extensión de depuración usa gl.RENDERER", async () => {
    canvas.spy.mockRestore();
    const gl = fakeGL("WebKit WebGL", { debugExt: false });
    stubCanvas({ webgl: gl });
    const probeWebGL = await freshProbe();
    expect(probeWebGL()).toEqual({ ok: true, software: false, renderer: "WebKit WebGL" });
    expect(gl.getParameter).toHaveBeenCalledWith(gl.RENDERER);
  });

  test("si no hay WebGL 2 prueba WebGL 1", async () => {
    canvas.spy.mockRestore();
    const gl = fakeGL("ANGLE");
    const { spy } = stubCanvas({ webgl: (kind) => (kind === "webgl" ? gl : null) });
    const probeWebGL = await freshProbe();
    expect(probeWebGL().ok).toBe(true);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["webgl2", "webgl"]);
  });

  test("sin WebGL: no ok", async () => {
    canvas.spy.mockRestore();
    stubCanvas({ webgl: null });
    const probeWebGL = await freshProbe();
    expect(probeWebGL()).toEqual({ ok: false, software: false });
  });

  test("si crear el contexto tira una excepción: no ok", async () => {
    canvas.spy.mockRestore();
    stubCanvas({
      webgl: () => {
        throw new Error("bloqueado");
      },
    });
    const probeWebGL = await freshProbe();
    expect(probeWebGL()).toEqual({ ok: false, software: false });
  });
});

/* ------------------------------------------------------------------ */

describe("construcción", () => {
  test("pone el canvas del renderer al principio del contenedor, oculto a lectores de pantalla", () => {
    const previo = document.createElement("p");
    host.append(previo);
    const s = make();
    const r = s.renderer;
    expect(host.firstChild).toBe(r.domElement);
    expect(r.domElement.className).toBe("r3d-canvas");
    expect(r.domElement.getAttribute("aria-hidden")).toBe("true");
    expect(r.params).toEqual({ antialias: true, alpha: false, powerPreference: "high-performance" });
    expect(r.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    expect(r.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(r.toneMappingExposure).toBe(1.05);
    expect(r.setClearColor).toHaveBeenCalledWith(0x000000, 1);
  });

  test("por defecto: calidad adaptativa desde 'alta', con sombras de 2048", () => {
    const s = make();
    expect(s.adaptive).toBe(true);
    expect(s.tier).toBe(0);
    expect(s.minTier).toBe(0);
    expect(s.quality).toBe("alta");
    expect(s.renderer.shadowMap.enabled).toBe(true);
    expect(s.key.castShadow).toBe(true);
    expect(s.key.shadow.mapSize.x).toBe(2048);
  });

  test("por software arranca en 'baja', sin antialias y sin poder subir a 'alta'", () => {
    const s = make({ software: true });
    expect(s.quality).toBe("baja");
    expect(s.minTier).toBe(1);
    expect(s.renderer.params.antialias).toBe(false);
    expect(s.renderer.shadowMap.enabled).toBe(false);
    expect(s.key.castShadow).toBe(false);
  });

  test("calidad fija: no se adapta, y 'media' todavía usa antialias", () => {
    const s = make({ quality: "media", software: true });
    expect(s.adaptive).toBe(false);
    expect(s.quality).toBe("media");
    expect(s.minTier).toBe(0);
    expect(s.renderer.params.antialias).toBe(true);
    expect(s.key.shadow.mapSize.x).toBe(1024);
  });

  test("calidad fija 'mínima' sin antialias", () => {
    const s = make({ quality: "mínima" });
    expect(s.tier).toBe(3);
    expect(s.renderer.params.antialias).toBe(false);
  });

  test("una calidad desconocida es adaptativa", () => {
    expect(make({ quality: "ultra" }).adaptive).toBe(true);
  });

  test("entorno procedural para los reflejos (RoomEnvironment) y el generador se libera", () => {
    const s = make();
    const pmrem = FakePMREM.instances[0];
    expect(pmrem.renderer).toBe(s.renderer);
    expect(pmrem.fromScene).toHaveBeenCalledWith(expect.any(RoomEnvironment), 0.04);
    expect(pmrem.dispose).toHaveBeenCalled();
    expect(s.scene.environment).toBe(pmrem.texture);
    expect(s.envTexture).toBe(pmrem.texture);
    expect(s.scene.environmentIntensity).toBe(0.45);
  });

  test("luces de estudio: hemisférica, principal con sombras y contraluz", () => {
    const s = make();
    const dirs = s.scene.children.filter((o) => o.isDirectionalLight);
    expect(dirs).toHaveLength(2);
    expect(s.key.intensity).toBe(2.4);
    expect(s.key.position.toArray()).toEqual([2.2, 4.2, 1.6]);
    expect(s.key.shadow.bias).toBe(-0.0004);
    expect(s.key.shadow.normalBias).toBe(0.02);
    expect(s.hemi.intensity).toBe(1.15);
    expect(s.camera.fov).toBe(40);
    expect(s.camera.near).toBe(0.02);
  });

  test("piso de 60 m con grilla: textura repetida 1 por metro y anisotropía hasta 8", () => {
    const s = make();
    expect(s.floor.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(s.floor.material.map).toBe(s.gridTexture);
    expect(s.gridTexture.repeat.toArray()).toEqual([60, 60]);
    expect(s.gridTexture.wrapS).toBe(THREE.RepeatWrapping);
    expect(s.gridTexture.anisotropy).toBe(8);
    expect(s.gridCanvas.width).toBe(512);
    expect(s.floor.rotation.x).toBe(-Math.PI / 2);
    expect(s.floor.receiveShadow).toBe(true);
    expect(s.floor.geometry.parameters.width).toBe(60);
  });

  test("fondo transparente: solo la sombra del robot, sin grilla, y clear con alfa 0", () => {
    const s = make({ transparent: true });
    expect(s.floor.material).toBeInstanceOf(THREE.ShadowMaterial);
    expect(s.floor.material.opacity).toBe(0.22);
    expect(s.gridTexture).toBeUndefined();
    expect(s.renderer.params.alpha).toBe(true);
    expect(s.renderer.setClearColor).toHaveBeenCalledWith(0x000000, 0);
  });

  test("interactiva: OrbitControls con amortiguación, sin bajar del piso", () => {
    const s = make();
    expect(s.controls).toBeInstanceOf(OrbitControls);
    expect(s.controls.domElement).toBe(s.renderer.domElement);
    expect(s.controls.enableDamping).toBe(true);
    expect(s.controls.dampingFactor).toBe(0.08);
    expect(s.controls.maxPolarAngle).toBeCloseTo((88 * Math.PI) / 180);
    expect(s.controls.screenSpacePanning).toBe(true);
    // A pantalla completa los toques son de la cámara (lo que pone OrbitControls).
    expect(s.controls.touches.ONE).toBe(THREE.TOUCH.ROTATE);
    expect(s.renderer.domElement.style.touchAction).toBe("none");
  });

  test("con menos movimiento la cámara no tiene inercia", () => {
    expect(make({ reducedMotion: true }).controls.enableDamping).toBe(false);
  });

  test("embebida (spec 006): un dedo desplaza la página y dos dedos giran y acercan", () => {
    const s = make({ transparent: true });
    expect(s.controls.touches).toEqual({ ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE });
    expect(s.renderer.domElement.style.touchAction).toBe("pan-y");
  });

  test("el usuario toma la cámara: 'start' corta la transición y 'change' pide cuadro", () => {
    const s = make();
    s.frameRobot(CAM_GO2);
    s.goTo(s.presetPose("arriba", 0));
    expect(s._tween).not.toBeNull();
    s.controls.dispatchEvent({ type: "start" });
    expect(s._tween).toBeNull();
    s._dirty = false;
    s.controls.dispatchEvent({ type: "change" });
    expect(s._dirty).toBe(true);
  });

  test("sin interacción: un objetivo con la forma de OrbitControls que mira con lookAt", () => {
    const s = make({ interactive: false });
    expect(s.controls).not.toBeInstanceOf(OrbitControls);
    s.controls.target.set(0, 1, 0);
    s.camera.position.set(0, 1, 5);
    s.controls.update();
    const dir = s.camera.getWorldDirection(new THREE.Vector3());
    nearVec(dir, [0, 0, -1], 1e-6);
    expect(() => s.controls.dispose()).not.toThrow();
  });

  test("observa el tamaño del contenedor", () => {
    const s = make();
    const ro = FakeResizeObserver.instances[0];
    expect(ro.observe).toHaveBeenCalledWith(host);
    setSize(host, 400, 300);
    s.renderer.setSize.mockClear();
    ro.trigger();
    expect(s.renderer.setSize).toHaveBeenCalledWith(400, 300, false);
  });
});

/* ------------------------------------------------------------------ */

describe("tema, encuadre y piso", () => {
  test("pinta la grilla: fondo, tres líneas finas por metro y el borde marcado", () => {
    const s = make();
    s.applyTheme(THEME);
    const g = canvas.contexts2d.at(-1);
    expect(g.fillRect).toHaveBeenCalledWith(0, 0, 512, 512);
    expect(g.stroke).toHaveBeenCalledTimes(3);
    expect(g.moveTo.mock.calls).toEqual([
      [128, 0], [0, 128],
      [256, 0], [0, 256],
      [384, 0], [0, 384],
    ]);
    expect(g.lineTo.mock.calls).toEqual([
      [128, 512], [512, 128],
      [256, 512], [512, 256],
      [384, 512], [512, 384],
    ]);
    expect(g.strokeRect).toHaveBeenCalledWith(0, 0, 512, 512);
    expect(g.fillStyle).toBe(THEME.floor);
    expect(g.strokeStyle).toBe(THEME.major);
    expect(g.lineWidth).toBe(5);
    expect(s.gridTexture.version).toBeGreaterThan(0);
  });

  test("las líneas finas van con el color minor a 2 px y el borde con major a 5 px", () => {
    const s = make();
    s.applyTheme(THEME);
    expect(canvas.contexts2d.at(-1).strokes).toEqual([
      [THEME.minor, 2],
      [THEME.minor, 2],
      [THEME.minor, 2],
      [THEME.major, 5],
    ]);
  });

  test("fondo y niebla del color del tema; niebla por defecto de 3 a 10 m", () => {
    const s = make();
    s.applyTheme(THEME);
    expect(s.scene.background.getHexString()).toBe("0b0e14");
    expect(s.scene.fog).toBeInstanceOf(THREE.Fog);
    expect(s.scene.fog.color.getHexString()).toBe("0b0e14");
    expect([s.scene.fog.near, s.scene.fog.far]).toEqual([3, 10]);
    expect(s.hemi.color.getHexString()).toBe("dfe9ff");
    expect(s.hemi.groundColor.getHexString()).toBe("1a1e26");
  });

  test("tema claro: más luz ambiente y exposición 1", () => {
    const s = make();
    s.applyTheme({ ...THEME, light: true });
    expect(s.hemi.intensity).toBe(1.5);
    expect(s.renderer.toneMappingExposure).toBe(1);
    s.applyTheme(THEME);
    expect(s.hemi.intensity).toBe(1.15);
    expect(s.renderer.toneMappingExposure).toBe(1.05);
  });

  test("embebida: el tema no pone fondo, niebla ni grilla", () => {
    const s = make({ transparent: true });
    const antes = canvas.contexts2d.length;
    s._dirty = false;
    s.applyTheme(THEME);
    expect(s.scene.background).toBeNull();
    expect(s.scene.fog).toBeNull();
    expect(canvas.contexts2d.length).toBe(antes);
    expect(s.hemi.color.getHexString()).toBe("dfe9ff");
    expect(s._dirty).toBe(true);
  });

  test("frameRobot ajusta niebla, cámara de sombras y límites de zoom al tamaño del robot", () => {
    const s = make();
    s.applyTheme(THEME);
    s.frameRobot(CAM_GO2);
    expect(s.cam).toBe(CAM_GO2);
    near(s.scene.fog.near, 1.3 * 2.2);
    near(s.scene.fog.far, 1.3 * 7);
    const sc = s.key.shadow.camera;
    near(sc.left, -0.975);
    near(sc.bottom, -0.975);
    near(sc.right, 0.975);
    near(sc.top, 0.975);
    expect([sc.near, sc.far]).toEqual([0.1, 12]);
    expect(s.controls.minDistance).toBe(0.45);
    expect(s.controls.maxDistance).toBe(4);
    // un tema aplicado después respeta la niebla del robot
    s.applyTheme(THEME);
    near(s.scene.fog.near, 2.86);
    near(s.scene.fog.far, 9.1);
  });

  test("frameRobot sin niebla ni controles orbitables no falla", () => {
    const s = make({ interactive: false, transparent: true });
    s.frameRobot(CAM_GO2);
    expect(s.scene.fog).toBeNull();
    expect("minDistance" in s.controls).toBe(false);
  });

  test("scrollFloor desplaza la textura: u con +x, v con −z, y da la vuelta en 1 m", () => {
    const s = make();
    s.scrollFloor(0.3, 0.2);
    near(s.gridTexture.offset.x, 0.3);
    near(s.gridTexture.offset.y, -0.2);
    s.scrollFloor(0.9, -1.5);
    near(s.gridTexture.offset.x, 0.2, 1e-9);
    near(s.gridTexture.offset.y, 0.3, 1e-9);
  });

  test("scrollFloor sin grilla (embebida) no hace nada", () => {
    const s = make({ transparent: true });
    expect(() => s.scrollFloor(1, 1)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */

describe("calidad", () => {
  test("QUALITY: de mejor a peor", () => {
    expect(QUALITY.map((q) => q.name)).toEqual(["alta", "media", "baja", "mínima"]);
    expect(QUALITY.map((q) => q.fps)).toEqual([60, 30, 24, 15]);
    expect(QUALITY.map((q) => q.shadow)).toEqual([2048, 1024, 0, 0]);
    expect(QUALITY.map((q) => q.ratio)).toEqual([2, 1, 0.75, 0.5]);
  });

  test("la resolución es la del dispositivo con el tope del escalón", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    expect(make().renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    vi.stubGlobal("devicePixelRatio", 1.5);
    expect(make({ quality: "baja" }).renderer.setPixelRatio).toHaveBeenLastCalledWith(0.75);
  });

  test("sin devicePixelRatio se asume 1", () => {
    vi.stubGlobal("devicePixelRatio", 0);
    expect(make().renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
  });

  test("al prender o apagar sombras se recompilan todos los materiales (también los múltiples)", () => {
    const s = make({ quality: "media" });
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    const c = new THREE.MeshStandardMaterial();
    s.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [a, b]), new THREE.Mesh(new THREE.BoxGeometry(), c));
    const v = [a.version, b.version, c.version];
    s.tier = 2;
    s._applyQuality();
    expect(s.renderer.shadowMap.enabled).toBe(false);
    expect([a.version, b.version, c.version]).toEqual(v.map((x) => x + 1));
    // Mismo estado de sombras: no se recompila.
    s.tier = 3;
    s._applyQuality();
    expect([a.version, b.version, c.version]).toEqual(v.map((x) => x + 1));
    expect(s.key.castShadow).toBe(false);
  });

  test("al cambiar el tamaño del mapa de sombras se descarta el mapa viejo", () => {
    const s = make();
    const map = { dispose: vi.fn() };
    s.key.shadow.map = map;
    s.tier = 1;
    s._applyQuality();
    expect(s.key.shadow.mapSize.toArray()).toEqual([1024, 1024]);
    expect(map.dispose).toHaveBeenCalled();
    expect(s.key.shadow.map).toBeNull();
    // mismo tamaño: no se toca
    const otro = { dispose: vi.fn() };
    s.key.shadow.map = otro;
    s._applyQuality();
    expect(otro.dispose).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */

describe("bucle de dibujo y calidad adaptativa", () => {
  /** Hace que cada cuadro "cueste" `ms` en el hilo principal. */
  const cost = (s, ms) => s.renderer.render.mockImplementation(() => clock.advance(ms));

  test("start pide un cuadro una sola vez; stop lo cancela", () => {
    const s = make();
    s.start();
    s.start();
    expect(clock.raf).toHaveBeenCalledTimes(1);
    s.stop();
    expect(clock.caf).toHaveBeenCalledWith(1);
    expect(s._raf).toBe(0);
    expect(clock.pending).toBe(0);
  });

  test("con la pestaña oculta no arranca; al volver a verse arranca y al ocultarse para", () => {
    const s = make();
    setHidden(true);
    s.start();
    expect(clock.raf).not.toHaveBeenCalled();
    setHidden(false);
    expect(clock.raf).toHaveBeenCalledTimes(1);
    setHidden(true);
    expect(s._raf).toBe(0);
    expect(clock.pending).toBe(0);
  });

  test("dibuja el primer cuadro y no vuelve a dibujar si nada cambió", () => {
    const s = make({ interactive: false });
    s.start();
    clock.frame(17);
    expect(s.renderer.render).toHaveBeenCalledWith(s.scene, s.camera);
    clock.frames(5, 17);
    expect(s.renderer.render).toHaveBeenCalledTimes(1);
    s.invalidate();
    clock.frame(17);
    expect(s.renderer.render).toHaveBeenCalledTimes(2);
  });

  test("respeta el tope de cuadros por segundo del escalón", () => {
    const s = make({ interactive: false, quality: "mínima" });
    const onTick = vi.fn(() => true);
    s.onTick = onTick;
    s.start();
    clock.frame(16);
    expect(onTick).toHaveBeenCalledTimes(1);
    clock.frame(16);
    clock.frame(16);
    clock.frame(16); // 48 ms < 1000/15 − 2
    expect(onTick).toHaveBeenCalledTimes(1);
    clock.frame(16); // 64 ms ≥ 64,67? todavía no
    expect(onTick).toHaveBeenCalledTimes(1);
    clock.frame(1); // 65 ms
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  test("onTick recibe dt en segundos con tope de 0,1 s, y si devuelve true se redibuja", () => {
    const s = make({ interactive: false });
    const dts = [];
    s.onTick = (dt) => (dts.push(dt), true);
    s.start();
    clock.frame(20);
    clock.frame(5000); // volver de otra pestaña
    clock.frame(30);
    expect(dts[0]).toBeCloseTo(0.02);
    expect(dts[1]).toBe(0.1);
    expect(dts[2]).toBeCloseTo(0.03);
    expect(s.renderer.render).toHaveBeenCalledTimes(3);
  });

  test("si onTick devuelve false y no hay otros cambios no se dibuja", () => {
    const s = make({ interactive: false });
    s.onTick = () => false;
    s.start();
    clock.frame(17);
    clock.frame(17);
    expect(s.renderer.render).toHaveBeenCalledTimes(1);
  });

  test("baja de escalón si cada cuadro se pasa del presupuesto durante ~1 s", () => {
    const s = make({ interactive: false });
    s.onTick = () => true;
    cost(s, 12); // > 16,7 ms · 0,35 · 1,6
    s.start();
    clock.frames(40, 17);
    expect(s.quality).toBe("alta");
    clock.frames(40, 17);
    expect(s.quality).toBe("media");
    expect(s.renderer.shadowMap.enabled).toBe(true);
    expect(s.key.shadow.mapSize.x).toBe(1024);
    expect(s._stats.slow).toBeLessThan(30);
  });

  test("también baja si los cuadros llegan muy espaciados (intervalo > 1,8 × objetivo)", () => {
    const s = make({ interactive: false });
    s.onTick = () => true;
    s.start();
    clock.frames(90, 40);
    expect(s.tier).toBeGreaterThanOrEqual(1);
  });

  test("baja hasta 'mínima' y ahí se queda", () => {
    const s = make({ interactive: false });
    s.onTick = () => true;
    cost(s, 60);
    s.start();
    clock.frames(600, 70);
    expect(s.quality).toBe("mínima");
    expect(s.renderer.shadowMap.enabled).toBe(false);
  });

  test("sube de escalón si sobra margen durante ~4 s, pero no por encima del mínimo por software", () => {
    const s = make({ interactive: false, software: true });
    s.onTick = () => true;
    s.start();
    clock.frames(90, 42);
    expect(s.quality).toBe("baja");
    clock.frames(20, 42);
    expect(s.quality).toBe("media");
    clock.frames(400, 34);
    expect(s.quality).toBe("media");
    expect(s.minTier).toBe(1);
  });

  test("sin software sube hasta 'alta'", () => {
    const s = make({ interactive: false });
    s.tier = 1;
    s._applyQuality();
    s.onTick = () => true;
    s.start();
    clock.frames(110, 34);
    expect(s.quality).toBe("media");
    clock.frames(20, 34); // > 30 fps · 4 cuadros holgados
    expect(s.quality).toBe("alta");
    expect(s.key.shadow.mapSize.x).toBe(2048);
  });

  test("con calidad fija mide pero nunca cambia de escalón", () => {
    const s = make({ interactive: false, quality: "alta" });
    s.onTick = () => true;
    cost(s, 30);
    s.start();
    clock.frames(200, 40);
    expect(s.quality).toBe("alta");
    expect(s._stats.js).toBeGreaterThan(25);
    expect(s._stats.interval).toBeGreaterThan(60);
  });

  test("la medición es un promedio móvil (10 %) del costo y del intervalo", () => {
    const s = make({ interactive: false, quality: "alta" });
    s.onTick = () => true;
    cost(s, 14);
    s.start();
    clock.frame(20); // primer cuadro: intervalo 0
    expect(s._stats.js).toBeCloseTo(4 + (14 - 4) * 0.1);
    expect(s._stats.interval).toBeCloseTo(16 + (0 - 16) * 0.1);
    clock.frame(20); // ahora el intervalo es 20 + 14 del costo anterior
    expect(s._stats.interval).toBeCloseTo(14.4 + (34 - 14.4) * 0.1);
  });
});

/* ------------------------------------------------------------------ */

describe("cámara", () => {
  test("presetPose con rumbo 0: perspectiva 3/4, arriba, lateral y frente", () => {
    const s = make();
    s.frameRobot(CAM_GO2);
    const d = 1.3;
    const t = 0.17;
    const p = (n) => s.presetPose(n, 0);
    nearVec(p("perspectiva").position, [d * 0.72, t + d * 0.42, -d * 0.62]);
    nearVec(p("arriba").position, [-0.002 * d, t + d * 1.35, 0]);
    nearVec(p("lateral").position, [0, t + d * 0.06, -d * 1.12]);
    nearVec(p("frente").position, [d * 1.12, t + d * 0.08, 0]);
    nearVec(p("perspectiva").target, [0, t, 0]);
    nearVec(p("otra").position, p("perspectiva").position.toArray());
  });

  test("presetPose gira con el rumbo del robot", () => {
    const s = make();
    s.frameRobot(CAM_GO2);
    nearVec(s.presetPose("frente", Math.PI / 2).position, [0, 0.17 + 1.3 * 0.08, -1.3 * 1.12], 1e-9);
    nearVec(s.presetPose("lateral", Math.PI / 2).position, [-1.3 * 1.12, 0.17 + 1.3 * 0.06, 0], 1e-9);
  });

  test("goTo instantáneo mueve cámara y objetivo en el acto", () => {
    const s = make({ interactive: false });
    const update = vi.spyOn(s.controls, "update");
    const pos = new THREE.Vector3(1, 2, 3);
    const tgt = new THREE.Vector3(0, 0.5, 0);
    s._dirty = false;
    s.goTo({ position: pos, target: tgt }, true);
    expect(s.camera.position.toArray()).toEqual([1, 2, 3]);
    expect(s.controls.target.toArray()).toEqual([0, 0.5, 0]);
    expect(s._tween).toBeNull();
    expect(update).toHaveBeenCalled();
    expect(s._dirty).toBe(true);
  });

  test("con menos movimiento goTo siempre es instantáneo", () => {
    const s = make({ interactive: false, reducedMotion: true });
    s.goTo({ position: new THREE.Vector3(4, 4, 4), target: new THREE.Vector3() });
    expect(s.camera.position.toArray()).toEqual([4, 4, 4]);
    expect(s._tween).toBeNull();
  });

  test("goTo animado: transición de 0,65 s con aceleración suave (ease in-out)", () => {
    const s = make({ interactive: false, quality: "mínima" });
    s.camera.position.set(0, 0, 0);
    s.controls.target.set(0, 0, 0);
    s.goTo({ position: new THREE.Vector3(10, 0, 0), target: new THREE.Vector3(0, 2, 0) });
    expect(s.camera.position.x).toBe(0);
    s.start();
    clock.frame(65); // dt 0,065 → t = 0,1
    near(s.camera.position.x, 10 * 4 * 0.1 ** 3, 1e-9);
    clock.frames(4, 65); // t = 0,5 → mitad del camino
    near(s.camera.position.x, 5, 1e-9);
    near(s.controls.target.y, 1, 1e-9);
    clock.frame(65); // t = 0,6
    near(s.camera.position.x, 10 * (1 - (-2 * 0.6 + 2) ** 3 / 2), 1e-9);
    clock.frames(4, 65);
    expect(s._tween).not.toBeNull();
    clock.frame(65);
    expect(s._tween).toBeNull();
    near(s.camera.position.x, 10, 1e-9);
    near(s.controls.target.y, 2, 1e-9);
  });

  test("orbitBy gira la cámara alrededor del objetivo (y el destino de la transición)", () => {
    const s = make({ interactive: false });
    s.controls.target.set(1, 0, 0);
    s.camera.position.set(2, 1, 0);
    s.goTo({ position: new THREE.Vector3(3, 0, 0), target: new THREE.Vector3(1, 0, 0) });
    s.orbitBy(Math.PI / 2);
    nearVec(s.camera.position, [1, 1, -1], 1e-9);
    nearVec(s._tween.toP, [1, 0, -2], 1e-9);
  });

  test("orbitBy sin transición en curso y orbitBy(0)", () => {
    const s = make({ interactive: false });
    s.camera.position.set(0, 0, 2);
    s.orbitBy(0);
    expect(s.camera.position.toArray()).toEqual([0, 0, 2]);
    s.orbitBy(Math.PI);
    nearVec(s.camera.position, [0, 0, -2], 1e-9);
  });
});

/* ------------------------------------------------------------------ */

describe("tamaño", () => {
  test("ajusta renderer y relación de aspecto al contenedor", () => {
    const s = make();
    expect(s.renderer.setSize).toHaveBeenLastCalledWith(800, 600, false);
    near(s.camera.aspect, 800 / 600);
    expect(s.camera.fov).toBe(40);
  });

  test("en una pantalla angosta (celular vertical) abre el campo visual", () => {
    setSize(host, 390, 700);
    const s = make();
    expect(s.camera.fov).toBe(52);
    setSize(host, 400, 500); // 0,8 justo: ya no es angosta
    s.resize();
    expect(s.camera.fov).toBe(40);
  });

  test("un contenedor sin tamaño cuenta como 1 × 1", () => {
    setSize(host, 0, 0);
    const s = make();
    expect(s.renderer.setSize).toHaveBeenLastCalledWith(1, 1, false);
  });

  test("corre el centro óptico según getFocusOffset y lo limpia si vuelve a cero", () => {
    const s = make();
    let off = { x: 10, y: -40 };
    s.getFocusOffset = () => off;
    s.resize();
    expect(s.camera.view).toMatchObject({ enabled: true, fullWidth: 800, fullHeight: 600, offsetX: -10, offsetY: 40, width: 800, height: 600 });
    off = { x: 0, y: 0 };
    s.resize();
    expect(s.camera.view.enabled).toBe(false);
    off = { x: 0, y: 5 };
    s.resize();
    expect(s.camera.view.offsetY).toBe(-5);
    s.getFocusOffset = () => undefined;
    s.resize();
    expect(s.camera.view.enabled).toBe(false);
  });

  test("resize pide un cuadro nuevo", () => {
    const s = make();
    s._dirty = false;
    s.resize();
    expect(s._dirty).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("dispose y pool de renderers", () => {
  test("libera todo: rAF, visibilidad, tamaño, controles, GPU y el canvas", () => {
    const s = make();
    s.applyTheme(THEME);
    s.start();
    const r = s.renderer;
    const ro = FakeResizeObserver.instances[0];
    const controls = vi.spyOn(s.controls, "dispose");
    const floorGeo = vi.spyOn(s.floor.geometry, "dispose");
    const floorMat = vi.spyOn(s.floor.material, "dispose");
    const grid = vi.spyOn(s.gridTexture, "dispose");
    const a = new THREE.MeshBasicMaterial();
    const b = new THREE.MeshBasicMaterial();
    const da = vi.spyOn(a, "dispose");
    const db = vi.spyOn(b, "dispose");
    s.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [a, b]));
    const shadowMap = { dispose: vi.fn() };
    s.key.shadow.map = shadowMap;
    const env = s.envTexture;
    s.onTick = () => true;

    s.dispose();

    expect(clock.pending).toBe(0);
    expect(ro.disconnect).toHaveBeenCalled();
    expect(controls).toHaveBeenCalled();
    expect(floorGeo).toHaveBeenCalled();
    expect(floorMat).toHaveBeenCalled();
    expect(grid).toHaveBeenCalled(); // map del piso y gridTexture
    expect(da).toHaveBeenCalled();
    expect(db).toHaveBeenCalled();
    expect(shadowMap.dispose).toHaveBeenCalled();
    expect(env.dispose).toHaveBeenCalled();
    expect(s.scene.environment).toBeNull();
    expect(r.domElement.isConnected).toBe(false);
    expect(r.renderLists.dispose).toHaveBeenCalled();
    expect(r.setRenderTarget).toHaveBeenCalledWith(null);
    expect(r.dispose).not.toHaveBeenCalled(); // queda en el pool
    expect(s.renderer).toBeNull();
    expect(s.onTick).toBeNull();
    // ya no reacciona a la visibilidad ni al tamaño
    setHidden(false);
    s.start();
    s.resize();
    expect(clock.raf).toHaveBeenCalledTimes(1);
  });

  test("dispose dos veces no hace nada la segunda", () => {
    const s = make({ transparent: true });
    s.dispose();
    expect(() => s.dispose()).not.toThrow();
  });

  test("la siguiente escena con las mismas opciones reutiliza el contexto", () => {
    const a = make();
    const r = a.renderer;
    a.dispose();
    const b = make();
    expect(b.renderer).toBe(r);
    expect(FakeRenderer.instances).toHaveLength(1);
    expect(host.firstChild).toBe(r.domElement);
  });

  test("no reutiliza un contexto de otra clase (antialias o alfa distintos)", () => {
    const a = make();
    const ra = a.renderer;
    a.dispose();
    const b = make({ transparent: true });
    expect(b.renderer).not.toBe(ra);
    const c = make();
    expect(c.renderer).toBe(ra);
  });

  test("no reutiliza un contexto perdido mientras estaba guardado", () => {
    const a = make();
    const ra = a.renderer;
    a.dispose();
    ra.contextLost = true;
    const b = make();
    expect(b.renderer).not.toBe(ra);
    expect(FakeRenderer.instances).toHaveLength(2);
  });

  test("como máximo dos contextos ociosos: el tercero se destruye", () => {
    const [a, b, c] = [make(), make(), make()];
    const rs = [a.renderer, b.renderer, c.renderer];
    a.dispose();
    b.dispose();
    c.dispose();
    expect(rs[0].dispose).not.toHaveBeenCalled();
    expect(rs[1].dispose).not.toHaveBeenCalled();
    expect(rs[2].dispose).toHaveBeenCalled();
    expect(rs[2].forceContextLoss).toHaveBeenCalled();
  });

  test("un contexto perdido al liberar se destruye en vez de guardarse", () => {
    const a = make();
    const r = a.renderer;
    r.contextLost = true;
    a.dispose();
    expect(r.dispose).toHaveBeenCalled();
    expect(r.forceContextLoss).toHaveBeenCalled();
  });

  test("releaseIdleRenderers destruye los contextos guardados", () => {
    const a = make();
    const r = a.renderer;
    a.dispose();
    releaseIdleRenderers();
    expect(r.dispose).toHaveBeenCalled();
    expect(r.forceContextLoss).toHaveBeenCalled();
    expect(make().renderer).not.toBe(r);
  });
});
