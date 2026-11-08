// config.js: preferencias en localStorage y dirección inicial del servidor.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULTS, settings, resolveInitialServer, resolveBackendUrl, resolveInitialTransport } from "../../js/config.js";

const KEY = "tp05-dashboard";

/** Un `location` falso con lo que usan las funciones. */
function loc(href) {
  const u = new URL(href);
  return { search: u.search, protocol: u.protocol, pathname: u.pathname, origin: u.origin, hostname: u.hostname };
}

const urlOriginal = window.location.href;
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.happyDOM.setURL(urlOriginal);
});

describe("DEFAULTS", () => {
  it("cumple la consigna (polling ≤ 500 ms, ventana ≥ 60 muestras) y no se puede modificar", () => {
    expect(DEFAULTS).toEqual({ transport: "websocket", intervalMs: 250, historySize: 600, chartWindow: 150, torqueAlarm: 18 });
    expect(Object.isFrozen(DEFAULTS)).toBe(true);
  });
});

describe("settings", () => {
  it("guarda y lee valores en una sola clave JSON", () => {
    settings.set("baseUrl", "http://10.0.0.5:8001");
    settings.set("intervalMs", 300);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ baseUrl: "http://10.0.0.5:8001", intervalMs: 300 });
    expect(settings.get("baseUrl")).toBe("http://10.0.0.5:8001");
    expect(settings.get("intervalMs")).toBe(300);
  });

  it("set pisa solo la clave indicada", () => {
    settings.set("a", 1);
    settings.set("b", 2);
    settings.set("a", 3);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ a: 3, b: 2 });
  });

  it("devuelve el valor por defecto si no hay nada guardado (o es null)", () => {
    expect(settings.get("nada")).toBeUndefined();
    expect(settings.get("nada", "x")).toBe("x");
    settings.set("nulo", null);
    expect(settings.get("nulo", "x")).toBe("x");
    settings.set("cero", 0);
    expect(settings.get("cero", 5)).toBe(0); // 0 es un valor válido
  });

  it("con JSON corrupto se comporta como si estuviera vacío", () => {
    localStorage.setItem(KEY, "{no es json");
    expect(settings.get("baseUrl", "def")).toBe("def");
    settings.set("x", 1);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ x: 1 });
  });

  it("con el almacenamiento bloqueado no falla: lee el defecto y no guarda", () => {
    const set = vi.fn(() => {
      throw new DOMException("lleno", "QuotaExceededError");
    });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("bloqueado", "SecurityError");
      },
      setItem: set,
    });
    expect(settings.get("baseUrl", "def")).toBe("def");
    expect(() => settings.set("baseUrl", "x")).not.toThrow();
    expect(set).toHaveBeenCalledWith(KEY, JSON.stringify({ baseUrl: "x" }));
  });
});

describe("resolveInitialServer", () => {
  it("1. ?server= en la URL gana sobre todo", () => {
    settings.set("baseUrl", "http://guardado:8001");
    expect(resolveInitialServer(loc("http://robot.github.io/dashboard/?server=http://10.0.0.5:8001"))).toBe("http://10.0.0.5:8001");
  });

  it("un ?server= vacío se ignora", () => {
    expect(resolveInitialServer(loc("http://x.github.io/?server="))).toBe("demo");
  });

  it("2. si no, lo último que se usó", () => {
    settings.set("baseUrl", "http://guardado:8001");
    expect(resolveInitialServer(loc("http://localhost:8001/dashboard/"))).toBe("http://guardado:8001");
  });

  it("3. si el dashboard lo sirve el backend (/dashboard), el mismo origen", () => {
    expect(resolveInitialServer(loc("http://10.0.0.5:8001/dashboard/index.html"))).toBe("http://10.0.0.5:8001");
    expect(resolveInitialServer(loc("https://robot.example.com/dashboard"))).toBe("https://robot.example.com");
  });

  it("fuera de /dashboard o sin http no usa el origen", () => {
    expect(resolveInitialServer(loc("http://10.0.0.5:8001/otra/"))).toBe("http://localhost:8001");
    expect(resolveInitialServer(loc("file:///home/u/robot/frontend/dashboard/index.html"))).toBe("http://localhost:8001");
  });

  it("4. publicado en GitHub Pages usa el simulador del navegador", () => {
    expect(resolveInitialServer(loc("https://carlos.github.io/robot/"))).toBe("demo");
    expect(resolveInitialServer(loc("https://github.io.example.com/"))).toBe("http://localhost:8001");
  });

  it("5. si no, localhost:8001", () => {
    expect(resolveInitialServer(loc("http://127.0.0.1:5500/frontend/index.html"))).toBe("http://localhost:8001");
  });

  it("sin argumentos lee window.location", () => {
    window.happyDOM.setURL("https://carlos.github.io/robot/?server=demo-g1");
    expect(resolveInitialServer()).toBe("demo-g1");
  });
});

describe("resolveBackendUrl", () => {
  it("prefiere el último backend real guardado", () => {
    settings.set("backendUrl", "http://10.0.0.9:8001");
    expect(resolveBackendUrl(loc("http://10.0.0.5:8001/dashboard/"))).toBe("http://10.0.0.9:8001");
  });

  it("si el backend sirve el dashboard, el mismo origen", () => {
    expect(resolveBackendUrl(loc("http://10.0.0.5:8001/dashboard/"))).toBe("http://10.0.0.5:8001");
  });

  it("en otro caso, localhost:8001", () => {
    expect(resolveBackendUrl(loc("http://10.0.0.5:8001/"))).toBe("http://localhost:8001");
    expect(resolveBackendUrl(loc("file:///dashboard/index.html"))).toBe("http://localhost:8001");
    expect(resolveBackendUrl(loc("https://carlos.github.io/dashboardx"))).toBe("https://carlos.github.io");
  });

  it("sin argumentos lee window.location", () => {
    window.happyDOM.setURL("http://10.0.0.7:8001/dashboard/");
    expect(resolveBackendUrl()).toBe("http://10.0.0.7:8001");
  });
});

describe("resolveInitialTransport", () => {
  it.each(["polling", "websocket"])("?transport=%s se respeta", (t) => {
    settings.set("transport", t === "polling" ? "websocket" : "polling");
    expect(resolveInitialTransport(loc(`http://x/?transport=${t}`))).toBe(t);
  });

  it("un ?transport= desconocido se ignora y usa lo guardado", () => {
    settings.set("transport", "polling");
    expect(resolveInitialTransport(loc("http://x/?transport=carrier-pigeon"))).toBe("polling");
  });

  it("sin nada guardado usa WebSocket", () => {
    expect(resolveInitialTransport(loc("http://x/"))).toBe("websocket");
  });

  it("sin argumentos lee window.location", () => {
    window.happyDOM.setURL("http://x/?transport=polling");
    expect(resolveInitialTransport()).toBe("polling");
  });
});
