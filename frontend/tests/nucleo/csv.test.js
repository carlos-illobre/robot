// Exportación CSV: escape RFC 4180, columnas dinámicas, formato Excel y descarga.
import { describe, it, expect, vi, afterEach } from "vitest";
import { escapeCsv, buildColumns, toCsv, csvFilename, downloadText } from "../../js/core/csv.js";
import { CaptureStore } from "../../js/core/CaptureStore.js";
import { normalizeFrame } from "../../js/core/telemetryModel.js";
import { rawFrame } from "./helpers.js";

const BASE_HEADERS = [
  "captura", "tipo", "fecha_hora_iso", "ts_servidor_s", "modelo",
  "imu_roll_deg", "imu_pitch_deg", "imu_yaw_deg", "imu_ax_ms2", "imu_ay_ms2", "imu_az_ms2",
  "bms_soc_pct", "bms_corriente_mA", "bms_temperatura_C",
];

/** Una captura chiquita y controlada. */
const muestra = (n, frame, tipo = "manual", iso = "2026-10-29T17:30:05.000Z") => ({ n, tipo, capturedAt: new Date(iso), frame });
const frameMini = ({ motores = [], celdas = [], fuerzas = {}, modelo = "go2" } = {}) => ({
  modelo,
  ts: 1.5,
  imu: { roll: 1.25, pitch: -2, yaw: 3, ax: 0.1, ay: 0.2, az: 9.8 },
  bms: { soc: 80, corriente: -1500, temperatura: 30.5, celdas },
  fuerzas,
  motores,
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("escapeCsv", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    [0, "0"],
    [false, "false"],
    ["simple", "simple"],
    ["a,b", '"a,b"'],
    ['dijo "hola"', '"dijo ""hola"""'],
    ["dos\nlíneas", '"dos\nlíneas"'],
    ["retorno\rcarro", '"retorno\rcarro"'],
    ["a;b", "a;b"],
  ])("%j → %j", (v, esperado) => {
    expect(escapeCsv(v)).toBe(esperado);
  });

  it("con separador ';' pone comillas al ';' pero no a la coma", () => {
    expect(escapeCsv("a;b", ";")).toBe('"a;b"');
    expect(escapeCsv("1,5", ";")).toBe("1,5");
  });
});

describe("buildColumns", () => {
  it("sin muestras solo trae las columnas fijas", () => {
    expect(buildColumns([]).map((c) => c.header)).toEqual(BASE_HEADERS);
  });

  it("marca como numéricas las columnas de mediciones y no las de texto", () => {
    const numeric = Object.fromEntries(buildColumns([]).map((c) => [c.header, Boolean(c.numeric)]));
    expect(numeric).toMatchObject({ captura: false, tipo: false, fecha_hora_iso: false, modelo: false, ts_servidor_s: true, bms_soc_pct: true });
  });

  it("une motores, celdas y patas de todas las muestras sin repetir", () => {
    const s1 = muestra(1, frameMini({ motores: [{ nombre: "FR_hip" }], celdas: [3.9], fuerzas: { FR: 1 } }));
    const s2 = muestra(2, frameMini({ motores: [{ nombre: "FR_hip" }, { nombre: "FL_hip" }], celdas: [3.9, 4, 4.1], fuerzas: { FR: 0, FL: 1 } }));
    const headers = buildColumns([s1, s2]).map((c) => c.header);
    expect(headers.slice(BASE_HEADERS.length)).toEqual([
      "bms_celda_1_V", "bms_celda_2_V", "bms_celda_3_V",
      "pata_FR_contacto", "pata_FL_contacto",
      "FR_hip_angulo_deg", "FR_hip_velocidad_rads", "FR_hip_torque_Nm", "FR_hip_temperatura_C",
      "FL_hip_angulo_deg", "FL_hip_velocidad_rads", "FL_hip_torque_Nm", "FL_hip_temperatura_C",
    ]);
  });

  it.each([
    ["go2", 12, 4],
    ["g1", 29, 2],
  ])("un %s da %i motores × 4 columnas y %i patas", (modelo, n, patas) => {
    const s = muestra(1, normalizeFrame(rawFrame(modelo)));
    expect(buildColumns([s])).toHaveLength(BASE_HEADERS.length + 3 + patas + n * 4);
  });
});

