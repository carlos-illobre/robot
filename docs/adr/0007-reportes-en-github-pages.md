# ADR 0007: Publicar el dashboard y los reportes de calidad en GitHub Pages desde `main`

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 (el dashboard se publica desde 2026-10-29) |
| **Especificación** | [009](../../specs/009-reportes-de-calidad/spec.md) |

## Contexto

El docente tiene que poder ver el dashboard funcionando y los reportes de cobertura y mutación sin
clonar el repositorio ni instalar nada.

## Decisión

Un workflow (`.github/workflows/pages.yml`) que corre **solo con `main`** genera y publica:

- `/`: el visor de maquetas de diseño;
- `/app/`: el dashboard real, con el simulador en el navegador (sin servidor);
- `/coverage/`: un índice con los reportes HTML de cobertura y de mutación de frontend y backend.

Los reportes se **generan en la CI**, no se versionan. La caché guarda el estado incremental de
Stryker y los mutantes de mutmut entre corridas.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Commitear los reportes | Son derivados: ensucian el historial y quedan desactualizados |
| Publicar desde cualquier branch | Un branch a medio hacer pisaba el sitio publicado (pasó) |
| Servicio externo (Codecov, Stryker Dashboard) | Cuentas y tokens extra; el docente tendría que salir del sitio del proyecto |

## Consecuencias

**A favor**

- Una URL al principio del README lleva a todos los reportes.
- El sitio siempre refleja `main`.

**En contra**

- La primera corrida (mutación completa) tarda cerca de 2 h; las siguientes son incrementales.
- Branches viejos que todavía tienen una versión anterior del workflow pueden publicar si se
  vuelven a subir: no hay que subirlos.

## Referencias

- `.github/workflows/pages.yml`, `docs/coverage/index.html`
