/**
 * Perfiles 3D de cada robot: dónde está el modelo, cómo se llaman sus
 * articulaciones en el MJCF de Unitree y qué parte del cuerpo es cada pata.
 *
 * Es el ÚNICO lugar del Gemelo 3D que conoce nombres concretos de robots: la
 * escena y la vista trabajan con lo que diga este perfil y con
 * `info.motores_nombres` (nada de "12 motores" fijos).
 */

const asset = (rel) => new URL(`../../../assets/robots/${rel}`, import.meta.url).href;

/**
 * Nombre del contrato de la API → joint del MJCF.
 * Go2: "FR_hip" → "FR_hip_joint" (mismo nombre que el SDK de Unitree).
 */
const go2Joint = (nombre) => `${nombre}_joint`;

/**
 * G1: "L_hip_pitch" → "left_hip_pitch_joint", "torso_yaw" → "waist_yaw_joint".
 * El contrato llama "torso" a lo que el MJCF de Unitree llama "waist".
 */
const g1Joint = (nombre) =>
  `${nombre.replace(/^L_/, "left_").replace(/^R_/, "right_").replace(/^torso_/, "waist_")}_joint`;

/** Paleta PBR que reemplaza los colores planos del MJCF (en MuJoCo "black" es negro absoluto). */
const GO2_MATERIALS = {
  black: { color: 0x1a1d23, roughness: 0.55, metalness: 0.15 },
  metal: { color: 0xc9ced6, roughness: 0.32, metalness: 0.75 },
  white: { color: 0xeef0f3, roughness: 0.38, metalness: 0.05 },
  gray: { color: 0x8c93a6, roughness: 0.42, metalness: 0.35 },
};

export const PROFILES = {
  go2: {
    label: "Unitree Go2",
    url: asset("go2/go2.glb"),
    jointFor: go2Joint,
    /** Pata de la telemetría → body del MJCF cuyos puntos de apoyo la representan. */
    feet: { FR: "FR_calf", FL: "FL_calf", RR: "RR_calf", RL: "RL_calf" },
    /** Geoms que se iluminan cuando la pata apoya (malla "foot" del MJCF). */
    footGeom: "foot",
    padRadius: 0.07,
    /** Pose "de pie" de robots.py de la cátedra, mientras no llega el primer dato. */
    restPose: { FR_thigh: 0.8, FL_thigh: 0.8, RR_thigh: 0.8, RL_thigh: 0.8, FR_calf: -1.55, FL_calf: -1.55, RR_calf: -1.55, RL_calf: -1.55 },
    markerRadius: () => 0.042,
    materialFor: (mjcfMaterial) => GO2_MATERIALS[mjcfMaterial],
    camera: { target: 0.2, distance: 1.35, minDistance: 0.45, maxDistance: 4 },
    /** Escala de "velocidad visual" del piso: m/s por rad/s de velocidad articular media. */
    floorSpeed: 0.45,
  },
  g1: {
    label: "Unitree G1",
    url: asset("g1/g1.glb"),
    jointFor: g1Joint,
    feet: { R_foot: "right_ankle_roll_link", L_foot: "left_ankle_roll_link" },
    footGeom: null, // se ilumina todo el eslabón del tobillo
    padRadius: 0.11,
    restPose: { L_shoulder_pitch: 0.2, R_shoulder_pitch: 0.2, L_elbow: 1.0, R_elbow: 1.0, L_shoulder_roll: 0.18, R_shoulder_roll: -0.18 },
    markerRadius: (joint) => (/wrist/.test(joint) ? 0.03 : /shoulder|elbow/.test(joint) ? 0.04 : /waist/.test(joint) ? 0.06 : 0.052),
    // Los grises del MJCF del G1 (0.2 y 0.7) se pasan a grafito y aluminio.
    materialFor: (_name, rgba) =>
      rgba && rgba[0] < 0.4
        ? { color: 0x24272e, roughness: 0.5, metalness: 0.2 }
        : { color: 0xc4c8d0, roughness: 0.36, metalness: 0.45 },
    camera: { target: 0.72, distance: 2.6, minDistance: 0.8, maxDistance: 7 },
    floorSpeed: 0.55,
  },
};

/** Perfil del modelo de `info`, o null si no hay modelo 3D para ese robot. */
export function profileFor(modelo) {
  return PROFILES[String(modelo ?? "").toLowerCase()] ?? null;
}

/**
 * Cómo se asigna cada motor de la telemetría a un joint del MJCF.
 *
 * - "nombre" (por defecto): por el NOMBRE que manda la API (`info.motores_nombres`).
 *   Es lo que dice el contrato y lo que hace el demo.
 * - "indice": por POSICIÓN, según el orden de actuadores del MJCF (que es el orden
 *   del SDK de Unitree y el que publica el simulador). Sirve para comparar: en el
 *   G1, config.py nombra las caderas yaw/roll/pitch, pero el índice 0 que publica
 *   el simulador es hip_pitch. Se activa con `?mapeo=indice` en la URL.
 */
export function mappingMode() {
  try {
    return new URLSearchParams(location.search).get("mapeo") === "indice" ? "indice" : "nombre";
  } catch {
    return "nombre";
  }
}

/**
 * Devuelve, para cada motor de `info`, el joint que mueve (o null si no existe).
 * @param {string[]} nombres  info.motores_nombres
 * @param {string[]} actuators orden de actuadores del MJCF (extras del .glb)
 */
export function mapMotors(profile, nombres, actuators, joints, mode = "nombre") {
  const known = new Set(joints);
  return nombres.map((nombre, i) => {
    const joint = mode === "indice" ? actuators[i] : profile.jointFor(nombre);
    return { index: i, nombre, joint: known.has(joint) ? joint : null };
  });
}
