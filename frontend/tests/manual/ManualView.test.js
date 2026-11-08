// Pruebas de la vista Manual (js/views/manual/ManualView.js).
// Cada prueba importa el módulo de cero (vi.resetModules) para que el caché
// de marcas.json no pase de una prueba a otra.
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

import { icon } from "../../js/ui/icons.js";
import { PaseoSim } from "../../js/core/paseoSim.js";
import { normalizeFrame } from "../../js/core/telemetryModel.js";
import { SECTIONS } from "../../js/views/manual/content.js";
import { FakeIntersectionObserver, MARCAS, installGlobals, jsonResponse, makeCtx, flush, html } from "./helpers.js";

const VIEW = "../../js/views/manual/ManualView.js";
const CONTENT = "../../js/views/manual/content.js";

let g;
let container;

/** Importa la vista de cero y la monta. */
async function montar({ ctx = makeCtx(), sections } = {}) {
  vi.resetModules();
  if (sections) vi.doMock(CONTENT, () => ({ SECTIONS: sections }));
  const { default: ManualView } = await import(VIEW);
  const view = new ManualView(ctx);
  view.mount(container);
  view.scroller.scrollTo = vi.fn();
  return { view, ctx, ManualView };
}

const seccion = (view, id) => view.article.querySelector(`[data-section="${id}"]`);
const links = (view) => [...view.toc.querySelectorAll("a")];
const activos = (view) => links(view).filter((a) => a.classList.contains("is-active")).map((a) => a.getAttribute("href"));

beforeEach(() => {
  g = installGlobals();
  history.replaceState(null, "", "/app?robot=go2");
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
  vi.doUnmock(CONTENT);
  vi.unstubAllGlobals();
});

describe("identidad de la vista", () => {
  test("se registra como 'manual' y declara J y K en la ayuda", async () => {
    const { ManualView } = await montar();
    expect(ManualView.id).toBe("manual");
    expect(ManualView.shortcuts).toEqual([
      ["J", "Sección siguiente"],
      ["K", "Sección anterior"],
    ]);
  });

  test("el constructor guarda el contexto y arranca sin observer ni enlaces", async () => {
    vi.resetModules();
    const { default: ManualView } = await import(VIEW);
    const ctx = makeCtx();
    const view = new ManualView(ctx);
    expect(view.ctx).toBe(ctx);
    expect(view.observer).toBeNull();
    expect(view.tocLinks.size).toBe(0);
  });
});

