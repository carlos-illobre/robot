# Especificación 001: Telemetría en tiempo real

| | |
|---|---|
| **Estado** | ✅ Implementada (especificación retroactiva) |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Consigna: "Requisitos transversales" y "Extensión WebSocket" · [`docs/API.md`](../../docs/API.md) |

## Contexto y problema

El dashboard tiene que mostrar el estado del robot **mientras se mueve**. La consigna pide
actualización automática por polling a `/telemetria` con un intervalo máximo de 500 ms, o por
WebSocket como extensión. El backend es provisto por la cátedra y define el contrato.

## Historias de usuario

### HU-1 · Ver los datos sin tocar nada (P1)

**Como** operador del laboratorio **quiero** que el dashboard se actualice solo **para** ver qué le
pasa al robot sin recargar la página.

1. **Dado** un backend en modo demo, **cuando** abro el dashboard, **entonces** recibo ~10 muestras por segundo por WebSocket.
2. **Dado** que elijo polling, **cuando** pasan 500 ms, **entonces** ya se pidió al menos una muestra nueva.
3. **Dado** un servidor lento, **cuando** un pedido tarda más que el intervalo, **entonces** no se superponen pedidos.

### HU-2 · Recuperarse solo (P1)

**Como** operador **quiero** que si se corta la conexión el dashboard lo diga y se reconecte solo
**para** no perder la sesión ni las capturas.

1. **Dado** que el servidor se cae, **cuando** pasan unos segundos sin datos, **entonces** el dashboard muestra "sin datos".
2. **Dado** que el servidor vuelve, **cuando** el backoff vence, **entonces** se reconecta sin recargar.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | El backend DEBE exponer `GET /telemetria`, `/motores`, `/imu`, `/bms`, `/fuerzas`, `/info` y `WS /ws` según el contrato | `backend/tests/test_api.py` › `test_telemetria_respeta_el_contrato`, `test_endpoints_parciales`, `test_websocket_empuja_telemetria` |
| FR-002 | El polling NO DEBE superar 500 ms de intervalo | `frontend/tests/services.test.js` › "el polling nunca supera 500 ms" |
| FR-003 | El polling NO DEBE superponer pedidos | `services.test.js` › "no superpone pedidos" |
| FR-004 | El WebSocket DEBE reconectarse con backoff exponencial acotado y con jitter | `core.test.js` › "reconexión WebSocket con backoff"; E2E "si el servidor se cae…" |
| FR-005 | La Facade (`TelemetryService`) DEBE normalizar cada muestra y publicarla en el `EventBus` | `services.test.js` › "TelemetryService (Facade)…" |
| FR-006 | El dashboard DEBE avisar cuando dejan de llegar datos | `services.test.js` › "avisa cuando dejan de llegar datos" |
| FR-007 | El adaptador del frontend DEBE tolerar campos faltantes o con tipos inválidos | `core.test.js` › "normalizeFrame tolera…" |

## Requisitos no funcionales

| ID | Requisito |
|---|---|
| NFR-001 | El dibujo se agrupa en `requestAnimationFrame`: varias muestras en un cuadro se pintan una vez. |
| NFR-002 | Funciona con Python 3.10 a 3.13 (regresión del WebSocket en 3.10 cubierta por `test_websocket_sigue_abierto…`). |

## Código

`backend/api/telemetry_server.py`, `backend/api/telemetry_adapter.py`,
`frontend/js/services/*.js`, `frontend/js/core/telemetryModel.js`, `frontend/js/core/EventBus.js`.
