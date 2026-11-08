# Plan 007: Cobertura unitaria del 100 %

## Resumen técnico

- **Frontend:** se migra de `node:test` a **Vitest** (las pruebas existentes cambian solo el
  `import`; siguen usando `node:assert`). Vitest trae DOM simulado (happy-dom), dobles de prueba
  (`vi.fn`, `vi.mock`, temporizadores falsos) y cobertura V8 con umbrales. Además es el corredor que
  Stryker soporta con análisis de cobertura por prueba (especificación 008): con `node:test`
  Stryker tendría que correr la suite entera por cada mutante.
- **Backend:** `pytest-cov` con cobertura de ramas, configurado en `pyproject.toml`.
- **Ratchet:** el umbral arranca en la cobertura actual y sube con cada branch de pruebas hasta 100 %.
  Así `main` está siempre en verde.

## Verificación de la constitución

| Principio | ¿Se respeta? | Nota |
|---|:-:|---|
| III. Probado o no existe | ✅ | Es el objetivo |
| IV. Sin compilación, sin internet | ✅ | Vitest es `devDependency`; el navegador sigue cargando los ES modules tal cual |

## Archivos

| Archivo | Cambio |
|---|---|
| `package.json` | `vitest`, `@vitest/coverage-v8`, `happy-dom`; scripts `test`, `coverage`, `coverage:backend` |
| `vitest.config.js` | entorno, alias `three` → `frontend/vendor/three`, cobertura y umbrales |
| `frontend/tests/setup.js` | dobles globales comunes (Chart.js, `matchMedia`, `ResizeObserver`, canvas 2D) |
| `frontend/tests/*.test.js` | `import { test } from "vitest"` |
| `pyproject.toml` | configuración de pytest y coverage (`fail_under`) |
| `requirements-dev.txt` | `pytest`, `httpx`, `pytest-cov` (separado de lo que necesita la aplicación) |
| `.github/workflows/ci.yml` | correr la cobertura |

## Decisiones

> La decisión principal está registrada como [ADR-0004](../../docs/adr/0004-cobertura-unitaria-total.md) (cobertura del 100 % con Vitest + happy-dom y pytest-cov).

| Decisión | Alternativa | Por qué |
|---|---|---|
| Vitest | `node --test --experimental-test-coverage` | No genera HTML ni lo soporta Stryker con análisis por prueba |
| happy-dom | jsdom | Implementa `<dialog>.showModal()` y es más rápido |
| Mock de WebGL / `three` en las pruebas | Correr Three.js real | No hay GPU en Node; lo que se prueba es nuestra lógica (rig, cámara, calidad adaptativa), no Three.js |

## Exclusiones de cobertura

Ninguna por ahora. Si en el camino aparece código imposible de cubrir, se rediseña o se elimina.
