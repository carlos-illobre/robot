# Decisiones de arquitectura (ADR)

Cada archivo registra **una** decisión técnica: el contexto que la forzó, lo que se decidió, las
alternativas que se descartaron y las consecuencias (lo que se gana y lo que se paga). Así se
decidió registrarlas en el [ADR-0001](0001-registrar-decisiones-con-adr.md).

- Para una decisión nueva: copiar la [plantilla](_plantilla.md) con el número siguiente y
  enlazarla desde el `plan.md` de la especificación.
- Un ADR **no se edita para cambiar de opinión**: se escribe uno nuevo y el anterior pasa a
  "Reemplazada por ADR-NNNN".
- Los diagramas de la arquitectura están en [`docs/arquitectura.md`](../arquitectura.md).

Las decisiones 0008 a 0022 se tomaron al comenzar el proyecto (2026-10-29) y se registraron de forma
retroactiva al adoptar SDD (2026-11-08).

## Proceso y calidad

| N.º | Decisión | Estado | Especificación |
|:-:|---|:-:|:-:|
| [0001](0001-registrar-decisiones-con-adr.md) | Registrar las decisiones de arquitectura con ADR | ✅ Aceptada | [011](../../specs/011-adr-y-diagramas/spec.md) |
| [0002](0002-desarrollo-guiado-por-especificaciones.md) | Desarrollar guiados por especificaciones (SDD) | ✅ Aceptada | [proceso](../../specs/README.md) |
| [0003](0003-historial-git-profesional.md) | Un branch por tarea, merge sin fast-forward y Conventional Commits | ✅ Aceptada | [constitución](../../specs/constitution.md) |
| [0004](0004-cobertura-unitaria-total.md) | Cobertura unitaria del 100 % con Vitest + happy-dom y pytest-cov | ✅ Aceptada | [007](../../specs/007-cobertura-100/spec.md) |
| [0005](0005-pruebas-de-mutacion.md) | Pruebas de mutación con Stryker y mutmut | ✅ Aceptada | [008](../../specs/008-pruebas-de-mutacion/spec.md) |
| [0006](0006-e2e-solo-lo-imprescindible.md) | E2E con Playwright solo para lo que una unitaria no puede probar | ✅ Aceptada | [006](../../specs/006-scroll-mobile/spec.md) |
| [0007](0007-reportes-en-github-pages.md) | Publicar el dashboard y los reportes en GitHub Pages desde `main` | ✅ Aceptada | [009](../../specs/009-reportes-de-calidad/spec.md) |

## Frontend

| N.º | Decisión | Estado | Especificación |
|:-:|---|:-:|:-:|
| [0008](0008-javascript-sin-framework.md) | JavaScript sin framework, con módulos ES nativos y sin compilación | ✅ Aceptada | [constitución](../../specs/constitution.md) |
| [0009](0009-todo-en-el-repositorio-sin-internet.md) | Todo lo que el navegador necesita está en el repositorio | ✅ Aceptada | [004](../../specs/004-vistas-y-gemelo-3d/spec.md) |
| [0010](0010-el-backend-sirve-el-frontend.md) | El backend sirve el frontend en `/dashboard` | ✅ Aceptada | [001](../../specs/001-telemetria-tiempo-real/spec.md) |
| [0011](0011-patrones-adapter-observer-facade.md) | Adapter, Observer y Facade para desacoplar datos y presentación | ✅ Aceptada | [001](../../specs/001-telemetria-tiempo-real/spec.md) |
| [0012](0012-transporte-intercambiable.md) | WebSocket por defecto; polling y simulador como estrategias intercambiables | ✅ Aceptada | [001](../../specs/001-telemetria-tiempo-real/spec.md) |
| [0013](0013-polling-encadenado-y-backoff.md) | Polling con `setTimeout` encadenado y reconexión con backoff y jitter | ✅ Aceptada | [001](../../specs/001-telemetria-tiempo-real/spec.md) |
| [0014](0014-rendimiento-del-dibujo.md) | Historial en buffer circular y dibujo agrupado por cuadro | ✅ Aceptada | [002](../../specs/002-paneles-consigna/spec.md) |
| [0015](0015-nucleo-sin-dom.md) | Núcleo sin DOM y arquitectura en capas en el cliente | ✅ Aceptada | [002](../../specs/002-paneles-consigna/spec.md) |
| [0016](0016-vistas-como-estrategias.md) | Vistas intercambiables con un contrato común y carga diferida | ✅ Aceptada | [004](../../specs/004-vistas-y-gemelo-3d/spec.md) |
| [0017](0017-gemelo-3d-gltf-local.md) | Gemelo 3D con Three.js y glTF comprimido con meshoptimizer | ✅ Aceptada | [004](../../specs/004-vistas-y-gemelo-3d/spec.md) |
| [0018](0018-alarmas-con-histeresis.md) | Alarmas con histéresis | ✅ Aceptada | [002](../../specs/002-paneles-consigna/spec.md) |

## Backend y operación

| N.º | Decisión | Estado | Especificación |
|:-:|---|:-:|:-:|
| [0019](0019-fuente-de-datos-inyectada-y-cambio-en-caliente.md) | La fuente de datos se fabrica, se inyecta y se cambia en caliente de forma transaccional | ✅ Aceptada | [005](../../specs/005-fuentes-de-datos/spec.md) |
| [0020](0020-corregir-la-catedra-sin-reescribirla.md) | Corregir los errores de la cátedra con cambios mínimos y documentados | ✅ Aceptada | [README](../../README.md#-hallazgos-tres-errores-en-el-material-de-la-cátedra) |
| [0021](0021-demo-paseo-con-fisica-coherente.md) | Una demo propia con física de juguete coherente | ✅ Aceptada | [005](../../specs/005-fuentes-de-datos/spec.md) |
| [0022](0022-arranque-con-un-script-en-python.md) | Un único script de arranque en Python y Docker como alternativa | ✅ Aceptada | [001](../../specs/001-telemetria-tiempo-real/spec.md) |
