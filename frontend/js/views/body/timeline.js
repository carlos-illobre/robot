/**
 * Línea de tiempo (canvas): en el mismo eje de tiempo, la inclinación (roll y
 * pitch), el yaw, el diagrama de apoyos y el motor más caliente. Las capturas
 * quedan clavadas como alfileres numerados y la grabación continua, como una
 * franja sombreada.
 *
 * Es el gráfico histórico de la IMU que pide la consigna (≥ 60 muestras, con
 * eje numérico): a 10 Hz muestra 300 muestras. El eje X es el tiempo de
 * llegada (`receivedAt`) y no el índice: con polling o con cortes, los huecos
 * se ven como huecos y las capturas caen donde ocurrieron.
 *
 * Se dibuja en canvas porque son cientos de puntos por pista, 10 veces por
 * segundo: con SVG serían miles de nodos.
 */

/** Ventana visible. */
export const WINDOW_MS = 30_000;
/** Un hueco mayor que esto corta la línea (corte de conexión, pausa del servidor). */
const GAP_MS = 1_500;
/** Escalas "redondas" para roll y pitch: la escala se adapta pero no baila. */
const TILT_STEPS = [2, 5, 10, 15, 20, 30, 45, 60, 90, 180];
/** Orden de dibujo de las patas: como se ven en el dibujo (izquierda primero). */
const LEG_ORDER = ["FL", "FR", "RL", "RR", "R_foot", "L_foot"];

