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

    // El robot es un botón desplegable: abre el selector de robot y de fuente de datos.
    this.robotEl = h("button", { type: "button", class: "brand__robot", title: "Cambiar de robot (Go2 / G1) o de fuente de datos", "aria-haspopup": "dialog", onclick: () => this.togglePopover(true, "source") }, "Esperando /info…");
    // Fuente de datos, siempre a la vista: ¿lo que veo es el robot real o una simulación?
    this.modeEl = h("button", { type: "button", class: "mode-chip", hidden: true, title: "Fuente de datos (clic para cambiar)", onclick: () => this.togglePopover(true, "source") });
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
      if (!this.popover.hidden && !this.popover.contains(e.target) && !this.pill.contains(e.target) && !this.modeEl.contains(e.target) && !this.robotEl.contains(e.target)) this.togglePopover(false);
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
      { class: "field", onsubmit: (e) => { e.preventDefault(); actions.connect(this.urlInput.value).then(() => this.togglePopover(false)); } },
      h("span", {}, "Servidor (backend FastAPI)"),
      h("div", { style: { display: "flex", gap: "8px" } }, this.urlInput, h("button", { class: "btn btn--primary", type: "submit" }, "Conectar")),
    );

    this.detailEl = h("p", {}, "");

    // ---- Fuente de datos ----
    this.sourceList = h("div", { class: "sources", role: "radiogroup", "aria-label": "Fuente de datos" });
    this.robotSeg = mkSeg([["go2", "Go2 · 12 motores"], ["g1", "G1 · 29 motores"]], "go2", (r) => { this.pickedRobot = r; this.#syncSourceForm(); }, "Robot");
    this.ifaceInput = h("input", { class: "input", placeholder: "automática (p. ej. eth0, enp3s0)", spellcheck: "false" });
    this.ifaceField = h("label", { class: "field", hidden: true }, h("span", {}, "Placa de red conectada al robot"), this.ifaceInput);
    this.applyBtn = h("button", { type: "button", class: "btn btn--primary" }, "Usar esta fuente");
    this.applyBtn.addEventListener("click", async () => {
      this.applyBtn.disabled = true;
      setText(this.applyBtn, this.pickedSource === "real" ? "Conectando con el robot…" : "Cambiando…");
      const ok = await actions.setSource({ modo: this.pickedSource, robot: this.pickedRobot ?? this.sources?.actual?.robot ?? "go2", interfaz: this.ifaceInput.value.trim() });
      if (ok) this.pickedRobot = null;
      this.#syncSourceForm();
    });
    this.sourceNote = h("p", { class: "popover__note" }, "");
    this.sourceSection = h(
      "section",
      { class: "popover__section" },
      h("div", { class: "popover__title" },
        h("h3", {}, "Fuente de datos"),
        h("button", { type: "button", class: "link-btn", onclick: () => { this.togglePopover(false); actions.openManual("fuentes"); } }, "¿Qué es cada fuente?")),
      this.sourceList,
      h("div", { class: "field" }, h("span", {}, "Robot"), this.robotSeg),
      this.ifaceField,
      this.applyBtn,
      this.sourceNote,
    );

    return h(
      "div",
      { class: "popover", role: "dialog", "aria-label": "Conexión y fuente de datos", hidden: true },
      this.sourceSection,
      h("hr", { class: "popover__sep" }),
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

  togglePopover(force, focus) {
    const open = force ?? this.popover.hidden;
    this.popover.hidden = !open;
    this.pill.setAttribute("aria-expanded", String(open));
    if (open) {
      this.urlInput.value = this.state.baseUrl;
      this.actions.loadSources();
      if (focus === "source") this.sourceSection.scrollIntoView({ block: "nearest" });
    }
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
    this.robotEl.replaceChildren(h("b", {}, info.nombre ?? info.modelo), ` · ${info.n_motores} motores`, h("span", { class: "brand__caret", "aria-hidden": "true" }, "▾"));
    if (!this.sources) this.#paintChip({ modo: info.modo, medido: info.modo === "real" });
  }

  #paintChip(actual) {
    const label = { real: "Robot real", simulador: "MuJoCo", demo: "Demo", "demo-catedra": "Demo cátedra", navegador: "Navegador" }[actual?.modo] ?? actual?.modo ?? "";
    this.modeEl.hidden = !label;
    this.modeEl.dataset.mode = actual?.medido ? "real" : "demo";
    // Corta a propósito: "Real" o "Simulado". La fuente exacta, al pasar el mouse y en el panel.
    this.modeEl.innerHTML = `<span class="mode-chip__dot"></span>${actual?.medido ? "Real" : "Simulado"}<span class="mode-chip__caret" aria-hidden="true">▾</span>`;
    this.modeEl.title = `Fuente de datos: ${label} (clic para cambiar)`;
    this.modeEl.setAttribute("aria-label", `Fuente de datos: ${label}. Cambiar`);
  }

  /** Pinta el selector de fuentes con lo que devolvió actions.loadSources(). */
  setSources({ actual, cambiable, fuentes, backendUrl, error }) {
    this.sources = { actual, cambiable, fuentes };
    this.#paintChip(actual);
    const pick = this.pickedSource && fuentes.some((f) => f.modo === this.pickedSource && f.disponible) ? this.pickedSource : actual.modo;
    this.pickedSource = pick;
    this.robotSeg.set(this.pickedRobot ?? actual.robot ?? "go2");
    this.sourceList.replaceChildren(
      ...fuentes.map((f) => {
        const backendSource = f.modo !== "navegador";
        const enabled = f.disponible && (!backendSource || cambiable || f.modo === actual.modo);
        const motivo = !f.disponible ? f.motivo : backendSource && !cambiable && f.modo !== actual.modo ? "Este servidor tiene la fuente fija." : "";
        const input = h("input", { type: "radio", name: "fuente", value: f.modo, checked: f.modo === pick, disabled: !enabled, onchange: () => { this.pickedSource = f.modo; this.#syncSourceForm(); } });
        return h(
          "label",
          { class: `source${enabled ? "" : " is-disabled"}${f.modo === actual.modo ? " is-current" : ""}`, dataset: { modo: f.modo } },
          input,
          h("span", { class: "source__body" },
            h("b", {}, f.nombre, f.modo === actual.modo ? h("em", {}, "en uso") : null, f.medido ? h("i", { class: "source__real" }, "datos medidos") : null),
            h("span", {}, motivo || f.descripcion)),
        );
      }),
    );
    setText(this.sourceNote, error && !fuentes.some((f) => f.disponible && f.modo !== "navegador") ? `Servidor: ${backendUrl}. ${error}` : `Servidor: ${backendUrl}. Cambiar la fuente del servidor afecta a todos los dashboards conectados a él.`);
    this.#syncSourceForm();
  }

  #syncSourceForm() {
    const real = this.pickedSource === "real";
    this.ifaceField.hidden = !real;
    const actual = this.sources?.actual ?? {};
    const same = this.pickedSource === actual.modo && (this.pickedRobot ?? actual.robot) === actual.robot;
    this.applyBtn.disabled = same;
    setText(this.applyBtn, same ? "Fuente en uso" : "Usar esta fuente");
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
