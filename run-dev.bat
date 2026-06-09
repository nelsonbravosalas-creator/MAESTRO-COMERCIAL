@echo off
REM BravoCRM - Modo Development Rápido (JSON)
REM Sin necesidad de Docker o PostgreSQL

cls
echo.
echo ╔════════════════════════════════════════╗
echo ║  BravoCRM - MODO DEVELOPMENT RÁPIDO    ║
echo ║  (JSON Database - Sin Docker)          ║
echo ╚════════════════════════════════════════╝
echo.

set PROJECT_ROOT=%~dp0
set BACKEND_PATH=%PROJECT_ROOT%backend
set FRONTEND_PATH=%PROJECT_ROOT%frontend

echo [✓] Iniciando servidores...
echo.
echo 🔌 Backend en:  http://localhost:3000
echo 🎨 Frontend en: http://localhost:5173
echo.
echo 👤 Usuarios de Prueba:
echo    - nbravo.nbyb@gmail.com / 3571 (admin)
echo    - hmeza.nbyb@gmail.com / 4321 (manager)
echo.

REM Iniciar Backend
echo [BACKEND] Iniciando en puerto 3000...
start "Backend - BravoCRM (Puerto 3000)" cmd /k "cd /d %BACKEND_PATH% && node server-dev.js"

REM Esperar a que Backend esté listo
timeout /t 5 /nobreak

REM Iniciar Frontend
echo [FRONTEND] Iniciando en puerto 5173...
start "Frontend - BravoCRM (Puerto 5173)" cmd /k "cd /d %FRONTEND_PATH% && npm run dev"

echo.
echo ╔════════════════════════════════════════╗
echo ║ ✓ Servicios iniciados                 ║
echo ║   Backend:  http://localhost:3000     ║
echo ║   Frontend: http://localhost:5173     ║
echo ║ Abriendo navegador...                 ║
echo ╚════════════════════════════════════════╝
echo.

REM Abrir navegador
timeout /t 8 /nobreak
start http://localhost:5173

echo Presiona Enter para cerrar esta ventana...
pause
