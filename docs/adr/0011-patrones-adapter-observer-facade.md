# ADR 0011: Adapter, Observer y Facade para desacoplar los datos de la presentación

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [001](../../specs/001-telemetria-tiempo-real/spec.md) · [Constitución, principio II](../../specs/constitution.md) · [Consigna](../consigna.md) |

## Contexto

La consigna pide que la fuente de datos (robot real, simulador o demo) y la presentación no se
conozcan, usando **Adapter, Observer y Facade**. Además el robot habla en radianes, milivoltios y
cuaterniones con nombres del SDK de Unitree, y la interfaz quiere grados, voltios y ángulos de Euler.

## Decisión

- **Adapter**, dos veces: en el backend `telemetry_adapter.py` (de la cátedra) traduce el
  *snapshot* crudo al JSON de `docs/API.md`; en el frontend `normalizeFrame()` garantiza tipos,
  completa faltantes y calcula una sola vez las métricas compartidas (motor más caliente, patas
  apoyadas, desbalance de celdas).
- **Observer:** `EventBus` (`on`, `off`, `emit`). Si un suscriptor lanza una excepción, los
  demás igual se ejecutan.
- **Facade:** `TelemetryService` es la única puerta al backend (`connect`, `setTransport`,
  `disconnect`). Los paneles nunca llaman a `fetch` ni a `new WebSocket`.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Cada panel hace su propio `fetch` | N peticiones por muestra; cada panel tendría que saber del transporte |
| Normalizar solo en el backend | El frontend también se usa con el backend original de la cátedra y con el simulador del navegador |
| `EventTarget` del navegador | No aísla errores de un suscriptor y obliga a envolver todo en `CustomEvent` |

## Consecuencias

**A favor**

- Cambiar WebSocket por polling, o el robot por la demo, no toca una línea de la interfaz.
- Un panel con un error no deja al resto sin datos.

**En contra**

- Un salto de indirección más al depurar (el dato pasa por el bus).

## Referencias

- `frontend/js/core/telemetryModel.js`, `frontend/js/core/EventBus.js`,
  `frontend/js/services/TelemetryService.js`, `backend/api/telemetry_adapter.py`
- Diagrama de clases en [`docs/arquitectura.md`](../arquitectura.md#clases-de-los-patrones)
