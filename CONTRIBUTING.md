# Cómo se trabaja en este repositorio

El proyecto sigue **Spec-Driven Development** ([`specs/README.md`](specs/README.md)) y los
principios de la [constitución](specs/constitution.md). Las decisiones técnicas se registran como
[ADR](docs/adr/README.md) y la arquitectura está dibujada en [`docs/arquitectura.md`](docs/arquitectura.md). Este archivo dice cómo se lleva eso a git.

## Branches

`main` siempre está en verde y solo recibe merges. **Cada tarea tiene su branch**, creado desde
`main`, con un nombre que dice qué se hace:

| Prefijo | Para qué | Ejemplo |
|---|---|---|
| `feat/` | Funcionalidad nueva | `feat/alarma-de-bateria` |
| `fix/` | Corrección de un error | `fix/scroll-mobile` |
| `test/` | Pruebas, cobertura, mutación | `test/coverage-backend` |
| `docs/` | Documentación y especificaciones | `docs/sdd-especificaciones` |
| `refactor/` | Cambiar la estructura sin cambiar el comportamiento | `refactor/main-testeable` |
| `ci/` | Integración continua y publicación | `ci/pages-coverage` |
| `chore/` | Mantenimiento (dependencias, configuración) | `chore/actualizar-playwright` |

Nombres en minúscula, en castellano, con guiones y cortos.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/es/) en castellano:

```
<tipo>(<alcance>): <qué cambia, en presente>

<por qué, si no es obvio>

Spec: 006 · FR-002
```

- `tipo`: `feat`, `fix`, `test`, `docs`, `refactor`, `ci`, `chore`, `style`, `perf`.
- `alcance`: la parte del sistema (`backend`, `console`, `body`, `pilot`, `twin`, `manual`, `core`,
  `services`, `spec`, `ci`…).
- El pie `Spec:` enlaza el commit con el requisito que implementa.

## Flujo de una tarea

```bash
git switch main
git switch -c fix/scroll-mobile
# 1. docs(spec): especificación, plan y tareas
# 2. test(...): pruebas que fallan
# 3. fix(...)/feat(...): implementación
npm run test:all
npm run coverage
git switch main
git merge --no-ff fix/scroll-mobile -m "Merge branch 'fix/scroll-mobile': ..."
```

El merge es **siempre `--no-ff`**: así cada tarea queda como un "paquete" en el historial
(`git log --graph --oneline`).

## Definición de terminado

Una tarea se puede mergear solo si:

- [ ] Tiene especificación (`specs/NNN-*/spec.md`) y sus criterios de aceptación se cumplen.
- [ ] `npm run test:all` pasa (unitarias de backend y frontend + E2E).
- [ ] La cobertura unitaria sigue en **100 %** (`npm run coverage` y `npm run coverage:backend`).
- [ ] El puntaje de mutación no baja del umbral (`npm run mutation` y `npm run mutation:backend`).
- [ ] La documentación (README, manual, especificación) está al día.
- [ ] Cada decisión técnica nueva (una biblioteca, un patrón, un formato, un cambio de proceso) tiene
      su [ADR](docs/adr/README.md), enlazado desde el `plan.md`. Si la decisión cambia una anterior,
      el ADR viejo pasa a "Reemplazada por ADR-NNNN".
- [ ] Si cambia la estructura del sistema, los diagramas de [`docs/arquitectura.md`](docs/arquitectura.md)
      siguen coincidiendo con el código.
- [ ] El índice de [`specs/README.md`](specs/README.md) refleja el nuevo estado.
