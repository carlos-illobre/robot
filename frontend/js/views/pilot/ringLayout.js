/**
 * Geometría del anillo de motores (funciones puras, sin DOM, testeables).
 *
 * Convenciones: ángulos en grados, 0° a la derecha y sentido horario (el de
 * SVG, con la Y hacia abajo). El robot se dibuja visto desde ARRIBA (Go2) o
 * desde ATRÁS (G1): en los dos casos su izquierda queda a la izquierda de la
 * pantalla y su frente hacia arriba, igual que la cinta de rumbo. Así el
 * anillo, la silueta y el rumbo cuentan la misma historia.
 */
import { motorGroup } from "../../core/telemetryModel.js";

/** Radio del anillo en unidades del SVG: todo lo demás se mide desde acá. */
export const RING_R = 180;

/** Separación (°) entre grupos, para que cada pata o miembro se lea como un bloque. */
const GROUP_GAP = 6;

/**
 * Orden de los grupos alrededor del anillo, en sentido horario desde arriba.
 * `reverse` invierte el orden de los motores del grupo para que la
 * articulación más cercana al cuerpo (cadera, hombro) quede siempre del lado
 * del eje del robot y la más lejana (pantorrilla, muñeca) hacia afuera.
 */
const PLANS = {
  cuadrupedo: { order: ["FR", "RR", "RL", "FL"], reverse: ["RR", "FL"], centerFirst: false },
  humanoide: { order: ["torso", "R_brazo", "R_pierna", "L_pierna", "L_brazo"], reverse: ["L_pierna", "L_brazo"], centerFirst: true },
};

/** Ángulo de cada pata o pie alrededor del anillo (diagonales en el Go2, abajo en el G1). */
const FOOT_ANGLE = { FR: -45, FL: -135, RR: 45, RL: 135, R_foot: 72, L_foot: 108 };
const FOOT_LABEL = { R_foot: "PIE D", L_foot: "PIE I" };

/** Rótulos cortos de los grupos del humanoide (los del Go2 son las patas). */
const GROUP_SHORT = { torso: "TORSO", R_brazo: "BRAZO D", L_brazo: "BRAZO I", R_pierna: "PIERNA D", L_pierna: "PIERNA I" };

/**
 * Reparte los motores en segmentos del anillo, agrupados por `motorGroup`.
 * Nada está fijo en 12 o 29: todo sale de la lista de nombres de `/info`.
 *
 * @param {string[]} names  `info.motores_nombres`
 * @returns {{ kind: "cuadrupedo"|"humanoide", segments: object[], groups: object[] }}
 */
export function layoutRing(names) {
  const groups = new Map();
  for (const name of names) {
    const { key, label } = motorGroup(name);
    if (!groups.has(key)) groups.set(key, { key, label, short: GROUP_SHORT[key] ?? key.toUpperCase(), names: [] });
    groups.get(key).names.push(name);
  }

  const kind = PLANS.cuadrupedo.order.some((k) => groups.has(k)) ? "cuadrupedo" : "humanoide";
  const plan = PLANS[kind];
  // Primero los grupos conocidos en su lugar; si aparece uno desconocido, va al final.
  const keys = [...plan.order.filter((k) => groups.has(k)), ...[...groups.keys()].filter((k) => !plan.order.includes(k))];
  const ordered = keys.map((k) => groups.get(k));

  const total = Math.max(1, names.length);
  const step = (360 - GROUP_GAP * ordered.length) / total;
  const pad = Math.min(1.5, step * 0.12);
  // Con `centerFirst` el primer grupo (el torso) queda centrado arriba; si no, la
  // primera separación cae justo arriba (entre FL y FR).
  let cursor = plan.centerFirst ? -90 - (ordered[0]?.names.length ?? 0) * step / 2 : -90 + GROUP_GAP / 2;

  const segments = [];
  const groupArcs = [];
  for (const g of ordered) {
    const list = plan.reverse.includes(g.key) ? [...g.names].reverse() : g.names;
    const start = cursor;
    list.forEach((name, i) => {
      const a0 = start + i * step + pad;
      const a1 = start + (i + 1) * step - pad;
      segments.push({ name, group: g.key, a0, a1, mid: (a0 + a1) / 2 });
    });
    cursor += list.length * step;
    groupArcs.push({ key: g.key, label: g.label, short: g.short, a0: start, a1: cursor, mid: (start + cursor) / 2 });
    cursor += GROUP_GAP;
  }
  return { kind, segments, groups: groupArcs };
}

/**
 * Ubica las patas (Go2) o los pies (G1) alrededor del anillo.
 * Si llegara una pata desconocida, se reparten abajo para no perderla.
 * @param {string[]} legs `info.patas`
 */
export function layoutFeet(legs) {
  const unknown = legs.filter((l) => !(l in FOOT_ANGLE));
  return legs.map((leg) => ({
    leg,
    label: FOOT_LABEL[leg] ?? leg,
    angle: FOOT_ANGLE[leg] ?? 90 + (unknown.indexOf(leg) - (unknown.length - 1) / 2) * 24,
  }));
}

/** Punto en coordenadas polares (grados) → [x, y] del SVG. */
export function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

/** Atributo `d` de un arco de circunferencia entre dos ángulos (horario). */
export function arcPath(r, a0, a1) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
