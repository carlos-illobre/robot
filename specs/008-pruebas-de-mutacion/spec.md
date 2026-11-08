# Especificación 008: Pruebas de mutación

| | |
|---|---|
| **Branch** | `test/mutation-testing` |
| **Estado** | 🔄 En curso |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Constitución, principio III · Especificación 007 |

## Contexto y problema

La cobertura dice qué líneas **se ejecutan** durante las pruebas, no si las pruebas **detectarían
un error** en ellas. Una prueba sin aserciones llega al 100 % de cobertura y no prueba nada.

Las **pruebas de mutación** miden eso: una herramienta introduce a propósito un error chico en el
código (un *mutante*: cambiar `>` por `>=`, `+` por `-`, `true` por `false`, borrar una llamada,
vaciar un string) y corre las pruebas. Si alguna falla, el mutante **murió** (bien: las pruebas lo
detectaron). Si todas pasan, **sobrevivió**: hay un comportamiento que ninguna prueba vigila.

```
puntaje de mutación = mutantes muertos / mutantes totales
```

## Historias de usuario

### HU-1 · Medir la calidad de las pruebas (P1)

**Como** docente **quiero** ver qué mutantes sobreviven y dónde **para** evaluar si las pruebas
verifican comportamiento o solo recorren líneas.

1. **Dado** el repositorio, **cuando** corro `npm run mutation`, **entonces** obtengo un reporte HTML del frontend con cada mutante, su estado y el código cambiado.
2. **Dado** el repositorio, **cuando** corro `npm run mutation:backend`, **entonces** obtengo un reporte HTML del backend con la misma información.

### HU-2 · Que la calidad no se degrade (P2)

1. **Dado** un puntaje por debajo del umbral mínimo, **cuando** corre la publicación de reportes, **entonces** falla.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | Frontend: Stryker con el corredor de Vitest y análisis de cobertura por prueba (cada mutante corre solo las pruebas que lo alcanzan) | `stryker.config.mjs` |
| FR-002 | Backend: mutmut sobre `backend/` con las pruebas de pytest | `pyproject.toml` › `[tool.mutmut]` |
| FR-003 | Reportes HTML navegables en `reports/mutation/frontend/` y `reports/mutation/backend/` | `npm run mutation`, `npm run mutation:backend` |
| FR-004 | El reporte del backend muestra, por archivo, cada mutante sobreviviente con su diff | `tools/mutmut_html.py` |
| FR-005 | Umbral mínimo (`break`) configurado; por debajo, el comando falla | configuración |
| FR-006 | Modo incremental: una corrida nueva solo re-evalúa los archivos que cambiaron | `incremental` de Stryker; caché de mutmut |

## Criterios de éxito medibles

| ID | Métrica | Objetivo |
|---|---|---|
| SC-001 | Puntaje de mutación del frontend | ≥ umbral `break` (se fija con la primera medición completa, ver `plan.md`) |
| SC-002 | Puntaje de mutación del backend | ≥ umbral `break` |

## Fuera de alcance

- Matar el 100 % de los mutantes: hay **mutantes equivalentes** (cambian el código sin cambiar el
  comportamiento observable, por ejemplo `i < n` ↔ `i !== n` en un bucle que nunca se pasa), que
  ninguna prueba puede matar. Por eso el objetivo es un umbral, no el 100 %.
