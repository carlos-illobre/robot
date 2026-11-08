/**
 * Exportación CSV de las muestras capturadas.
 *
 * Formato "ancho": una fila por muestra y una columna por variable, que es lo
 * que esperan Excel, LibreOffice, pandas o MATLAB. Las columnas se generan a
 * partir de los datos (12 motores para Go2, 29 para G1; N celdas de batería).
 */

/** Escapa un campo según RFC 4180: comillas si contiene separador, comillas o saltos. */
export function escapeCsv(value, sep = ",") {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r")
    ? `"${s.replaceAll('"', '""')}"`
    : s;
}

/** Arma las columnas a partir de todas las muestras (unión de motores, celdas y patas). */
export function buildColumns(samples) {
  const motors = [];
  const seenMotors = new Set();
  const legs = [];
  let maxCells = 0;

  for (const { frame } of samples) {
    for (const m of frame.motores) {
      if (!seenMotors.has(m.nombre)) {
        seenMotors.add(m.nombre);
        motors.push(m.nombre);
      }
    }
    for (const pata of Object.keys(frame.fuerzas)) if (!legs.includes(pata)) legs.push(pata);
    maxCells = Math.max(maxCells, frame.bms.celdas.length);
  }

  const cols = [
    { header: "captura", get: (s) => s.n },
    { header: "tipo", get: (s) => s.tipo },
    { header: "fecha_hora_iso", get: (s) => s.capturedAt.toISOString() },
    { header: "ts_servidor_s", get: (s) => s.frame.ts, numeric: true },
    { header: "modelo", get: (s) => s.frame.modelo },
    { header: "imu_roll_deg", get: (s) => s.frame.imu.roll, numeric: true },
    { header: "imu_pitch_deg", get: (s) => s.frame.imu.pitch, numeric: true },
    { header: "imu_yaw_deg", get: (s) => s.frame.imu.yaw, numeric: true },
    { header: "imu_ax_ms2", get: (s) => s.frame.imu.ax, numeric: true },
    { header: "imu_ay_ms2", get: (s) => s.frame.imu.ay, numeric: true },
    { header: "imu_az_ms2", get: (s) => s.frame.imu.az, numeric: true },
    { header: "bms_soc_pct", get: (s) => s.frame.bms.soc, numeric: true },
    { header: "bms_corriente_mA", get: (s) => s.frame.bms.corriente, numeric: true },
    { header: "bms_temperatura_C", get: (s) => s.frame.bms.temperatura, numeric: true },
  ];
  for (let i = 0; i < maxCells; i++) {
    cols.push({ header: `bms_celda_${i + 1}_V`, get: (s) => s.frame.bms.celdas[i], numeric: true });
  }
  for (const pata of legs) {
    cols.push({ header: `pata_${pata}_contacto`, get: (s) => s.frame.fuerzas[pata], numeric: true });
  }
  const fields = [
    ["angulo", "deg"],
    ["velocidad", "rads"],
    ["torque", "Nm"],
    ["temperatura", "C"],
  ];
  for (const nombre of motors) {
    for (const [field, unit] of fields) {
      cols.push({
        header: `${nombre}_${field}_${unit}`,
        get: (s) => s.frame.motores.find((m) => m.nombre === nombre)?.[field],
        numeric: true,
      });
    }
  }
  return cols;
}

/**
 * Genera el texto CSV.
 * @param {Array} samples muestras de CaptureStore
 * @param {{excel?: boolean}} opts excel=true usa ";" y coma decimal (Excel en español)
 */
export function toCsv(samples, { excel = false } = {}) {
  const sep = excel ? ";" : ",";
  const cols = buildColumns(samples);
  const fmt = (value, numeric) => {
    if (numeric && excel && typeof value === "number") return String(value).replace(".", ",");
    return value;
  };
  const lines = [cols.map((c) => escapeCsv(c.header, sep)).join(sep)];
  for (const s of samples) {
    lines.push(cols.map((c) => escapeCsv(fmt(c.get(s), c.numeric), sep)).join(sep));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Nombre de archivo con fecha local: telemetria_go2_2026-10-29_17-30-05.csv */
export function csvFilename(modelo, date = new Date(), ext = "csv") {
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
  return `telemetria_${modelo}_${stamp}.${ext}`;
}

/** Dispara la descarga en el navegador. El BOM hace que Excel lea bien los acentos. */
export function downloadText(text, filename, mime = "text/csv;charset=utf-8") {
  const bom = mime.startsWith("text/csv") ? "﻿" : "";
  const blob = new Blob([bom + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
