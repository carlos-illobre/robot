/**
 * Sonido de la cabina (Web Audio, sin archivos): una pisada por pata al
 * apoyar, una alarma doble sobre 60 °C y un clic al capturar.
 *
 * Arranca APAGADO. El `AudioContext` se crea recién cuando el usuario lo
 * prende (tecla S o botón): los navegadores no dejan sonar audio sin un
 * gesto del usuario, y así tampoco se reserva el dispositivo de audio si
 * nadie lo usa. `destroy()` lo cierra al salir de la vista.
 */

/** Un tono distinto por pata: con el sonido prendido, el trote "se escucha". */
const FOOT_HZ = { FR: 220, FL: 247, RR: 196, RL: 175, R_foot: 220, L_foot: 196 };
/** Separación mínima entre alarmas, para avisar sin aturdir. */
const ALARM_EVERY_MS = 2500;

export class CockpitSound {
  #ctx = null;
  #lastAlarm = -Infinity;
  enabled = false;

  /** Prende o apaga. Debe llamarse desde un gesto del usuario (tecla o clic). */
  toggle(force) {
    this.enabled = force ?? !this.enabled;
    if (this.enabled) {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) {
        this.enabled = false;
        return false;
      }
      this.#ctx ??= new Ctx();
      if (this.#ctx.state === "suspended") this.#ctx.resume();
    }
    return this.enabled;
  }

  /** "Tic" de una pata que acaba de apoyar. */
  step(leg) {
    this.#tone(FOOT_HZ[leg] ?? 200, 0.06, 0.05, "triangle");
  }

  /** Alarma doble (agudo-grave), como mucho cada 2,5 s mientras dure la condición. */
  alarm() {
    const now = performance.now();
    if (!this.enabled || now - this.#lastAlarm < ALARM_EVERY_MS) return;
    this.#lastAlarm = now;
    this.#tone(880, 0.12, 0.06, "sine");
    this.#tone(660, 0.16, 0.06, "sine", 0.15);
  }

  /** Clic de obturador al capturar. */
  shutter() {
    this.#tone(1320, 0.05, 0.04, "square");
  }

  /** Un tono corto con envolvente (ataque de 5 ms, caída exponencial) para que no "chasquee". */
  #tone(freq, dur, vol, type, delay = 0) {
    const ctx = this.#ctx;
    if (!this.enabled || !ctx || ctx.state !== "running") return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  destroy() {
    this.enabled = false;
    this.#ctx?.close();
    this.#ctx = null;
  }
}
