/**
 * Cliente REST mínimo para la API de telemetría de la cátedra.
 * Todas las llamadas tienen timeout: un fetch colgado nunca debe congelar la UI.
 */
export class ApiClient {
  constructor(baseUrl, { timeoutMs = 2500 } = {}) {
    this.baseUrl = ApiClient.normalizeBaseUrl(baseUrl);
    this.timeoutMs = timeoutMs;
  }

  /** "10.0.0.5:8001/" → "http://10.0.0.5:8001" */
  static normalizeBaseUrl(url) {
    let u = String(url ?? "").trim();
    if (!u) throw new Error("Falta la dirección del servidor");
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
    return u.replace(/\/+$/, "");
  }

  /** "http://host:8001" → "ws://host:8001/ws" (o wss si la página es https) */
  static toWebSocketUrl(baseUrl, path = "/ws") {
    const u = new URL(ApiClient.normalizeBaseUrl(baseUrl));
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = path;
    return u.toString();
  }

  async get(path, { signal } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException("Timeout", "TimeoutError")), this.timeoutMs);
    signal?.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          detail = (await res.json()).detail ?? detail;
        } catch { /* cuerpo no JSON */ }
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  info(opts) {
    return this.get("/info", opts);
  }

  telemetria(opts) {
    return this.get("/telemetria", opts);
  }
}