describe("estructura con el contenido real", () => {
  test("arma el lateral con el título, el índice y la barra de progreso", async () => {
    const { view } = await montar();
    const man = container.querySelector(":scope > .man");
    expect(man).not.toBeNull();
    const side = man.querySelector(":scope > aside.man-side");
    expect(side.querySelector(".man-side__head b").textContent).toBe("Manual");
    expect(side.querySelector(".man-side__head span").innerHTML).toBe(html(icon("book", { size: 18 })));
    expect(view.toc.tagName).toBe("NAV");
    expect(view.toc.getAttribute("aria-label")).toBe("Contenido del manual");
    expect(view.toc.className).toBe("man-toc");
    expect(view.scroller.className).toBe("man-scroller");
    expect(view.scroller.firstChild).toBe(view.article);
    expect(view.article.className).toBe("man-article");
    expect(view.progress.className).toBe("man-progress");
    expect(view.progress.getAttribute("aria-hidden")).toBe("true");
    expect([...man.children]).toEqual([side, view.scroller, view.progress]);
  });

  test("dibuja una sección por cada entrada del contenido, en orden y con su id", async () => {
    const { view } = await montar();
    const els = [...view.article.querySelectorAll(":scope > section")];
    expect(els.map((el) => el.dataset.section)).toEqual(SECTIONS.map((s) => s.id));
    for (const [i, s] of SECTIONS.entries()) {
      expect(els[i].id).toBe(`man-${s.id}`);
      expect(els[i].className).toBe(`man-section man-section--l${s.level ?? 1}`);
      const title = els[i].querySelector(".man-title");
      expect(title.tagName).toBe(s.level === 2 ? "H3" : "H2");
      expect(title.textContent).toBe(s.title);
      expect(els[i].querySelector(".man-kicker")?.textContent ?? null).toBe(s.kicker ?? null);
      if (s.lead) expect(els[i].querySelector(".man-lead").innerHTML).toBe(html(s.lead));
      else expect(els[i].querySelector(".man-lead")).toBeNull();
    }
  });

  test("la portada es la bienvenida con su título real", async () => {
    const { view } = await montar();
    const inicio = seccion(view, "inicio");
    expect(view.article.firstElementChild).toBe(inicio);
    expect(inicio.querySelector("h2").textContent).toBe("Cómo leer y usar el dashboard de telemetría");
    expect(inicio.querySelector(".man-kicker").textContent).toBe("Manual de uso · TP05");
  });

  test("el índice tiene un enlace por sección, con su texto corto y sangría en las subsecciones", async () => {
    const { view } = await montar();
    const ls = links(view);
    expect(ls).toHaveLength(SECTIONS.length);
    for (const [i, s] of SECTIONS.entries()) {
      expect(ls[i].getAttribute("href")).toBe(`#man-${s.id}`);
      expect(ls[i].textContent).toBe(s.toc ?? s.title);
      expect(ls[i].className).toBe(s.level === 2 ? "man-toc__link is-sub" : "man-toc__link");
      expect(view.tocLinks.get(s.id)).toBe(ls[i]);
    }
    expect(ls[0].textContent).toBe("Bienvenida");
  });

  test("cada enlace del índice apunta a una sección que existe", async () => {
    const { view } = await montar();
    for (const a of links(view)) expect(view.article.querySelector(a.getAttribute("href"))).not.toBeNull();
  });

  test("los enlaces internos del texto (#man-…) también apuntan a secciones existentes", async () => {
    const { view } = await montar();
    const internos = [...view.article.querySelectorAll('a[href^="#man-"]')];
    expect(internos.length).toBeGreaterThan(0);
    for (const a of internos) expect(view.article.querySelector(a.getAttribute("href"))).not.toBeNull();
  });

  test("las tarjetas de la portada abren cada una de las cuatro vistas", async () => {
    const { view, ctx } = await montar();
    const cards = [...seccion(view, "inicio").querySelectorAll(".man-cards > button.man-card")];
    expect(cards.map((c) => c.querySelector("b").textContent)).toEqual(["Consola", "Cuerpo", "Piloto", "Gemelo 3D"]);
    expect(cards.map((c) => c.querySelector(".man-card__key").textContent)).toEqual(["1", "2", "3", "4"]);
    expect(cards.map((c) => c.querySelector("img").getAttribute("src"))).toEqual([
      "assets/manual/console-desktop.png",
      "assets/manual/body-desktop.png",
      "assets/manual/pilot-desktop.png",
      "assets/manual/twin-desktop.png",
    ]);
    for (const c of cards) {
      expect(c.getAttribute("type")).toBe("button");
      expect(c.querySelector("img").getAttribute("loading")).toBe("lazy");
      expect(c.querySelector("img").getAttribute("alt")).toBe("");
    }
    cards[2].click();
    expect(ctx.actions.switchView).toHaveBeenCalledTimes(1);
    expect(ctx.actions.switchView).toHaveBeenCalledWith("pilot");
  });

  test("si la imagen de una tarjeta no carga, se quita y la tarjeta queda solo con texto", async () => {
    const { view } = await montar();
    const card = seccion(view, "inicio").querySelector(".man-card");
    card.querySelector("img").dispatchEvent(new Event("error"));
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector("b").textContent).toBe("Consola");
  });

  test("cada vista explicada tiene su captura y un botón para probarla en vivo", async () => {
    const { view, ctx } = await montar();
    const casos = [
      ["vista-consola", "console", "Abrir la Consola", "1"],
      ["vista-cuerpo", "body", "Abrir el Cuerpo", "2"],
      ["vista-piloto", "pilot", "Abrir el Piloto", "3"],
      ["vista-gemelo", "twin", "Abrir el Gemelo 3D", "4"],
    ];
    for (const [id, vista, label, key] of casos) {
      const sec = seccion(view, id);
      const img = sec.querySelector(".man-shot .man-shot__stage > img");
      expect(img.getAttribute("src")).toBe(`assets/manual/${vista}-desktop.png`);
      expect(img.getAttribute("alt")).toBeTruthy();
      const tryBtn = sec.querySelector("button.man-try");
      expect(tryBtn.textContent).toBe(`${label}${key}`);
      expect(tryBtn.querySelector("kbd").textContent).toBe(key);
      expect(tryBtn.querySelector("span").innerHTML).toBe(html(icon("play", { size: 14 })));
      tryBtn.click();
      expect(ctx.actions.switchView).toHaveBeenLastCalledWith(vista);
    }
    expect(ctx.actions.switchView).toHaveBeenCalledTimes(4);
  });

  test("dibuja los cinco diagramas SVG con su epígrafe", async () => {
    const { view } = await montar();
    const figs = [...view.article.querySelectorAll("figure.man-diagram")];
    expect(figs).toHaveLength(5);
    for (const f of figs) {
      expect(f.querySelector(".man-diagram__art > svg[role='img']")).not.toBeNull();
      expect(f.querySelector("figcaption").textContent.length).toBeGreaterThan(0);
    }
    expect(seccion(view, "motores").querySelector(".man-diagram svg").getAttribute("aria-label")).toBe("Pata del Go2 con sus tres articulaciones");
    expect(seccion(view, "patas").querySelector(".man-diagram svg").getAttribute("aria-label")).toBe("Diagrama de marcha al trote");
  });

  test("las tablas tienen encabezado y filas con la cantidad de celdas del contenido", async () => {
    const { view } = await montar();
    const tablas = SECTIONS.flatMap((s) => (s.blocks ?? []).filter((b) => b.type === "table"));
    const doms = [...view.article.querySelectorAll(".man-table-wrap > table.man-table")];
    expect(doms).toHaveLength(tablas.length);
    tablas.forEach((t, i) => {
      expect([...doms[i].querySelectorAll("thead th")].map((th) => th.innerHTML)).toEqual(t.head.map(html));
      const filas = [...doms[i].querySelectorAll("tbody tr")];
      expect(filas).toHaveLength(t.rows.length);
      filas.forEach((tr, j) => expect([...tr.querySelectorAll("td")].map((td) => td.innerHTML)).toEqual(t.rows[j].map((c) => html(String(c)))));
    });
  });

  test("los pasos del laboratorio siguen la numeración desde el 3", async () => {
    const { view } = await montar();
    const listas = [...seccion(view, "robot-real").querySelectorAll("ol.man-steps")];
    expect(listas).toHaveLength(2);
    expect(listas[0].hasAttribute("start")).toBe(false);
    expect(listas[0].style.counterReset).toBe("step 0");
    expect(listas[1].getAttribute("start")).toBe("3");
    expect(listas[1].style.counterReset).toBe("step 2");
  });

  test("los avisos llevan el ícono de su tipo", async () => {
    const { view } = await montar();
    const tipos = { warn: "alert", tip: "bolt", info: "info" };
    const avisos = SECTIONS.flatMap((s) => (s.blocks ?? []).filter((b) => b.type === "callout"));
    const doms = [...view.article.querySelectorAll(".man-callout")];
    expect(doms).toHaveLength(avisos.length);
    avisos.forEach((b, i) => {
      expect(doms[i].className).toBe(`man-callout man-callout--${b.kind}`);
      expect(doms[i].innerHTML).toBe(html(`${icon(tipos[b.kind], { size: 18 })}<div>${b.html}</div>`));
    });
    expect(new Set(avisos.map((b) => b.kind))).toEqual(new Set(["warn", "tip", "info"]));
  });

  test("las listas sin numerar del contenido salen como <ul>", async () => {
    const { view } = await montar();
    const lista = seccion(view, "patas").querySelector(".man-list");
    expect(lista.tagName).toBe("UL");
    expect(lista.querySelectorAll("li")).toHaveLength(3);
    expect(lista.querySelector("li").innerHTML).toBe("<b>Quieto:</b> las cuatro patas apoyadas todo el tiempo.");
  });
});

