/**
 * El robot dibujado como interfaz (SVG).
 *
 * - Go2 (cuadrúpedo): visto desde arriba; cada pata sale de su esquina.
 * - G1 (humanoide): visto de frente, con brazos, torso y piernas.
 * - Cualquier otro: un cuerpo con las articulaciones en ronda (para no romper
 *   si mañana aparece un robot con otros nombres).
 *
 * Todo sale de `info.motores_nombres` e `info.patas`: nada de 12 motores fijos.
 * El SVG se arma UNA vez por robot (en `build`); `update` solo cambia
 * atributos, clases y `transform`.
 *
 * Convención de la IMU (la de ROS / Unitree, la que usa el simulador):
 * roll > 0 baja el lado derecho; pitch > 0 baja la nariz; yaw > 0 es un giro
 * a la izquierda (antihorario visto desde arriba).
 */
import { h, s, setText, fmt } from "../../ui/dom.js";
import { tempLevel, socLevel } from "../../core/telemetryModel.js";

/** Exageración de la inclinación: 1–2° reales no se verían. */
export const TILT_GAIN = 3;
/** Distancia de la cámara para la perspectiva 3D (px), igual a la del CSS. */
const PERSPECTIVE = 900;
/** El viewBox es un cuadrado centrado en 0,0; el anillo de rumbo tiene radio 200. */
const VB = 430;
const RING_R = 200;

/* ------------------------------------------------------------------ */
/* Geometría                                                           */
/* ------------------------------------------------------------------ */

/** Pata del Go2 vista desde arriba: cadera, muslo, pantorrilla y pie. */
function quadLeg(leg) {
  const sx = leg[1] === "R" ? 1 : -1;  // pata derecha → a la derecha de la pantalla
  const sy = leg[0] === "F" ? -1 : 1;  // delantera → arriba (el robot mira hacia arriba)
  const p = (x, y) => [x * sx, y * sy];
  return { path: [p(42, 85), p(80, 105), p(104, 137)], foot: p(118, 161) };
}

/**
 * Humanoide de frente: el lado izquierdo del robot queda a la DERECHA de la
 * pantalla (como cuando lo tenés enfrente). Coordenadas del lado izquierdo.
 */
const HUMANOID_JOINTS = {
  shoulder_pitch: [62, -108], shoulder_roll: [70, -92], shoulder_yaw: [75, -74], elbow: [80, -42],
  wrist_roll: [85, -10], wrist_pitch: [88, 6], wrist_yaw: [90, 22],
  hip_yaw: [20, 54], hip_roll: [24, 68], hip_pitch: [27, 82], knee: [31, 116],
  ankle_pitch: [34, 146], ankle_roll: [36, 160],
};
const TORSO_JOINTS = { torso_yaw: [-14, 32], torso_roll: [0, 32], torso_pitch: [14, 32] };

function humanoidPoint(name) {
  if (TORSO_JOINTS[name]) return TORSO_JOINTS[name];
  const m = /^([LR])_(.+)$/.exec(name);
  const base = m && HUMANOID_JOINTS[m[2]];
  if (!base) return null;
  return [m[1] === "L" ? base[0] : -base[0], base[1]];
}

/** Interpola un punto a lo largo de una poligonal (t de 0 a 1). */
function along(points, t) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let dist = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (dist <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, dist / seg[i]) : 0;
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * k, points[i][1] + (points[i + 1][1] - points[i][1]) * k];
    }
    dist -= seg[i];
  }
  return points[0];
}

/** Qué cuerpo dibujar según lo que informa /info. */
export function bodyKind(info) {
  const legs = info?.patas ?? [];
  if (legs.some((l) => /^[FR][LR]$/.test(l))) return "quad";
  if (info?.tipo === "humanoide" || legs.some((l) => l.endsWith("_foot"))) return "humanoid";
  return "generic";
}

/* ------------------------------------------------------------------ */
/* Matemática de la inclinación                                        */
/* ------------------------------------------------------------------ */

const rad = (d) => (d * Math.PI) / 180;
const ROT = {
  x: (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]],
  y: (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]],
  z: (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]],
};
const mul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));

/**
 * Rotaciones (en el orden de CSS) a partir de roll y pitch. Devuelve el
 * string para `style.transform` y la matriz equivalente, que se usa para
 * saber dónde quedó cada articulación en pantalla SIN leer el layout.
 */
