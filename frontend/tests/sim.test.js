// El simulador del navegador (usado en GitHub Pages) cumple el mismo contrato
// y las mismas propiedades físicas que el demo "paseo" del backend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PaseoSim, GUION } from "../js/core/paseoSim.js";
import { normalizeFrame, tempLevel } from "../js/core/telemetryModel.js";

const CICLO = GUION.reduce((a, [d]) => a + d, 0);

function recorrer(modelo, segundos) {
  const sim = new PaseoSim(modelo);
  const out = [];
  for (let t = 0; t < segundos; t += 0.5) {
    sim.advance(0.5);
    out.push({ tramo: sim.tramo.label, t: sim.telemetria() });
  }
  return { sim, out };
}

test("respeta el contrato de /telemetria e /info (Go2 y G1)", () => {
  for (const [modelo, n, patas] of [["go2", 12, 4], ["g1", 29, 2]]) {
    const { sim, out } = recorrer(modelo, 3);
    const t = out.at(-1).t;
    assert.deepEqual(Object.keys(t).sort(), ["bms", "fuerzas", "imu", "modelo", "motores", "ts"]);
    assert.equal(t.motores.length, n);
    assert.equal(Object.keys(t.fuerzas).length, patas);
    assert.equal(sim.info().n_motores, n);
    assert.ok(t.bms.celdas.every((v) => v > 3 && v < 4.3));
    assert.doesNotThrow(() => normalizeFrame(t));
  }
});

test("el paseo recorre los tres colores del semáforo", () => {
  const { out } = recorrer("go2", 240);
  const niveles = new Set(out.flatMap(({ t }) => t.motores.map((m) => tempLevel(m.temperatura))));
  assert.deepEqual([...niveles].sort(), ["crit", "ok", "warn"]);
});

test("quieto apoya las cuatro patas; trotando, las diagonales se alternan", () => {
  const { out } = recorrer("go2", CICLO);
  const quieto = out.filter((s) => s.tramo === "quieto").at(-1).t.fuerzas;
  assert.equal(Object.values(quieto).reduce((a, b) => a + b), 4);
  const trote = out.filter((s) => s.tramo === "trota").map((s) => s.t.fuerzas);
  assert.ok(trote.some((f) => f.FR === f.RL && f.FL === f.RR && f.FR !== f.FL));
});
