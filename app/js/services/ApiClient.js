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

  get(path, opts) {
    return this.request(path, opts);
  }

  post(path, body, opts = {}) {
    return this.request(path, { ...opts, method: "POST", body });
  }

  async request(path, { signal, method = "GET", body, timeoutMs = this.timeoutMs } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
    signal?.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: ctrl.signal,
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
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

  /** Fuentes de datos del backend (ruta agregada por backend/fuentes.py). */
  fuentes(opts) {
    return this.get("/fuentes", opts);
  }

  /** Cambia la fuente del backend. Puede tardar: espera el primer dato (hasta 5 s). */
  cambiarFuente(pedido) {
    return this.post("/fuente", pedido, { timeoutMs: 9000 });
  }
}
