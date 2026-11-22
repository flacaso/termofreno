@echo off
cd /d "%~dp0"
echo === Buscando Python ===
set PY=python
%PY% --version >nul 2>&1 || set PY=py
%PY% --version || (echo.& echo NO se encontro Python. Instalalo desde python.org y marca "Add Python to PATH".& pause & exit /b)
echo.
echo === Instalando requests ===
%PY% -m pip install requests
echo.
echo === Generando voces con ElevenLabs (necesita internet) ===
%PY% generar_voz.py
echo.
echo === Terminado. Revisa arriba si hubo errores ===
pause
