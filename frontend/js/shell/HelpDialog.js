/** Diálogo de ayuda: atajos globales, atajos de la vista actual y guía rápida. */
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { VIEWS } from "../views/registry.js";

export const GLOBAL_SHORTCUTS = [
  ["C", "Capturar muestra"],
  ["R", "Grabar / detener grabación continua"],
  ["E", "Exportar CSV"],
  ["Espacio", "Pausar / reanudar la vista"],
  ["W", "Cambiar WebSocket ↔ polling"],
  ["T", "Tema claro / oscuro"],
  ["1 2 3 4 5", "Cambiar de vista (5 = manual)"],
  ["?", "Esta ayuda"],
];

export function openHelp(dialog, view) {
  const keys = (list) =>
    h("dl", { class: "keys" }, ...list.map(([k, d]) => h("div", {}, h("dt", {}, d), h("dd", {}, ...k.split(" ").map((x) => h("kbd", {}, x))))));

  const viewShortcuts = view?.constructor?.shortcuts ?? [];
  const meta = VIEWS.find((v) => v.id === view?.constructor?.id);
  dialog.replaceChildren(
    h(
      "div",
      { class: "dialog__head" },
      h("h2", { id: "help-title" }, "Ayuda y atajos de teclado"),
      h("button", { class: "icon-btn", "aria-label": "Cerrar", onclick: () => dialog.close(), html: icon("x") }),
    ),
    h(
      "div",
      { class: "dialog__body" },
      h("section", {}, h("h3", {}, "En todas las vistas"), keys(GLOBAL_SHORTCUTS)),
      viewShortcuts.length ? h("section", {}, h("h3", {}, `Vista ${meta?.label ?? ""}`), keys(viewShortcuts)) : null,
      h(
        "section",
        {},
        h("h3", {}, "Semáforo de temperatura (igual que electroSim)"),
        h(
          "div",
          { class: "legend-sem" },
          h("span", {}, h("i", { style: { background: "var(--sem-ok)" } }), "menos de 40 °C"),
          h("span", {}, h("i", { style: { background: "var(--sem-warn)" } }), "de 40 a 60 °C"),
          h("span", {}, h("i", { style: { background: "var(--sem-crit)" } }), "más de 60 °C"),
        ),
      ),
      h(
        "section",
        {},
        h("h3", {}, "Las vistas"),
        h("p", {}, "Muestran los mismos datos, de la misma conexión: cambiar de vista no corta la conexión ni borra el historial ni las capturas."),
        h("ul", {}, ...VIEWS.map((v) => h("li", {}, h("b", {}, `${v.key} · ${v.label}: `), v.hint))),
      ),
    ),
  );
  dialog.showModal();
}
