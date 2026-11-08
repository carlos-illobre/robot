# ADR 0018: Alarmas con histéresis

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [002](../../specs/002-paneles-consigna/spec.md) |

## Contexto

Un motor que oscila alrededor de 60 °C (59,9 → 60,1 → 59,9…) con un umbral simple prende y apaga el
aviso diez veces por segundo: el aviso deja de servir y distrae.

## Decisión

Cada alarma se **activa** al cruzar el umbral y se **desactiva** recién un poco por debajo
(60 °C → 58 °C; torque → 90 % del umbral), como un termostato. Los umbrales son configurables
porque los valores del simulador y de la demo no son medidos.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Umbral simple | Parpadeo del aviso |
| Promedio móvil | Retrasa también la activación, que es cuando más importa avisar |
| Tiempo mínimo encendida | Funciona, pero agrega un temporizador por alarma y es más difícil de explicar |

## Consecuencias

**A favor**

- Avisos estables; es una función pura, probada con secuencias de valores.

**En contra**

- Entre 58 °C y 60 °C el estado depende de la historia (lo que se quiere, pero hay que explicarlo).

## Referencias

- `frontend/js/core/alerts.js`, `frontend/tests/nucleo/alerts.test.js`
