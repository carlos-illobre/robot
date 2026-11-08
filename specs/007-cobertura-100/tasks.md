# Tareas 007: Cobertura unitaria del 100 %

## Fase 1 · Herramientas (`test/vitest-cobertura`)

- [x] T001 Especificación, plan y tareas
- [x] T002 Migrar las pruebas a Vitest sin cambiar lo que verifican
- [x] T003 Configurar cobertura V8 (HTML, texto, lcov) con umbral = cobertura actual
- [x] T004 `pytest-cov` con ramas, `requirements-dev.txt`, `pyproject.toml`
- [x] T005 CI corre la cobertura

Línea de base medida: **frontend 9,6 %** de líneas · **backend 58,1 %**. Esos son los primeros umbrales.

## Fase 2 · Backend (`test/coverage-backend`)

- [x] T006 Pruebas unitarias hasta 100 % de backend + `iniciar.py`

## Fase 3 · Frontend (un branch por área)

- [x] T007 `test/coverage-frontend-nucleo`: `core/`, `services/`, `config.js`
- [x] T008 `test/coverage-frontend-shell`: `ui/`, `shell/`, `main.js`, `registry.js`
- [x] T009 `test/coverage-frontend-consola`: `views/console/`
- [x] T010 `test/coverage-frontend-cuerpo`: `views/body/`
- [x] T011 `test/coverage-frontend-piloto`: `views/pilot/`
- [x] T012 `test/coverage-frontend-gemelo`: `views/twin/`
- [x] T013 `test/coverage-frontend-manual`: `views/manual/`

## Fase 4 · Cierre

- [x] T014 Umbral en 100 % en los dos lados
- [x] T015 README: sección de pruebas con las cifras nuevas

## Resultado

| | Antes | Después | Pruebas |
|---|---|---|---|
| Frontend (líneas · ramas · funciones · sentencias) | 9,6 % · 10,4 % · 12,0 % · 9,4 % | **100 % · 100 % · 100 % · 100 %** (4433 líneas, 2510 ramas) | 24 → 1765 |
| Backend + `iniciar.py` (líneas · ramas) | 58,1 % | **100 % · 100 %** (849 sentencias, 178 ramas) | 21 → 312 |

Exclusiones de cobertura: **ninguna**. Se eliminaron los dos `# pragma: no cover` que traía el código
de la cátedra. Código eliminado o simplificado por ser imposible de ejecutar: ramas defensivas que
nunca se cumplen y una función sin uso (`angleDelta`), cada caso en su propio commit `refactor(...)`.
Las pruebas encontraron 17 errores reales: especificación 010.
