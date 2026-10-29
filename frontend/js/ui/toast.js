/** Notificaciones efímeras ("toasts") con región aria-live para lectores de pantalla. */
import { h } from "./dom.js";
import { icon } from "./icons.js";

let region;

export function toast(message, { kind = "info", timeout = 3500 } = {}) {
  region ??= document.getElementById("toasts");
  const iconName = { ok: "check", warn: "alert", crit: "alert", info: "info" }[kind] ?? "info";
  const el = h("div", { class: `toast toast--${kind}`, role: kind === "crit" ? "alert" : "status" });
  el.innerHTML = `${icon(iconName, { size: 16 })}<span></span>`;
  el.querySelector("span").textContent = message;
  region.append(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  setTimeout(() => {
    el.classList.remove("is-in");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  }, timeout);
}
