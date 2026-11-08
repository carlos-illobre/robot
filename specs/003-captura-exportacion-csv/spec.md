# Especificación 003: Captura de muestras y exportación CSV

| | |
|---|---|
| **Estado** | ✅ Implementada (especificación retroactiva) |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Consigna: botones "Capturar muestra" y "Exportar CSV" |

## Historias de usuario

### HU-1 · Guardar el estado de un instante (P1)

**Como** alumno en el laboratorio **quiero** capturar la muestra actual **para** analizarla después.

1. **Dado** que hay datos, **cuando** aprieto "Capturar" (o la tecla C), **entonces** el contador de capturas sube en uno.
2. **Dado** que capturé, **cuando** la muestra original cambia, **entonces** la captura no cambia.
3. **Dado** que activo "Grabar" (R), **entonces** se captura cada muestra que llega hasta que lo detengo.

### HU-2 · Llevarme los datos (P1)

1. **Dado** N capturas, **cuando** aprieto "Exportar CSV" (E), **entonces** se descarga un archivo con N filas de datos.
2. **Dado** que elijo "Excel en castellano", **entonces** el separador es `;` y la coma es decimal.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | Una fila por captura, columnas por motor, escapado RFC 4180 | `core.test.js` › "CSV: una fila por captura…" |
| FR-002 | La captura es una copia profunda | `core.test.js` › "CaptureStore copia la muestra" |
| FR-003 | El navegador descarga el archivo | E2E › "el navegador descarga el CSV con una fila por captura" |
| FR-004 | Cambiar de vista no pierde las capturas | E2E › "las cinco vistas se dibujan sin errores…" |

## Código

`frontend/js/core/CaptureStore.js`, `frontend/js/core/csv.js`, `frontend/js/main.js` (acciones).
