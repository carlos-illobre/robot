/**
 * El robot 3D "con hilos": carga el .glb convertido del MJCF de Unitree y
 * expone una API chica para moverlo con la telemetría.
 *
 * Jerarquía (el MJCF es Z-arriba; three.js es Y-arriba):
 *
 *   root (Y-arriba) ─► zUp (rotX −90°) ─► attitude (roll/pitch/yaw de la IMU,
 *   altura de apoyo) ─► mjcf_root ─► base_link/pelvis ─► … un nodo por <body>
 *
 * Cada <body> con joint guarda su cuaternión de reposo (pos/quat del MJCF);
 * el ángulo del motor se aplica como `reposo · rotación(eje, q)`, que es
 * exactamente lo que hace MuJoCo con un joint hinge.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mapMotors } from "./robotProfiles.js";

/** Colores del semáforo en la escena (mismos tonos que --sem-* del dashboard). */
export const SEM_COLORS = { ok: 0x22c55e, warn: 0xf59e0b, crit: 0xef4444, unknown: 0x8b93a7 };

/* ------------------------------------------------------------------ */
/* Descarga con progreso + caché del módulo                            */
/* ------------------------------------------------------------------ */

/**
 * Se guarda el ArrayBuffer (no los objetos de GPU): al volver a la vista no
 * se descarga de nuevo, pero tampoco queda nada vivo en la placa de video.
 */
const downloads = new Map();

