# Tareas NNN: <título corto>

> Pasos chicos y verificables derivados de [`plan.md`](plan.md). Cada uno termina en un commit que
> cita su requisito. `[P]` = se puede hacer en paralelo con la anterior.

## Fase 1 · Preparación

- [ ] T001 Crear el branch `tipo/descripcion-corta` desde `main`
- [ ] T002 Commit de `spec.md`, `plan.md` y `tasks.md`

## Fase 2 · Pruebas primero

- [ ] T003 Prueba que falla para FR-001

## Fase 3 · Implementación

- [ ] T004 Implementar FR-001

## Fase 4 · Verificación

- [ ] T005 `npm run test:all` en verde
- [ ] T006 Cobertura 100 % (`npm run coverage` y `npm run coverage:backend`)
- [ ] T007 Criterios de aceptación revisados uno por uno
- [ ] T008 Estado de la especificación → **Implementada**; índice de `specs/README.md` actualizado
- [ ] T009 `git merge --no-ff` a `main`
