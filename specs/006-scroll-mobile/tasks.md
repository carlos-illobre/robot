# Tareas 006: Desplazamiento en el celular

## Fase 1 · Preparación

- [x] T001 Crear el branch `fix/scroll-mobile` desde `main`
- [x] T002 Medir con Playwright y gestos táctiles dónde se traba (ver tabla en `spec.md`)
- [x] T003 Commit de `spec.md`, `plan.md` y `tasks.md`

## Fase 2 · Pruebas primero

- [x] T004 Prueba E2E con gestos táctiles que falla en Consola y Cuerpo (FR-001, FR-002, FR-003, FR-005)

## Fase 3 · Implementación

- [x] T005 `console.css`: la tabla no retiene el gesto vertical (FR-001)
- [x] T006 `body.css`: ídem (FR-002)
- [x] T006b `Stage3D.js`: el 3D embebido no atrapa el dedo (FR-005)
- [x] T006c `pilot.css`: alto mínimo en el celular (FR-006)

## Fase 4 · Verificación

- [x] T007 Nuevo barrido: 0 puntos trabados en iPhone 13 y iPhone SE (SC-001)
- [x] T008 `npm run test:all` en verde
- [x] T009 Estado → Implementada; índice de `specs/README.md`
- [x] T010 `git merge --no-ff` a `main`

## Resultado

| Dispositivo | Figura | Puntos trabados antes | Después |
|---|---|:-:|:-:|
| iPhone 13 | esquema | 19 | 0 |
| iPhone SE | esquema | 17 | 0 |
| iPhone 13 | 3D | 25 | 0 |
| Pixel 5 | 3D | — | 0 |
