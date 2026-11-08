"""Reporte HTML de las pruebas de mutación del backend (spec 008 · FR-003, FR-004).

mutmut 3 guarda los resultados en ``mutants/**/*.meta`` y solo los muestra en la terminal. Este
script los convierte en una página navegable: puntaje total, una fila por archivo y, para cada
mutante que sobrevivió, el cambio exacto que ninguna prueba detectó.

    python tools/mutmut_html.py [--salida reports/mutation/backend/index.html] [--minimo 80]

Se corre desde la raíz del repositorio, después de ``mutmut run``. Con ``--minimo`` sale con
código 1 si el puntaje queda por debajo (para la CI).
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

DETECTADOS = {"killed", "timeout", "caught by type check", "segfault"}
NO_CUENTAN = {"not checked", "skipped", "check was interrupted by user"}
ETIQUETA = {
    "killed": "muerto",
    "survived": "sobrevivió",
    "no tests": "sin pruebas",
    "timeout": "tiempo agotado",
    "suspicious": "sospechoso",
    "not checked": "sin evaluar",
    "skipped": "salteado",
    "caught by type check": "detectado por tipos",
    "segfault": "se colgó",
}


def leer_resultados(raiz: Path) -> dict[str, dict[str, str]]:
    """{archivo fuente: {nombre del mutante: estado}} a partir de mutants/**/*.meta."""
    from mutmut.stats import status_by_exit_code

    resultados: dict[str, dict[str, str]] = {}
    for meta in sorted((raiz / "mutants").rglob("*.py.meta")):
        fuente = meta.relative_to(raiz / "mutants").with_suffix("")
        datos = json.loads(meta.read_text(encoding="utf-8"))
        resultados[str(fuente)] = {k: status_by_exit_code[v] for k, v in datos["exit_code_by_key"].items()}
    return resultados


def puntaje(estados) -> tuple[int, int, float]:
    """(detectados, evaluados, porcentaje). "Sin pruebas" cuenta como sobreviviente."""
    evaluados = [e for e in estados if e not in NO_CUENTAN]
    detectados = sum(1 for e in evaluados if e in DETECTADOS)
    return detectados, len(evaluados), (100.0 * detectados / len(evaluados)) if evaluados else 100.0


def diff_de(nombre: str, fuente: str) -> str:
    from mutmut.mutation.diff_apply import get_diff_for_mutant

    try:
        return get_diff_for_mutant(nombre, path=Path("mutants") / fuente)
    except Exception as e:  # el reporte no se cae por un mutante que no se puede mostrar
        return f"(no se pudo obtener el cambio: {e})"


def _color(p: float) -> str:
    return "ok" if p >= 80 else "warn" if p >= 60 else "crit"


def _diff_html(texto: str) -> str:
    filas = []
    for linea in texto.splitlines():
        if linea.startswith(("---", "+++")):
            continue
        clase = "add" if linea.startswith("+") else "del" if linea.startswith("-") else "hunk" if linea.startswith("@@") else ""
        filas.append(f'<span class="{clase}">{html.escape(linea)}</span>')
    return "\n".join(filas)


def generar_html(resultados: dict[str, dict[str, str]], diffs: dict[str, str]) -> str:
    total = [e for estados in resultados.values() for e in estados.values()]
    det, ev, p = puntaje(total)
    conteo = Counter(total)
    filas, detalles = [], []
    for fuente, estados in resultados.items():
        d, e, pf = puntaje(estados.values())
        c = Counter(estados.values())
        ancla = fuente.replace("/", "-").replace(".", "-")
        filas.append(
            f'<tr><td><a href="#{ancla}">{html.escape(fuente)}</a></td>'
            f'<td class="num"><span class="pill {_color(pf)}">{pf:.1f} %</span></td>'
            f'<td class="num">{c["killed"] + c["timeout"]}</td><td class="num">{c["survived"]}</td>'
            f'<td class="num">{c["no tests"]}</td><td class="num">{e}</td></tr>'
        )
        vivos = [(n, s) for n, s in estados.items() if s not in DETECTADOS and s not in NO_CUENTAN]
        if not vivos:
            continue
        items = "".join(
            f'<details><summary><code>{html.escape(n.split(".")[-1])}</code> <span class="tag">{ETIQUETA.get(s, s)}</span></summary>'
            f'<pre>{_diff_html(diffs.get(n, ""))}</pre></details>'
            for n, s in vivos
        )
        detalles.append(f'<section id="{ancla}"><h2>{html.escape(fuente)} <small>{len(vivos)} vivos</small></h2>{items}</section>')

    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mutación del backend</title>
<style>
:root {{ --bg:#f7f8fa; --panel:#fff; --text:#1b1f27; --muted:#5d6575; --line:#e3e6ec; --ok:#1a7f45; --warn:#9a6200; --crit:#b42318; --add:#e7f6ec; --del:#fdecea; --accent:#2f5bea; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#0e1116; --panel:#161b22; --text:#e6e9ef; --muted:#97a0b0; --line:#2a313c; --ok:#4ade80; --warn:#fbbf24; --crit:#f87171; --add:#12301e; --del:#3a1517; --accent:#7aa2ff; }} }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }}
main {{ max-width:1000px; margin:0 auto; padding:24px 16px 64px; }}
h1 {{ margin:0 0 4px; font-size:24px; }} h2 {{ font-size:16px; margin:32px 0 8px; }} h2 small {{ color:var(--muted); font-weight:500; }}
.sub {{ color:var(--muted); margin:0 0 24px; }}
.cards {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-bottom:24px; }}
.card {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }}
.card b {{ display:block; font-size:26px; }} .card span {{ color:var(--muted); font-size:13px; }}
.wrap {{ overflow-x:auto; background:var(--panel); border:1px solid var(--line); border-radius:12px; }}
table {{ width:100%; border-collapse:collapse; font-size:14px; }}
th, td {{ padding:8px 12px; border-bottom:1px solid var(--line); text-align:left; white-space:nowrap; }}
th {{ color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }}
.num {{ text-align:right; font-variant-numeric:tabular-nums; }}
a {{ color:var(--accent); }}
.pill {{ font-weight:700; }} .ok {{ color:var(--ok); }} .warn {{ color:var(--warn); }} .crit {{ color:var(--crit); }}
details {{ background:var(--panel); border:1px solid var(--line); border-radius:10px; margin:6px 0; }}
summary {{ cursor:pointer; padding:8px 12px; }} .tag {{ color:var(--muted); font-size:12px; margin-left:6px; }}
pre {{ margin:0; padding:10px 12px; overflow-x:auto; border-top:1px solid var(--line); font:12.5px/1.45 ui-monospace, "JetBrains Mono", monospace; }}
pre span {{ display:block; }} .add {{ background:var(--add); }} .del {{ background:var(--del); }} .hunk {{ color:var(--muted); }}
</style></head><body><main>
<p><a href="../../">← Reportes de calidad</a></p>
<h1>Pruebas de mutación · backend</h1>
<p class="sub">mutmut · {fecha} · un mutante <em>sobrevive</em> si ninguna prueba falla al introducir ese cambio.</p>
<div class="cards">
<div class="card"><b class="{_color(p)}">{p:.1f} %</b><span>puntaje de mutación</span></div>
<div class="card"><b>{det}</b><span>mutantes detectados</span></div>
<div class="card"><b>{conteo["survived"]}</b><span>sobrevivieron</span></div>
<div class="card"><b>{conteo["no tests"]}</b><span>sin pruebas que los alcancen</span></div>
<div class="card"><b>{ev}</b><span>mutantes evaluados</span></div>
</div>
<div class="wrap"><table><thead><tr><th>Archivo</th><th class="num">Puntaje</th><th class="num">Muertos</th><th class="num">Sobrevivieron</th><th class="num">Sin pruebas</th><th class="num">Total</th></tr></thead>
<tbody>{"".join(filas)}</tbody></table></div>
{"".join(detalles)}
</main></body></html>
"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--salida", default="reports/mutation/backend/index.html")
    ap.add_argument("--minimo", type=float, default=None, help="puntaje mínimo; por debajo sale con código 1")
    args = ap.parse_args(argv)

    raiz = Path.cwd()
    resultados = leer_resultados(raiz)
    if not resultados:
        print("No hay resultados: corré `mutmut run` primero.", file=sys.stderr)
        return 2
    diffs = {
        n: diff_de(n, fuente)
        for fuente, estados in resultados.items()
        for n, s in estados.items()
        if s not in DETECTADOS and s not in NO_CUENTAN
    }
    salida = Path(args.salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(generar_html(resultados, diffs), encoding="utf-8")

    det, ev, p = puntaje([e for estados in resultados.values() for e in estados.values()])
    (salida.parent / "mutation.json").write_text(
        json.dumps({"puntaje": round(p, 2), "detectados": det, "evaluados": ev}, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Puntaje de mutación del backend: {p:.1f} % ({det}/{ev}) → {salida}")
    if args.minimo is not None and p < args.minimo:
        print(f"Por debajo del mínimo ({args.minimo} %).", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
