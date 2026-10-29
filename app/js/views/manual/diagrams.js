/**
 * Diagramas del manual en SVG. Usan variables CSS (--m-ink, --m-muted,
 * --m-accent, --sem-*) para verse bien en tema claro y oscuro.
 */

const T = (x, y, text, extra = "") => `<text x="${x}" y="${y}" ${extra}>${text}</text>`;

/** Pata del Go2 de costado: cadera, muslo, pantorrilla, pie. */
export const LEG = `
<svg viewBox="0 0 520 260" role="img" aria-label="Pata del Go2 con sus tres articulaciones">
  <rect x="40" y="40" width="300" height="56" rx="20" class="d-body"/>
  ${T(190, 74, "cuerpo", 'text-anchor="middle" class="d-label"')}
  <line x1="290" y1="96" x2="350" y2="170" class="d-bone"/>
  <line x1="350" y1="170" x2="300" y2="236" class="d-bone"/>
  <circle cx="290" cy="96" r="13" class="d-joint"/>
  <circle cx="350" cy="170" r="11" class="d-joint"/>
  <circle cx="300" cy="238" r="9" class="d-foot"/>
  <path d="M262 82 a30 30 0 0 1 0 28" class="d-arrow"/>
  <path d="M372 150 a26 26 0 0 1 4 30" class="d-arrow"/>
  ${T(390, 92, "hip · cadera", 'class="d-strong"')}
  ${T(390, 110, "abre la pata al costado", 'class="d-label"')}
  ${T(390, 166, "thigh · muslo", 'class="d-strong"')}
  ${T(390, 184, "adelante y atrás", 'class="d-label"')}
  ${T(330, 232, "calf · pantorrilla", 'class="d-strong"')}
  ${T(330, 250, "dobla la rodilla", 'class="d-label"')}
  ${T(60, 160, "Cada pata: FR, FL, RR, RL", 'class="d-strong"')}
  ${T(60, 180, "× 3 articulaciones = 12 motores", 'class="d-label"')}
</svg>`;

/** Roll, pitch y yaw en tres viñetas. */
export const RPY = `
<svg viewBox="0 0 660 230" role="img" aria-label="Roll, pitch y yaw">
  <g transform="translate(110 105)">
    <g transform="rotate(-14)">
      <rect x="-60" y="-18" width="120" height="36" rx="14" class="d-body"/>
      <line x1="-44" y1="18" x2="-44" y2="58" class="d-bone"/><line x1="44" y1="18" x2="44" y2="58" class="d-bone"/>
    </g>
    <line x1="-90" y1="0" x2="90" y2="0" class="d-axis" stroke-dasharray="4 5"/>
    <path d="M70 -46 a80 80 0 0 1 22 30" class="d-arrow"/>
    ${T(0, 104, "ROLL", 'text-anchor="middle" class="d-title"')}
    ${T(0, 122, "visto de frente: se inclina al costado", 'text-anchor="middle" class="d-label"')}
  </g>
  <g transform="translate(330 105)">
    <g transform="rotate(-10)">
      <rect x="-70" y="-16" width="140" height="32" rx="12" class="d-body"/>
      <circle cx="58" cy="-2" r="4" class="d-eye"/>
      <line x1="-50" y1="16" x2="-56" y2="58" class="d-bone"/><line x1="50" y1="16" x2="44" y2="58" class="d-bone"/>
    </g>
    <path d="M86 -40 a70 70 0 0 1 10 34" class="d-arrow"/>
    ${T(0, 104, "PITCH", 'text-anchor="middle" class="d-title"')}
    ${T(0, 122, "de costado: sube o baja la cabeza", 'text-anchor="middle" class="d-label"')}
  </g>
  <g transform="translate(550 95)">
    <circle r="66" class="d-ring"/>
    ${T(0, -72, "N", 'text-anchor="middle" class="d-label"')}
    <g transform="rotate(35)">
      <rect x="-18" y="-42" width="36" height="84" rx="14" class="d-body"/>
      <circle cx="0" cy="-34" r="4" class="d-eye"/>
      <line x1="0" y1="-42" x2="0" y2="-62" class="d-accent-line"/>
    </g>
    <path d="M-30 -56 a64 64 0 0 1 46 -8" class="d-arrow"/>
    ${T(0, 114, "YAW", 'text-anchor="middle" class="d-title"')}
    ${T(0, 132, "desde arriba: hacia dónde mira", 'text-anchor="middle" class="d-label"')}
  </g>
</svg>`;

