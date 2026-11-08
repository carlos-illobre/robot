# ADR 0013: Polling con `setTimeout` encadenado y reconexión con backoff exponencial y jitter

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [001](../../specs/001-telemetria-tiempo-real/spec.md) |

## Contexto

- Con `setInterval`, si el servidor tarda más que el intervalo, las peticiones se apilan y las
  respuestas llegan desordenadas.
- En el laboratorio hay ~30 dashboards conectados al mismo backend. Cuando el backend se reinicia,
  si todos reconectan cada 1 s **en el mismo instante**, lo saturan apenas levanta.

## Decisión

- **Polling:** cada petición programa la siguiente con `setTimeout` recién cuando termina (nunca
  hay dos en vuelo), con *timeout* propio por petición.
- **WebSocket:** al cortarse, reintento con demora `min(8 s, 0,5 s · 2^n)` y **±25 % de azar**
  (*jitter*). El contador vuelve a cero al reconectar.
- **Sin datos:** si no llega una muestra en 2 s, el estado pasa a "sin datos" (`stale`) aunque la
  conexión siga abierta.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| `setInterval` | Peticiones apiladas y desordenadas |
| Reintentar cada 1 s fijo | Estampida sincronizada sobre el servidor recién levantado |
| Backoff sin jitter | Los clientes que se cayeron juntos siguen reintentando juntos |

## Consecuencias

**A favor**

- El dashboard se recupera solo de reinicios del backend y cortes de WiFi.
- `backoffDelay` es una función pura con el azar inyectado: se prueba sin esperar.

**En contra**

- Después de un corte largo, hasta 8 s (±25 %) para volver a ver datos.

## Referencias

- `frontend/js/services/WebSocketTransport.js` › `backoffDelay`,
  `frontend/js/services/PollingTransport.js`, `TelemetryService` › `#checkStale`
