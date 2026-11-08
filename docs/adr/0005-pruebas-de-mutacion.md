# ADR 0005: Pruebas de mutación con Stryker (frontend) y mutmut (backend)

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 |
| **Especificación** | [008](../../specs/008-pruebas-de-mutacion/spec.md) |

## Contexto

Con cobertura del 100 % ([ADR-0004](0004-cobertura-unitaria-total.md)) una prueba sin aserciones
igual "cubre". Hace falta medir si las pruebas **detectan** errores: la herramienta introduce un
cambio (`>` por `>=`, borra una llamada) y verifica que alguna prueba falle.

## Decisión

- **Frontend:** Stryker 10 con el corredor de Vitest y análisis de cobertura **por prueba** (cada
  mutante corre solo las pruebas que lo alcanzan), modo incremental e `ignoreStatic`.
- **Backend:** mutmut 3, con un alias de importación en `backend/tests/conftest.py` para que los
  módulos "planos" de la cátedra (`import config`) se resuelvan al nombre completo
  (`backend.api.config`) que mutmut usa para asociar pruebas y mutantes. Reporte HTML propio
  (`tools/mutmut_html.py`).
- **Umbrales** fijados con la primera medición completa, dos puntos por debajo: frontend 74 %
  (medido 76,1 %), backend 90 % (medido 92,8 %).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| cosmic-ray (backend) | Corre la suite entera por cada mutante: con ~2500 mutantes, horas |
| `mutmut browse` | Interfaz de terminal; el docente necesita una página web |
| Convertir el backend en paquete | Obliga a reescribir las importaciones del código de la cátedra |
| Objetivo del 100 % | Los mutantes equivalentes (cambian el código sin cambiar el comportamiento) no se pueden matar |

## Consecuencias

**A favor**

- Un número que mide la calidad de las pruebas, no solo su alcance.
- Lista concreta de comportamientos sin vigilar, archivo por archivo.

**En contra**

- La corrida completa del frontend tarda ~110 min (13 591 mutantes); se mitiga con el modo
  incremental y la caché de la CI ([ADR-0007](0007-reportes-en-github-pages.md)).
- Los sobrevivientes se concentran en contenido estático (textos del manual, SVG): quedan como
  trabajo futuro en el plan de la spec 008.

## Referencias

- `stryker.config.mjs`, `pyproject.toml` (`[tool.mutmut]`), `tools/mutmut_html.py`,
  `backend/tests/conftest.py`
