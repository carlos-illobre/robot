// Pruebas unitarias del frontend (spec 007). `npm test` · `npm run coverage`
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const vendor = fileURLToPath(new URL("./frontend/vendor/three/", import.meta.url));

export default defineConfig({
  resolve: {
    // Lo mismo que el importmap de index.html: "three" vive en vendor/, sin npm.
    alias: [
      { find: /^three$/, replacement: `${vendor}three.module.min.js` },
      { find: /^three\/addons\/(.*)$/, replacement: `${vendor}addons/$1` },
    ],
  },
  test: {
    include: ["frontend/tests/**/*.test.js"],
    environment: "happy-dom",
    setupFiles: ["frontend/tests/setup.js"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["frontend/js/**/*.js"],
      reportsDirectory: "coverage/frontend",
      reporter: ["text-summary", "text", "html", "lcov", "json-summary"],
      // Spec 007: 100 % o la CI falla.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
