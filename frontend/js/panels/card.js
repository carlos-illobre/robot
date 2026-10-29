/** Estructura común de todas las tarjetas del dashboard. */
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

export function card({ id, iconName, title, subtitle = "", actions = [], className = "", tag }) {
  const sub = h("p", { class: "card__subtitle" }, subtitle);
  const head = h(
    "header",
    { class: "card__head" },
    h("div", { class: "card__icon", html: icon(iconName, { size: 18 }) }),
    h("div", { class: "card__titles" }, h("h2", { class: "card__title" }, title, tag ? h("span", { class: "tag" }, tag) : null), sub),
    h("div", { class: "card__actions" }, ...actions),
  );
  const body = h("div", { class: "card__body" });
  const el = h("section", { class: `card ${className}`, id, "aria-labelledby": `${id}-title` }, head, body);
  head.querySelector("h2").id = `${id}-title`;
  return { el, head, body, sub };
}

/** Grupo de botones segmentados accesible (role=radiogroup). */
export function segmented(options, value, onChange, label) {
  const group = h("div", { class: "segmented", role: "radiogroup", "aria-label": label });
  const buttons = options.map(([val, text]) => {
    const b = h("button", { type: "button", role: "radio", "aria-checked": String(val === value), dataset: { value: val } }, text);
    b.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-checked", String(other === b));
      onChange(val);
    });
    return b;
  });
  group.append(...buttons);
  group.setValue = (v) => buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === String(v))));
  return group;
}