function tiltFor(kind, roll, pitch, gain) {
  const steps = kind === "humanoid"
    // De frente: el roll es una inclinación en el plano (lado derecho del robot = izquierda de la pantalla);
    // el pitch acerca o aleja la cabeza.
    ? [["x", -pitch * gain], ["z", -roll * gain]]
    // Desde arriba: la nariz baja (pitch > 0) → el frente se aleja; el lado derecho baja (roll > 0) → se aleja.
    : [["x", pitch * gain], ["y", roll * gain]];
  const css = steps.map(([axis, deg]) => `rotate${axis.toUpperCase()}(${deg.toFixed(2)}deg)`).join(" ");
  const matrix = steps.reduce((M, [axis, deg]) => mul(M, ROT[axis](rad(deg))), ROT.z(0));
  return { css, matrix };
}

/* ------------------------------------------------------------------ */
/* Figura                                                              */
/* ------------------------------------------------------------------ */

export class RobotFigure {
  /** @param {{ onSelect: (name: string) => void }} opts */
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.joints = new Map();   // nombre → { g, x, y, level }
    this.feet = new Map();     // pata → { foot, ripple, down }
    this.matrix = ROT.z(0);
    this.sizePx = 0;

    this.shadow = h("div", { class: "bd-shadow", "aria-hidden": "true" });
    this.svg = s("svg", { class: "bd-robot", viewBox: `${-VB / 2} ${-VB / 2} ${VB} ${VB}`, role: "group" });
    this.tilt = h("div", { class: "bd-tilt" }, this.svg);
    this.el = h("div", { class: "bd-robotbox" }, this.shadow, this.tilt);
  }

  /** Arma el dibujo para un robot. Se llama en setInfo (no en cada muestra). */
  build(info) {
    this.kind = bodyKind(info);
    this.el.dataset.kind = this.kind;
    this.joints.clear();
    this.feet.clear();
    this.svg.replaceChildren();
    this.svg.setAttribute("aria-label", this.kind === "humanoid"
      ? "Robot humanoide visto de frente: cada punto es un motor con el color de su temperatura"
      : "Robot visto desde arriba: cada punto es un motor con el color de su temperatura");

    this.#buildRing();
    const names = info?.motores_nombres ?? [];
    const placed = this.kind === "quad" ? this.#buildQuad(info, names)
      : this.kind === "humanoid" ? this.#buildHumanoid(info, names)
        : this.#buildGeneric();

    // Los motores que el dibujo no sabe ubicar van en ronda alrededor del cuerpo:
    // así ningún motor queda sin su punto, aunque cambien los nombres.
    const orphans = names.filter((n) => !placed.has(n));
    orphans.forEach((n, i) => {
      const a = (i / orphans.length) * 2 * Math.PI - Math.PI / 2;
      placed.set(n, [Math.cos(a) * 160, Math.sin(a) * 160]);
    });
    const r = this.kind === "humanoid" ? 6 : 8.5;
    for (const n of names) this.#addJoint(n, placed.get(n), /_hip$/.test(n) ? r - 1 : r);
  }

  #buildRing() {
    // El anillo gira con el yaw; el robot queda siempre mirando hacia arriba.
    this.ring = s("g", { class: "bd-ring" });
    this.ring.append(s("circle", { r: RING_R, class: "bd-ring__circle" }));
    for (let a = 0; a < 360; a += 10) {
      const r1 = a % 90 === 0 ? RING_R - 12 : a % 30 === 0 ? RING_R - 8 : RING_R - 5;
      const t = rad(a);
      this.ring.append(s("line", {
        x1: Math.sin(t) * r1, y1: -Math.cos(t) * r1, x2: Math.sin(t) * RING_R, y2: -Math.cos(t) * RING_R,
        class: a % 90 === 0 ? "bd-ring__tick bd-ring__tick--major" : "bd-ring__tick",
      }));
    }
    for (const [label, a] of [["N", 0], ["E", 90], ["S", 180], ["O", 270]]) {
      const t = rad(a);
      const text = s("text", { x: Math.sin(t) * (RING_R - 26), y: -Math.cos(t) * (RING_R - 26) + 4, class: label === "N" ? "bd-ring__label bd-ring__label--north" : "bd-ring__label" });
      text.textContent = label;
      this.ring.append(text);
    }
    // Marca fija arriba: hacia dónde mira el robot.
    this.svg.append(this.ring, s("path", { d: `M0 ${-RING_R - 3} l-7 -10 h14 z`, class: "bd-ring__heading" }));
  }

  /** Cuerpo = batería: un rectángulo que se llena según el SOC. */
  #buildBattery(x, y, w, hgt, rx, textY) {
    const id = `bd-clip-${Math.random().toString(36).slice(2, 8)}`;
    const clip = s("clipPath", { id }, s("rect", { x: x + 2, y: y + 2, width: w - 4, height: hgt - 4, rx: rx - 2 }));
    this.batFill = s("rect", { x, y, width: w, height: hgt, class: "bd-batfill", "clip-path": `url(#${id})` });
    this.batText = s("text", { x: 0, y: textY, class: "bd-battext" });
    this.batSub = s("text", { x: 0, y: textY + 20, class: "bd-batsub" });
    this.batSub.textContent = "batería";
    this.svg.append(
      s("defs", {}, clip),
      s("rect", { x, y, width: w, height: hgt, rx, class: "bd-body" }),
      this.batFill,
    );
    return [this.batText, this.batSub];
  }

  #buildQuad(info, names) {
    const placed = new Map();
    const legsG = s("g", { class: "bd-limbs" });
    this.svg.append(legsG);
    const texts = this.#buildBattery(-54, -117, 108, 236, 30, 4);
    // Cabeza: el frente del robot, para que se lea hacia dónde camina.
    this.svg.append(
      s("path", { d: "M-36 -117c0-22 16-38 36-38s36 16 36 38", class: "bd-body" }),
      s("circle", { cx: -12, cy: -137, r: 4, class: "bd-eye" }),
      s("circle", { cx: 12, cy: -137, r: 4, class: "bd-eye" }),
      ...texts,
    );

    for (const leg of info.patas.filter((l) => /^[FR][LR]$/.test(l))) {
      const geo = quadLeg(leg);
      const pts = [...geo.path, geo.foot];
      legsG.append(s("path", { d: `M${pts.map((p) => p.join(" ")).join(" L")}` }));
      const own = names.filter((n) => n.startsWith(`${leg}_`));
      // Con 3 motores por pata (cadera, muslo, pantorrilla) caen en los codos del dibujo;
      // con otra cantidad se reparten a lo largo de la pata.
      own.forEach((n, i) => placed.set(n, own.length === 3 ? geo.path[i] : along(geo.path, own.length > 1 ? i / (own.length - 1) : 0)));
      this.#addFoot(leg, geo.foot, 13, leg, leg[1] === "R" ? 1 : -1);
    }
    return placed;
  }

  #buildHumanoid(info, names) {
    const placed = new Map();
    const limbs = s("g", { class: "bd-limbs" });
    const arm = (sx) => `M${62 * sx} -108 L${80 * sx} -42 L${92 * sx} 30`;
    const leg = (sx) => `M${20 * sx} 44 L${31 * sx} 116 L${36 * sx} 160 L${46 * sx} 166`;
    limbs.append(s("path", { d: `${arm(1)} ${arm(-1)} ${leg(1)} ${leg(-1)}` }));
    this.svg.append(limbs);
    const texts = this.#buildBattery(-48, -124, 96, 140, 24, -50);
    this.svg.append(
      s("rect", { x: -38, y: 20, width: 76, height: 26, rx: 10, class: "bd-body" }),   // cadera
      s("circle", { cx: 0, cy: -154, r: 22, class: "bd-body" }),                        // cabeza
      s("circle", { cx: -8, cy: -156, r: 3, class: "bd-eye" }),
      s("circle", { cx: 8, cy: -156, r: 3, class: "bd-eye" }),
      ...texts,
    );
    for (const n of names) {
      const p = humanoidPoint(n);
      if (p) placed.set(n, p);
    }
    for (const foot of info.patas ?? []) {
      const sx = foot.startsWith("L") ? 1 : -1;
      this.#addFoot(foot, [50 * sx, 170], 10, sx > 0 ? "pie izq." : "pie der.", sx);
    }
    return placed;
  }

  #buildGeneric() {
    const texts = this.#buildBattery(-60, -90, 120, 180, 30, 4);
    this.svg.append(...texts);
    return new Map();
  }

  #addFoot(leg, [x, y], r, label, side) {
    const ripple = s("circle", { cx: x, cy: y, r, class: "bd-ripple" });
    const foot = s("circle", { cx: x, cy: y, r, class: "bd-foot" });
    // El rótulo va hacia afuera del pie (en el G1, más lejos: el texto es más largo).
    const gap = this.kind === "humanoid" ? r + 30 : r + 14;
    const text = s("text", { x: x + side * gap, y: y + 4, class: "bd-foot__label" });
    text.textContent = label;
    const title = s("title");
    title.textContent = leg;
    foot.append(title);
    this.svg.append(ripple, foot, text);
    this.feet.set(leg, { foot, ripple, down: null });
  }

  #addJoint(name, [x, y], r) {
    const g = s("g", { class: "bd-joint", "data-level": "ok", role: "button", tabindex: "-1", "aria-label": `Motor ${name}` });
    g.append(
      s("circle", { cx: x, cy: y, r, class: "bd-joint__pulse" }),
      s("circle", { cx: x, cy: y, r: r + 6, class: "bd-joint__halo" }),
      s("circle", { cx: x, cy: y, r, class: "bd-joint__dot" }),
    );
    g.addEventListener("click", () => this.onSelect(name));
    this.svg.append(g);
    this.joints.set(name, { g, x, y, level: "ok" });
  }

  setSelected(name) {
    for (const [n, j] of this.joints) j.g.classList.toggle("is-selected", n === name);
  }

  /** Tamaño en px del dibujo (lo mide la vista con un ResizeObserver). */
  resize(sizePx) {
    this.sizePx = sizePx;
  }

  /**
   * Dónde está una articulación en pantalla, en px relativos a la esquina del
   * dibujo, aplicando la misma rotación y perspectiva que el CSS. Así las
   * líneas de las tarjetas siguen al robot inclinado sin medir el DOM.
   */
  project(name) {
    const j = this.joints.get(name);
    if (!j || !this.sizePx) return null;
    const k = this.sizePx / VB;
    const p = [j.x * k, j.y * k, 0];
    const M = this.matrix;
    const x = M[0][0] * p[0] + M[0][1] * p[1];
    const y = M[1][0] * p[0] + M[1][1] * p[1];
    const z = M[2][0] * p[0] + M[2][1] * p[1];
    const f = PERSPECTIVE / (PERSPECTIVE - z);
    return [this.sizePx / 2 + x * f, this.sizePx / 2 + y * f];
  }

  /**
   * @param {object} frame
   * @param {{ reducedMotion: boolean }} opts
   */
  update(frame, { reducedMotion }) {
    // Semáforo: la clase cambia solo si cambió el nivel (evita recalcular estilos).
    for (const m of frame.motores) {
      const j = this.joints.get(m.nombre);
      if (!j) continue;
      const level = tempLevel(m.temperatura);
      if (level !== j.level) {
        j.level = level;
        j.g.dataset.level = level;
      }
    }

    // Patas: se rellenan al apoyar y sueltan una onda en el instante del apoyo.
    for (const [leg, f] of this.feet) {
      const down = frame.fuerzas[leg] === 1;
      if (down === f.down) continue;
      f.foot.classList.toggle("is-down", down);
      if (down && f.down === false && !reducedMotion) {
        f.ripple.animate(
          [{ transform: "scale(1)", opacity: 0.6 }, { transform: "scale(2.4)", opacity: 0 }],
          { duration: 500, easing: "ease-out" },
        );
      }
      f.down = down;
    }

    // Batería: el cuerpo se llena con el SOC.
    const soc = Math.max(0, Math.min(100, frame.bms.soc));
    this.batFill.style.transform = `scaleY(${soc / 100})`;
    this.batFill.dataset.level = socLevel(soc);
    setText(this.batText, `${fmt(soc, 0)}%`);

    // IMU: el dibujo se inclina en 3D y el anillo gira con el yaw.
    const gain = reducedMotion ? 0 : TILT_GAIN;
    const { css, matrix } = tiltFor(this.kind, frame.imu.roll, frame.imu.pitch, gain);
    this.matrix = matrix;
    this.tilt.style.transform = css;
    this.shadow.style.transform = `translate(${(frame.imu.roll * gain * 1.4).toFixed(1)}px, ${(frame.imu.pitch * gain * 1.4 + 8).toFixed(1)}px)`;
    // yaw > 0 = giró a la izquierda → el norte queda corrido a su derecha: el anillo gira en sentido horario.
    this.ring.setAttribute("transform", `rotate(${frame.imu.yaw.toFixed(1)})`);
  }
}
