@echo off
REM MAESTRO COMERCIAL - Modo Development Local (JSON Database)
REM Sin necesidad de Docker o PostgreSQL

cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   MAESTRO COMERCIAL - DEV LOCAL            ║
echo ║   Base de Datos: JSON (sin Docker)         ║
echo ╚════════════════════════════════════════════╝
echo.

set PROJECT_ROOT=%~dp0
set BACKEND_PATH=%PROJECT_ROOT%backend
set FRONTEND_PATH=%PROJECT_ROOT%frontend

REM Verificar que node_modules existan
if not exist "%BACKEND_PATH%\node_modules" (
    echo [!] Instalando dependencias del backend...
    cd /d "%BACKEND_PATH%"
    npm install
)
if not exist "%FRONTEND_PATH%\node_modules" (
    echo [!] Instalando dependencias del frontend...
    cd /d "%FRONTEND_PATH%"
    npm install
)

echo.
echo [OK] Iniciando servidores...
echo.
echo   Backend:   http://localhost:3000
echo   Frontend:  http://localhost:5173
echo.
echo   Usuarios:
echo     nbravo.nbyb@gmail.com  /  3571  (admin)
echo     hmeza.nbyb@gmail.com   /  4321  (manager)
echo.

REM Iniciar Backend en nueva ventana
start "BACKEND - Puerto 3000" cmd /k "cd /d "%BACKEND_PATH%" && npm run dev:json"

REM Esperar que backend esté listo
timeout /t 6 /nobreak > nul

REM Iniciar Frontend en nueva ventana
start "FRONTEND - Puerto 5173" cmd /k "cd /d "%FRONTEND_PATH%" && npm run dev"

REM Abrir navegador
timeout /t 5 /nobreak > nul
start http://localhost:5173

echo.
echo ╔════════════════════════════════════════════╗
echo ║  Servicios corriendo en ventanas separadas ║
echo ║  Cierra las ventanas para detener todo     ║
echo ╚════════════════════════════════════════════╝
echo.
pause