describe("figuras anotadas", () => {
  test("las marcas de cada vista salen de marcas.json, pedido una sola vez y sin caché del navegador", async () => {
    const { view } = await montar();
    await flush();
    expect(g.fetch).toHaveBeenCalledTimes(1);
    expect(g.fetch).toHaveBeenCalledWith("assets/manual/marcas.json", { cache: "no-cache" });
    for (const [id, vista] of [["vista-consola", "console"], ["vista-cuerpo", "body"], ["vista-piloto", "pilot"], ["vista-gemelo", "twin"]]) {
      const sec = seccion(view, id);
      const markers = [...sec.querySelectorAll(".man-shot__stage > button.man-marker")];
      const esperadas = MARCAS[vista].map((p, i) => [p, i]).filter(([p]) => p);
      expect(markers).toHaveLength(esperadas.length);
      markers.forEach((m, k) => {
        const [[x, y], i] = esperadas[k];
        expect(m.textContent).toBe(String(i + 1));
        expect(m.getAttribute("aria-label")).toBe(`Referencia ${i + 1}`);
        expect(m.style.left).toBe(`${x}%`);
        expect(m.style.top).toBe(`${y}%`);
      });
      // La leyenda tiene una entrada por marca medida.
      expect(sec.querySelectorAll(".man-legend > li")).toHaveLength(MARCAS[vista].length);
    }
  });

  test("un segundo montaje reutiliza las marcas ya pedidas", async () => {
    const { ManualView } = await montar();
    await flush();
    const otro = document.createElement("div");
    new ManualView(makeCtx()).mount(otro);
    await flush();
    expect(g.fetch).toHaveBeenCalledTimes(1);
    expect(otro.querySelectorAll("[data-section='vista-consola'] .man-marker").length).toBeGreaterThan(0);
  });

  test("si marcas.json responde con error, las capturas quedan sin marcas pero con su leyenda", async () => {
    g.fetch.mockImplementation(async () => jsonResponse({ console: [[1, 1]] }, false));
    const { view } = await montar();
    await flush();
    const sec = seccion(view, "vista-consola");
    expect(sec.querySelectorAll(".man-marker")).toHaveLength(0);
    expect(sec.querySelectorAll(".man-legend > li")).toHaveLength(MARCAS.console.length);
  });

  test("si no se puede pedir marcas.json, el manual igual se muestra sin marcas", async () => {
    g.fetch.mockImplementation(async () => {
      throw new TypeError("sin red");
    });
    const { view } = await montar();
    await flush();
    expect(view.article.querySelectorAll("[data-section^='vista-'] .man-marker")).toHaveLength(0);
    expect(seccion(view, "vista-consola").querySelector(".man-shot img")).not.toBeNull();
  });

  test("las marcas fijas del contenido se dibujan sin pedir nada", async () => {
    const { view } = await montar();
    const barra = [...seccion(view, "primeros-pasos").querySelectorAll(".man-marker")];
    expect(barra.map((m) => m.style.left)).toEqual(["2.3%", "20.5%", "55.3%", "86.1%", "94.3%", "97.8%"]);
    expect(barra.every((m) => m.style.top === "50%")).toBe(true);
  });

  test("las capturas de la tira y del celular llevan su clase y reservan el alto correcto", async () => {
    const { view } = await montar();
    const [tira, celular] = [...seccion(view, "robot-real").querySelectorAll("figure.man-shot")];
    expect(tira.className).toBe("man-shot man-shot--strip");
    expect(tira.querySelector("img").style.aspectRatio).toBe("");
    expect(celular.className).toBe("man-shot man-shot--phone");
    expect(celular.querySelector("img").style.aspectRatio).toBe("570 / 855");
    const consola = seccion(view, "vista-consola").querySelector("figure.man-shot");
    expect(consola.className).toBe("man-shot");
    expect(consola.querySelector("img").style.aspectRatio).toBe("1366 / 716");
    expect(consola.querySelector("img").getAttribute("loading")).toBe("lazy");
    expect(consola.querySelector(".man-shot__frame > .man-shot__missing").textContent).toBe("Captura no disponible");
    expect(consola.querySelector("figcaption")).toBeNull();
    expect(tira.querySelector("figcaption").textContent).toBe("Paso 6: la etiqueta junto al nombre del robot. Haciendo clic se abre el panel.");
  });

  test("pasar el mouse por un ítem de la leyenda marca su número en la captura, y al salir se apaga", async () => {
    const { view } = await montar();
    await flush();
    const sec = seccion(view, "vista-consola");
    const items = [...sec.querySelectorAll(".man-legend > li")];
    const markers = [...sec.querySelectorAll(".man-marker")];
    expect(items[2].getAttribute("tabindex")).toBe("0");
    expect(items[2].querySelector(".man-legend__n").textContent).toBe("3");
    items[2].dispatchEvent(new Event("mouseenter"));
    expect(markers[2].classList.contains("is-hot")).toBe(true);
    expect(items[2].classList.contains("is-hot")).toBe(true);
    expect(sec.querySelectorAll(".is-hot")).toHaveLength(2);
    items[2].dispatchEvent(new Event("mouseleave"));
    expect(sec.querySelectorAll(".is-hot")).toHaveLength(0);
    items[4].dispatchEvent(new Event("focus"));
    expect(markers[4].classList.contains("is-hot")).toBe(true);
    items[4].dispatchEvent(new Event("blur"));
    expect(markers[4].classList.contains("is-hot")).toBe(false);
  });

  test("pasar el mouse o enfocar una marca resalta su ítem de la leyenda", async () => {
    const { view } = await montar();
    await flush();
    const sec = seccion(view, "vista-cuerpo");
    const items = [...sec.querySelectorAll(".man-legend > li")];
    const m = sec.querySelectorAll(".man-marker")[1];
    m.dispatchEvent(new Event("mouseenter"));
    expect(items[1].classList.contains("is-hot")).toBe(true);
    expect(m.classList.contains("is-hot")).toBe(true);
    m.dispatchEvent(new Event("mouseleave"));
    expect(items[1].classList.contains("is-hot")).toBe(false);
    m.dispatchEvent(new Event("focus"));
    expect(items[1].classList.contains("is-hot")).toBe(true);
    m.dispatchEvent(new Event("blur"));
    expect(items[1].classList.contains("is-hot")).toBe(false);
    expect(m.classList.contains("is-hot")).toBe(false);
  });

  test("hacer clic en una marca lleva su ítem de la leyenda a la vista", async () => {
    const { view } = await montar();
    await flush();
    const sec = seccion(view, "vista-piloto");
    const items = [...sec.querySelectorAll(".man-legend > li")];
    items.forEach((li) => (li.scrollIntoView = vi.fn()));
    sec.querySelectorAll(".man-marker")[3].click();
    expect(items[3].scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
    expect(items.filter((li) => li.scrollIntoView.mock.calls.length)).toEqual([items[3]]);
  });

  test("si la captura no carga, la figura avisa que no está disponible", async () => {
    const { view } = await montar();
    const fig = seccion(view, "vista-gemelo").querySelector("figure.man-shot");
    fig.querySelector("img").dispatchEvent(new Event("error"));
    expect(fig.classList.contains("is-missing")).toBe(true);
    expect(seccion(view, "vista-piloto").querySelector("figure.man-shot").classList.contains("is-missing")).toBe(false);
  });
});

describe("bloques poco comunes (contenido de prueba)", () => {
  const SINTETICO = [
    {
      id: "a",
      title: "Sección A",
      blocks: [
        { type: "callout", html: "sin tipo" },
        { type: "list", ordered: true, items: ["uno", "dos"] },
        { type: "steps", items: ["primero"] },
        { type: "diagram", svg: "<svg></svg>" },
        { type: "cards", items: [{ section: "b", title: "Ir a B", text: "texto" }] },
        { type: "try", view: "body" },
        { type: "desconocido" },
        { type: "figure", src: "x.png", alt: "x", markers: [null, [10, 20], [30, 40]], legend: [["Uno", "t1"]] },
        { type: "figure", src: "y.png", alt: "y", marks: "inexistente" },
        { type: "figure", src: "z.png", alt: "z" },
      ],
    },
    { id: "b", title: "Sección B", level: 2 },
  ];

  test("un aviso sin tipo es informativo", async () => {
    const { view } = await montar({ sections: SINTETICO });
    const c = view.article.querySelector(".man-callout");
    expect(c.className).toBe("man-callout man-callout--info");
    expect(c.innerHTML).toBe(html(`${icon("info", { size: 18 })}<div>sin tipo</div>`));
  });

  test("una lista numerada sale como <ol> y los pasos sin inicio arrancan en 1", async () => {
    const { view } = await montar({ sections: SINTETICO });
    const ol = view.article.querySelector("ol.man-list");
    expect([...ol.children].map((li) => li.innerHTML)).toEqual(["uno", "dos"]);
    expect(view.article.querySelector("ol.man-steps").style.counterReset).toBe("step 0");
  });

  test("un diagrama sin epígrafe no tiene figcaption", async () => {
    const { view } = await montar({ sections: SINTETICO });
    const fig = view.article.querySelector("figure.man-diagram");
    expect(fig.querySelector(".man-diagram__art").innerHTML).toBe("<svg></svg>");
    expect(fig.querySelector("figcaption")).toBeNull();
  });

  test("una tarjeta que apunta a una sección lleva hasta ella sin cambiar de vista", async () => {
    const { view, ctx } = await montar({ sections: SINTETICO });
    const card = view.article.querySelector(".man-card");
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector(".man-card__key").textContent).toBe("");
    Object.defineProperty(seccion(view, "b"), "offsetTop", { value: 516 });
    card.click();
    expect(ctx.actions.switchView).not.toHaveBeenCalled();
    expect(view.scroller.scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
    expect(location.hash).toBe("#man-b");
  });

  test("el botón de probar en vivo sin texto ni tecla dice 'Probar en vivo'", async () => {
    const { view, ctx } = await montar({ sections: SINTETICO });
    const btn = view.article.querySelector(".man-try");
    expect(btn.textContent).toBe("Probar en vivo");
    expect(btn.querySelector("kbd")).toBeNull();
    btn.click();
    expect(ctx.actions.switchView).toHaveBeenCalledWith("body");
  });

  test("un bloque de tipo desconocido deja un <div> vacío", async () => {
    const { view } = await montar({ sections: SINTETICO });
    const hijos = [...seccion(view, "a").children];
    const div = hijos.find((el) => el.tagName === "DIV" && el.className === "");
    expect(div).toBeDefined();
    expect(div.childNodes).toHaveLength(0);
  });

  test("una marca sin medir (null) se saltea y conserva la numeración de las demás", async () => {
    const { view } = await montar({ sections: SINTETICO });
    const fig = view.article.querySelectorAll("figure.man-shot")[0];
    const ms = [...fig.querySelectorAll(".man-marker")];
    expect(ms.map((m) => m.textContent)).toEqual(["2", "3"]);
    expect(ms.map((m) => [m.style.left, m.style.top])).toEqual([["10%", "20%"], ["30%", "40%"]]);
    expect(fig.querySelector("figcaption")).toBeNull();
    // El ítem 1 no tiene marca: resaltarlo no rompe nada.
    const li = fig.querySelector(".man-legend > li");
    li.dispatchEvent(new Event("mouseenter"));
    expect(li.classList.contains("is-hot")).toBe(true);
    expect(fig.querySelectorAll(".man-marker.is-hot")).toHaveLength(0);
    // La marca 3 no tiene ítem: resaltarla y hacer clic no rompe nada.
    ms[1].dispatchEvent(new Event("mouseenter"));
    expect(ms[1].classList.contains("is-hot")).toBe(true);
    expect(() => ms[1].click()).not.toThrow();
  });

  test("una figura con marcas de una vista que no está en marcas.json queda sin marcas ni leyenda", async () => {
    const { view } = await montar({ sections: SINTETICO });
    await flush();
    expect(g.fetch).toHaveBeenCalledTimes(1);
    const fig = view.article.querySelectorAll("figure.man-shot")[1];
    expect(fig.querySelectorAll(".man-marker")).toHaveLength(0);
    expect(fig.querySelectorAll(".man-legend > li")).toHaveLength(0);
  });

  test("una figura sin marcas no pide marcas.json", async () => {
    const { view } = await montar({ sections: [{ id: "a", title: "A", blocks: [SINTETICO[0].blocks[9]] }] });
    await flush();
    expect(g.fetch).not.toHaveBeenCalled();
    expect(view.article.querySelectorAll(".man-marker")).toHaveLength(0);
  });

  test("una sección sin bloques muestra solo su título", async () => {
    const { view } = await montar({ sections: SINTETICO });
    const b = seccion(view, "b");
    expect([...b.children].map((el) => el.tagName)).toEqual(["H3"]);
    expect(links(view)[1].textContent).toBe("Sección B");
  });
});

describe("navegación", () => {
  test("hacer clic en el índice desplaza suave hasta la sección y actualiza la dirección", async () => {
    history.replaceState(null, "", "/app?robot=go2#otra");
    const { view } = await montar();
    Object.defineProperty(seccion(view, "imu"), "offsetTop", { value: 1216 });
    const link = view.tocLinks.get("imu");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(g.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(view.scroller.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "smooth" });
    expect(location.pathname).toBe("/app");
    expect(location.search).toBe("?robot=go2");
    expect(location.hash).toBe("#man-imu");
  });

  test("con movimiento reducido, el salto es instantáneo", async () => {
    g.matchMedia.mockImplementation((q) => ({ matches: true, media: q }));
    const { view } = await montar();
    view.goTo("bateria");
    expect(view.scroller.scrollTo).toHaveBeenCalledWith({ top: -16, behavior: "auto" });
    expect(location.hash).toBe("#man-bateria");
  });

  test("goTo a una sección que no existe no mueve nada ni cambia la dirección", async () => {
    const { view } = await montar();
    view.goTo("no-existe");
    expect(view.scroller.scrollTo).not.toHaveBeenCalled();
    expect(location.hash).toBe("");
  });

  test("al entrar con #man-<sección> en la dirección, salta ahí sin animación", async () => {
    history.replaceState(null, "", "/app#man-alarmas");
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const { view } = await montar();
    expect(g.raf).toHaveBeenCalledTimes(1);
    Object.defineProperty(seccion(view, "alarmas"), "offsetTop", { value: 816 });
    g.frames[0]();
    expect(view.scroller.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "auto" });
    expect(location.hash).toBe("#man-alarmas");
  });

  test("mientras cargan las imágenes (hasta 2,5 s) vuelve a saltar a la sección pedida", async () => {
    history.replaceState(null, "", "/app#man-alarmas");
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const { view } = await montar();
    const imgs = [...view.article.querySelectorAll("img")];
    expect(imgs.length).toBeGreaterThan(2);
    now.mockReturnValue(3499);
    imgs[0].dispatchEvent(new Event("load"));
    expect(view.scroller.scrollTo).toHaveBeenCalledTimes(1);
    expect(view.scroller.scrollTo).toHaveBeenLastCalledWith({ top: -16, behavior: "auto" });
    // Cada imagen avisa una sola vez.
    imgs[0].dispatchEvent(new Event("load"));
    expect(view.scroller.scrollTo).toHaveBeenCalledTimes(1);
    // Pasado el plazo, el usuario ya está leyendo: no se lo mueve.
    now.mockReturnValue(3500);
    imgs[1].dispatchEvent(new Event("load"));
    expect(view.scroller.scrollTo).toHaveBeenCalledTimes(1);
  });

  test("un #man-… que no es una sección, o una dirección sin hash, no programa ningún salto", async () => {
    history.replaceState(null, "", "/app#man-nada");
    await montar();
    history.replaceState(null, "", "/app");
    await montar();
    history.replaceState(null, "", "/app#");
    await montar();
    expect(g.raf).not.toHaveBeenCalled();
  });

  test("J y K pasan a la sección siguiente y a la anterior de la que se está leyendo", async () => {
    const { view } = await montar();
    const ids = SECTIONS.map((s) => s.id);
    // Sin ninguna activa, cuenta como si se estuviera en la primera.
    expect(view.onKey({ key: "j" })).toBe(true);
    expect(location.hash).toBe(`#man-${ids[1]}`);
    g.matchMedia.mockClear();
    const obs = FakeIntersectionObserver.instances.at(-1);
    obs.fire([seccion(view, ids[5])]);
    expect(view.onKey({ key: "k" })).toBe(true);
    expect(location.hash).toBe(`#man-${ids[4]}`);
    expect(view.onKey({ key: "j" })).toBe(true);
    expect(location.hash).toBe(`#man-${ids[6]}`);
  });

  test("J en la última sección y K en la primera no se pasan del borde", async () => {
    const { view } = await montar();
    const ids = SECTIONS.map((s) => s.id);
    const obs = FakeIntersectionObserver.instances.at(-1);
    obs.fire([seccion(view, ids.at(-1))]);
    view.onKey({ key: "j" });
    expect(location.hash).toBe(`#man-${ids.at(-1)}`);
    obs.fire([seccion(view, ids[0])]);
    view.onKey({ key: "k" });
    expect(location.hash).toBe(`#man-${ids[0]}`);
  });

  test("las demás teclas no las consume", async () => {
    const { view } = await montar();
    expect(view.onKey({ key: "x" })).toBe(false);
    expect(view.onKey({ key: "J" })).toBe(false);
    expect(view.scroller.scrollTo).not.toHaveBeenCalled();
  });
});

