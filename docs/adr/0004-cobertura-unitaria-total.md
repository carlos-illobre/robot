# ADR 0004: Cobertura unitaria del 100 % con Vitest + happy-dom y pytest-cov

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 |
| **Especificación** | [007](../../specs/007-cobertura-100/spec.md) |

## Contexto

El proyecto tenía pruebas con `node --test` sobre el núcleo y pytest sobre parte del backend, sin
medir cobertura. Las vistas (DOM, Canvas, Chart.js, Three.js) no tenían pruebas. Un umbral menor
al 100 % siempre deja una excusa para "esa línea no".

## Decisión

- **Frontend:** Vitest con entorno **happy-dom** y cobertura V8, umbral 100 % de sentencias,
  ramas, funciones y líneas. Chart.js, WebGL, Web Audio, `fetch` y `WebSocket` se reemplazan con
  dobles de prueba (`frontend/tests/setup.js`); `three` apunta a la copia local.
- **Backend:** pytest + pytest-cov con cobertura de ramas, `fail_under = 100`, en Python 3.10 y
  3.12.
- Lo que no se puede cubrir **se rediseña** (extraer una función pura, inyectar la dependencia) **o
  se elimina**. No se usan comentarios de exclusión.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| `node --test --experimental-test-coverage` | No genera HTML y Stryker no lo soporta con análisis por prueba |
| jsdom | No implementa `<dialog>.showModal()` y es más lento que happy-dom |
| Three.js real en las pruebas | No hay GPU en Node; lo que se prueba es nuestra lógica (rig, cámara, calidad adaptativa) |
| Umbral del 80-90 % | Deja huecos elegidos por conveniencia, no por imposibilidad |

## Consecuencias

**A favor**

- Aparecieron **17 errores reales** al cubrir caminos nunca ejercitados
  ([spec 010](../../specs/010-errores-hallados-por-las-pruebas/spec.md)).
- La CI falla si se agrega una línea sin probar.

**En contra**

- 100 % de cobertura no implica pruebas buenas: por eso existe [ADR-0005](0005-pruebas-de-mutacion.md).
- Los dobles de prueba de bibliotecas de terceros hay que mantenerlos si cambia su API.

## Referencias

- `vitest.config.js`, `frontend/tests/setup.js`, `pyproject.toml`, `.github/workflows/ci.yml`
