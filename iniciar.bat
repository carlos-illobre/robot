@echo off
REM Arranque en un paso (Windows): doble clic, o  iniciar.bat --robot g1
REM Crea un entorno virtual la primera vez, instala dependencias, levanta el
REM backend en modo demo y abre el dashboard en el navegador.
setlocal
cd /d "%~dp0"

where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>nul
if errorlevel 1 (
  echo Hace falta Python 3.10 o superior: https://www.python.org/downloads/
  echo Al instalarlo, tilda "Add python.exe to PATH".
  pause
  exit /b 1
)

if not exist .venv (
  echo ^> Creando entorno virtual ^(.venv^)...
  %PY% -m venv .venv
)
echo ^> Instalando dependencias...
.venv\Scripts\python -m pip install -q --upgrade pip
.venv\Scripts\python -m pip install -q -r requirements.txt

set ARGS=%*
if "%ARGS%"=="" set ARGS=--demo

start "" cmd /c "timeout /t 2 >nul & start http://localhost:8001"
.venv\Scripts\python backend\servidor.py --puerto 8001 %ARGS%
pause
