/**
 * Escenario 3D genérico: renderer, cámara, luces, piso con grilla y un bucle
 * de dibujo propio que SE ADAPTA A LA MÁQUINA.
 *
 * No sabe nada de robots ni de telemetría: RobotScene le cuelga el modelo y
 * le pasa un `onTick(dt)` que se llama antes de cada cuadro dibujado.
 *
 * Calidad adaptativa: el dashboard tiene que seguir recibiendo 10 muestras
 * por segundo aunque la PC no tenga placa de video (Chromium con SwiftShader,
 * notebooks viejas del laboratorio). El bucle mide cuánto tarda cada cuadro
 * en el hilo principal y, si se pasa del presupuesto, baja la resolución,
 * apaga las sombras y limita los cuadros por segundo. Si sobra margen, sube.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * ¿Hay WebGL? ¿Es por software? Se prueba con un contexto descartable que se
 * libera en el acto (los navegadores limitan cuántos contextos vivos hay).
 */
export function probeWebGL() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return { ok: false, software: false };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name), renderer: name };
  } catch {
    return { ok: false, software: false };
  }
}

/**
 * Escalones de calidad, de mejor a peor. `fps` es el tope de cuadros por
 * segundo; `ratio`, el devicePixelRatio máximo; `shadow`, el lado del mapa
 * de sombras (0 = sin sombras).
 */
export const QUALITY = [
  { name: "alta", ratio: 2, shadow: 2048, fps: 60 },
  { name: "media", ratio: 1, shadow: 1024, fps: 30 },
  { name: "baja", ratio: 0.75, shadow: 0, fps: 24 },
  { name: "mínima", ratio: 0.5, shadow: 0, fps: 15 },
];

