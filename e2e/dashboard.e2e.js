/**
 * Pruebas de punta a punta (E2E): backend real + dashboard en un Chromium real.
 *
 *   npm run test:e2e
 *
 * Solo cubren lo que una prueba unitaria NO puede: la integración real entre
 * el navegador y el backend (WebSocket, HTTP, CORS), el DOM de las vistas, las
 * descargas y el diseño adaptable. La lógica (polling, Facade, CSV, alarmas,
 * simulador, semáforo) ya está cubierta por las pruebas unitarias
 * (`npm test` y `pytest`), que corren en milisegundos.
 *
 * Para que sean rápidas, todas comparten UN navegador y UNA página, como una
 * persona usando el dashboard de corrido. Requiere Python con
 * requirements.txt y Playwright (`npx playwright install chromium`).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");

let browser, page, server, port;
const errors = [];
const base = () => `http://127.0.0.1:${port}`;

/* ------------------------------ utilidades ------------------------------ */

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, "127.0.0.1", () => {
      const { port: p } = srv.address();
      srv.close(() => resolve(p));
    });
  });
}

async function startServer() {
  const proc = spawn(PYTHON, ["backend/servidor.py", "--demo", "--puerto", String(port), "--host", "127.0.0.1"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  for (const limit = Date.now() + 15000; Date.now() < limit; ) {
    try {
      if ((await fetch(`${base()}/info`)).ok) return proc;
    } catch { /* todavía no levantó */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("El backend no levantó");
}

const stopServer = (proc) =>
  new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) return resolve();
    proc.once("exit", resolve);
    proc.kill();
  });

/** Espera una condición evaluada en la página (por defecto, 8 s). */
const until = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
const pillText = () => page.locator(".pill").textContent();
const frames = () => page.evaluate(() => window.tp05.state.stats.frames);

/* -------------------------------- setup --------------------------------- */

before(async () => {
  port = await freePort();
  [server, browser] = await Promise.all([
    startServer(),
    chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }),
  ]);
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${base()}/dashboard/?view=console`);
  await until(() => window.tp05?.state.latest);
});

after(async () => {
  await browser?.close();
  await stopServer(server);
});

/* -------------------------------- pruebas ------------------------------- */

test("integración: el backend empuja ~10 Hz por WebSocket y el polling HTTP también anda", async () => {
  await until(() => window.tp05.state.stats.hz > 7);
  assert.match(await pillText(), /En vivo · WS/);
  assert.match(await page.locator(".brand__robot").textContent(), /Go2 .* 12 motores/, "el robot sale de GET /info");

  await page.keyboard.press("w");
  await until(() => /Polling/.test(document.querySelector(".pill").textContent));
  const f0 = await frames();
  await until((n) => window.tp05.state.stats.frames >= n + 3, f0);
  await page.keyboard.press("w");
  await until(() => /WS/.test(document.querySelector(".pill").textContent));
});

test("las cinco vistas se dibujan sin errores y cambiar de vista conserva historial y capturas", async () => {
  await page.keyboard.press("c");
  const antes = await page.evaluate(() => window.tp05.captures.size);
  for (const [key, id] of [["2", "body"], ["3", "pilot"], ["4", "twin"], ["5", "manual"], ["1", "console"]]) {
    await page.keyboard.press(key);
    await page.waitForSelector(`#view-root.view-${id} > *`);
    const f0 = await frames();
    await until((n) => window.tp05.state.stats.frames > n + 2, f0); // la vista recibió datos en vivo
    assert.equal(await page.locator(`.views__btn[data-view="${id}"]`).getAttribute("aria-pressed"), "true");
  }
  assert.equal(await page.evaluate(() => window.tp05.captures.size), antes, "las capturas sobreviven al cambio de vista");
  assert.ok((await page.evaluate(() => window.tp05.history.size)) > 20, "el historial también");
  assert.deepEqual(errors, [], "sin errores en la consola del navegador");
});

test("el navegador descarga el CSV con una fila por captura", async () => {
  await page.evaluate(() => window.tp05.actions.clearCaptures());
  await page.keyboard.press("c");
  await page.keyboard.press("c");
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("e")]);
  assert.match(download.suggestedFilename(), /^telemetria_go2_.+\.csv$/);
  const lines = (await readFile(await download.path(), "utf8")).trim().split("\r\n");
  assert.equal(lines.length, 3, "encabezado + 2 capturas");
  assert.ok(lines[0].includes("FR_calf_temperatura_C"));
});

test("la fuente se cambia desde el dashboard contra el backend real: Go2 → G1 → Go2", async () => {
  await page.click(".mode-chip");
  await page.click('.popover [aria-label="Robot"] >> text=G1');
  await page.click(".popover >> text=Usar esta fuente");
  await until(() => window.tp05.state.latest?.motores.length === 29);
  assert.match(await page.locator(".brand__robot").textContent(), /G1 .* 29 motores/);

  await page.click('.popover [aria-label="Robot"] >> text=Go2');
  await page.click(".popover >> text=Usar esta fuente");
  await until(() => window.tp05.state.latest?.motores.length === 12);
  await page.keyboard.press("Escape");
});

test("si el servidor se cae, el dashboard lo muestra y reconecta solo cuando vuelve", async () => {
  await stopServer(server);
  await until(() => /Reconectando|Sin datos/.test(document.querySelector(".pill").textContent));
  server = await startServer();
  await until(() => /En vivo/.test(document.querySelector(".pill").textContent), undefined, 15000);
  const f0 = await frames();
  await until((n) => window.tp05.state.stats.frames > n, f0);
});

test("en el celular (390 px) ninguna vista se desborda a lo ancho", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const key of ["1", "2", "3", "4", "5"]) {
    await page.keyboard.press(key);
    await page.waitForSelector(`#view-root > *`);
    await page.waitForTimeout(250); // un cuadro de layout después del montaje
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `vista ${key}: ${overflow}px de más a lo ancho`);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
});
