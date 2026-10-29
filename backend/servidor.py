"""Levanta el backend de telemetria del TP05 y sirve el dashboard web.

Uso rapido:

    python backend/servidor.py --demo                 # Go2, datos de paseo simulado
    python backend/servidor.py --demo --robot g1      # humanoide G1 (29 motores)
    python backend/servidor.py --demo-catedra         # DemoReader original de la catedra
    python backend/servidor.py                        # lee del simulador MuJoCo de la catedra

y abrir  http://localhost:8001  en el navegador.

Es el mismo backend FastAPI que provee la catedra (`api/telemetry_server.py`,
sin modificaciones). Este archivo solo agrega dos cosas:

1. Elige que *lector* (fuente de datos) se inyecta en el servidor: la API y el
   JSON son identicos en los tres modos. Ese es el punto de la arquitectura.
2. Monta el frontend (`/frontend`) como archivos estaticos en `/dashboard`,
   para que alcance con un solo comando y no haya problemas de CORS ni de
   modulos ES abiertos desde `file://`.
"""

from __future__ import annotations

import argparse
import socket
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
FRONTEND = BASE.parent / "frontend"
for sub in (BASE, BASE / "api"):
    if str(sub) not in sys.path:
        sys.path.insert(0, str(sub))


def ip_de_la_maquina() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def crear_lector(modo: str, robot: str):
    """Fabrica (Factory Method) del lector segun el modo elegido."""
    if modo == "demo":
        from api.demo_paseo import PaseoDemoReader
        return PaseoDemoReader(robot)
    if modo == "demo-catedra":
        from api.telemetry_reader_dds import DemoReader
        return DemoReader(robot)
    from api.telemetry_reader import TelemetryReader
    return TelemetryReader(robot, network_interface="lo")


def montar_dashboard(app) -> None:
    """Sirve el frontend en /dashboard y redirige la raiz hacia ahi."""
    from fastapi.responses import RedirectResponse
    from fastapi.staticfiles import StaticFiles

    if not FRONTEND.exists():
        return
    app.mount("/dashboard", StaticFiles(directory=FRONTEND, html=True), name="dashboard")

    @app.get("/", include_in_schema=False)
    def raiz():
        return RedirectResponse(url="/dashboard/")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Backend de telemetria TP05 + dashboard web")
    ap.add_argument("--robot", default="go2", choices=("g1", "go2"))
    ap.add_argument("--puerto", type=int, default=8001)
    ap.add_argument("--host", default="0.0.0.0")
    grupo = ap.add_mutually_exclusive_group()
    grupo.add_argument("--demo", action="store_true",
                       help="paseo simulado sin robot ni MuJoCo (recomendado)")
    grupo.add_argument("--demo-catedra", action="store_true",
                       help="DemoReader original de la catedra (senoidales)")
    args = ap.parse_args(argv)

    import uvicorn
    from api.telemetry_server import app, configurar

    modo = "demo" if args.demo else "demo-catedra" if args.demo_catedra else "simulador"
    lector = crear_lector(modo, args.robot)
    if modo == "simulador" and not lector.esperar_primer_dato(timeout=8.0):
        print("\n  No llegan datos del simulador MuJoCo de la catedra.")
        print("  Fijate que la ventana del simulador siga abierta,")
        print("  o proba sin simulador con:  python backend/servidor.py --demo\n")
        return 1

    # El servidor de la catedra reporta "demo" en /info; los dos demos lo son.
    configurar(lector, args.robot, "demo" if modo.startswith("demo") else modo)
    montar_dashboard(app)
    ip = ip_de_la_maquina()

    print()
    print("=" * 66)
    print("  BACKEND DE TELEMETRIA TP05 LISTO")
    print("=" * 66)
    print(f"  Robot : {args.robot}   Modo: {modo}")
    print()
    print(f"  DASHBOARD  ->  http://localhost:{args.puerto}")
    print(f"  (desde otra maquina de la red: http://{ip}:{args.puerto})")
    print()
    print("  Endpoints:")
    for e in ("/telemetria", "/motores", "/imu", "/bms", "/fuerzas", "/info"):
        print(f"        GET  {e}")
    print(f"        WS   ws://{ip}:{args.puerto}/ws     (tiempo real)")
    print(f"  Documentacion OpenAPI: http://localhost:{args.puerto}/docs")
    print("=" * 66)
    print()

    uvicorn.run(app, host=args.host, port=args.puerto, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
