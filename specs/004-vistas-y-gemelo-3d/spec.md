# Especificación 004: Vistas múltiples y gemelo 3D

| | |
|---|---|
| **Estado** | ✅ Implementada (especificación retroactiva) |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Extra sobre la consigna · [`frontend/js/views/README.md`](../../frontend/js/views/README.md) |

## Contexto

Los mismos datos sirven a públicos distintos: quien analiza (Consola), quien quiere entender de un
vistazo (Cuerpo), quien proyecta en clase (Piloto) y quien quiere ver el robot real (Gemelo 3D). Un
Manual integrado explica cómo leer cada una.

## Historias de usuario

### HU-1 · Cambiar de vista sin perder nada (P1)

1. **Dado** que tengo historial y capturas, **cuando** cambio de vista (barra o teclas 1 a 5), **entonces** se conservan.
2. **Dado** cualquier vista, **cuando** se dibuja, **entonces** no hay errores en la consola del navegador.

### HU-2 · Ver el robot en 3D (P2)

1. **Dado** la vista Gemelo 3D, **entonces** el modelo oficial de Unitree se mueve con los ángulos reales.
2. **Dado** Consola, Cuerpo o Piloto, **cuando** aprieto "Esquema | 3D" (G), **entonces** el dibujo cambia al modelo 3D y la preferencia se recuerda.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | Cada vista cumple el contrato `mount/update/unmount` (patrón Strategy) | pruebas de cada vista |
| FR-002 | Cambiar de vista conserva historial y capturas | E2E › "las cinco vistas…" |
| FR-003 | Three.js y los modelos se cargan solo cuando se elige 3D | pruebas de `FigureSwitch` |
| FR-004 | En 390 px ninguna vista se desborda a lo ancho | E2E › "en el celular (390 px)…" |

## Código

`frontend/js/views/**`, `frontend/js/views/registry.js`, `frontend/js/ui/FigureSwitch.js`.
