# Plan 009: Reportes de calidad en GitHub Pages

## Resumen técnico

El workflow `pages.yml` (solo en `main` y a mano) instala Node y Python, corre
`npm run coverage`, `npm run coverage:backend`, `npm run mutation` y `npm run mutation:backend`,
y arma el sitio:

```
/            visor de maquetas (docs/design)            ← sin cambios
/app/        el dashboard con la simulación del navegador ← sin cambios
/coverage/   índice de reportes (docs/coverage/index.html)
  frontend/            cobertura Vitest (HTML de istanbul)
  backend/             cobertura pytest-cov (HTML de coverage.py)
  mutation/frontend/   Stryker
  mutation/backend/    mutmut (tools/mutmut_html.py)
  commit.json          sha y fecha
```

El índice lee `frontend/coverage-summary.json`, `backend/coverage.json`,
`mutation/frontend/mutation.json` y `mutation/backend/mutation.json` con `fetch`.

## Decisiones

| Decisión | Alternativa | Por qué |
|---|---|---|
| Generar en la CI | Commitear los reportes | Los reportes son derivados: commitearlos ensucia el historial y quedan desactualizados |
| Caché del modo incremental de Stryker y de `mutants/` entre corridas | Correr todo siempre | La mutación completa del frontend tarda mucho; con caché solo se re-evalúan los archivos que cambiaron |
| Publicar solo desde `main` | Cualquier branch | Un branch a medio hacer pisaba el sitio publicado |
