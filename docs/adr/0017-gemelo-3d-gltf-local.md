# ADR 0017: Gemelo 3D con Three.js y modelos glTF comprimidos con meshoptimizer

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [004](../../specs/004-vistas-y-gemelo-3d/spec.md) |

## Contexto

El modelo oficial de Unitree viene en OBJ/STL: ~46 MB entre Go2 y G1. Por GitHub Pages o por el
WiFi del laboratorio eso tarda decenas de segundos. Además, GitHub Pages comprime con gzip y el
encabezado `Content-Length` indica el tamaño **comprimido**.

## Decisión

- Los modelos se convierten a **glTF + meshoptimizer** (~2 MB en total) y se decodifican con el
  `MeshoptDecoder` de Three.js, todo local ([ADR-0009](0009-todo-en-el-repositorio-sin-internet.md)).
- La descarga con progreso **no confía en `Content-Length`**: acumula los bloques que llegan.
- Cada articulación del modelo se mueve **por nombre** de motor (con `?mapeo=indice` como
  alternativa para el backend original de la cátedra).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| OBJ/STL originales | 46 MB |
| Draco | Comprime más la geometría, pero su decodificador es más pesado y más lento al abrir el modelo |
| Reservar el buffer con `Content-Length` | Rompía la descarga en GitHub Pages (error real encontrado al publicar) |

## Consecuencias

**A favor**

- El gemelo aparece en menos de un segundo.
- Mover el modelo por nombre reveló dos errores en el material de la cátedra
  ([ADR-0020](0020-corregir-la-catedra-sin-reescribirla.md)).

**En contra**

- Hay que regenerar los glTF si Unitree actualiza el modelo.

## Referencias

- `frontend/js/views/twin/RobotRig.js`, `frontend/js/views/twin/Stage3D.js`, `frontend/assets/robots/`
