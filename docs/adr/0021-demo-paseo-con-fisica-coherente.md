# ADR 0021: Una demo propia con física de juguete coherente

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [005](../../specs/005-fuentes-de-datos/spec.md) |

## Contexto

El `DemoReader` de la cátedra genera senoidales independientes: la temperatura nunca pasa de
~43 °C (el semáforo nunca se pone rojo) y las patas apoyan al azar. Para evaluar el dashboard sin
robot hacen falta datos que **se relacionen** como en el robot.

## Decisión

`PaseoDemoReader` (`backend/api/demo_paseo.py`) sigue un guion (quieto, camina, curva, trota,
gira…) y deriva todo de él: velocidad → marcha → ángulos y velocidades de los motores; esfuerzo →
torque → temperatura (ley de enfriamiento de Newton con calor por efecto Joule) y corriente →
batería. Se integra con Euler a 50 Hz. Implementa la **misma interfaz** que el lector DDS. Es la
fuente por defecto; la demo de la cátedra sigue disponible.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Solo la demo de la cátedra | No ejercita las alarmas ni el diagrama de apoyos |
| Exigir el simulador MuJoCo | Instalación pesada; no corre en todas las máquinas del laboratorio |
| Reproducir una grabación del robot | No hay grabaciones reales disponibles |

## Consecuencias

**A favor**

- Los tres colores del semáforo aparecen solos (hay una prueba que lo verifica).
- La misma lógica se portó a JavaScript (`frontend/js/core/paseoSim.js`) para la versión de
  GitHub Pages, sin servidor.

**En contra**

- Los valores son **coherentes pero no medidos**; contra el robot real los números serán otros
  (por eso los umbrales son configurables).

## Referencias

- `backend/api/demo_paseo.py`, `frontend/js/core/paseoSim.js`, README › "El modo demo paseo"
