# Especificación 006: Desplazamiento en el celular

| | |
|---|---|
| **Branch** | `fix/scroll-mobile` |
| **Estado** | En revisión |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Constitución, principio V · Especificación 004 (FR-004) |

## Contexto y problema

En el celular, algunas zonas de la página **no responden al dedo**: si el gesto de desplazamiento
empieza sobre ellas, la página no se mueve. Durante una demostración, esto obliga a buscar un
"lugar libre" para arrastrar y da la impresión de que la aplicación se colgó.

**Cómo se midió.** Un script de Playwright emula un iPhone 13 (390 × 664) y un iPhone SE
(375 × 548) con pantalla táctil, recorre cada vista de arriba abajo y en cada posición hace un
gesto de arrastre real (`touchStart` → `touchMove` → `touchEnd`) en una grilla de 3 × 3 puntos.
Un punto está "trabado" cuando, sin estar al final de la página, el gesto no mueve ni la página
ni ningún contenedor interno.

| Vista | Puntos trabados (iPhone 13) | Dónde |
|---|:-:|---|
| Consola | 8 | Tabla de motores (cabecera y filas) |
| Cuerpo | 11 | Tabla de motores |
| Piloto, Gemelo 3D, Manual | 0 | — |

**Causa.** En el celular la página entera se desplaza, pero las tablas de motores conservan
`overscroll-behavior: contain` y siguen siendo contenedores con desplazamiento propio (en la
computadora tienen su propia barra). Un contenedor con `contain` **no le pasa el gesto a la
página** cuando él mismo no tiene nada que desplazar en esa dirección: el dedo queda "atrapado".

## Historias de usuario

### HU-1 · Desplazar desde cualquier lugar (P1)

**Como** alumno que muestra el dashboard en el celular **quiero** desplazar la página arrastrando
desde cualquier punto **para** que la demostración sea fluida.

1. **Dado** un teléfono de 375 a 430 px de ancho en la vista Consola, **cuando** arrastro hacia arriba con el dedo sobre la tabla de motores, **entonces** la página baja.
2. **Dado** lo mismo en la vista Cuerpo, **entonces** la página baja.
3. **Dado** cualquier vista que se desplaza, **cuando** recorro la página de arriba abajo arrastrando desde cualquier punto, **entonces** ningún punto queda trabado.

### HU-2 · Ver el desborde horizontal de la tabla (P2)

1. **Dado** que la tabla es más ancha que la pantalla, **cuando** arrastro de costado sobre ella, **entonces** la tabla se desplaza a lo ancho (y la página no).

### HU-3 · En la computadora no cambia nada (P1)

1. **Dado** una pantalla de escritorio, **cuando** desplazo dentro de la tabla de motores, **entonces** se desplaza solo la tabla, como antes (el gesto no "se escapa" a la página).

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | En pantallas angostas la tabla de motores de Consola NO DEBE retener el gesto vertical | E2E › "en el celular se desplaza con el dedo desde cualquier punto" |
| FR-002 | Ídem en la vista Cuerpo | ídem |
| FR-003 | La tabla puede seguir desplazándose a lo ancho | ídem (gesto horizontal) |
| FR-004 | En escritorio, las tablas mantienen `overscroll-behavior: contain` | revisión del CSS (las reglas nuevas están dentro de `@media`) |

## Criterios de éxito medibles

| ID | Métrica | Objetivo |
|---|---|---|
| SC-001 | Puntos trabados en las cinco vistas, iPhone 13 y iPhone SE | **0** (antes: 19 y 17) |

## Fuera de alcance

- El Gemelo 3D a pantalla completa no se desplaza a propósito: el gesto orbita la cámara.
- El Manual se desplaza en su propio contenedor (con el índice al costado): funciona y no se cambia.
