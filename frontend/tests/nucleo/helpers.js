// Ayudantes compartidos de las pruebas del núcleo (core, services, config).
import { vi } from "vitest";
import { ROBOTS } from "../../js/core/paseoSim.js";

/** Un motor crudo como lo manda el backend. */
export const motor = (nombre, extra = {}) => ({
  id: 0,
  nombre,
  angulo: 10,
  velocidad: 0.1,
  torque: 2,
  temperatura: 30,
  ...extra,
});

/**
 * Muestra cruda de /telemetria para Go2 (12 motores) o G1 (29 motores).
 * `motores` permite pisar campos por nombre: { FR_calf: { temperatura: 61 } }.
 */
export function rawFrame(modelo = "go2", { motores = {}, bms = {}, imu = {}, ts = 1.5 } = {}) {
  const cfg = ROBOTS[modelo];
  return {
    modelo,
    ts,
    motores: cfg.motores_nombres.map((n, i) => ({ ...motor(n), id: i, ...motores[n] })),
    imu: { roll: 1, pitch: -2, yaw: 3, ax: 0.1, ay: 0.2, az: 9.8, ...imu },
    bms: { soc: 80, corriente: 1500, temperatura: 30, celdas: [3.9, 3.95, 4.0], ...bms },
    fuerzas: Object.fromEntries(cfg.patas.map((p) => [p, 1])),
  };
}

/** Respuesta de fetch con forma mínima. */
export const respuesta = (body, { status = 200, statusText = "OK", json } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  json: json ?? (async () => body),
});

/**
 * WebSocket controlable: cada instancia queda en `FakeWebSocket.instances` y la
 * prueba dispara a mano `open()`, `message(data)` y `serverClose(code)`.
 */
export class FakeWebSocket {
  static instances = [];
  static last() {
    return FakeWebSocket.instances.at(-1);
  }

  constructor(url) {
    this.url = url;
    this.close = vi.fn();
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  message(data) {
    this.onmessage?.({ data });
  }

  serverClose(code = 1006) {
    this.onclose?.({ code });
  }
}
