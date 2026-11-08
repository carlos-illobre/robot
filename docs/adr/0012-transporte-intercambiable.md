# ADR 0012: WebSocket por defecto, polling y simulador como estrategias intercambiables

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [001](../../specs/001-telemetria-tiempo-real/spec.md) · [005](../../specs/005-fuentes-de-datos/spec.md) |

## Contexto

La API ofrece las dos formas: `GET /telemetria` (pull) y `WS /ws` (push a 10 Hz). Algunas redes
(con proxy) cortan WebSocket. En GitHub Pages no hay servidor.

## Decisión

Patrón **Strategy**: `WebSocketTransport`, `PollingTransport` y `SimTransport` exponen la misma
interfaz (`start()`, `stop()` y avisan por `onData` / `onState`). `TelemetryService` elige una
en tiempo de ejecución y se puede cambiar en caliente sin perder el historial. **WebSocket es la
opción por defecto**; la dirección `demo` usa el simulador del navegador.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Solo polling | Latencia del intervalo + una petición HTTP por muestra |
| Solo WebSocket | No funciona detrás de algunos proxies |
| Server-Sent Events | La API de la cátedra no lo ofrece |
| Cambio automático a polling si falla WebSocket | Esconde el problema de red que justamente se quiere ver en clase; el cambio es manual y visible |

## Consecuencias

**A favor**

- Se puede comparar en vivo la frecuencia y la latencia de cada estrategia (panel de estadísticas).
- La versión de GitHub Pages funciona igual, con la misma interfaz.

**En contra**

- Tres implementaciones de la misma interfaz que mantener.

## Referencias

- `frontend/js/services/*Transport.js`, [ADR-0013](0013-polling-encadenado-y-backoff.md)
- Diagrama de estados en [`docs/arquitectura.md`](../arquitectura.md#estados-de-la-conexión)