describe("índice que sigue la lectura", () => {
  test("observa todas las secciones con el lector como raíz", async () => {
    const { view } = await montar();
    const obs = FakeIntersectionObserver.instances.at(-1);
    expect(view.observer).toBe(obs);
    expect(obs.options).toEqual({ root: view.scroller, rootMargin: "-10% 0px -80% 0px" });
    expect(obs.observed).toEqual([...view.article.querySelectorAll("section[data-section]")]);
    expect(obs.observed).toHaveLength(SECTIONS.length);
  });

  test("resalta solo el enlace de la sección que entra en pantalla", async () => {
    const { view } = await montar();
    const obs = FakeIntersectionObserver.instances.at(-1);
    obs.fire([seccion(view, "imu")]);
    expect(activos(view)).toEqual(["#man-imu"]);
    obs.fire([seccion(view, "bateria")]);
    expect(activos(view)).toEqual(["#man-bateria"]);
  });

  test("una sección que sale de pantalla no cambia el resaltado", async () => {
    const { view } = await montar();
    const obs = FakeIntersectionObserver.instances.at(-1);
    obs.fire([seccion(view, "imu")]);
    obs.fire([seccion(view, "bateria"), false], [seccion(view, "patas"), false]);
    expect(activos(view)).toEqual(["#man-imu"]);
  });
});

