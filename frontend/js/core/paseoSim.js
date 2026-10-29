/**
 * Simulador "paseo" en el navegador: port a JavaScript de
 * backend/api/demo_paseo.py, para poder usar el dashboard SIN servidor
 * (por ejemplo, publicado en GitHub Pages).
 *
 * Produce exactamente el JSON de GET /telemetria y GET /info (ya adaptado:
 * grados, voltios, roll/pitch/yaw), así que para el resto del dashboard es
 * indistinguible del backend real. Mismo guion, misma marcha al trote y mismo
 * modelo térmico que el demo de Python.
 */

export const ROBOTS = {
  go2: {
    nombre: "Unitree Go2 EDU",
    tipo: "cuadrupedo",
    patas: ["FR", "FL", "RR", "RL"],
    motores_nombres: ["FR_hip", "FR_thigh", "FR_calf", "FL_hip", "FL_thigh", "FL_calf", "RR_hip", "RR_thigh", "RR_calf", "RL_hip", "RL_thigh", "RL_calf"],
  },
  g1: {
    nombre: "Unitree G1 EDU",
    tipo: "humanoide",
    patas: ["R_foot", "L_foot"],
    motores_nombres: [
      "L_hip_yaw", "L_hip_roll", "L_hip_pitch", "L_knee", "L_ankle_pitch", "L_ankle_roll",
      "R_hip_yaw", "R_hip_roll", "R_hip_pitch", "R_knee", "R_ankle_pitch", "R_ankle_roll",
      "torso_yaw", "torso_roll", "torso_pitch",
      "L_shoulder_pitch", "L_shoulder_roll", "L_shoulder_yaw", "L_elbow", "L_wrist_roll", "L_wrist_pitch", "L_wrist_yaw",
      "R_shoulder_pitch", "R_shoulder_roll", "R_shoulder_yaw", "R_elbow", "R_wrist_roll", "R_wrist_pitch", "R_wrist_yaw",
    ],
  },
};

/** [duración s, velocidad 0..1, giro °/s, etiqueta] — igual que GUION en Python. */
export const GUION = [
  [6, 0, 0, "quieto"],
  [10, 0.55, 0, "camina"],
  [5, 0.55, 18, "curva izquierda"],
  [12, 1, 0, "trota"],
  [4, 0.3, -30, "gira derecha"],
  [7, 0, 0, "quieto"],
  [14, 0.85, 6, "camina rápido"],
  [5, 0, 0, "quieto"],
];

const T_AMB = 30;
const K_CALOR = 1.75;
const DEG = 180 / Math.PI;