export class Timeline {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tiltScale = TILT_STEPS[1];
  }

  /** Ajusta el tamaño del lienzo a su caja (con la densidad de la pantalla). */
  #fit() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [W, H];
  }

  /**
   * @param {object}   o
   * @param {object[]} o.frames    historial en orden cronológico
   * @param {object[]} o.captures  capturas (CaptureStore.samples), en orden cronológico
   * @param {number}   o.now       instante del borde derecho (ms)
   * @param {string[]} o.legs      patas que informa el robot (info.patas)
   * @param {Record<string,string>} o.palette colores del tema
   */
  draw({ frames, captures, now, legs, palette: P }) {
    const [W, H] = this.#fit();
    const x = this.ctx;
    x.clearRect(0, 0, W, H);
    if (!W || !H) return;

    const compact = W < 560;
    const titleW = compact ? 0 : 92;   // columna con el nombre de cada pista
    const tickW = 42;                   // columna con los números del eje Y
    const left = titleW + tickW;
    const right = W - 6;
    const top = 16;                     // lugar para la cabeza de los alfileres
    const bottom = H - 18;              // lugar para el eje de tiempo
    const plotW = right - left;
    const X = (t) => right - ((now - t) / WINDOW_MS) * plotW;
    const t0 = now - WINDOW_MS;
    const visible = frames.filter((f, i) => f.receivedAt >= t0 || frames[i + 1]?.receivedAt >= t0);

    const legList = [...legs].sort((a, b) => LEG_ORDER.indexOf(a) - LEG_ORDER.indexOf(b));
    const tracks = [
      { key: "tilt", title: "Roll · pitch", weight: 0.4 },
      { key: "yaw", title: "Yaw", weight: 0.22 },
      { key: "legs", title: legList.some((l) => l.endsWith("_foot")) ? "Pies" : "Patas", weight: legList.length ? 0.075 * legList.length + 0.03 : 0.1 },
      { key: "heat", title: "Más caliente", weight: 0.1 },
    ];
    const gap = 6;
    const avail = bottom - top - gap * (tracks.length - 1);
    const sum = tracks.reduce((a, t) => a + t.weight, 0);
    let y = top;

    x.textBaseline = "middle";
    for (const t of tracks) {
      const th = (avail * t.weight) / sum;
      const box = { y, h: th };
      x.fillStyle = P.track;
      x.fillRect(left, y, plotW, th);
      if (!compact) {
        x.font = `600 12px ${P.sans}`;
        x.fillStyle = P.muted;
        x.textAlign = "left";
        x.fillText(t.title, 0, y + Math.min(th / 2, 9));
      }
      if (t.key === "tilt") this.#tilt(visible, box, { X, left, right, compact, P });
      else if (t.key === "yaw") this.#yaw(visible, box, { X, left, right, compact, P });
      else if (t.key === "legs") this.#legs(visible, legList, box, { X, left, right, now, P });
      else this.#heat(visible, box, { X, left, right, compact, now, P });
      y += th + gap;
    }

    this.#captures(captures, { X, t0, top, bottom, now, P });
    this.#timeAxis({ left, right, plotW, H, P, compact });
    this.count = visible.length;
  }

  /** Título dentro de la pista (en el celular no hay columna de títulos). */
  #inlineTitle(text, box, left, P) {
    const x = this.ctx;
    x.font = `600 11px ${P.sans}`;
    x.textAlign = "left";
    x.fillStyle = P.muted;
    x.fillText(text, left + 6, box.y + 8);
  }

  /** Números del eje Y, alineados a la derecha de su columna. */
  #tick(text, y, left, P, size = 11) {
    const x = this.ctx;
    x.font = `${size}px ${P.mono}`;
    x.fillStyle = P.muted;
    x.textAlign = "right";
    x.fillText(text, left - 6, y);
  }

  #hline(y, left, right, color, dash = []) {
    const x = this.ctx;
    x.strokeStyle = color;
    x.lineWidth = 1;
    x.setLineDash(dash);
    x.beginPath();
    x.moveTo(left, Math.round(y) + 0.5);
    x.lineTo(right, Math.round(y) + 0.5);
    x.stroke();
    x.setLineDash([]);
  }

  /** Dibuja una serie; corta la línea en los huecos y donde `breakIf` lo pide. */
  #series(frames, get, Y, X, color, breakIf = () => false) {
    const x = this.ctx;
    x.strokeStyle = color;
    x.lineWidth = 1.6;
    x.lineJoin = "round";
    x.beginPath();
    let prev = null;
    for (const f of frames) {
      const v = get(f);
      const px = X(f.receivedAt);
      if (!prev || f.receivedAt - prev.t > GAP_MS || breakIf(prev.v, v)) x.moveTo(px, Y(v));
      else x.lineTo(px, Y(v));
      prev = { t: f.receivedAt, v };
    }
    x.stroke();
  }

  #tilt(frames, box, { X, left, right, compact, P }) {
    // Escala simétrica que contiene todo lo visible; solo crece o se achica de a "escalones".
    let peak = 0;
    for (const f of frames) peak = Math.max(peak, Math.abs(f.imu.roll), Math.abs(f.imu.pitch));
    this.tiltScale = TILT_STEPS.find((s) => s >= peak) ?? 180;
    const M = this.tiltScale;
    const pad = 3;
    const Y = (v) => box.y + pad + ((M - v) / (2 * M)) * (box.h - 2 * pad);
    this.#hline(Y(0), left, right, P.rule2);
    this.#hline(Y(M / 2), left, right, P.rule, [2, 3]);
    this.#hline(Y(-M / 2), left, right, P.rule, [2, 3]);
    this.#tick(`+${M}°`, Y(M) + 3, left, P);
    this.#tick("0", Y(0), left, P);
    this.#tick(`−${M}°`, Y(-M) - 3, left, P);
    this.#series(frames, (f) => f.imu.roll, Y, X, P.s1);
    this.#series(frames, (f) => f.imu.pitch, Y, X, P.s2);

    // Leyenda de colores (en la columna de títulos o dentro de la pista).
    const x = this.ctx;
    const lx = compact ? left + 6 : 0;
    const ly = compact ? box.y + 8 : box.y + 26;
    x.font = `600 11px ${P.sans}`;
    x.textAlign = "left";
    x.fillStyle = P.s1;
    x.fillRect(lx, ly - 1, 10, 2.5);
    x.fillText("Roll", lx + 14, ly);
    const lx2 = lx + (compact ? 48 : 0);
    const ly2 = compact ? ly : ly + 16;
    x.fillStyle = P.s2;
    x.fillRect(lx2, ly2 - 1, 10, 2.5);
    x.fillText("Pitch", lx2 + 14, ly2);
  }

  #yaw(frames, box, { X, left, right, compact, P }) {
    const pad = 3;
    const Y = (v) => box.y + pad + ((180 - v) / 360) * (box.h - 2 * pad);
    this.#hline(Y(0), left, right, P.rule2);
    // Con poca altura, solo los extremos: el cero se lee por la línea guía.
    if (box.h >= 34) this.#tick("0", Y(0), left, P);
    this.#tick("+180°", Y(180) + 4, left, P);
    this.#tick("−180°", Y(-180) - 4, left, P);
    const norm = (v) => ((((v + 180) % 360) + 360) % 360) - 180;
    // Al cruzar ±180° el yaw salta: se corta la línea en lugar de trazar una vertical.
    this.#series(frames, (f) => norm(f.imu.yaw), Y, X, P.ink, (a, b) => Math.abs(a - b) > 180);
    if (compact) this.#inlineTitle("Yaw", box, left, P);
  }

  #legs(frames, legs, box, { X, left, right, now, P }) {
    const x = this.ctx;
    if (!legs.length) {
      x.font = `11px ${P.sans}`;
      x.fillStyle = P.muted;
      x.textAlign = "left";
      x.fillText("El robot no informa contacto de patas", left + 8, box.y + box.h / 2);
      return;
    }
    const rh = box.h / legs.length;
    legs.forEach((leg, li) => {
      const ry = box.y + li * rh;
      this.#tick(leg.replace("_foot", ""), ry + rh / 2, left, P, rh < 12 ? 9 : 11);
      x.fillStyle = P.ink2;
      // Rachas de apoyo: un rectángulo por racha (no uno por muestra); un hueco corta la racha.
      let start = null;
      let prev = null;
      const flush = (end) => {
        if (start === null) return;
        const x0 = Math.max(left, X(start));
        x.fillRect(x0, ry + 1.5, Math.max(1, Math.min(right, X(end)) - x0), Math.max(1, rh - 3));
        start = null;
      };
      for (const f of frames) {
        if (prev !== null && f.receivedAt - prev > GAP_MS) flush(prev);
        if (f.fuerzas[leg] === 1) start ??= f.receivedAt;
        else flush(f.receivedAt);
        prev = f.receivedAt;
      }
      flush(now);
    });
  }

  #heat(frames, box, { X, left, right, compact, now, P }) {
    // Color del semáforo de la temperatura máxima de cada muestra (derived.tempMax).
    const x = this.ctx;
    const color = { ok: P.ok, warn: P.warn, crit: P.crit };
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const t = f.derived.tempMax?.value;
      if (!Number.isFinite(t)) continue;
      const next = frames[i + 1]?.receivedAt ?? now;
      if (next - f.receivedAt > GAP_MS) continue;
      const x0 = Math.max(left, X(f.receivedAt));
      const x1 = Math.min(right, X(next));
      if (x1 <= x0) continue;
      x.fillStyle = color[t > 60 ? "crit" : t >= 40 ? "warn" : "ok"];
      x.fillRect(x0, box.y, x1 - x0 + 0.5, box.h);
    }
    // En el celular no hay columna de títulos: el rótulo va en la de números.
    if (compact) this.#tick("máx", box.y + box.h / 2, left, P);
  }

  /** Alfileres numerados (capturas manuales) y franjas (grabación continua). */
  #captures(captures, { X, t0, top, bottom, now, P }) {
    const x = this.ctx;
    const pins = [];
    let run = null;
    const runs = [];
    // Las capturas están en orden: se recorren desde la más nueva hasta salir de la ventana.
    for (let i = captures.length - 1; i >= 0; i--) {
      const c = captures[i];
      const t = c.frame.receivedAt ?? c.capturedAt.getTime();
      if (t < t0) break;
      if (t > now) continue;
      if (c.tipo === "manual") pins.push({ t, n: c.n });
      else if (run && run.start - t < GAP_MS) run.start = t;
      else runs.push((run = { start: t, end: t }));
    }
    x.fillStyle = P.accent;
    for (const r of runs) {
      x.globalAlpha = 0.14;
      x.fillRect(X(r.start), top, Math.max(2, X(r.end) - X(r.start) + 2), bottom - top);
      x.globalAlpha = 1;
      x.fillRect(X(r.start), top - 2, Math.max(2, X(r.end) - X(r.start) + 2), 2);
    }
    for (const p of pins) {
      const px = Math.round(X(p.t)) + 0.5;
      x.strokeStyle = P.accent;
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(px, top);
      x.lineTo(px, bottom);
      x.stroke();
      const label = String(p.n);
      x.font = `600 11px ${P.mono}`;
      const w = Math.max(16, x.measureText(label).width + 8);
      x.fillStyle = P.accent;
      x.beginPath();
      x.roundRect(px - w / 2, 0, w, 15, 7.5);
      x.fill();
      x.fillStyle = P.onAccent;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(label, px, 8);
    }
  }

  #timeAxis({ left, right, plotW, H, P, compact }) {
    const x = this.ctx;
    x.font = `11px ${P.mono}`;
    x.fillStyle = P.muted;
    x.textBaseline = "alphabetic";
    const step = compact ? 10 : 5;
    for (let s = 0; s <= WINDOW_MS / 1000; s += step) {
      const px = right - (s / (WINDOW_MS / 1000)) * plotW;
      x.textAlign = s === 0 ? "right" : px - left < 20 ? "left" : "center";
      x.fillText(s ? `−${s} s` : "ahora", px, H - 3);
    }
  }
}