describe("barra de progreso de lectura", () => {
  const medidas = (el, { scrollHeight, clientHeight, scrollTop }) => {
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
    Object.defineProperty(el, "scrollTop", { configurable: true, value: scrollTop });
  };

  test("crece con la proporción leída", async () => {
    const { view } = await montar();
    medidas(view.scroller, { scrollHeight: 1000, clientHeight: 200, scrollTop: 400 });
    view.scroller.dispatchEvent(new Event("scroll"));
    expect(view.progress.style.transform).toBe("scaleX(0.5)");
    medidas(view.scroller, { scrollHeight: 1000, clientHeight: 200, scrollTop: 800 });
    view.scroller.dispatchEvent(new Event("scroll"));
    expect(view.progress.style.transform).toBe("scaleX(1)");
  });

  test("si todo entra en pantalla queda en cero", async () => {
    const { view } = await montar();
    medidas(view.scroller, { scrollHeight: 1000, clientHeight: 200, scrollTop: 400 });
    view.scroller.dispatchEvent(new Event("scroll"));
    medidas(view.scroller, { scrollHeight: 300, clientHeight: 300, scrollTop: 0 });
    view.scroller.dispatchEvent(new Event("scroll"));
    expect(view.progress.style.transform).toBe("scaleX(0)");
  });
});