/** Fracción máxima del hilo principal que puede usar el 3D (el resto es para datos y UI). */
const MAIN_THREAD_BUDGET = 0.35;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Stage3D {
  /**
   * @param {HTMLElement} host contenedor del <canvas>
   * @param {object} opts
   * @param {boolean} [opts.interactive=true]  cámara orbitable con mouse/toque
   * @param {boolean} [opts.transparent=false] fondo transparente (para embeber sobre una tarjeta)
   * @param {boolean} [opts.reducedMotion=false]
   * @param {"auto"|"alta"|"media"|"baja"|"mínima"} [opts.quality="auto"]
   * @param {boolean} [opts.software=false] el probe detectó renderizado por software
   */
  constructor(host, { interactive = true, transparent = false, reducedMotion = false, quality = "auto", software = false } = {}) {
    this.host = host;
    this.transparent = transparent;
    this.reducedMotion = reducedMotion;
    this.onTick = null;
    this.getFocusOffset = null;
    this._raf = 0;
    this._tween = null;
    this._dirty = true;

    const fixed = QUALITY.findIndex((q) => q.name === quality);
    this.adaptive = fixed < 0;
    // Por software se arranca abajo y sin antialias (no se puede cambiar después de crear el contexto).
    this.tier = fixed >= 0 ? fixed : software ? 2 : 0;
    this.minTier = software && this.adaptive ? 1 : 0;

    const renderer = new THREE.WebGLRenderer({ antialias: this.tier <= 1, alpha: transparent, powerPreference: "high-performance" });
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    if (transparent) renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "r3d-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.prepend(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 80);
    this.camera.position.set(1.4, 0.8, 1.2);

    // Iluminación "de estudio": cielo/suelo + luz principal con sombras suaves + contraluz frío.
    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x1a1e26, 1.15);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.2, 4.2, 1.6);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(0x8fd3ff, 0.9);
    rim.position.set(-2.5, 2.2, -2.8);
    scene.add(this.hemi, key, key.target, rim);
    this.key = key;

    // Reflejos suaves con un entorno procedural (no hay archivos HDR que bajar).
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.45;

    this._buildFloor();

    if (interactive) {
      const controls = new OrbitControls(this.camera, renderer.domElement);
      controls.enableDamping = !reducedMotion;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = THREE.MathUtils.degToRad(88); // no meterse debajo del piso
      controls.screenSpacePanning = true;
      controls.addEventListener("start", () => (this._tween = null)); // el usuario manda
      controls.addEventListener("change", () => (this._dirty = true));
      this.controls = controls;
    } else {
      // Sin controles: un "objetivo" mínimo con la misma forma que OrbitControls.target.
      this.controls = { target: new THREE.Vector3(), update: () => this.camera.lookAt(this.controls.target), dispose() {} };
    }

    this._applyQuality();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(host);
    this.resize();

    this._loop = this._loop.bind(this);
    this._onVisibility = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener("visibilitychange", this._onVisibility);
    this._stats = { js: 4, interval: 16, slow: 0, fast: 0, lastRender: 0 };
  }

  /* ------------------------------ piso ------------------------------ */

  _buildFloor() {
    const SIZE = 60; // metros; 1 repetición de la textura = 1 m
    if (this.transparent) {
      // Embebido: solo la sombra, sin grilla, para que se apoye sobre la tarjeta que lo contiene.
      this.floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.ShadowMaterial({ opacity: 0.22 }));
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      this.gridCanvas = canvas;
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      tex.repeat.set(SIZE, SIZE);
      this.gridTexture = tex;
      this.floor = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE, SIZE),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, envMapIntensity: 0.25 }),
      );
    }
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  /** Una celda de 1 m: líneas finas cada 25 cm y una marcada en el borde. */
  _paintGrid({ floor, minor, major }) {
    if (!this.gridCanvas) return;
    const g = this.gridCanvas.getContext("2d");
    const n = this.gridCanvas.width;
    g.fillStyle = floor;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = minor;
    g.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const p = (i * n) / 4;
      g.beginPath();
      g.moveTo(p, 0); g.lineTo(p, n);
      g.moveTo(0, p); g.lineTo(n, p);
      g.stroke();
    }
    g.strokeStyle = major;
    g.lineWidth = 5;
    g.strokeRect(0, 0, n, n);
    this.gridTexture.needsUpdate = true;
  }

  /** Colores de la escena (los decide el CSS: ver RobotScene.applyTheme). */
  applyTheme(colors) {
    if (!this.transparent) {
      const bg = new THREE.Color(colors.bg);
      this.scene.background = bg;
      this.scene.fog = new THREE.Fog(bg, this._fogNear ?? 3, this._fogFar ?? 10);
      this._paintGrid(colors);
    }
    this.hemi.color.set(colors.sky);
    this.hemi.groundColor.set(colors.ground);
    this.hemi.intensity = colors.light ? 1.5 : 1.15;
    this.renderer.toneMappingExposure = colors.light ? 1.0 : 1.05;
    this._dirty = true;
  }

  /** Ajusta niebla, sombras y límites de zoom al tamaño del robot. */
  frameRobot(cam) {
    this.cam = cam;
    const d = cam.distance;
    this._fogNear = d * 2.2;
    this._fogFar = d * 7;
    if (this.scene.fog) Object.assign(this.scene.fog, { near: this._fogNear, far: this._fogFar });
    const s = this.key.shadow.camera;
    s.left = s.bottom = -d * 0.75;
    s.right = s.top = d * 0.75;
    s.near = 0.1;
    s.far = 12;
    s.updateProjectionMatrix();
    if ("minDistance" in this.controls) {
      this.controls.minDistance = cam.minDistance;
      this.controls.maxDistance = cam.maxDistance;
    }
    this._dirty = true;
  }

  /** Desplaza la textura del piso (sensación de avance), en metros y ejes del mundo. */
  scrollFloor(dx, dz) {
    if (!this.gridTexture) return;
    // El plano está rotado −90° en X: u crece con +x y v con −z.
    const o = this.gridTexture.offset;
    o.x = (o.x + dx) % 1;
    o.y = (o.y - dz) % 1;
  }

  /* ----------------------------- calidad ---------------------------- */

  get quality() {
    return QUALITY[this.tier].name;
  }

  _applyQuality() {
    const q = QUALITY[this.tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    const shadows = q.shadow > 0;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      // Los materiales compilados con/sin sombras se tienen que recompilar.
      this.scene.traverse((o) => o.material && ([].concat(o.material).forEach((m) => (m.needsUpdate = true))));
    }
    this.key.castShadow = shadows;
    if (shadows && this.key.shadow.mapSize.x !== q.shadow) {
      this.key.shadow.mapSize.set(q.shadow, q.shadow);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.resize();
  }

  /**
   * Ajuste de calidad con histéresis: baja si el cuadro se pasa del
   * presupuesto durante ~1 s; sube si sobra mucho durante ~4 s.
   */
  _adapt(jsMs, intervalMs) {
    const st = this._stats;
    st.js += (jsMs - st.js) * 0.1;
    st.interval += (intervalMs - st.interval) * 0.1;
    if (!this.adaptive) return;
    const q = QUALITY[this.tier];
    const target = 1000 / q.fps;
    const tooSlow = st.js > target * MAIN_THREAD_BUDGET * 1.6 || st.interval > target * 1.8;
    const roomy = st.js < (1000 / (QUALITY[this.tier - 1]?.fps ?? 60)) * MAIN_THREAD_BUDGET * 0.5 && st.interval < target * 1.15;
    st.slow = tooSlow ? st.slow + 1 : 0;
    st.fast = roomy ? st.fast + 1 : 0;
    if (st.slow > q.fps && this.tier < QUALITY.length - 1) {
      this.tier++;
      st.slow = st.fast = 0;
      this._applyQuality();
    } else if (st.fast > q.fps * 4 && this.tier > this.minTier) {
      this.tier--;
      st.slow = st.fast = 0;
      this._applyQuality();
    }
  }

  /* ----------------------------- cámara ----------------------------- */

  /**
   * Pose de cámara de una vista predefinida, relativa al rumbo del robot.
   * @param {"perspectiva"|"arriba"|"lateral"|"frente"} name
   * @param {number} heading rumbo (yaw) en radianes
   */
  presetPose(name, heading) {
    const { target, distance: d } = this.cam;
    const fwd = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const left = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    const t = new THREE.Vector3(0, target, 0);
    const p = t.clone();
    switch (name) {
      case "arriba": // casi cenital: el frente del robot queda arriba en la pantalla
        p.addScaledVector(fwd, -0.002 * d).y += d * 1.35;
        break;
      case "lateral":
        p.addScaledVector(left, d * 1.12).y += d * 0.06;
        break;
      case "frente":
        p.addScaledVector(fwd, d * 1.12).y += d * 0.08;
        break;
      default: // perspectiva 3/4, como la ventana de MuJoCo
        p.addScaledVector(fwd, d * 0.72).addScaledVector(left, d * 0.62).y += d * 0.42;
    }
    return { position: p, target: t };
  }

  /** Mueve la cámara con una transición corta (o al instante si se pidió menos movimiento). */
  goTo({ position, target }, instant = false) {
    this._dirty = true;
    if (instant || this.reducedMotion) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this._tween = null;
      this.controls.update();
      return;
    }
    this._tween = { t: 0, fromP: this.camera.position.clone(), fromT: this.controls.target.clone(), toP: position, toT: target };
  }

  /** Gira la cámara alrededor del objetivo (modo "seguir al robot"). */
  orbitBy(deltaYaw) {
    if (!deltaYaw) return;
    const c = this.controls.target;
    const off = this.camera.position.clone().sub(c).applyAxisAngle(THREE.Object3D.DEFAULT_UP, deltaYaw);
    this.camera.position.copy(c).add(off);
    if (this._tween) this._tween.toP.sub(c).applyAxisAngle(THREE.Object3D.DEFAULT_UP, deltaYaw).add(c);
  }

  /** Pide un cuadro aunque nada se haya movido (cambió un color, una etiqueta…). */
  invalidate() {
    this._dirty = true;
  }

  /* ------------------------------ bucle ----------------------------- */

  start() {
    if (this._raf || this._disposed || document.hidden) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _loop(now) {
    const t0 = performance.now();
    this._raf = requestAnimationFrame(this._loop);
    const st = this._stats;
    // Tope de cuadros: si todavía no toca, se devuelve el hilo en el acto.
    if (now - st.lastRender < 1000 / QUALITY[this.tier].fps - 2) return;
    const interval = now - (st.lastRender || now);
    st.lastRender = now;
    const dt = Math.min(0.1, (now - this._last) / 1000); // tope: al volver de otra pestaña no "salta"
    this._last = now;

    if (this._tween) {
      const tw = this._tween;
      tw.t = Math.min(1, tw.t + dt / 0.65);
      const k = easeInOut(tw.t);
      this.camera.position.lerpVectors(tw.fromP, tw.toP, k);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      if (tw.t >= 1) this._tween = null;
      this._dirty = true;
    }
    if (this.onTick?.(dt)) this._dirty = true;
    this.controls.update();
    // Sin cambios (robot quieto, en pausa, cámara quieta) no se dibuja: cero costo.
    if (!this._dirty) return;
    this._dirty = false;
    this.renderer.render(this.scene, this.camera);
    // Costo en el hilo principal = desde que arrancó el callback (interpolación + dibujo).
    this._adapt(performance.now() - t0, interval);
  }

  resize() {
    if (this._disposed) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // En pantallas angostas (celular vertical) se abre el campo visual para que entre el robot.
    this.camera.fov = w / h < 0.8 ? 52 : 40;
    // Corre el centro óptico al área libre de paneles (en el celular el HUD tapa el tercio de arriba).
    const off = this.getFocusOffset?.() ?? { x: 0, y: 0 };
    if (off.x || off.y) this.camera.setViewOffset(w, h, -off.x, -off.y, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this._dirty = true;
  }

  /** Libera TODO (GPU, listeners, rAF) en el acto: al cambiar de vista no queda nada vivo. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.stop();
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) {
        m.map?.dispose();
        m.dispose();
      }
    });
    this.gridTexture?.dispose();
    this.envTexture.dispose();
    this.key.shadow.map?.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.onTick = null;
  }
}