function download(url, onProgress) {
  let entry = downloads.get(url);
  if (!entry) {
    entry = { listeners: new Set(), promise: null };
    entry.promise = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo descargar el modelo (${res.status})`);
      // Ojo: si el servidor comprime (GitHub Pages manda gzip), Content-Length es
      // el tamaño COMPRIMIDO y lo que se lee es más grande. Por eso no se reserva
      // un buffer de ese tamaño: se juntan los pedazos y se unen al final, y el
      // total solo se usa para estimar el progreso.
      const total = Number(res.headers.get("content-length")) || 0;
      if (!res.body || !total) return res.arrayBuffer();
      const reader = res.body.getReader();
      const chunks = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        for (const fn of entry.listeners) fn(Math.min(0.99, loaded / total));
      }
      const out = new Uint8Array(loaded);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out.buffer;
    })();
    entry.promise.catch(() => downloads.delete(url)); // si falló, se puede reintentar
    downloads.set(url, entry);
  }
  if (onProgress) entry.listeners.add(onProgress);
  return entry.promise.finally(() => entry.listeners.delete(onProgress));
}

/* ------------------------------------------------------------------ */
/* Texturas procedurales (sin archivos extra)                          */
/* ------------------------------------------------------------------ */

/** Disco con degradé radial: "halo" de la pata apoyada sobre el piso. */
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,.55)");
  grd.addColorStop(0.7, "rgba(255,255,255,.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* Rig                                                                 */
/* ------------------------------------------------------------------ */

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const Z_UP_FIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export class RobotRig {
  /**
   * @param {object} profile perfil de robotProfiles.js
   */
  constructor(profile) {
    this.profile = profile;
    this.root = new THREE.Group();
    this.root.name = "robot";
    this.zUp = new THREE.Group();
    this.zUp.quaternion.copy(Z_UP_FIX);
    this.attitude = new THREE.Group();
    this.root.add(this.zUp);
    this.zUp.add(this.attitude);

    /** joint del MJCF → { body, axis, rest, range, marker, hit, materials, motor } */
    this.joints = new Map();
    /** pata → { contacts: [{body, local: Vector3, r}], pad, footMaterials } */
    this.feet = new Map();
    this.meshes = [];
    this.motors = [];
    this.groundOffset = 0;
    this._disposables = new Set();
  }

  /** Descarga (con progreso 0..1) y arma el robot. */
  async load(onProgress) {
    const buffer = await download(this.profile.url, onProgress);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(buffer.slice(0), "");
    this._build(gltf.scene);
    return this;
  }

  _track(obj) {
    this._disposables.add(obj);
    return obj;
  }

  _build(scene) {
    const mjcfRoot = scene.getObjectByName("mjcf_root");
    this.actuators = mjcfRoot.userData.actuators ?? [];
    this.jointNames = mjcfRoot.userData.joints ?? [];
    this.attitude.add(mjcfRoot);

    // La base flota: su altura la decide el apoyo de las patas, no el MJCF.
    const base = mjcfRoot.children[0];
    base.position.set(0, 0, 0);

    const { profile } = this;
    mjcfRoot.traverse((obj) => {
      const ud = obj.userData;
      if (obj.isMesh) {
        // Materiales propios por geom: así se puede teñir un eslabón sin tocar los demás.
        const src = obj.material;
        const look = profile.materialFor(src.userData?.mjcfMaterial, src.userData?.rgba) ?? { color: src.color.getHex() };
        obj.material = this._track(new THREE.MeshStandardMaterial({ ...look, envMapIntensity: 0.9 }));
        obj.material.userData.baseEmissive = new THREE.Color(0, 0, 0);
        src.dispose();
        obj.castShadow = true;
        obj.receiveShadow = true;
        this._track(obj.geometry);
        this.meshes.push(obj);
      }
      if (ud.joint) {
        const axis = new THREE.Vector3().fromArray(ud.joint.axis).normalize();
        this.joints.set(ud.joint.name, {
          name: ud.joint.name,
          body: obj,
          axis,
          rest: obj.quaternion.clone(),
          range: ud.joint.range,
          angle: 0,
          materials: obj.children.filter((c) => c.isMesh).map((c) => c.material),
          motor: null,
        });
      }
    });

    this._buildMarkers();
    this._buildFeet();
    this.setPose(Object.fromEntries(Object.entries(profile.restPose).map(([n, v]) => [profile.jointFor(n), v])));
  }

  /** Anillo en cada articulación, perpendicular a su eje de giro: muestra DÓNDE y SOBRE QUÉ gira. */
  _buildMarkers() {
    const geoCache = new Map();
    const hitGeo = this._track(new THREE.SphereGeometry(1, 12, 8));
    const hitMat = this._track(new THREE.MeshBasicMaterial({ visible: false }));
    const zAxis = new THREE.Vector3(0, 0, 1);
    this.markerGroup = [];
    this.hitTargets = [];
    for (const j of this.joints.values()) {
      const r = this.profile.markerRadius(j.name);
      const key = r.toFixed(3);
      if (!geoCache.has(key)) geoCache.set(key, this._track(new THREE.TorusGeometry(r, Math.max(0.0028, r * 0.09), 8, 48)));
      const mat = this._track(
        new THREE.MeshBasicMaterial({ color: SEM_COLORS.unknown, transparent: true, opacity: 0.88, depthTest: false, depthWrite: false, toneMapped: false }),
      );
      const ring = new THREE.Mesh(geoCache.get(key), mat);
      ring.quaternion.setFromUnitVectors(zAxis, j.axis);
      ring.renderOrder = 10;
      ring.userData.joint = j.name;
      j.body.add(ring);
      j.marker = ring;

      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.scale.setScalar(r * 1.25);
      hit.userData.joint = j.name;
      j.body.add(hit);
      this.hitTargets.push(hit);
      this.markerGroup.push(ring);
    }
  }

  /** Puntos de apoyo de cada pata (esferas chicas del MJCF) + halo en el piso. */
  _buildFeet() {
    const tex = this._track(glowTexture());
    const padGeo = this._track(new THREE.PlaneGeometry(1, 1));
    padGeo.rotateX(-Math.PI / 2);
    this.allContacts = [];
    for (const [leg, bodyName] of Object.entries(this.profile.feet)) {
      const body = this.attitude.getObjectByName(bodyName);
      if (!body) continue;
      const contacts = (body.userData.contacts ?? [[0, 0, 0, 0]]).map(([x, y, z, r]) => ({ body, local: new THREE.Vector3(x, y, z), r }));
      this.allContacts.push(...contacts);
      const mat = this._track(
        new THREE.MeshBasicMaterial({ map: tex, color: 0x22d3ee, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      const pad = new THREE.Mesh(padGeo, mat);
      pad.scale.setScalar(this.profile.padRadius * 2.6);
      pad.renderOrder = 2;
      this.root.add(pad);
      const footMaterials = body.children
        .filter((c) => c.isMesh && c.userData.geom && (!this.profile.footGeom || c.userData.geom === this.profile.footGeom))
        .map((c) => c.material);
      this.feet.set(leg, { contacts, pad, footMaterials, level: 0 });
    }
  }

  /** Asigna los motores de la telemetría a los joints (ver mapMotors). */
  setMotors(nombres, mode) {
    this.motors = mapMotors(this.profile, nombres, this.actuators, this.jointNames, mode);
    for (const j of this.joints.values()) j.motor = null;
    for (const m of this.motors) if (m.joint) this.joints.get(m.joint).motor = m;
    return this.motors;
  }

  /** Ángulos (rad) por nombre de joint del MJCF. */
  setPose(anglesByJoint) {
    for (const [name, q] of Object.entries(anglesByJoint)) {
      const j = this.joints.get(name);
      if (j) this.setJoint(j, q);
    }
  }

  setJoint(j, q) {
    j.angle = q;
    j.body.quaternion.copy(j.rest).multiply(_q.setFromAxisAngle(j.axis, q));
  }

  /**
   * Orientación de la base desde la IMU (rad). Convención aeronáutica ZYX,
   * la misma de `quaternion_a_euler` del backend: yaw → pitch → roll.
   */
  setAttitude(roll, pitch, yaw) {
    this.attitude.quaternion.setFromEuler(_e.set(roll, pitch, yaw, "ZYX"));
  }

  /**
   * Apoya el robot en el piso: baja/sube la base hasta que el punto de apoyo
   * más bajo toque y = 0. La telemetría no trae la altura, así que se deduce.
   */
  ground(smoothing = 1) {
    this.root.updateMatrixWorld(true);
    let minY = Infinity;
    for (const c of this.allContacts) {
      _v.copy(c.local).applyMatrix4(c.body.matrixWorld);
      minY = Math.min(minY, _v.y - c.r);
    }
    if (!Number.isFinite(minY)) return;
    const target = this.groundOffset - minY;
    this.groundOffset += (target - this.groundOffset) * smoothing;
    this.attitude.position.z = this.groundOffset; // Z del MJCF = arriba
  }

  /** Halo y brillo de cada pata según `frame.fuerzas` (1 = apoyada). */
  updateFeet(fuerzas, dt) {
    // Las matrices ya las actualizó ground() en este mismo cuadro.
    for (const [leg, f] of this.feet) {
      const on = fuerzas?.[leg] ? 1 : 0;
      f.level += (on - f.level) * Math.min(1, dt * 14);
      // Halo debajo del punto de apoyo más bajo de esa pata
      let lowestY = Infinity;
      for (const c of f.contacts) {
        _v.copy(c.local).applyMatrix4(c.body.matrixWorld);
        if (_v.y < lowestY) {
          lowestY = _v.y;
          _w.copy(_v);
        }
      }
      if (lowestY < Infinity) f.pad.position.set(_w.x, 0.002, _w.z);
      f.pad.material.opacity = 0.9 * f.level;
      f.pad.visible = f.level > 0.01;
      const g = f.level * (this.profile.footGlow ?? 1);
      for (const m of f.footMaterials) m.emissive.setRGB(0.05 * g, 0.55 * g, 0.65 * g);
    }
  }

  /** Color del anillo y tinte del eslabón según el semáforo de temperatura. */
  setJointLevel(j, level, highlighted = false) {
    j.marker.material.color.setHex(SEM_COLORS[level] ?? SEM_COLORS.unknown);
    j.marker.scale.setScalar(highlighted ? 1.35 : 1);
    const tint = level === "crit" ? 0.38 : level === "warn" ? 0.16 : 0;
    _c.setHex(SEM_COLORS[level] ?? 0).multiplyScalar(tint);
    for (const m of j.materials) {
      if (highlighted) m.emissive.setRGB(0.12, 0.2, 0.35);
      else m.emissive.copy(_c);
    }
  }

  setMarkersVisible(on) {
    for (const r of this.markerGroup) r.visible = on;
  }

  /** Posición en el mundo del centro de una articulación (para la etiqueta flotante). */
  jointWorldPosition(j, target = new THREE.Vector3()) {
    return j.body.getWorldPosition(target);
  }

  /** Joint bajo el rayo: primero los anillos (blancos grandes), después las mallas. */
  pick(raycaster) {
    const hits = raycaster.intersectObjects(this.hitTargets, false);
    if (hits.length) return this.joints.get(hits[0].object.userData.joint);
    const meshHits = raycaster.intersectObjects(this.meshes, false);
    for (let o = meshHits[0]?.object; o; o = o.parent) {
      if (o.userData?.joint?.name) return this.joints.get(o.userData.joint.name);
      if (o.userData?.body) return (this._basePick ??= { name: o.userData.body, base: true, body: o });
    }
    return null;
  }

  /** Raycaster con el umbral por defecto (la vista no importa three directamente). */
  static makeRaycaster() {
    return new THREE.Raycaster();
  }

  dispose() {
    for (const d of this._disposables) d.dispose?.();
    this._disposables.clear();
    this.root.removeFromParent();
  }
}
