# Especificación 007: Cobertura unitaria del 100 %

| | |
|---|---|
| **Branch** | `test/vitest-cobertura` (herramientas) · `test/coverage-backend` · `test/coverage-frontend-*` (pruebas) |
| **Estado** | ✅ Implementada |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Constitución, principio III |

## Contexto y problema

El proyecto tenía 51 pruebas, pero **nadie medía qué parte del código ejecutaban**. Una prueba que
pasa no dice nada sobre el código que nunca recorre. La cátedra valora especialmente las pruebas,
y la constitución exige que todo el código de la aplicación esté cubierto.

## Alcance: qué es "el código de la aplicación"

| Se mide | No se mide (y por qué) |
|---|---|
| `backend/**/*.py` (servidor, API, lectores, demo, fuentes) | `backend/tests/` — son las pruebas |
| `iniciar.py` (arranque multiplataforma) | `frontend/vendor/` — Chart.js y Three.js, código de terceros |
| `frontend/js/**/*.js` (todas las vistas, servicios, núcleo, shell, UI) | `tools/` — scripts de desarrollo que se corren a mano (convertir modelos 3D, sacar capturas del manual); no forman parte de la aplicación |
| | `docs/design/` — maquetas del director de arte, prototipos descartables |
| | `docker/`, `e2e/` — infraestructura y pruebas |

## Historias de usuario

### HU-1 · Ver qué código está probado (P1)

**Como** docente que corrige el TP **quiero** ver un reporte navegable de cobertura **para**
comprobar que cada línea está ejercitada por una prueba.

1. **Dado** el repositorio, **cuando** corro `npm run coverage`, **entonces** obtengo un reporte HTML del frontend en `coverage/frontend/`.
2. **Dado** el repositorio, **cuando** corro `npm run coverage:backend`, **entonces** obtengo un reporte HTML del backend en `coverage/backend/`.

### HU-2 · Que la cobertura no baje nunca (P1)

1. **Dado** un cambio que deja una línea, rama o función sin cubrir, **cuando** corre la CI, **entonces** falla.

### HU-3 · Pruebas unitarias, no E2E (P1)

1. **Dado** código que solo parecía probable en un navegador (vistas, gráficos, 3D, `main.js`), **entonces** se prueba con un DOM simulado y dobles de prueba (Chart.js, WebGL, `fetch`, `WebSocket`), no con E2E.
2. **Dado** código imposible de cubrir con una prueba unitaria, **entonces** se rediseña para que sea probable o se elimina.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | Las pruebas del frontend corren con Vitest y un DOM simulado (happy-dom) | `npm test` |
| FR-002 | `npm run coverage` mide `frontend/js/**` y genera HTML + texto + lcov | `vitest.config.js` |
| FR-003 | `npm run coverage:backend` mide backend e `iniciar.py` con cobertura de ramas | `pyproject.toml` |
| FR-004 | Umbral: **100 %** de líneas, ramas, funciones y sentencias en los dos lados | umbrales en la configuración; CI |
| FR-005 | La CI corre la cobertura y falla si no se alcanza el umbral | `.github/workflows/ci.yml` |
| FR-006 | No hay exclusiones de cobertura (`/* v8 ignore */`, `# pragma: no cover`) salvo las listadas en `plan.md` con su justificación | `grep` en la revisión |

## Criterios de éxito medibles

| ID | Métrica | Objetivo |
|---|---|---|
| SC-001 | Cobertura de líneas, ramas, funciones y sentencias (frontend) | 100 % |
| SC-002 | Cobertura de líneas y ramas (backend + `iniciar.py`) | 100 % |
| SC-003 | Tiempo de `npm test` | < 60 s |

## Fuera de alcance

- Pruebas de mutación: especificación 008.
- Publicar los reportes: especificación 009.
