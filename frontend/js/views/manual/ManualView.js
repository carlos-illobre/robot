/**
 * Vista "Manual": guía de uso y de lectura de los datos, dentro del propio
 * dashboard.
 *
 * El contenido vive en `content.js` como datos (secciones y bloques). Esta
 * clase solo sabe dibujar cada tipo de bloque: párrafo, aviso, tabla, pasos,
 * diagrama SVG y "figura anotada" (una captura real con marcas numeradas que
 * se conectan con su leyenda).
 *
 * No necesita telemetría para funcionar, pero la usa: la portada muestra en
 * vivo si hay conexión, y el botón "Probar en vivo" salta a la vista que se
 * está explicando.
 */
import { h, setText } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { SECTIONS } from "./content.js";

/** Posiciones de las marcas, medidas por tools/capturas_manual.mjs al sacar las capturas. */
let marcas = null;
const loadMarcas = () => (marcas ??= fetch("assets/manual/marcas.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

export default class ManualView {
  static id = "manual";
  static shortcuts = [
    ["J", "Sección siguiente"],
    ["K", "Sección anterior"],
  ];

  constructor(ctx) {
    this.ctx = ctx;
    this.observer = null;
    this.tocLinks = new Map();
  }

  mount(container) {
    this.toc = h("nav", { class: "man-toc", "aria-label": "Contenido del manual" });
    this.article = h("article", { class: "man-article" });
    this.live = h("span", { class: "man-live" });
    this.progress = h("div", { class: "man-progress", "aria-hidden": "true" });

    this.scroller = h("div", { class: "man-scroller" }, this.article);
    container.append(
      h(
        "div",
        { class: "man" },
        h(
          "aside",
          { class: "man-side" },
          h("div", { class: "man-side__head" }, h("span", { html: icon("book", { size: 18 }) }), h("b", {}, "Manual"), this.live),
          this.toc,
        ),
        this.scroller,
        this.progress,
      ),
    );

    for (const section of SECTIONS) {
      this.article.append(this.#section(section));
      const link = h("a", { href: `#man-${section.id}`, class: `man-toc__link${section.level === 2 ? " is-sub" : ""}` }, section.toc ?? section.title);
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.#goTo(section.id);
      });
      this.tocLinks.set(section.id, link);
      this.toc.append(link);
    }

    // "Scrollspy": resalta en el índice la sección que se está leyendo.
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.dataset.section;
          for (const [key, link] of this.tocLinks) link.classList.toggle("is-active", key === id);
        }
      },
      { root: this.scroller, rootMargin: "-10% 0px -80% 0px" },
    );
    this.article.querySelectorAll("section[data-section]").forEach((el) => this.observer.observe(el));

    this.onScroll = () => {
      const max = this.scroller.scrollHeight - this.scroller.clientHeight;
      this.progress.style.transform = `scaleX(${max > 0 ? this.scroller.scrollTop / max : 0})`;
    };
    this.scroller.addEventListener("scroll", this.onScroll, { passive: true });

    const hash = location.hash.replace("#man-", "");
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      // Se repite cuando terminan de cargar las imágenes, que cambian la altura de la página.
      requestAnimationFrame(() => this.#goTo(hash, false));
      const until = performance.now() + 2500; // después de eso, el usuario ya está leyendo
      this.article.querySelectorAll("img").forEach((img) =>
        img.addEventListener("load", () => performance.now() < until && this.#goTo(hash, false), { once: true }),
      );
    }
    this.onConnection(this.ctx.state.connection);
  }

  /** Lleva a una sección del manual (lo usa actions.openManual). */
  goTo(id) {
    this.#goTo(id);
  }

  setInfo() {}

  update() {}

  onConnection(conn) {
    const live = conn?.state === "live";
    this.live.dataset.live = String(live);
    setText(this.live, live ? "datos en vivo" : "sin conexión");
  }

  onKey(e) {
    const ids = SECTIONS.map((s) => s.id);
    const current = [...this.tocLinks].find(([, a]) => a.classList.contains("is-active"))?.[0] ?? ids[0];
    const i = ids.indexOf(current);
    if (e.key === "j") return this.#goTo(ids[Math.min(ids.length - 1, i + 1)]), true;
    if (e.key === "k") return this.#goTo(ids[Math.max(0, i - 1)]), true;
    return false;
  }

  destroy() {
    this.observer?.disconnect();
    this.scroller?.removeEventListener("scroll", this.onScroll);
  }

  /* ---------------------------------------------------------------- */

  #goTo(id, smooth = true) {
    const el = this.article.querySelector(`[data-section="${id}"]`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scroller.scrollTo({ top: el.offsetTop - 16, behavior: smooth && !reduce ? "smooth" : "auto" });
    window.history.replaceState(null, "", `${location.pathname}${location.search}#man-${id}`);
  }

  #section(section) {
    const Tag = section.level === 2 ? "h3" : "h2";
    const el = h(
      "section",
      { class: `man-section man-section--l${section.level ?? 1}`, id: `man-${section.id}`, dataset: { section: section.id } },
      section.kicker ? h("p", { class: "man-kicker" }, section.kicker) : null,
      h(Tag, { class: "man-title" }, section.title),
      section.lead ? h("p", { class: "man-lead", html: section.lead }) : null,
    );
    for (const block of section.blocks ?? []) el.append(this.#block(block));
    return el;
  }

  #block(b) {
    switch (b.type) {
      case "p":
        return h("p", { html: b.html });
      case "callout":
        return h("div", { class: `man-callout man-callout--${b.kind ?? "info"}`, html: `${icon(b.kind === "warn" ? "alert" : b.kind === "tip" ? "bolt" : "info", { size: 18 })}<div>${b.html}</div>` });
      case "list":
        return h(b.ordered ? "ol" : "ul", { class: "man-list" }, ...b.items.map((i) => h("li", { html: i })));
      case "steps":
        return h("ol", { class: "man-steps", start: b.start, style: { counterReset: `step ${(b.start ?? 1) - 1}` } }, ...b.items.map((i) => h("li", { html: i })));
      case "table":
        return h(
          "div",
          { class: "man-table-wrap" },
          h(
            "table",
            { class: "man-table" },
            h("thead", {}, h("tr", {}, ...b.head.map((c) => h("th", { html: c })))),
            h("tbody", {}, ...b.rows.map((r) => h("tr", {}, ...r.map((c) => h("td", { html: String(c) }))))),
          ),
        );
      case "diagram":
        return h("figure", { class: "man-diagram" }, h("div", { class: "man-diagram__art", html: b.svg }), b.caption ? h("figcaption", { html: b.caption }) : null);
      case "cards":
        return h(
          "div",
          { class: "man-cards" },
          ...b.items.map((c) =>
            h(
              "button",
              { type: "button", class: "man-card", onclick: () => (c.view ? this.ctx.actions.switchView(c.view) : this.#goTo(c.section)) },
              c.img ? h("img", { src: c.img, alt: "", loading: "lazy", onerror: (e) => e.currentTarget.remove() }) : null,
              h("span", { class: "man-card__key" }, c.key ?? ""),
              h("b", {}, c.title),
              h("span", {}, c.text),
            ),
          ),
        );
      case "figure":
        return this.#annotated(b);
      case "try":
        return h(
          "button",
          { type: "button", class: "man-try", onclick: () => this.ctx.actions.switchView(b.view) },
          h("span", { html: icon("play", { size: 14 }) }),
          b.label ?? "Probar en vivo",
          b.key ? h("kbd", {}, b.key) : null,
        );
      default:
        return h("div");
    }
  }

  /**
   * Figura anotada: captura real + marcas numeradas en coordenadas relativas
   * (porcentaje), para que sigan en su lugar a cualquier ancho. Pasar el mouse
   * o enfocar un ítem de la leyenda resalta su marca, y viceversa.
   */
  #annotated(b) {
    const markers = [];
    const items = [];
    const highlight = (n, on) => {
      markers[n - 1]?.classList.toggle("is-hot", on);
      items[n - 1]?.classList.toggle("is-hot", on);
    };

    const stage = h(
      "div",
      { class: "man-shot__stage" },
      h("img", {
        src: b.src,
        alt: b.alt,
        loading: "lazy",
        // Reserva el alto antes de cargar (las capturas de las vistas son de 1366×716).
        style: b.strip ? undefined : { aspectRatio: b.ratio ?? "1366 / 716" },
        onerror: (e) => {
          e.currentTarget.closest(".man-shot").classList.add("is-missing");
        },
      }),
    );
    const placeMarkers = (list) => list?.forEach((pos, i) => {
      if (!pos) return;
      const [x, y] = pos;
      const m = h("button", { type: "button", class: "man-marker", style: { left: `${x}%`, top: `${y}%` }, "aria-label": `Referencia ${i + 1}` }, String(i + 1));
      m.addEventListener("mouseenter", () => highlight(i + 1, true));
      m.addEventListener("mouseleave", () => highlight(i + 1, false));
      m.addEventListener("focus", () => highlight(i + 1, true));
      m.addEventListener("blur", () => highlight(i + 1, false));
      m.addEventListener("click", () => items[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      markers[i] = m;
      stage.append(m);
    });
    if (b.markers) placeMarkers(b.markers);
    else if (b.marks) loadMarcas().then((all) => placeMarkers(all[b.marks]));

    const legend = h(
      "ol",
      { class: "man-legend" },
      ...(b.legend ?? []).map(([title, text], i) => {
        const li = h("li", { tabindex: "0" }, h("span", { class: "man-legend__n" }, String(i + 1)), h("div", {}, h("b", {}, title), h("p", { html: text })));
        li.addEventListener("mouseenter", () => highlight(i + 1, true));
        li.addEventListener("mouseleave", () => highlight(i + 1, false));
        li.addEventListener("focus", () => highlight(i + 1, true));
        li.addEventListener("blur", () => highlight(i + 1, false));
        items.push(li);
        return li;
      }),
    );

    return h(
      "figure",
      { class: `man-shot${b.phone ? " man-shot--phone" : ""}${b.strip ? " man-shot--strip" : ""}` },
      h("div", { class: "man-shot__frame" }, stage, h("p", { class: "man-shot__missing" }, "Captura no disponible")),
      b.caption ? h("figcaption", { html: b.caption }) : null,
      legend,
    );
  }
}
