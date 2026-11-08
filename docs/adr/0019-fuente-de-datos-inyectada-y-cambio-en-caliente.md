# ADR 0019: La fuente de datos se fabrica, se inyecta y se cambia en caliente de forma transaccional

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [005](../../specs/005-fuentes-de-datos/spec.md) |

## Contexto

Hay cuatro fuentes posibles: el robot real (DDS por cable), el simulador MuJoCo de la cátedra, la
demo "paseo" y la demo original de la cátedra. El servidor de la cátedra
(`telemetry_server.py`) recibe **un** lector al arrancar con `configurar()`. En clase hace falta
pasar de la demo al robot sin reiniciar el backend ni dejar los dashboards en blanco si el robot
no responde.

## Decisión

- **Factory Method:** `crear_lector(modo, robot, interfaz)` en `backend/servidor.py` decide qué
  lector crear. Todos cumplen la misma interfaz (`obtener_snapshot()`, `esperar_primer_dato()`,
  `mensajes_leidos`, `cerrar()`), así que el servidor no sabe cuál tiene.
- **Inyección de dependencias:** `backend/fuentes.py` agrega `GET /fuentes` y `POST /fuente`
  como un router que recibe `crear_lector` y `configurar` por parámetro, **sin modificar**
  `telemetry_server.py`.
- **Cambio transaccional:** el lector nuevo tiene que entregar un dato en 5 s; recién entonces
  reemplaza al viejo, que se cierra. Si falla, se informa el error y sigue la fuente anterior. Un
  candado evita que dos dashboards cambien a la vez.
- Se puede bloquear con `--fuente-fija` (el cambio afecta a todos los dashboards conectados).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Elegir la fuente solo al arrancar (`--modo`) | Cambiar de demo a robot obliga a reiniciar el backend en plena clase |
| Modificar `telemetry_server.py` | Es código de la cátedra; tocarlo dificulta comparar con el original |
| Cerrar el lector viejo antes de abrir el nuevo | Si el robot no responde, los dashboards quedan sin datos |

## Consecuencias

**A favor**

- El dashboard ofrece las fuentes disponibles y explica por qué alguna no lo está (SDK no
  instalado, simulador cerrado).
- La API sigue siendo de **solo lectura** respecto del robot: cambiar la fuente decide de dónde lee
  el backend, nunca mueve al robot.

**En contra**

- Durante el cambio conviven dos lectores hasta 5 s.

## Referencias

- `backend/servidor.py` › `crear_lector`, `backend/fuentes.py`, `backend/tests/`
- Diagrama de secuencia en [`docs/arquitectura.md`](../arquitectura.md#cambio-de-fuente-en-caliente)
