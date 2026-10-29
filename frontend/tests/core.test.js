// Pruebas del núcleo del frontend. Correr con:  npm test   (Node 18+, sin dependencias)
import { test } from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../js/core/EventBus.js";
import { RingBuffer } from "../js/core/RingBuffer.js";
import { normalizeFrame, tempLevel, socLevel, motorGroup, jointLabel } from "../js/core/telemetryModel.js";
import { CaptureStore } from "../js/core/CaptureStore.js";
import { toCsv, escapeCsv, csvFilename } from "../js/core/csv.js";
import { evaluateAlerts, AlertTracker } from "../js/core/alerts.js";
import { WebSocketTransport } from "../js/services/WebSocketTransport.js";
import { ApiClient } from "../js/services/ApiClient.js";

// Ejemplo literal de docs/API.md
const RAW = {
  modelo: "go2",
  ts: 16.24,
  motores: [{ id: 0, nombre: "FR_hip", angulo: 45.84, velocidad: -0.218, torque: 1.31, temperatura: 30.0 }],
  imu: { roll: -1.39, pitch: -1.06, yaw: 78.2, ax: -0.043, ay: -0.012, az: 9.79 },
  bms: { soc: 86, corriente: 0, temperatura: 0.0, celdas: [] },
  fuerzas: { FR: 1, FL: 0, RR: 0, RL: 1 },
};

test("semáforo de temperatura igual a electroSim (<40 verde, 40-60 amarillo, >60 rojo)", () => {
  assert.equal(tempLevel(39.9), "ok");
  assert.equal(tempLevel(40), "warn");
  assert.equal(tempLevel(60), "warn");
  assert.equal(tempLevel(60.1), "crit");
  assert.equal(tempLevel(Number.NaN), "unknown");
  assert.equal(socLevel(15), "crit");
  assert.equal(socLevel(35), "warn");
  assert.equal(socLevel(87), "ok");
});

test("normalizeFrame acepta el JSON del contrato y calcula derivados", () => {
  const f = normalizeFrame(RAW, 1000);
  assert.equal(f.modelo, "go2");
  assert.equal(f.motores[0].nombre, "FR_hip");
  assert.equal(f.derived.contacts, 2);
  assert.equal(f.derived.legs, 4);
  assert.equal(f.derived.tempMax.motor, "FR_hip");
  assert.equal(f.derived.cellDeltaMv, null);
  assert.equal(f.receivedAt, 1000);
});

test("normalizeFrame tolera campos faltantes o con tipos raros", () => {
  const f = normalizeFrame({ modelo: "g1", motores: [{ nombre: "L_knee", temperatura: "45.5" }], bms: { celdas: [4.01, "x"] } });
  assert.equal(f.motores[0].temperatura, 45.5);
  assert.equal(f.motores[0].angulo, 0);
  assert.deepEqual(f.bms.celdas, [4.01, 0]);
  assert.deepEqual(f.fuerzas, {});
  assert.throws(() => normalizeFrame(null));
});

test("grupos anatómicos y nombres legibles", () => {
  assert.equal(motorGroup("FR_calf").key, "FR");
  assert.equal(motorGroup("L_shoulder_pitch").label, "Brazo izquierdo");
  assert.equal(motorGroup("R_knee").label, "Pierna derecha");
  assert.equal(motorGroup("torso_yaw").label, "Torso");
  assert.equal(jointLabel("FR_calf"), "pantorrilla");
  assert.equal(jointLabel("L_shoulder_pitch"), "hombro · cabeceo");
});

test("RingBuffer descarta lo más viejo y mantiene el orden", () => {
  const rb = new RingBuffer(3);
  [1, 2, 3, 4, 5].forEach((n) => rb.push(n));
  assert.equal(rb.size, 3);
  assert.deepEqual(rb.tail(), [3, 4, 5]);
  assert.deepEqual(rb.tail(2), [4, 5]);
  assert.equal(rb.last(), 5);
  assert.equal(rb.at(0), 3);
  rb.clear();
  assert.equal(rb.size, 0);
  assert.throws(() => new RingBuffer(0));
});

