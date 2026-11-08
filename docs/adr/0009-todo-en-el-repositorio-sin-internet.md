# ADR 0009: Todo lo que el navegador necesita está en el repositorio (funciona sin internet)

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [Constitución, principio IV](../../specs/constitution.md) · [004](../../specs/004-vistas-y-gemelo-3d/spec.md) |

## Contexto

En el laboratorio la notebook se conecta al robot por **cable de red**; muchas veces esa red no
tiene salida a internet. Un dashboard que depende de un CDN se queda en blanco justo en la demo.

## Decisión

Chart.js, Three.js (con sus complementos), las fuentes tipográficas y los modelos 3D de los robots
se guardan en `frontend/vendor/`, `frontend/fonts/` y `frontend/assets/`. El backend sirve el
frontend ([ADR-0010](0010-el-backend-sirve-el-frontend.md)).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| CDN (jsDelivr, unpkg) | Sin internet no carga |
| Google Fonts | Ídem; además envía la IP de cada visitante a un tercero |
| npm + bundler | Contradice [ADR-0008](0008-javascript-sin-framework.md) |

## Consecuencias

**A favor**

- Funciona 100 % offline y con la misma versión de cada biblioteca siempre.

**En contra**

- El repositorio pesa ~5 MB más; las bibliotecas se actualizan a mano.

## Referencias

- `frontend/vendor/`, `frontend/fonts/`, `frontend/assets/robots/`
