# Plan 008: Pruebas de mutación

## Resumen técnico

| | Frontend | Backend |
|---|---|---|
| Herramienta | [Stryker](https://stryker-mutator.io/) 10 + `@stryker-mutator/vitest-runner` | [mutmut](https://github.com/boxed/mutmut) 3 |
| Configuración | `stryker.config.mjs` | `pyproject.toml` › `[tool.mutmut]` |
| Comando | `npm run mutation` | `npm run mutation:backend` |
| Reporte | `reports/mutation/frontend/index.html` (reporte oficial de Stryker) | `reports/mutation/backend/index.html` (generado por `tools/mutmut_html.py`) |
| Velocidad | cobertura por prueba + incremental | una prueba por mutante (selección por cobertura de mutmut) + caché en `mutants/` |

## Decisiones

| Decisión | Alternativa | Por qué |
|---|---|---|
| mutmut 3 | cosmic-ray | cosmic-ray corre la suite entera por cada mutante: con ~3000 mutantes, horas. mutmut 3 corre solo las pruebas que alcanzan la función mutada |
| Reporte HTML propio para mutmut | `mutmut browse` (interfaz de terminal) | mutmut 3 no genera HTML; el docente necesita una página navegable en GitHub Pages |
| Alias de importación en `backend/tests/conftest.py` | Convertir el backend en paquete (`from backend.api.config import …`) | El código de la cátedra importa módulos "planos" (`from config import ROBOTS`) con `sys.path`. mutmut asocia cada prueba con el mutante por el nombre completo del módulo (`backend.api.config`); el alias hace que `import config` devuelva ese mismo módulo. Efecto colateral bueno: cada archivo se carga **una sola vez** (antes `api.telemetry_server` y `telemetry_server` eran dos módulos distintos con estado separado) |

## Umbrales

Se fijan con la primera corrida completa sobre la suite con cobertura 100 % (spec 007): `break`
queda unos puntos por debajo del puntaje medido, para que la CI no falle por ruido y sí falle si
alguien agrega código sin pruebas que lo verifiquen.