describe("toCsv", () => {
  const s1 = muestra(1, frameMini({ motores: [{ nombre: "FR_hip", angulo: 45.5, velocidad: -0.25, torque: 1.5, temperatura: 31 }], celdas: [3.95], fuerzas: { FR: 1 } }));
  const s2 = muestra(2, frameMini({ motores: [], celdas: [], fuerzas: {} }), "continua, auto", "2026-10-29T17:30:06.000Z");

  it("genera encabezado y filas con CRLF, dejando vacíos los datos que faltan", () => {
    const csv = toCsv([s1, s2]);
    const lineas = csv.split("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lineas).toHaveLength(4); // encabezado + 2 filas + "" final
    expect(lineas[0]).toBe(
      [...BASE_HEADERS, "bms_celda_1_V", "pata_FR_contacto", "FR_hip_angulo_deg", "FR_hip_velocidad_rads", "FR_hip_torque_Nm", "FR_hip_temperatura_C"].join(","),
    );
    expect(lineas[1]).toBe("1,manual,2026-10-29T17:30:05.000Z,1.5,go2,1.25,-2,3,0.1,0.2,9.8,80,-1500,30.5,3.95,1,45.5,-0.25,1.5,31");
    expect(lineas[2]).toBe('2,"continua, auto",2026-10-29T17:30:06.000Z,1.5,go2,1.25,-2,3,0.1,0.2,9.8,80,-1500,30.5,,,,,,');
    expect(lineas[3]).toBe("");
  });

  it("en modo Excel usa ';' y coma decimal solo en los números", () => {
    const lineas = toCsv([s1], { excel: true }).split("\r\n");
    expect(lineas[0].split(";")[0]).toBe("captura");
    expect(lineas[1]).toBe("1;manual;2026-10-29T17:30:05.000Z;1,5;go2;1,25;-2;3;0,1;0,2;9,8;80;-1500;30,5;3,95;1;45,5;-0,25;1,5;31");
  });

  it("en modo Excel no toca los textos con punto", () => {
    const s = muestra(1, frameMini({ modelo: "go2.v2" }), "a.b");
    const fila = toCsv([s], { excel: true }).split("\r\n")[1].split(";");
    expect(fila[1]).toBe("a.b");
    expect(fila[4]).toBe("go2.v2");
  });

  it("funciona con muestras reales de CaptureStore", () => {
    const store = new CaptureStore();
    store.add(normalizeFrame(rawFrame("go2"), Date.UTC(2026, 9, 29, 17, 30, 5)));
    const lineas = toCsv(store.samples).split("\r\n");
    expect(lineas[1].startsWith("1,manual,2026-10-29T17:30:05.000Z,1.5,go2,")).toBe(true);
  });

  it("sin muestras devuelve solo el encabezado", () => {
    expect(toCsv([])).toBe(BASE_HEADERS.join(",") + "\r\n");
  });
});

describe("csvFilename", () => {
  it("usa la fecha local con ceros a la izquierda", () => {
    expect(csvFilename("go2", new Date(2026, 0, 5, 7, 8, 9))).toBe("telemetria_go2_2026-01-05_07-08-09.csv");
    expect(csvFilename("g1", new Date(2026, 11, 31, 23, 59, 58), "json")).toBe("telemetria_g1_2026-12-31_23-59-58.json");
  });

  it("por defecto usa la hora actual", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 29, 17, 30, 5) });
    expect(csvFilename("go2")).toBe("telemetria_go2_2026-10-29_17-30-05.csv");
  });
});

describe("downloadText", () => {
  /** Dobles de URL.createObjectURL/revokeObjectURL y del click del <a>. */
  function preparar() {
    vi.useFakeTimers();
    const blobs = [];
    const create = vi.fn((blob) => {
      blobs.push(blob);
      return "blob:fake/1";
    });
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clicks.push({ href: this.href, download: this.download, enDocumento: document.body.contains(this) });
    });
    return { blobs, create, revoke, clicks };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("descarga un CSV con BOM, hace click en un <a> temporal y libera la URL al segundo", async () => {
    const { blobs, revoke, clicks } = preparar();
    downloadText("a,b\r\n", "datos.csv");
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe("text/csv;charset=utf-8");
    const bytes = [...new Uint8Array(await blobs[0].arrayBuffer())];
    expect(bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
    expect(new TextDecoder().decode(new Uint8Array(bytes.slice(3)))).toBe("a,b\r\n");
    expect(clicks).toEqual([{ href: "blob:fake/1", download: "datos.csv", enDocumento: true }]);
    expect(document.querySelector("a")).toBeNull(); // el <a> se sacó del documento
    vi.advanceTimersByTime(999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:fake/1");
  });

  it("otros tipos (JSON) van sin BOM", async () => {
    const { blobs } = preparar();
    downloadText('{"a":1}', "datos.json", "application/json");
    expect(blobs[0].type).toBe("application/json");
    expect([...new Uint8Array(await blobs[0].arrayBuffer())]).toEqual([...new TextEncoder().encode('{"a":1}')]);
  });
});
