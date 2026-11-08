# Plan 006: Desplazamiento en el celular

## Resumen técnico

Dentro de las mismas `@media` que ya convierten la vista en "página que se desplaza entera", se
devuelve `overscroll-behavior` a `auto` en los contenedores de las tablas y se limita su
desplazamiento propio al eje horizontal (`overflow-y: hidden`). Así el gesto vertical encadena con
la página y el horizontal sigue moviendo la tabla.

## Verificación de la constitución

| Principio | ¿Se respeta? | Nota |
|---|:-:|---|
| I. Especificación como fuente de verdad | ✅ | Este documento antes del código |
| II. Contrato de la API | ✅ | No se toca |
| III. Probado o no existe | ✅ | Prueba E2E: depende del motor de desplazamiento del navegador real, no se puede probar en una unitaria |
| IV. Sin compilación, sin internet | ✅ | Solo CSS |
| V. Funciona en el celular | ✅ | Es el objetivo |
| VI. Historial profesional | ✅ | `fix/scroll-mobile` |
| VII. Castellano | ✅ | |

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `frontend/css/views/console.css` | `@media (max-width: 1100px)` y `(max-width: 640px)`: `.cv-tablewrap` sin `contain` y sin eje vertical propio |
| `frontend/css/views/body.css` | `@media (max-width: 900px)`: ídem `.bd-motors__scroll` |
| `frontend/js/views/twin/Stage3D.js` | Si la escena es embebida (fondo transparente): `touches.ONE = null`, `TWO = DOLLY_ROTATE` y `touch-action: pan-y` inline después de crear `OrbitControls` |
| `frontend/css/views/pilot.css` | `@media (max-width: 640px)`: `min-height: 780px` (antes 600) (FR-006) |
| `e2e/dashboard.e2e.js` | Prueba nueva con gestos táctiles reales (CDP `Input.dispatchTouchEvent`) |

## Decisiones y alternativas descartadas

| Decisión | Alternativa | Por qué se eligió |
|---|---|---|
| CSS dentro de las `@media` existentes | Quitar `contain` en todas las pantallas | En escritorio la tabla tiene su propia barra y `contain` evita que la página "salte" al llegar al final |
| `overflow-y: hidden` en el contenedor | Dejar `auto` | Con `auto` el contenedor sigue siendo candidato al gesto vertical |
| Gestos táctiles por CDP | `page.mouse.wheel` | La rueda del mouse no reproduce el error: solo el gesto táctil queda atrapado |

## Estrategia de pruebas

- **E2E:** emular 390 px con pantalla táctil, arrastrar sobre la tabla de motores de Consola y de
  Cuerpo y comprobar que `scrollY` aumenta. Arrastrar de costado y comprobar que la tabla se
  desplaza a lo ancho.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Que la cabecera fija (`sticky`) de la tabla deje de funcionar | En el celular ya se había anulado (`thead { position: relative }`); se verifica con capturas |
