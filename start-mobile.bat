@echo off
title Maestro Comercial - Modo Movil
color 0A

set ROOT=%~dp0
set BACKEND=%ROOT%backend
set FRONTEND=%ROOT%frontend

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║    MAESTRO COMERCIAL - MODO MOVIL         ║
echo  ║    IP Local: 192.168.100.11               ║
echo  ╚═══════════════════════════════════════════╝
echo.
echo  Abre en tu celular:
echo  ------------------------------------------
echo  App:      http://192.168.100.11:4000
echo  ------------------------------------------
echo  (el celular debe estar en la misma WiFi)
echo.

:: Arrancar backend en ventana separada
start "BACKEND - Puerto 3000" cmd /k "cd /d "%BACKEND%" && npm run dev:json"

:: Esperar que el backend arranque
timeout /t 3 /nobreak >nul

:: Arrancar servidor frontend (archivos ya compilados)
start "FRONTEND MOVIL - Puerto 4000" cmd /k "cd /d "%FRONTEND%" && npm run serve:lan"

echo  Servidores iniciados. Cierra esta ventana cuando termines.
pause
