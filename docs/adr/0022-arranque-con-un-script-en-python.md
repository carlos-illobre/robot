# ADR 0022: Un único script de arranque en Python (`iniciar.py`) y Docker como alternativa

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [001](../../specs/001-telemetria-tiempo-real/spec.md) |

## Contexto

El proyecto se prueba en Windows, macOS y Linux, y en el laboratorio corre en una notebook Linux
conectada al robot. Mantener `.sh` y `.bat` en paralelo duplica la lógica y los errores. El SDK
de Unitree necesita CycloneDDS compilado, lo que asusta a quien solo quiere ver la demo.

## Decisión

- `python iniciar.py` crea el entorno virtual, instala dependencias, levanta el backend y abre el
  navegador cuando responde. Igual en los tres sistemas; el SDK se instala solo si se pide.
- `docker/` ofrece una imagen con el SDK y el simulador MuJoCo ya compilados, como **opción**
  (para el robot real requiere Linux por `network_mode: host`).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| `.sh` + `.bat` | Dos scripts que divergen |
| Makefile | No viene en Windows |
| Docker como única forma | En Windows y macOS no ve la placa de red del robot |

## Consecuencias

**A favor**

- Un comando para todo el equipo; Python ya es requisito del backend.

**En contra**

- `iniciar.py` también hay que probarlo (está dentro de la cobertura del 100 %).

## Referencias

- `iniciar.py`, `docker/README.md`, `backend/tests/`
