# ADR 0014: Historial en buffer circular y dibujo agrupado por cuadro

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [002](../../specs/002-paneles-consigna/spec.md) |

## Contexto

Llegan 10 muestras por segundo con hasta 29 motores. Las notebooks del laboratorio son modestas y
una clase dura ~2 h (72 000 muestras). Las animaciones de Chart.js agregan retraso visual a datos
que ya cambian 10 veces por segundo.

## Decisión

- **Historial:** `RingBuffer` de 600 muestras (~60 s): memoria constante y `push` O(1).
- **Dibujo:** las muestras se acumulan y la vista se actualiza **una vez por cuadro** con
  `requestAnimationFrame`, con la última muestra; con la pestaña oculta no se dibuja.
- **Chart.js** con `animation: false` y `parsing: false` (los datos ya llegan como `{x, y}`).
- **Sparklines** de cada motor en un `<canvas>` propio, no un Chart.js por fila.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Un array que crece | Memoria sin límite durante la clase |
| Redibujar en cada mensaje | Si llegan 3 muestras en un cuadro se dibuja 3 veces para mostrar 1 |
| 29 instancias de Chart.js | Demasiado para una notebook del laboratorio a 10 Hz |

## Consecuencias

**A favor**

- Uso de memoria y de CPU constante, independiente de la duración de la sesión.

**En contra**

- El gráfico muestra los últimos ~60 s; para más, se usa la captura y exportación a CSV
  ([spec 003](../../specs/003-captura-exportacion-csv/spec.md)).

## Referencias

- `frontend/js/core/RingBuffer.js`, `frontend/js/main.js` (agrupado por cuadro),
  `frontend/js/ui/charts.js`, `frontend/js/config.js` › `historySize`
