/**
 * Barra común a las tres vistas: marca, robot conectado, selector de vista,
 * estado de la conexión (con su panel de configuración), tema y ayuda.
 */
import { h, setText, fmt } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { VIEWS } from "../views/registry.js";

const STATE_LABEL = {
  live: "En vivo",
  connecting: "Conectando…",
  reconnecting: "Reconectando…",
  stale: "Sin datos",
  offline: "Desconectado",
};

export class AppBar {
  constructor(root, { state, actions }) {
    this.root = root;
    this.state = state;
    this.actions = actions;
    this.#build();
  }

  #build() {
    const { actions } = this;

    this.robotEl = h("span", { class: "brand__robot" }, "Esperando /info…");
    this.modeEl = h("span", { class: "mode-chip", hidden: true });
    const brand = h(
      "div",
      { class: "brand" },
      h("span", { class: "brand__mark", html: icon("activity", { size: 18 }) }),
      h("span", { class: "brand__name" }, "Telemetría Unitree"),
      this.robotEl,
      this.modeEl,
    );

    // Selector de vistas: botones con "pulgar" deslizante
    this.thumb = h("span", { class: "views__thumb", "aria-hidden": "true" });
    this.viewButtons = VIEWS.map((v) =>
      h(
        "button",
        {
          type: "button",
          class: "views__btn",
          "aria-pressed": "false",
          title: `${v.label}: ${v.hint} (tecla ${v.key})`,
          dataset: { view: v.id },
          onclick: () => actions.switchView(v.id),
          html: `${icon(v.icon, { size: 15 })}<span>${v.label}</span><kbd>${v.key}</kbd>`,
        },
      ),
    );
    const views = h("nav", { class: "views", "aria-label": "Vista del dashboard" }, this.thumb, ...this.viewButtons);

    // Estado de la conexión
    this.pill = h(
      "button",
      { type: "button", class: "pill", "aria-haspopup": "dialog", "aria-expanded": "false", title: "Conexión con el servidor", onclick: () => this.togglePopover() },
      h("span", { class: "pill__dot" }),
      h("span", { class: "pill__label" }, "Desconectado"),
      h("span", { class: "pill__stats" }, ""),
    );
    this.pillLabel = this.pill.querySelector(".pill__label");
    this.pillStats = this.pill.querySelector(".pill__stats");

    this.themeBtn = h("button", { type: "button", class: "icon-btn", title: "Tema claro / oscuro (T)", "aria-label": "Cambiar tema", onclick: () => actions.toggleTheme() });
    const helpBtn = h("button", { type: "button", class: "icon-btn", "data-optional": "", title: "Ayuda y atajos (?)", "aria-label": "Ayuda", onclick: () => actions.openHelp(), html: icon("keyboard") });

    this.popover = this.#buildPopover();
    this.root.replaceChildren(brand, views, h("div", { class: "conn" }, this.pill, this.themeBtn, helpBtn), this.popover);

    document.addEventListener("click", (e) => {
      if (!this.popover.hidden && !this.popover.contains(e.target) && !this.pill.contains(e.target)) this.togglePopover(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.popover.hidden) this.togglePopover(false);
    });
    window.addEventListener("resize", () => this.#moveThumb());
    this.setTheme(document.documentElement.dataset.theme);
  }

  #buildPopover() {
    const { state, actions } = this;
    this.urlInput = h("input", { class: "input", id: "server-url", type: "url", spellcheck: "false", autocomplete: "off", placeholder: "http://10.0.0.5:8001", value: state.baseUrl });

