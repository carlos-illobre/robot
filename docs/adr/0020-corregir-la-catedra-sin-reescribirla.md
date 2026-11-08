# ADR 0020: Corregir los errores del material de la cátedra con cambios mínimos y documentados

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [README, "Hallazgos"](../../README.md#-hallazgos-tres-errores-en-el-material-de-la-cátedra) |

## Contexto

Al mover el modelo 3D oficial con la telemetría y al correr con Python 3.10 aparecieron tres errores
en el código provisto: los nombres de la cadera del G1 invertidos en `config.py`, las patas del Go2
cruzadas cuando los datos vienen del simulador, y el WebSocket que se cortaba después de una
muestra en Python 3.10 (`asyncio.TimeoutError` no es `TimeoutError` antes de 3.11).

## Decisión

Cada error se corrige con el **cambio más chico** posible, una prueba que lo demuestra y la
evidencia en el README:

- G1: se corrige el orden en `config.py`, con comentario.
- Go2 + simulador: un **Adapter** (`OrdenSimulador`) envuelve al lector del simulador y reordena
  los motores, sin tocar el lector de la cátedra.
- Python 3.10: `except (asyncio.TimeoutError, TimeoutError)`; la CI corre 3.10 y 3.12.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Reescribir el backend de la cátedra | Se pierde la posibilidad de comparar con el original |
| No corregir y solo documentar | El dashboard mostraría datos rotulados mal |
| Corregir en el frontend | El error es del backend; el frontend también se usa con otros backends |

## Consecuencias

**A favor**

- Cada diferencia con el material original tiene motivo, prueba y evidencia.

**En contra**

- Los errores 1 y 2 se verificaron cruzando archivos, no con un G1 real ni con MuJoCo corriendo.
  Para el backend original, el gemelo acepta `?mapeo=indice`.

## Referencias

- `backend/api/config.py`, `backend/servidor.py` › `OrdenSimulador`,
  `backend/api/telemetry_server.py` › `websocket_endpoint`
