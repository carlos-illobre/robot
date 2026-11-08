import { test, expect, beforeEach, afterEach } from "vitest";
import { openHelp, GLOBAL_SHORTCUTS } from "../../js/shell/HelpDialog.js";
import { VIEWS } from "../../js/views/registry.js";

let dialog;
beforeEach(() => {
  dialog = document.createElement("dialog");
  document.body.append(dialog);
});
afterEach(() => document.body.replaceChildren());

const sections = () => [...dialog.querySelectorAll(".dialog__body > section")];
const atajos = (section) =>
  [...section.querySelectorAll("dl.keys > div")].map((d) => [[...d.querySelectorAll("dd kbd")].map((k) => k.textContent).join(" "), d.querySelector("dt").textContent]);

class VistaConAtajos {
  static id = "pilot";
  static shortcuts = [["A D", "Girar"], ["F", "Pantalla completa"]];
}

test("los atajos globales son los del teclado de main.js", () => {
  expect(GLOBAL_SHORTCUTS.map(([k]) => k)).toEqual(["C", "R", "E", "Espacio", "W", "T", "G", "1 2 3 4 5", "?"]);
  expect(GLOBAL_SHORTCUTS).toHaveLength(9);
});

test("sin vista abre la ayuda con los atajos globales, el semáforo y las vistas", () => {
  openHelp(dialog, null);
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector(".dialog__head h2").id).toBe("help-title");
  expect(dialog.querySelector("h2").textContent).toBe("Ayuda y atajos de teclado");
  const [global, semaforo, vistas, ...resto] = sections();
  expect(resto).toEqual([]);
  expect(global.querySelector("h3").textContent).toBe("En todas las vistas");
  expect(atajos(global)).toEqual(GLOBAL_SHORTCUTS);
  expect([...global.querySelectorAll("dd")].at(-2).querySelectorAll("kbd")).toHaveLength(5);
  expect(semaforo.querySelector("h3").textContent).toBe("Semáforo de temperatura (igual que electroSim)");
  expect([...semaforo.querySelectorAll(".legend-sem span")].map((s) => [s.textContent, s.querySelector("i").style.background])).toEqual([
    ["menos de 40 °C", "var(--sem-ok)"],
    ["de 40 a 60 °C", "var(--sem-warn)"],
    ["más de 60 °C", "var(--sem-crit)"],
  ]);
  expect(vistas.querySelector("h3").textContent).toBe("Las vistas");
  expect(vistas.querySelector("p").textContent).toContain("no corta la conexión");
  expect([...vistas.querySelectorAll("li")].map((li) => li.textContent)).toEqual(VIEWS.map((v) => `${v.key} · ${v.label}: ${v.hint}`));
  expect(vistas.querySelector("li b").textContent).toBe("1 · Consola: ");
});

test("con una vista que tiene atajos, agrega su sección con su nombre", () => {
  openHelp(dialog, new VistaConAtajos());
  const s = sections();
  expect(s).toHaveLength(4);
  expect(s[1].querySelector("h3").textContent).toBe("Vista Piloto");
  expect(atajos(s[1])).toEqual([["A D", "Girar"], ["F", "Pantalla completa"]]);
});

test("una vista con atajos pero fuera del registro usa un título genérico", () => {
  class Otra {
    static shortcuts = [["X", "Algo"]];
  }
  openHelp(dialog, new Otra());
  expect(sections()[1].querySelector("h3").textContent).toBe("Vista ");
});

test("una vista sin atajos no agrega sección", () => {
  class Sin {
    static id = "console";
  }
  openHelp(dialog, new Sin());
  expect(sections()).toHaveLength(3);
  openHelp(dialog, Object.create(null));
  expect(sections()).toHaveLength(3);
});

test("el botón Cerrar cierra el diálogo", () => {
  openHelp(dialog, null);
  const btn = dialog.querySelector(".dialog__head button");
  expect(btn.className).toBe("icon-btn");
  expect(btn.getAttribute("aria-label")).toBe("Cerrar");
  expect(btn.querySelector("svg")).not.toBeNull();
  btn.click();
  expect(dialog.open).toBe(false);
});

test("reabrir reemplaza el contenido en vez de duplicarlo", () => {
  openHelp(dialog, new VistaConAtajos());
  dialog.close();
  openHelp(dialog, null);
  expect(dialog.querySelectorAll(".dialog__head")).toHaveLength(1);
  expect(sections()).toHaveLength(3);
});