    const mkSeg = (opts, value, onPick, label) => {
      const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": label });
      const btns = opts.map(([v, t]) =>
        h("button", { type: "button", role: "radio", "aria-checked": String(v === value), dataset: { v: String(v) }, onclick: (e) => { btns.forEach((b) => b.setAttribute("aria-checked", String(b === e.currentTarget))); onPick(v); } }, t),
      );
      seg.append(...btns);
      seg.set = (v) => btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === String(v))));
      return seg;
    };

    this.transportSeg = mkSeg([["websocket", "WebSocket (push)"], ["polling", "Polling (pull)"]], state.transport, (t) => actions.setTransport(t), "Transporte");
    this.intervalSeg = mkSeg([[100, "100 ms"], [250, "250 ms"], [500, "500 ms"]], state.intervalMs, (ms) => actions.setTransport("polling", ms), "Intervalo de polling");
    this.intervalField = h("label", { class: "field" }, h("span", {}, "Intervalo de polling (máx. 500 ms)"), this.intervalSeg);
    this.intervalField.hidden = state.transport !== "polling";

    this.statHz = h("b", {}, "—");
    this.statGap = h("b", {}, "—");
    this.statFrames = h("b", {}, "0");

    const form = h(
      "form",
      { class: "field", onsubmit: (e) => { e.preventDefault(); actions.connect(this.urlInput.value); } },
      h("span", {}, "Servidor (backend FastAPI)"),
      h("div", { style: { display: "flex", gap: "8px" } }, this.urlInput, h("button", { class: "btn btn--primary", type: "submit" }, "Conectar")),
    );

    this.detailEl = h("p", {}, "");
    return h(
      "div",
      { class: "popover", role: "dialog", "aria-label": "Conexión", hidden: true },
      h("div", {}, h("h3", {}, "Conexión"), this.detailEl),
      form,
      h("div", { class: "field" }, h("span", {}, "Transporte (tecla W)"), this.transportSeg),
      this.intervalField,
      h(
        "div",
        { class: "popover__stats" },
        h("div", { class: "stat" }, this.statHz, h("span", {}, "muestras/s")),
        h("div", { class: "stat" }, this.statGap, h("span", {}, "entre muestras")),
        h("div", { class: "stat" }, this.statFrames, h("span", {}, "recibidas")),
      ),
      h("p", {}, "Tip: ", h("code", {}, "?server=http://IP:8001"), " en la URL apunta el dashboard a otro robot. Con ", h("code", {}, "demo"), " o ", h("code", {}, "demo-g1"), " como servidor, los datos se simulan en el navegador."),
    );
  }

  togglePopover(force) {
    const open = force ?? this.popover.hidden;
    this.popover.hidden = !open;
    this.pill.setAttribute("aria-expanded", String(open));
    if (open) this.urlInput.value = this.state.baseUrl;
  }

  setView(id) {
    for (const b of this.viewButtons) b.setAttribute("aria-pressed", String(b.dataset.view === id));
    this.#moveThumb();
  }

  #moveThumb() {
    const active = this.viewButtons.find((b) => b.getAttribute("aria-pressed") === "true");
    if (!active) return;
    this.thumb.style.width = `${active.offsetWidth}px`;
    this.thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  setInfo(info) {
    if (!info) return;
    this.robotEl.replaceChildren(h("b", {}, info.nombre ?? info.modelo), ` · ${info.n_motores} motores`);
    this.modeEl.hidden = !info.modo;
    this.modeEl.dataset.mode = info.modo ?? "";
    setText(this.modeEl, info.modo ?? "");
  }

  setConnection({ state, detail, transport }) {
    this.pill.dataset.state = state;
    const short = { polling: "Polling", sim: "Simulado", websocket: "WS" }[transport] ?? transport;
    const long = { polling: "polling HTTP", sim: "el simulador del navegador (sin servidor)", websocket: "WebSocket" }[transport] ?? transport;
    setText(this.pillLabel, `${STATE_LABEL[state] ?? state} · ${short}`);
    setText(this.detailEl, detail && state !== "live" ? detail : `${STATE_LABEL[state] ?? state} por ${long}.`);
    this.transportSeg.set(transport);
    this.intervalField.hidden = transport !== "polling";
    this.intervalSeg.set(this.state.intervalMs);
  }

  setStats(stats) {
    const hz = stats.hz ? `${fmt(stats.hz, 1)} Hz` : "";
    const lat = stats.rttMs != null ? ` · ${Math.round(stats.rttMs)} ms` : "";
    setText(this.pillStats, hz + lat);
    setText(this.statHz, stats.hz ? fmt(stats.hz, 1) : "—");
    setText(this.statGap, stats.gapMs ? `${Math.round(stats.gapMs)} ms` : "—");
    setText(this.statFrames, String(stats.frames));
  }

  setPaused(paused) {
    this.pill.dataset.paused = String(paused);
  }

  setTheme(theme) {
    this.themeBtn.innerHTML = icon(theme === "dark" ? "sun" : "moon");
  }
}
