/**
 * Modelo de telemetría del lado del cliente (patrón Adapter).
 *
 * El backend ya entrega un JSON normalizado, pero el frontend NO confía
 * ciegamente en él: `normalizeFrame` lo convierte a una forma garantizada
 * (números siempre numéricos, listas siempre listas) y le agrega métricas
 * derivadas que varios paneles necesitan. Si mañana cambia un campo de la
 * API, se corrige acá y en ningún otro lado.
 */

/** Umbrales del semáforo de temperatura, idénticos a electroSim. */
export const TEMP_THRESHOLDS = Object.freeze({ warn: 40, crit: 60 });

/** Clasifica una temperatura: verde < 40 °C, amarillo 40–60 °C, rojo > 60 °C. */
export function tempLevel(celsius) {
  if (!Number.isFinite(celsius)) return "unknown";
  if (celsius > TEMP_THRESHOLDS.crit) return "crit";
  if (celsius >= TEMP_THRESHOLDS.warn) return "warn";
  return "ok";
}

/** Nivel de batería: rojo < 20 %, amarillo < 50 %, verde el resto. */
export function socLevel(soc) {
  if (!Number.isFinite(soc)) return "unknown";
  if (soc < 20) return "crit";
  if (soc < 50) return "warn";
  return "ok";
}

const num = (v, fallback = 0) => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
};

/** Velocidad articular media (rad/s) a partir de la cual se considera que el robot camina. */
export const MOVING_THRESHOLD = 0.35;

/**
 * Normaliza un JSON crudo de `/telemetria` o del WebSocket.
 * @param {object} raw     JSON tal cual llegó del servidor
 * @param {number} [receivedAt] marca de tiempo local (ms) de recepción
 */
export function normalizeFrame(raw, receivedAt = Date.now()) {
  if (!raw || typeof raw !== "object") throw new TypeError("Telemetría vacía o inválida");

  const motores = (Array.isArray(raw.motores) ? raw.motores : []).map((m, i) => ({
    id: num(m?.id, i),
    nombre: String(m?.nombre ?? `motor_${i}`),
    angulo: num(m?.angulo),
    velocidad: num(m?.velocidad),
    torque: num(m?.torque),
    temperatura: num(m?.temperatura),
  }));

  const imuRaw = raw.imu ?? {};
  const imu = {
    roll: num(imuRaw.roll),
    pitch: num(imuRaw.pitch),
    yaw: num(imuRaw.yaw),
    ax: num(imuRaw.ax),
    ay: num(imuRaw.ay),
    az: num(imuRaw.az),
  };

  const bmsRaw = raw.bms ?? {};
  const bms = {
    soc: num(bmsRaw.soc),
    corriente: num(bmsRaw.corriente),
    temperatura: num(bmsRaw.temperatura),
    celdas: (Array.isArray(bmsRaw.celdas) ? bmsRaw.celdas : []).map((v) => num(v)),
  };

  const fuerzas = {};
  for (const [pata, valor] of Object.entries(raw.fuerzas ?? {})) {
    fuerzas[pata] = num(valor) > 0 ? 1 : 0;
  }

  const frame = {
    modelo: String(raw.modelo ?? "desconocido"),
    ts: num(raw.ts),
    receivedAt,
    motores,
    imu,
    bms,
    fuerzas,
  };
  frame.derived = deriveMetrics(frame);
  return frame;
}

/** Métricas calculadas una sola vez por muestra y compartidas por los paneles. */
export function deriveMetrics({ motores, bms, fuerzas, imu }) {
  let tempMax = null;
  let torqueMax = null;
  let velSum = 0;
  const levels = { ok: 0, warn: 0, crit: 0 };

  for (const m of motores) {
    if (!tempMax || m.temperatura > tempMax.value) tempMax = { value: m.temperatura, motor: m.nombre };
    if (!torqueMax || Math.abs(m.torque) > Math.abs(torqueMax.value)) {
      torqueMax = { value: m.torque, motor: m.nombre };
    }
    velSum += Math.abs(m.velocidad);
    const lvl = tempLevel(m.temperatura);
    if (lvl in levels) levels[lvl] += 1;
  }

  const meanSpeed = motores.length ? velSum / motores.length : 0;
  const patas = Object.values(fuerzas);
  const celdas = bms.celdas;
  const packVoltage = celdas.reduce((a, b) => a + b, 0);
  const cellMin = celdas.length ? Math.min(...celdas) : null;
  const cellMax = celdas.length ? Math.max(...celdas) : null;

  return {
    tempMax,
    torqueMax,
    tempLevels: levels,
    meanSpeed,
    isMoving: meanSpeed > MOVING_THRESHOLD,
    contacts: patas.reduce((a, b) => a + b, 0),
    legs: patas.length,
    packVoltage,
    powerW: packVoltage * (bms.corriente / 1000),
    cellMin,
    cellMax,
    cellDeltaMv: cellMin === null ? null : Math.round((cellMax - cellMin) * 1000),
    tilt: Math.max(Math.abs(imu.roll), Math.abs(imu.pitch)),
  };
}

/* ------------------------------------------------------------------ */
/* Nombres legibles                                                    */
/* ------------------------------------------------------------------ */

export const LEG_LABELS = Object.freeze({
  FR: "Delantera derecha",
  FL: "Delantera izquierda",
  RR: "Trasera derecha",
  RL: "Trasera izquierda",
  R_foot: "Pie derecho",
  L_foot: "Pie izquierdo",
});

const JOINT_LABELS = {
  hip: "cadera",
  thigh: "muslo",
  calf: "pantorrilla",
  knee: "rodilla",
  ankle: "tobillo",
  shoulder: "hombro",
  elbow: "codo",
  wrist: "muñeca",
  torso: "torso",
  yaw: "guiñada",
  roll: "alabeo",
  pitch: "cabeceo",
};

/** "FR_calf" → "pantorrilla" ; "L_shoulder_pitch" → "hombro · cabeceo" */
export function jointLabel(nombre) {
  const parts = nombre.split("_").filter((p) => !["FR", "FL", "RR", "RL", "L", "R"].includes(p));
  return parts.map((p) => JOINT_LABELS[p] ?? p).join(" · ");
}

/** Grupo anatómico de un motor, para agrupar filas de la tabla. */
export function motorGroup(nombre) {
  const [prefix, joint] = nombre.split("_");
  if (["FR", "FL", "RR", "RL"].includes(prefix)) return { key: prefix, label: `${prefix} · ${LEG_LABELS[prefix]}` };
  if (prefix === "torso") return { key: "torso", label: "Torso" };
  const side = prefix === "L" ? "izquierdo" : prefix === "R" ? "derecho" : null;
  if (!side) return { key: "otros", label: "Otros" };
  const isArm = ["shoulder", "elbow", "wrist"].includes(joint);
  return isArm
    ? { key: `${prefix}_brazo`, label: `Brazo ${side}` }
    : { key: `${prefix}_pierna`, label: `Pierna ${side === "izquierdo" ? "izquierda" : "derecha"}` };
}
