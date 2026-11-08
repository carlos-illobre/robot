/**
 * Transporte "simulado": genera la telemetría en el propio navegador con
 * PaseoSim, sin servidor. Implementa la misma interfaz que WebSocketTransport
 * y PollingTransport (Strategy), así que el resto del dashboard no se entera.
 *
 * Se activa con  ?server=demo  (o ?server=demo-g1), y es lo que usa la
 * versión publicada en GitHub Pages.
 */
import { PaseoSim } from "../core/paseoSim.js";

export const isSimUrl = (url) => /^demo(-g1|-go2)?$/i.test(String(url ?? "").trim());
export const simModel = (url) => (/g1$/i.test(String(url)) ? "g1" : "go2");

export class SimTransport {
  name = "sim";
  label = "Simulador local";
  #timer = null;
  #last = 0;

  constructor({ baseUrl, onData, onState, rateHz = 10, warmupS = 25 }) {
    this.sim = new PaseoSim(simModel(baseUrl));
    // Arranca ya "caminando un rato" para que no se vea todo frío y quieto.
    this.sim.advance(warmupS);
    this.onData = onData;
    this.onState = onState;
    this.periodMs = 1000 / rateHz;
  }

  info() {
    return this.sim.info();
  }

  start() {
    this.onState("connecting", "simulador en el navegador");
    this.#last = performance.now();
    this.#timer = setInterval(() => {
      const now = performance.now();
      this.sim.advance(Math.min(0.5, (now - this.#last) / 1000));
      this.#last = now;
      this.onState("live");
      this.onData(this.sim.telemetria());
    }, this.periodMs);
  }

  stop() {
    clearInterval(this.#timer);
  }
}