/** Escala de temperatura con las tres zonas del semáforo. */
export const SEMAFORO = (() => {
  const x = (c) => 30 + ((c - 20) / 60) * 600;
  return `
<svg viewBox="0 0 660 120" role="img" aria-label="Semáforo de temperatura">
  <rect x="${x(20)}" y="36" width="${x(40) - x(20)}" height="22" rx="6" fill="var(--sem-ok)"/>
  <rect x="${x(40)}" y="36" width="${x(60) - x(40)}" height="22" fill="var(--sem-warn)"/>
  <rect x="${x(60)}" y="36" width="${x(80) - x(60)}" height="22" rx="6" fill="var(--sem-crit)"/>
  ${[20, 30, 40, 50, 60, 70, 80].map((c) => `<line x1="${x(c)}" y1="58" x2="${x(c)}" y2="66" class="d-axis"/>${T(x(c), 82, `${c} °C`, 'text-anchor="middle" class="d-label"')}`).join("")}
  ${T((x(20) + x(40)) / 2, 26, "VERDE · menos de 40 °C", 'text-anchor="middle" class="d-strong"')}
  ${T((x(40) + x(60)) / 2, 26, "AMARILLO · 40 a 60 °C", 'text-anchor="middle" class="d-strong"')}
  ${T((x(60) + x(80)) / 2, 26, "ROJO · más de 60 °C", 'text-anchor="middle" class="d-strong"')}
  ${T((x(20) + x(40)) / 2, 106, "normal", 'text-anchor="middle" class="d-label"')}
  ${T((x(40) + x(60)) / 2, 106, "trabajando, vigilar", 'text-anchor="middle" class="d-label"')}
  ${T((x(60) + x(80)) / 2, 106, "frenar para que enfríe", 'text-anchor="middle" class="d-label"')}
</svg>`;
})();

/** Celdas de batería con una desbalanceada. */
export const CELLS = (() => {
  const v = [4.06, 4.05, 4.06, 4.05, 4.06, 4.01, 4.05, 4.06];
  const y = (volt) => 150 - ((volt - 3.9) / 0.2) * 120;
  return `
<svg viewBox="0 0 520 200" role="img" aria-label="Voltajes de celdas">
  ${v.map((volt, i) => `<rect x="${40 + i * 52}" y="${y(volt)}" width="34" height="${150 - y(volt)}" rx="5" fill="${volt < 4.03 ? "var(--sem-warn)" : "var(--m-muted)"}" opacity="${volt < 4.03 ? 1 : 0.55}"/>${T(57 + i * 52, 170, volt.toFixed(2), 'text-anchor="middle" class="d-label"')}`).join("")}
  <line x1="30" y1="${y(4.06)}" x2="460" y2="${y(4.06)}" class="d-axis" stroke-dasharray="3 4"/>
  <line x1="30" y1="${y(4.01)}" x2="460" y2="${y(4.01)}" class="d-axis" stroke-dasharray="3 4"/>
  <line x1="480" y1="${y(4.06)}" x2="480" y2="${y(4.01)}" class="d-accent-line"/>
  ${T(488, (y(4.06) + y(4.01)) / 2 + 4, "Δ 50 mV", 'class="d-strong"')}
  ${T(40, 192, "8 celdas en serie · V", 'class="d-label"')}
</svg>`;
})();

/** Diagrama de marcha del trote. */
export const GAIT = (() => {
  const legs = [["FR", 0], ["FL", 1], ["RR", 1], ["RL", 0]];
  const cell = 26;
  const cols = 20;
  let bars = "";
  legs.forEach(([name, phase], r) => {
    bars += T(30, 54 + r * 34, name, 'text-anchor="end" class="d-strong"');
    for (let c = 0; c < cols; c++) {
      const stance = Math.floor(c / 3) % 2 === phase;
      bars += `<rect x="${44 + c * cell}" y="${38 + r * 34}" width="${cell - 4}" height="22" rx="4" ${stance ? 'fill="var(--m-accent)"' : 'class="d-empty"'}/>`;
    }
  });
  return `
<svg viewBox="0 0 580 200" role="img" aria-label="Diagrama de marcha al trote">
  ${T(44, 24, "tiempo →", 'class="d-label"')}
  ${bars}
  ${T(44, 192, "■ apoyada   □ en el aire   ·   FR + RL juntas, FL + RR juntas", 'class="d-label"')}
</svg>`;
})();
