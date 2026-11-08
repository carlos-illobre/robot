# ADR 0001: Registrar las decisiones de arquitectura con ADR

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 |
| **Especificación** | [011](../../specs/011-adr-y-diagramas/spec.md) |

## Contexto

Las decisiones técnicas estaban en una tabla del README (decisión, alternativa descartada y por
qué) y en las secciones "Decisiones" de los `plan.md`. La tabla es buena como resumen, pero no
tiene lugar para el **contexto** que forzó la decisión, sus **consecuencias** (lo que se paga) ni
un **estado** que permita reemplazarla sin perder la historia. Dentro de un año, "¿por qué no
usaron React?" no se debería responder leyendo commits.

## Decisión

Cada decisión de arquitectura se registra como un **Architecture Decision Record** en
`docs/adr/NNNN-titulo.md`, con el formato de Michael Nygard más la sección de alternativas de
MADR ([plantilla](_plantilla.md)).

- Los ADR **no se editan para cambiar la decisión**. Si cambia, se escribe uno nuevo y el viejo
  pasa a "Reemplazada por ADR-NNNN".
- El `plan.md` de cada especificación enlaza los ADR que crea.
- Las decisiones anteriores a SDD se registraron de forma **retroactiva** (2026-11-08), con la
  aclaración de cuándo se tomaron.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Solo la tabla del README | Sin contexto, consecuencias ni estado |
| Solo los `plan.md` | Una decisión transversal (por ejemplo, "sin framework") no pertenece a una sola especificación |
| Wiki de GitHub | Queda fuera del repositorio: no se versiona junto al código ni se revisa en el mismo merge |

## Consecuencias

**A favor**

- El porqué de cada decisión se encuentra en un lugar, con número, y se puede enlazar.
- Las decisiones reemplazadas no se pierden: se ve cómo evolucionó el diseño.

**En contra**

- Un archivo más por decisión. Se mitiga con la plantilla y con la regla de la
  [definición de terminado](../../CONTRIBUTING.md#definición-de-terminado).

## Referencias

- [Índice de ADR](README.md) · [Plantilla](_plantilla.md)
- Michael Nygard, *Documenting Architecture Decisions* (2011)
