# ADR 0015: Núcleo sin DOM y arquitectura en capas en el cliente

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [002](../../specs/002-paneles-consigna/spec.md) · [003](../../specs/003-captura-exportacion-csv/spec.md) |

## Contexto

La lógica que más importa que esté bien (normalizar muestras, historial, capturas, CSV, alarmas)
no debería depender del navegador para probarse ni mezclarse con el código que dibuja.

## Decisión

El cliente se organiza en capas que solo dependen hacia abajo:

| Capa | Carpeta | Sabe de |
|---|---|---|
| Composición | `js/main.js` | todo (único lugar que conecta las piezas) |
| Vistas | `js/views/` | DOM, SVG, Canvas, Three.js |
| UI común | `js/ui/`, `js/shell/` | DOM, Chart.js |
| Servicios | `js/services/` | HTTP, WebSocket |
| Núcleo | `js/core/` | **solo datos**: sin `document` ni `window` |

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Lógica dentro de cada vista | Se duplica (cuatro vistas) y solo se prueba con un DOM |
| Separar por funcionalidad (`motores/`, `imu/`…) | Mezcla en una carpeta lógica y DOM, que es lo que se quiere separar |

## Consecuencias

**A favor**

- El núcleo se prueba en Node, rápido y sin dobles de prueba del navegador.
- `main.js` es el único archivo que conoce a todos: cambiar una pieza no se propaga.

**En contra**

- `main.js` crece; se mantiene como pura composición, sin lógica propia.

## Referencias

- `frontend/js/core/`, `frontend/js/main.js`, `frontend/tests/nucleo/`