describe("estado de la conexión", () => {
  test("al montar muestra si hay datos en vivo según la conexión del contexto", async () => {
    const { view } = await montar({ ctx: makeCtx({ state: "live" }) });
    expect(view.live.className).toBe("man-live");
    expect(view.live.dataset.live).toBe("true");
    expect(view.live.textContent).toBe("datos en vivo");
  });

  test("cualquier estado que no sea 'live' (o ninguno) es 'sin conexión'", async () => {
    const { view } = await montar();
    expect(view.live.dataset.live).toBe("false");
    expect(view.live.textContent).toBe("sin conexión");
    view.onConnection({ state: "live" });
    expect(view.live.textContent).toBe("datos en vivo");
    for (const conn of [{ state: "stale" }, { state: "reconnecting" }, null, undefined]) {
      view.onConnection(conn);
      expect(view.live.dataset.live).toBe("false");
      expect(view.live.textContent).toBe("sin conexión");
    }
  });

  test("setInfo y update con datos reales del Go2 y del G1 no tocan el manual", async () => {
    const { view } = await montar({ ctx: makeCtx({ state: "live" }) });
    const antes = container.innerHTML;
    for (const modelo of ["go2", "g1"]) {
      const sim = new PaseoSim(modelo);
      sim.advance(1);
      const info = sim.info();
      const frame = normalizeFrame(sim.telemetria(), 1000);
      expect(frame.motores).toHaveLength(modelo === "go2" ? 12 : 29);
      expect(view.setInfo(info)).toBeUndefined();
      expect(view.update(frame)).toBeUndefined();
    }
    expect(container.innerHTML).toBe(antes);
  });
});

describe("destroy", () => {
  test("desconecta el observer y deja de escuchar el scroll", async () => {
    const { view } = await montar();
    const obs = view.observer;
    view.destroy();
    expect(obs.disconnect).toHaveBeenCalledTimes(1);
    Object.defineProperty(view.scroller, "scrollHeight", { value: 1000 });
    Object.defineProperty(view.scroller, "scrollTop", { value: 500 });
    view.scroller.dispatchEvent(new Event("scroll"));
    expect(view.progress.style.transform).toBe("");
  });

  test("se puede llamar sin haber montado", async () => {
    vi.resetModules();
    const { default: ManualView } = await import(VIEW);
    expect(() => new ManualView(makeCtx()).destroy()).not.toThrow();
  });
});
