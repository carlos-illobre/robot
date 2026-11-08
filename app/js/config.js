/**
 * Configuración del dashboard y preferencias persistentes del usuario.
 *
 * Prioridad para la dirección del servidor:
 *   1. ?server=http://10.0.0.5:8001  en la URL (ideal para el día del robot real)
 *   2. lo último que se usó (localStorage)
 *   3. el mismo origen, si el dashboard lo sirve el propio backend
 *   4. "demo" (simulador en el navegador) si está publicado en GitHub Pages
 *   5. http://localhost:8001
 */
const STORAGE_KEY = "tp05-dashboard";

export const DEFAULTS = Object.freeze({
  transport: "websocket",   // "websocket" | "polling"
  intervalMs: 250,          // polling: la consigna pide como máximo 500 ms
  historySize: 600,         // muestras en memoria (~60 s a 10 Hz)
  chartWindow: 150,         // muestras visibles en los gráficos (≥ 60 por consigna)
  torqueAlarm: 18,          // N·m: umbral de alarma de torque
});

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {}; // modo privado, almacenamiento bloqueado o JSON corrupto
  }
}

export const settings = {
  get(key, fallback = undefined) {
    return readAll()[key] ?? fallback;
  },
  set(key, value) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [key]: value }));
    } catch { /* sin persistencia: no es crítico */ }
  },
};

export function resolveInitialServer(location = window.location) {
  const fromQuery = new URLSearchParams(location.search).get("server");
  if (fromQuery) return fromQuery;
  const saved = settings.get("baseUrl");
  if (saved) return saved;
  if (location.protocol.startsWith("http") && location.pathname.startsWith("/dashboard")) {
    return location.origin;
  }
  if (location.hostname.endsWith("github.io")) return "demo";
  return "http://localhost:8001";
}

/** Último backend real usado (para volver a él desde la simulación del navegador). */
export function resolveBackendUrl(location = window.location) {
  const saved = settings.get("backendUrl");
  if (saved) return saved;
  if (location.protocol.startsWith("http") && location.pathname.startsWith("/dashboard")) return location.origin;
  return "http://localhost:8001";
}

export function resolveInitialTransport(location = window.location) {
  const q = new URLSearchParams(location.search).get("transport");
  if (q === "polling" || q === "websocket") return q;
  return settings.get("transport", DEFAULTS.transport);
}