test("EventBus notifica, desuscribe y aísla errores", () => {
  const bus = new EventBus();
  const got = [];
  const off = bus.on("frame", (x) => got.push(x));
  bus.on("frame", () => { throw new Error("boom"); });
  const origError = console.error;
  console.error = () => {};
  bus.emit("frame", 1);
  off();
  bus.emit("frame", 2);
  console.error = origError;
  assert.deepEqual(got, [1]);
});

test("CSV: una fila por captura, columnas por motor, escapado RFC 4180", () => {
  const store = new CaptureStore();
  const f = normalizeFrame({ ...RAW, bms: { ...RAW.bms, celdas: [4.05, 4.06] } }, Date.UTC(2026, 9, 29, 12));
  store.add(f, "manual");
  store.add(f, "continua");
  const csv = toCsv(store.samples);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 3);
  const header = lines[0].split(",");
  assert.ok(header.includes("FR_hip_temperatura_C"));
  assert.ok(header.includes("bms_celda_2_V"));
  assert.ok(header.includes("pata_RL_contacto"));
  assert.ok(lines[1].includes("2026-10-29T12:00:00.000Z"));
  assert.equal(escapeCsv('a,"b"'), '"a,""b"""');
  const excel = toCsv(store.samples, { excel: true });
  assert.ok(excel.split("\r\n")[1].includes("16,24"));
  assert.match(csvFilename("go2", new Date(2026, 0, 2, 3, 4, 5)), /^telemetria_go2_2026-01-02_03-04-05\.csv$/);
});

test("CaptureStore copia la muestra (no queda ligada al objeto original)", () => {
  const store = new CaptureStore({ maxSamples: 1 });
  const f = normalizeFrame(RAW);
  store.add(f);
  f.imu.roll = 999;
  assert.equal(store.samples[0].frame.imu.roll, -1.39);
  assert.equal(store.add(f), null); // tope alcanzado
});

test("alarmas: solo se informan los cambios", () => {
  const hot = normalizeFrame({ ...RAW, motores: [{ ...RAW.motores[0], temperatura: 61, torque: 25 }] });
  const cool = normalizeFrame(RAW);
  const alerts = evaluateAlerts(hot, { torqueAlarm: 18 });
  assert.deepEqual(alerts.map((a) => a.key).sort(), ["tau:FR_hip", "temp:FR_hip"]);
  const tracker = new AlertTracker();
  assert.equal(tracker.update(alerts).raised.length, 2);
  assert.equal(tracker.update(evaluateAlerts(hot)).raised.length, 0);
  assert.equal(tracker.update(evaluateAlerts(cool)).cleared.length, 2);
});

test("reconexión WebSocket con backoff exponencial acotado", () => {
  const mid = () => 0.5; // sin jitter
  assert.equal(WebSocketTransport.backoffDelay(0, 500, 8000, mid), 500);
  assert.equal(WebSocketTransport.backoffDelay(1, 500, 8000, mid), 1000);
  assert.equal(WebSocketTransport.backoffDelay(3, 500, 8000, mid), 4000);
  assert.equal(WebSocketTransport.backoffDelay(10, 500, 8000, mid), 8000);
});

test("URLs del servidor", () => {
  assert.equal(ApiClient.normalizeBaseUrl("10.0.0.5:8001/"), "http://10.0.0.5:8001");
  assert.equal(ApiClient.toWebSocketUrl("http://10.0.0.5:8001"), "ws://10.0.0.5:8001/ws");
  assert.equal(ApiClient.toWebSocketUrl("https://robot.lab"), "wss://robot.lab/ws");
});

test("alarmas con histéresis: no titilan si la temperatura oscila alrededor de 60 °C", () => {
  const at = (temp) => normalizeFrame({ ...RAW, motores: [{ ...RAW.motores[0], temperatura: temp }] });
  const tracker = new AlertTracker();
  const step = (temp) => tracker.update(evaluateAlerts(at(temp), {}, tracker.keys));
  assert.equal(step(60.5).raised.length, 1, "se activa al pasar 60 °C");
  assert.equal(step(59.6).cleared.length, 0, "a 59,6 °C sigue activa (no titila)");
  assert.equal(step(60.4).raised.length, 0, "no se vuelve a avisar");
  assert.equal(step(57.9).cleared.length, 1, "se normaliza recién por debajo de 58 °C");
});
