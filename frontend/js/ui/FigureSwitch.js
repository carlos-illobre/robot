/**
 * FigureSwitch: alterna, dentro de una vista, entre el ESQUEMA del robot
 * (el dibujo SVG simplificado de cada vista) y el MODELO 3D REAL de Unitree
 * (componente RobotScene del Gemelo 3D).
 *
 *   const fig = new FigureSwitch(ctx, { host, schematic, preset: "arriba" });
 *   fig.setInfo(info); fig.update(frame); fig.setMode(ctx.state.figure);
 *   fig.destroy();
 *
 * - `host`: contenedor (con position: relative) donde va el 3D, encima del esquema.
 * - `schematic`: el elemento del esquema; se oculta (visibility) mientras se ve el 3D,
 *   así conserva su lugar en el layout y la vista no "salta".
 *
 * El módulo 3D (three.js, ~700 kB) se carga recién la primera vez que alguien
 * elige "3D real" (import dinámico): quien no lo usa no lo descarga.
 * La preferencia es global (state.figure) y se cambia con el botón o la tecla G.
 */
import { h } from "./dom.js";
import { toast } from "./toast.js";

let sceneModule = null;
const loadScene = () => (sceneModule ??= import("../views/twin/RobotScene.js"));

export class FigureSwitch {
  /**
   * @param {object} ctx contexto de la vista
   * @param {object} o
   * @param {HTMLElement} o.host
   * @param {HTMLElement} [o.schematic]
   * @param {"perspectiva"|"arriba"|"lateral"|"frente"} [o.preset="perspectiva"]
   * @param {boolean} [o.interactive=true] permitir girar la cámara con el mouse
   * @param {boolean} [o.labels=true] etiqueta del motor bajo el puntero
   */
  constructor(ctx, { host, schematic = null, preset = "perspectiva", interactive = true, labels = true }) {
    this.ctx = ctx;
    this.host = host;
    this.schematic = schematic;
    this.opts = { preset, interactive, labels };
    this.mode = "esquema";
    this.scene = null;
    this.info = null;
    this.layer = h("div", { class: "fig3d", hidden: true });
    host.append(this.layer);
    this.token = 0;
  }

  get is3D() {
    return this.mode === "3d";
  }

  async setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const token = ++this.token;
    if (mode !== "3d") return this.#show3D(false);

    const { RobotScene } = await loadScene();
    if (token !== this.token) return; // cambió de idea mientras cargaba
    if (!RobotScene.isSupported()) {
      toast("Este navegador no puede mostrar 3D (WebGL): se muestra el esquema", { kind: "warn" });
      this.mode = "esquema";
      return;
    }
    this.scene ??= new RobotScene(this.layer, {
      background: "transparent",
      interactive: this.opts.interactive,
      labels: this.opts.labels,
      preset: this.opts.preset,
      follow: true,
      torqueAlarm: () => this.ctx.state.torqueAlarm,
    });
    if (this.info) this.scene.setInfo(this.info);
    if (this.ctx.state.latest) this.scene.update(this.ctx.state.latest);
    this.scene.setPaused?.(this.ctx.state.paused);
    this.#show3D(true);
  }

  #show3D(on) {
    this.layer.hidden = !on;
    if (this.schematic) this.schematic.style.visibility = on ? "hidden" : "";
    this.host.classList.toggle("is-3d", on);
    if (on) requestAnimationFrame(() => this.scene?.resize?.());
  }

  setInfo(info) {
    this.info = info;
    this.scene?.setInfo(info);
  }

  update(frame) {
    if (this.is3D) this.scene?.update(frame);
  }

  setPaused(paused) {
    this.scene?.setPaused?.(paused);
  }

  applyTheme() {
    this.scene?.applyTheme?.();
  }

  destroy() {
    this.token++;
    this.scene?.destroy();
    this.scene = null;
    this.layer.remove();
    if (this.schematic) this.schematic.style.visibility = "";
  }
}

/**
 * Botón segmentado "Esquema | 3D real", conectado a la preferencia global.
 * Devuelve el elemento; la vista llama a `button.set(mode)` en onFigureMode.
 */
export function figureToggle(ctx, { compact = false } = {}) {
  const el = h("div", { class: `fig-toggle${compact ? " fig-toggle--compact" : ""}`, role: "radiogroup", "aria-label": "Ilustración del robot (tecla G)", title: "Esquema simplificado o modelo 3D real (tecla G)" });
  const mk = (mode, text) =>
    h("button", { type: "button", role: "radio", dataset: { mode }, onclick: () => ctx.actions.setFigureMode(mode) }, text);
  el.append(mk("esquema", "Esquema"), mk("3d", compact ? "3D" : "3D real"));
  el.set = (mode) => el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
  el.set(ctx.state.figure);
  return el;
}
