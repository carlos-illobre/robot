# ADR 0016: Vistas intercambiables con un contrato común y carga diferida

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [004](../../specs/004-vistas-y-gemelo-3d/spec.md) |

## Contexto

Los mismos datos se presentan de cuatro maneras (Consola, Cuerpo, Piloto, Gemelo 3D) y un manual.
Cargar todo al inicio obliga a descargar Three.js (~700 kB) y los modelos aunque nunca se use el 3D.

## Decisión

Cada vista cumple el contrato `mount(container)`, `setInfo(info)`, `update(frame)`,
`destroy()` (y *hooks* opcionales). `views/registry.js` las enumera y `main.js` las cambia en
caliente. Cada vista se carga con `import()` dinámico recién cuando se abre.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Una sola página con todo y pestañas ocultas | Todas las vistas consumiendo CPU a 10 Hz aunque no se vean |
| Rutas con recarga de página | Se pierde el historial y la conexión al cambiar de vista |

## Consecuencias

**A favor**

- Agregar una vista es agregar una carpeta y una línea al registro.
- Quien no usa el 3D nunca descarga Three.js ni los modelos.

**En contra**

- La primera apertura de una vista tiene una pequeña demora de carga.

## Referencias

- `frontend/js/views/registry.js`, `frontend/js/views/README.md` (contrato)
