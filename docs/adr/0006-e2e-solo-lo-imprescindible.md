# ADR 0006: Pruebas E2E con Playwright solo para lo que una unitaria no puede probar

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 |
| **Especificación** | [006](../../specs/006-scroll-mobile/spec.md) · [Constitución, principio III](../../specs/constitution.md) |

## Contexto

Algunos comportamientos dependen del motor real del navegador: el desplazamiento con el dedo en el
celular (qué elemento se queda con el gesto), el WebSocket contra el backend real, la carga de los
módulos ES servidos por FastAPI. happy-dom no calcula diseño ni gestos.

## Decisión

Las E2E (Playwright + Chromium, contra el backend real en modo demo) son la **excepción**: solo para
lo que no se puede verificar en una unitaria. Los gestos táctiles se generan con eventos táctiles
reales por CDP (`Input.dispatchTouchEvent`), a tamaño de teléfono.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| E2E para todo | Lentas y frágiles; dan menos información cuando fallan |
| `page.mouse.wheel` | La rueda del mouse no reproduce el error: solo el gesto táctil quedaba atrapado |
| `Input.synthesizeScrollGesture` | No funciona con Chromium sin ventana |
| Cypress | Las E2E ya estaban escritas con Playwright desde el inicio; cambiar no agrega nada para este caso |

## Consecuencias

**A favor**

- 7 pruebas E2E cubren lo que las ~2100 unitarias no pueden; corren en ~30 s.
- Las regresiones de diseño adaptable (principio V) quedan vigiladas.

**En contra**

- Necesitan un Chromium instalado (`PW_CHROMIUM` permite indicar uno ya existente).

## Referencias

- `e2e/dashboard.e2e.js`, job "E2E" de `.github/workflows/ci.yml`
