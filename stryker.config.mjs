// Pruebas de mutación del frontend (spec 008). `npm run mutation`
// Stryker cambia el código (un ">" por ">=", un "+" por "-", borra una llamada…) y corre las
// pruebas que cubren esa línea: si ninguna falla, el mutante "sobrevive" y la prueba es débil.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.js" },
  coverageAnalysis: "perTest",
  // Los mutantes "estáticos" (constantes que se evalúan una vez al cargar el módulo, como el
  // texto del manual) obligan a correr TODA la suite por cada uno: ~18 % de los mutantes y ~80 %
  // del tiempo. Se informan como ignorados (spec 008, plan).
  ignoreStatic: true,
  mutate: ["frontend/js/**/*.js"],
  // Lo que no hace falta copiar al sandbox de Stryker (solo corre el frontend)
  ignorePatterns: [
    "/backend", "/docs", "/docker", "/e2e", "/tools", "/specs", "/mutants", "/coverage", "/reports",
    "/.claude", "/.venv", "/venv",
  ],
  reporters: ["html", "json", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/frontend/index.html" },
  jsonReporter: { fileName: "reports/mutation/frontend/mutation.json" },
  // high: verde · low: amarillo · break: la CI falla por debajo (spec 008)
  thresholds: { high: 90, low: 75, break: null },
  concurrency: 4,
  timeoutMS: 10000,
  // Reutiliza resultados de la corrida anterior para los archivos que no cambiaron
  incremental: process.env.STRYKER_INCREMENTAL !== "0",
  incrementalFile: "reports/mutation/frontend/stryker-incremental.json",
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
};