/** Generador pseudoaleatorio con semilla (mulberry32): resultados reproducibles. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

export class PaseoSim {
  constructor(modelo = "go2", { seed = 7 } = {}) {
    if (!ROBOTS[modelo]) throw new Error(`Modelo desconocido: ${modelo}`);
    this.modelo = modelo;
    this.cfg = ROBOTS[modelo];
    this.rand = rng(seed);
    this.gauss = (sd) => {
      const u = 1 - this.rand();
      const v = this.rand();
      return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    this.t = 0;
    this.fase = 0;
    this.vel = 0;
    this.giro = 0;
    this.yaw = (this.rand() - 0.5) * 1;
    this.soc = 92;
    this.batTemp = 29;
    this.cellOffset = Array.from({ length: 8 }, (_, i) => (this.rand() - 0.5) * 12 - (i === 5 ? 14 : 0));
    this.motors = this.cfg.motores_nombres.map((n) => this.#motor(n));
    this.qPrev = new Array(this.motors.length).fill(0);
    this.steps = 0;
  }

  #motor(n) {
    let nominal;
    if (this.modelo === "go2") nominal = n.includes("calf") ? 22 : n.includes("thigh") ? 20 : 9;
    else nominal = n.includes("knee") ? 36 : n.includes("hip_pitch") ? 26 : n.includes("ankle") ? 20 : 9;
    const k = K_CALOR * (n.includes("calf") || n.includes("knee") ? 1.25 : 1) * (0.85 + this.rand() * 0.35);
    return { k, nominal, tauTh: 35 + this.rand() * 15, temp: T_AMB + 1 + this.rand() * 3 };
  }

  get tramo() {
    const total = GUION.reduce((a, [d]) => a + d, 0);
    let t = this.t % total;
    for (const [d, v, g, label] of GUION) {
      if (t < d) return { v, g, label };
      t -= d;
    }
    return { v: 0, g: 0, label: "quieto" };
  }

  info() {
    return {
      modelo: this.modelo,
      nombre: this.cfg.nombre,
      tipo: this.cfg.tipo,
      n_motores: this.cfg.motores_nombres.length,
      motores_nombres: [...this.cfg.motores_nombres],
      patas: [...this.cfg.patas],
      frecuencia_hz: 10,
      modo: "demo",
    };
  }

  /** Avanza `dt` segundos integrando a 50 Hz. */
  advance(dt) {
    const h = 1 / 50;
    for (let left = dt; left > 1e-9; left -= h) this.#step(Math.min(h, left));
  }

  #step(dt) {
    this.t += dt;
    this.steps += 1;
    const { v, g } = this.tramo;
    this.vel = smooth(this.vel, v, dt, 0.8);
    this.giro = smooth(this.giro, g, dt, 0.6);
    this.yaw += (this.giro / DEG) * dt;
    this.yaw = ((this.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (this.vel > 0.02) this.fase = (this.fase + 2 * Math.PI * (1.6 + 0.9 * this.vel) * dt) % (2 * Math.PI);

    const { q, tau, feet } = this.modelo === "go2" ? this.#quadruped() : this.#biped();
    this.q = q;
    this.dq = q.map((x, i) => (this.steps > 1 ? (x - this.qPrev[i]) / dt : 0));
    this.qPrev = q;
    this.tau = tau;
    this.feet = feet;
    this.motors.forEach((m, i) => {
      const load = tau[i] / m.nominal;
      m.temp += (m.k * load * load - (m.temp - T_AMB) / m.tauTh) * dt;
    });

    const effort = tau.reduce((a, b) => a + Math.abs(b), 0) / tau.length;
    this.current = 1400 + 520 * effort + this.gauss(40);
    this.soc -= (this.current / 1000) * dt * 0.0045;
    if (this.soc < 12) this.soc = 96;
    this.batTemp = smooth(this.batTemp, 28 + this.current / 900, dt, 60);
  }

  #quadruped() {
    const a = this.vel;
    const desfase = { FR: 0, FL: Math.PI, RR: Math.PI, RL: 0 };
    const q = [];
    const tau = [];
    const feet = [];
    for (const pata of this.cfg.patas) {
      const f = this.fase + desfase[pata];
      const s = Math.sin(f);
      const c = Math.cos(f);
      const air = a > 0.05 && s > 0.15;
      const side = pata.endsWith("R") ? 1 : -1;
      const load = air ? 0.25 : 1;
      q.push((side * (1.5 + 3 * a * c)) / DEG, (45 + 22 * a * s) / DEG, (-88 - 28 * a * Math.max(0, s)) / DEG);
      tau.push((1.2 + 2.5 * a * Math.abs(c)) * side, 6 * load + 9 * a * Math.abs(s), -(9 * load + 13 * a * (0.5 + 0.5 * Math.abs(c))));
      feet.push(air ? 0 : 60 + 35 * a);
    }
    return { q, tau: tau.map((x) => x + this.gauss(0.15)), feet };
  }

  #biped() {
    const a = this.vel;
    const s = Math.sin(this.fase);
    const c = Math.cos(this.fase);
    const q = [];
    const tau = [];
    for (const n of this.cfg.motores_nombres) {
      const sign = n.startsWith("L_") ? 1 : -1;
      const sp = sign * s;
      let ang;
      let t;
      if (n.includes("hip_pitch")) [ang, t] = [-12 + 25 * a * sp, 8 + 10 * a * Math.abs(sp)];
      else if (n.includes("knee")) [ang, t] = [28 + 30 * a * Math.max(0, -sp), 18 + 14 * a * Math.abs(sp)];
      else if (n.includes("ankle_pitch")) [ang, t] = [-14 + 12 * a * sp, 9 + 8 * a * Math.abs(c)];
      else if (n.includes("shoulder_pitch")) [ang, t] = [10 - 20 * a * sp, 1.5 + 1.5 * a * Math.abs(sp)];
      else if (n.includes("elbow")) [ang, t] = [60 + 8 * a * c, 1.2 + 0.8 * a];
      else if (n.startsWith("torso_yaw")) [ang, t] = [4 * a * s, 3 + 5 * a * Math.abs(s)];
      else [ang, t] = [3 * a * sign * c, 1 + 1.5 * a * Math.abs(c)];
      q.push(ang / DEG);
      tau.push(t + this.gauss(0.15));
    }
    const airL = a > 0.05 && s > 0.2;
    const airR = a > 0.05 && s < -0.2;
    return { q, tau, feet: [airR ? 0 : 220, airL ? 0 : 220] };
  }

  /** La muestra con el formato de GET /telemetria. */
  telemetria() {
    const a = this.vel;
    const r2 = (x) => Math.round(x * 100) / 100;
    const roll = 2.2 * a * Math.sin(this.fase) + 0.25 * Math.sin(this.t * 0.7);
    const pitch = -1.2 * a + 1.6 * a * Math.cos(2 * this.fase) + 0.2 * Math.sin(this.t * 0.5);
    const vBase = 3300 + 9 * this.soc - this.current * 0.012;
    return {
      modelo: this.modelo,
      ts: r2(this.t),
      motores: this.motors.map((m, i) => ({
        id: i,
        nombre: this.cfg.motores_nombres[i],
        angulo: r2(this.q[i] * DEG),
        velocidad: Math.round(this.dq[i] * 1000) / 1000,
        torque: r2(this.tau[i]),
        temperatura: Math.round(m.temp),
      })),
      imu: {
        roll: r2(roll),
        pitch: r2(pitch),
        yaw: r2(this.yaw * DEG),
        ax: Math.round((0.35 * a * Math.cos(this.fase) + this.gauss(0.02)) * 1000) / 1000,
        ay: Math.round((0.25 * a * Math.sin(this.fase) + this.gauss(0.02)) * 1000) / 1000,
        az: Math.round((9.81 + 0.9 * a * Math.sin(2 * this.fase) + this.gauss(0.03)) * 1000) / 1000,
      },
      bms: {
        soc: Math.trunc(this.soc),
        corriente: Math.trunc(this.current),
        temperatura: Math.round(this.batTemp * 10) / 10,
        celdas: this.cellOffset.map((off) => Math.round(vBase + off + this.gauss(1.5)) / 1000),
      },
      fuerzas: Object.fromEntries(this.cfg.patas.map((p, i) => [p, this.feet[i] > 10 ? 1 : 0])),
    };
  }
}
