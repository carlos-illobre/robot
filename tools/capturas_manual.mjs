/**
 * Genera las capturas del manual (frontend/assets/manual/*.png) y la posición
 * de sus marcas numeradas (frontend/assets/manual/marcas.json).
 *
 *   node tools/capturas_manual.mjs
 *
 * Usa la simulación del navegador (?server=demo, semilla fija), así que no
 * necesita backend y las capturas salen siempre parecidas. Las marcas se
 * calculan midiendo en el navegador el centro de cada elemento: si una vista
 * cambia de diseño, se vuelve a correr y las marcas siguen apuntando bien.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "frontend/assets/manual");
const PORT = 8765 + Math.floor(Math.random() * 200);

/**
 * Qué se marca en cada vista: [selector CSS, ancla].
 * Ancla "tl": esquina superior izquierda del elemento (no tapa su texto); "c": centro
 * (para elementos chicos, como una articulación o un pie).
 */
const VISTAS = {
  console: [
    [".cv-strip", "tl"],
    [".cv-actions", "tl"],
    [".cv-motors .cv-ph h2", "tl"],
    [".cv-motors .cv-temp", "tl"],
    [".cv-alarm", "tl"],
    [".cv-mchart", "tl"],
    [".cv-horizon", "tl"],
    [".cv-imu .cv-chartbox", "tl"],
    [".cv-bms .cv-ring", "tl"],
    [".cv-cells", "tl"],
    [".cv-feet .cv-figure", "tl"],
    [".cv-legs", "tl"],
    [".cv-footer", "tl"],
  ],
  body: [
    [".bd-status", "tl"],
    [".bd-joint", "c"],
    [".bd-foot", "c"],
    [".bd-battext", "tl"],
    [".bd-ring__heading", "c"],
    [".bd-card__name", "tl"],
    [".bd-imu", "tl"],
    [".fig-toggle", "tl"],
    [".bd-detail", "tl"],
    [".bd-motors", "tl"],
    [".bd-battery", "tl"],
    [".bd-timeline__canvas", "tl"],
    [".bd-actions", "tl"],
  ],
  pilot: [
    [".pv-heading", "tl"],
    [".pv-battery", "tl"],
    [".pv-thermo", "tl"],
    [".pv-seg__main", "c"],
    [".pv-ring__feet circle", "c"],
    [".pv-ring__state", "c"],
    [".pv-osc", "tl"],
    [".pv-controls", "tl"],
    [".pv-desk", "tl"],
  ],
  twin: [
    [".tw-hud__head", "tl"],
    [".tw-att", "tl"],
    [".tw-compass", "c"],
    [".tw-hot", "tl"],
    [".tw-feet", "tl"],
    [".tw-stage", "c"],
    [".tw-panel", "tl"],
    [".tw-dock", "tl"],
  ],
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT), "-d", path.join(ROOT, "frontend")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1000));
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const marcas = {};
  try {
    for (const [vista, items] of Object.entries(VISTAS)) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.5 });
      await page.goto(`http://127.0.0.1:${PORT}/?server=demo&view=${vista}&calidad=alta`);
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.reload();
      await page.waitForFunction(() => window.tp05?.state.latest);
      // Esperar a que los gráficos tengan historia (la línea de tiempo del Cuerpo muestra 30 s).
      await page.waitForTimeout(vista === "body" ? 31000 : vista === "twin" ? 9000 : 14000);
      if (vista === "twin") {
        // Sin GPU, el 3D en movimiento hace muy lenta la captura: se congela y se oculta el aviso.
        await page.evaluate(() => window.tp05.actions.togglePause(true));
        await page.waitForTimeout(2500);
        await page.evaluate(() => document.querySelectorAll(".tw-status").forEach((el) => (el.style.visibility = "hidden")));
      }
      await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));

      marcas[vista] = [];
      for (const [sel, anchor] of items) {
        const box = await page.locator(sel).first().boundingBox().catch(() => null);
        if (!box) {
          console.warn(`  ${vista}: no encontré ${sel}`);
          marcas[vista].push(null);
          continue;
        }
        const x = anchor === "tl" ? box.x + 4 : box.x + box.width / 2;
        const y = anchor === "tl" ? box.y + 4 : box.y + box.height / 2;
        const clamp = (v) => Math.min(98, Math.max(1.8, v)); // que la marca no quede cortada en el borde
        marcas[vista].push([+clamp((x / 1366) * 100).toFixed(1), +clamp(((y - 52) / (768 - 52)) * 100).toFixed(1)]);
      }
      // La captura es solo el área de la vista (sin la barra común, que tiene su propia figura).
      await page.screenshot({ path: path.join(OUT, `${vista}-desktop.png`), clip: { x: 0, y: 52, width: 1366, height: 716 }, timeout: 120000 });
      console.log(`✓ ${vista}`);
      await page.close();
    }
    // Barra común
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.5 });
    await page.goto(`http://127.0.0.1:${PORT}/?server=demo&view=console`);
    await page.waitForFunction(() => window.tp05?.state.latest);
    await page.waitForTimeout(1500);
    await page.locator("#appbar").screenshot({ path: path.join(OUT, "appbar.png") });
    await page.close();
  } finally {
    await browser.close();
    server.kill();
  }
  await writeFile(path.join(OUT, "marcas.json"), JSON.stringify(marcas, null, 2) + "\n");
  console.log(JSON.stringify(marcas));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
