/**
 * Escenario 3D del Gemelo: renderer, cámara, luces, piso con grilla y bucle
 * de dibujo propio. No sabe nada de telemetría: la vista le pasa un `onTick`
 * que se llama una vez por cuadro con el tiempo transcurrido.
 *
 * El bucle es independiente del de main.js a propósito: los datos llegan a
 * 10 Hz, pero la escena se dibuja a la frecuencia de la pantalla (60 Hz)
 * interpolando, y se detiene sola si la pestaña queda oculta.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** ¿El navegador puede crear un contexto WebGL? (sin crear el renderer) */
export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class TwinScene {
  /**
   * @param {HTMLElement} host contenedor donde va el <canvas>
   * @param {{ reducedMotion: boolean }} opts
   */
  constructor(host, { reducedMotion = false } = {}) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.onTick = null;
    this._raf = 0;
    this._last = 0;
    this._tween = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = "tw-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.prepend(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 80);
    this.camera.position.set(1.4, 0.8, 1.2);

    // Iluminación "de estudio": cielo/suelo + luz principal con sombras suaves + contraluz.
    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x1a1e26, 1.15);
    scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.2, 4.2, 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(0x8fd3ff, 0.9);
    rim.position.set(-2.5, 2.2, -2.8);
    scene.add(rim);

    // Reflejos suaves (entorno procedural: no hay archivos HDR que bajar).
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.45;

    this._buildFloor();

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = !reducedMotion;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88); // no meterse debajo del piso
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.addEventListener("start", () => (this._tween = null)); // el usuario manda
    this.controls = controls;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(host);
    this.resize();

    this._loop = this._loop.bind(this);
    this._onVisibility = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  /* ------------------------------ piso ------------------------------ */

  _buildFloor() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    this.gridCanvas = canvas;
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const SIZE = 60; // metros; 1 repetición de la textura = 1 m
    tex.repeat.set(SIZE, SIZE);
    this.gridTexture = tex;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, envMapIntensity: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = "piso";
    this.floor = floor;
    this.scene.add(floor);
  }

  /** Dibuja una celda de 1 m: líneas finas cada 25 cm y una marcada en el borde. */
  _paintGrid({ floor, minor, major }) {
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

  /**
   * Colores de la escena según el tema del dashboard (leídos de las
   * variables CSS de .view-twin, para que el diseño quede en un solo lugar).
   */
  applyTheme(colors) {
    const bg = new THREE.Color(colors.bg);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, this._fogNear ?? 3, this._fogFar ?? 10);
    this._paintGrid(colors);
    this.hemi.color.set(colors.sky);
    this.hemi.groundColor.set(colors.ground);
    this.hemi.intensity = colors.light ? 1.5 : 1.15;
    this.renderer.toneMappingExposure = colors.light ? 1.0 : 1.05;
  }

  /** Ajusta cámara, niebla y sombras al tamaño del robot. */
  frameRobot(cam) {
    this.cam = cam;
    const d = cam.distance;
    this._fogNear = d * 2.2;
    this._fogFar = d * 7;
    if (this.scene.fog) {
      this.scene.fog.near = this._fogNear;
      this.scene.fog.far = this._fogFar;
    }
    const s = this.key.shadow.camera;
    s.left = s.bottom = -d * 0.75;
    s.right = s.top = d * 0.75;
    s.near = 0.1;
    s.far = 12;
    s.updateProjectionMatrix();
    this.controls.minDistance = cam.minDistance;
    this.controls.maxDistance = cam.maxDistance;
  }

  /** Desplaza la textura del piso (sensación de avance) en metros, en ejes del mundo. */
  scrollFloor(dx, dz) {
    // Ver _buildFloor: u crece con +x y v con −z (el plano está rotado −90° en X).
    const o = this.gridTexture.offset;
    o.x = (o.x + dx) % 1;
    o.y = (o.y - dz) % 1;
  }

  /* ----------------------------- cámara ----------------------------- */

  /**
   * Posición de cámara de una vista predefinida, relativa al rumbo del robot.
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
      case "arriba":
        p.addScaledVector(fwd, -0.002 * d).y += d * 1.35; // casi cenital: el frente queda arriba en pantalla
        break;
      case "lateral":
        p.addScaledVector(left, d).y += d * 0.08;
        break;
      case "frente":
        p.addScaledVector(fwd, d).y += d * 0.1;
        break;
      default: // perspectiva 3/4, como la ventana de MuJoCo
        p.addScaledVector(fwd, d * 0.72).addScaledVector(left, d * 0.62).y += d * 0.42;
    }
    return { position: p, target: t };
  }

  /** Mueve la cámara con una transición corta (o al instante si se pidió menos movimiento). */
  goTo({ position, target }, instant = false) {
    if (instant || this.reducedMotion) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this._tween = null;
      this.controls.update();
      return;
    }
    this._tween = {
      t: 0,
      fromP: this.camera.position.clone(),
      fromT: this.controls.target.clone(),
      toP: position,
      toT: target,
    };
  }

  /** Gira la cámara alrededor del objetivo (modo "seguir al robot"). */
  orbitBy(deltaYaw) {
    if (!deltaYaw) return;
    const c = this.controls.target;
    const off = this.camera.position.clone().sub(c).applyAxisAngle(THREE.Object3D.DEFAULT_UP, deltaYaw);
    this.camera.position.copy(c).add(off);
    if (this._tween) this._tween.toP.sub(c).applyAxisAngle(THREE.Object3D.DEFAULT_UP, deltaYaw).add(c);
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
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, (now - this._last) / 1000); // tope: al volver de otra pestaña no "salta"
    this._last = now;
    if (this._tween) {
      const tw = this._tween;
      tw.t = Math.min(1, tw.t + dt / 0.65);
      const k = easeInOut(tw.t);
      this.camera.position.lerpVectors(tw.fromP, tw.toP, k);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      if (tw.t >= 1) this._tween = null;
    }
    this.onTick?.(dt, now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // En pantallas angostas (celular vertical) se abre el campo visual para que entre el robot.
    this.camera.fov = w / h < 0.8 ? 52 : 40;
    this.camera.updateProjectionMatrix();
  }

  /** Libera TODO lo de la GPU y los listeners: al cambiar de vista no queda nada vivo. */
  dispose() {
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
    this.gridTexture.dispose();
    this.envTexture.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.onTick = null;
  }
}
