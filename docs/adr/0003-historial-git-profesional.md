# ADR 0003: Un branch por tarea, merge sin fast-forward y Conventional Commits

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 |
| **Especificación** | [Constitución, principio VI](../../specs/constitution.md) |

## Contexto

Hasta la adopción de SDD los commits iban directo a `main`, con mensajes libres. Así no se puede
ver qué commits forman una tarea, ni volver de una línea de código al requisito que la motivó.

## Decisión

- Cada tarea vive en un branch `tipo/descripcion-corta` (`feat/`, `fix/`, `test/`, `docs/`,
  `refactor/`, `ci/`, `chore/`) creado desde `main`.
- Commits en [Conventional Commits](https://www.conventionalcommits.org/es/), en castellano, con
  pie `Spec: NNN · FR-…`.
- Integración con `git merge --no-ff`: el merge agrupa la tarea y aparece en `git log --graph`.
- `main` siempre en verde: se mergea solo lo que cumple la
  [definición de terminado](../../CONTRIBUTING.md#definición-de-terminado).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Trunk-based (todo a `main`) | Con un equipo chico funciona, pero borra los límites de cada tarea |
| Squash merge | Deja un commit por tarea y pierde la secuencia especificación → pruebas → implementación, que es justamente lo que SDD quiere mostrar |
| Rebase + fast-forward | Historial lineal, pero sin el commit de merge que marca el fin de la tarea |
| Git Flow (`develop`, `release/…`) | Pensado para versiones con fecha; acá no hay releases |

## Consecuencias

**A favor**

- `git log --graph --oneline` muestra cada tarea como un bloque.
- El tipo del commit (`fix`, `test`…) permite filtrar el historial.

**En contra**

- Más commits de merge; un branch que dura mucho exige traer `main` y resolver conflictos (pasó
  con `specs/README.md`, que todas las tareas tocan).

## Referencias

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [plantilla de PR](../../.github/pull_request_template.md)
