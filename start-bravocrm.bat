@echo off
REM BravoCRM - Start All Services
REM Script para iniciar: Docker (DB), Backend, Frontend

setlocal enabledelayedexpansion

cls
echo.
echo ==================================
echo BravoCRM - Iniciando Servicios
echo ==================================
echo.

REM Obtener directorio del script
set PROJECT_ROOT=%~dp0
set FRONTEND_PATH=%PROJECT_ROOT%frontend
set BACKEND_PATH=%PROJECT_ROOT%backend

echo [*] Directorio: %PROJECT_ROOT%
echo.

REM 1. Verificar Docker
echo [1/5] Verificando Docker...
docker --version >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Docker instalado
) else (
    echo [ERROR] Docker NO instalado
    echo Instala desde: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM 2. Iniciar Docker Compose
echo.
echo [2/5] Iniciando Base de Datos (Docker)...
cd /d %PROJECT_ROOT%
docker-compose up -d
if !errorlevel! equ 0 (
    echo [OK] Docker iniciado
    timeout /t 10 /nobreak
) else (
    echo [ERROR] Fallo en Docker Compose
    pause
    exit /b 1
)

REM 3. Seed Database
echo.
echo [3/5] Poblando Base de Datos...
cd /d %BACKEND_PATH%

REM Esperar a que PostgreSQL esté listo
timeout /t 5 /nobreak

REM Ejecutar seed
echo Ejecutando seed...
npm run seed

REM 4. Iniciar Backend
echo.
echo [4/5] Iniciando Backend...
echo Backend en: http://localhost:3000
start "" cmd /k "cd /d %BACKEND_PATH% && npm run dev"

REM 5. Iniciar Frontend
echo.
echo [5/5] Iniciando Frontend...
echo Frontend en: http://localhost:5173
start "" cmd /k "cd /d %FRONTEND_PATH% && npm run dev"

REM Mostrar información
echo.
echo ==================================
echo [OK] BravoCRM Iniciado
echo ==================================
echo.
echo Servicios:
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:3000
echo   PgAdmin:   http://localhost:5050
echo   Database:  localhost:5432
echo.
echo Usuarios de Prueba:
echo   Admin:    nbravo.nbyb@gmail.com / 3571
echo   Manager:  hmeza.nbyb@gmail.com / 4321
echo.
echo Guia de Testing: QA_TESTING_GUIDE.md
echo.
echo [IMPORTANTE]
echo - Se han abierto 2 ventanas de comando (Backend y Frontend)
echo - Mantén estas ventanas abiertas mientras desarrollas
echo - Para detener todo: docker-compose down
echo.
pause
