@echo off
REM Detener todos los servicios de BravoCRM

cls
echo.
echo ==================================
echo BravoCRM - Deteniendo Servicios
echo ==================================
echo.

REM Obtener directorio del script
set PROJECT_ROOT=%~dp0

echo [*] Deteniendo Docker Compose...
cd /d %PROJECT_ROOT%
docker-compose down

if !errorlevel! equ 0 (
    echo [OK] Servicios detenidos
) else (
    echo [ERROR] No se pudieron detener los servicios
    pause
    exit /b 1
)

echo.
echo [OK] Todos los servicios han sido detenidos
echo.
echo Para ver los logs: docker-compose logs -f
echo Para ver estado: docker-compose ps
echo.
pause
