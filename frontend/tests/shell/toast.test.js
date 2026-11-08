import { test, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { toast } from "../../js/ui/toast.js";
import { icon } from "../../js/ui/icons.js";

let region;
beforeAll(() => {
  region = document.createElement("div");
  region.id = "toasts";
  document.body.append(region);
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  region.replaceChildren();
});

const last = () => region.lastElementChild;

test("muestra el mensaje en la región #toasts como estado informativo", () => {
  toast("Hola <b>");
  const el = last();
  expect(el.className).toBe("toast toast--info");
  expect(el.getAttribute("role")).toBe("status");
  expect(el.querySelector("span").textContent).toBe("Hola <b>");
  expect(el.querySelector("svg").getAttribute("width")).toBe("16");
  expect(el.children).toHaveLength(2);
});

test.each([
  ["ok", "check", "status"],
  ["warn", "alert", "status"],
  ["crit", "alert", "alert"],
  ["info", "info", "status"],
  ["raro", "info", "status"],
])("el tipo %s usa el ícono %s y el rol %s", (kind, iconName, role) => {
  toast("x", { kind });
  const el = last();
  expect(el.classList.contains(`toast--${kind}`)).toBe(true);
  expect(el.getAttribute("role")).toBe(role);
  const ref = document.createElement("div");
  ref.innerHTML = icon(iconName, { size: 16 });
  expect(el.querySelector("svg").innerHTML).toBe(ref.firstElementChild.innerHTML);
});

test("entra en el cuadro siguiente y se va a los 3,5 s por defecto", () => {
  toast("x");
  const el = last();
  expect(el.classList.contains("is-in")).toBe(false);
  vi.advanceTimersByTime(20);
  expect(el.classList.contains("is-in")).toBe(true);
  vi.advanceTimersByTime(3500 - 21);
  expect(el.classList.contains("is-in")).toBe(true);
  vi.advanceTimersByTime(1);
  expect(el.classList.contains("is-in")).toBe(false);
  expect(el.isConnected).toBe(true);
  el.dispatchEvent(new Event("transitionend"));
  expect(el.isConnected).toBe(false);
});

test("si no hay transición, se quita igual a los 600 ms", () => {
  toast("x", { timeout: 1000 });
  const el = last();
  vi.advanceTimersByTime(1000);
  expect(el.isConnected).toBe(true);
  vi.advanceTimersByTime(599);
  expect(el.isConnected).toBe(true);
  vi.advanceTimersByTime(1);
  expect(el.isConnected).toBe(false);
});

test("varios toasts se apilan en la misma región", () => {
  toast("a");
  toast("b");
  expect([...region.children].map((e) => e.textContent)).toEqual(["a", "b"]);
});
