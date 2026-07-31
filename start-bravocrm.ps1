# BravoCRM - Start All Services
# Script para iniciar: Docker (DB), Backend, Frontend

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "BravoCRM - Iniciando Servicios" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Configuración
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPath = "$projectRoot\frontend"
$backendPath = "$projectRoot\backend"

Write-Host "📁 Directorio: $projectRoot" -ForegroundColor Yellow
Write-Host ""

# 1. Verificar Docker
Write-Host "1️⃣  Verificando Docker..." -ForegroundColor Green
$dockerCheck = docker --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Docker instalado: $dockerCheck" -ForegroundColor Green
} else {
    Write-Host "✗ Docker NO instalado. Instala Docker Desktop desde: https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    Write-Host "Presiona Enter para continuar sin Docker (necesitarás PostgreSQL local)..." -ForegroundColor Yellow
    Read-Host
}

# 2. Iniciar Docker Compose (Base de Datos)
Write-Host ""
Write-Host "2️⃣  Iniciando Base de Datos (Docker)..." -ForegroundColor Green
Push-Location $projectRoot
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Docker Compose iniciado" -ForegroundColor Green
    Write-Host "⏳ Esperando a que PostgreSQL esté listo..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
} else {
    Write-Host "✗ Error inicializando Docker Compose" -ForegroundColor Red
    Write-Host "Asegúrate de tener Docker Desktop corriendo" -ForegroundColor Yellow
}

# 3. Seed Database
Write-Host ""
Write-Host "3️⃣  Poblando Base de Datos con usuarios iniciales..." -ForegroundColor Green
Push-Location $backendPath

Write-Host "Esperando conexión a BD..."
Start-Sleep -Seconds 3

# Ejecutar seed usando node directamente (sin tsx)
Write-Host "Ejecutando: npm run seed" -ForegroundColor Yellow

# Primero compilamos TypeScript
npm run build 2>&1 | Out-Null

# Credenciales solo para este entorno LOCAL (no reutilizar en staging/producción).
# Cámbialas aquí si quieres otras; nunca se versionan reales en el repo.
$env:SEED_ADMIN_EMAIL    = "admin@local.test"
$env:SEED_ADMIN_PASSWORD = "ChangeMe123!"
$env:SEED_MANAGER_EMAIL    = "manager@local.test"
$env:SEED_MANAGER_PASSWORD = "ChangeMe123!"

# Luego ejecutamos seed con node
node -r ts-node/register src/db/seed.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Base de datos poblada con usuarios de desarrollo LOCAL" -ForegroundColor Green
    Write-Host "  - $($env:SEED_ADMIN_EMAIL) / $($env:SEED_ADMIN_PASSWORD) (admin)" -ForegroundColor Cyan
    Write-Host "  - $($env:SEED_MANAGER_EMAIL) / $($env:SEED_MANAGER_PASSWORD) (manager)" -ForegroundColor Cyan
} else {
    Write-Host "⚠ Advertencia: Seed podría haber fallado" -ForegroundColor Yellow
    Write-Host "  Continúa de todos modos..." -ForegroundColor Yellow
}

# 4. Iniciar Backend
Write-Host ""
Write-Host "4️⃣  Iniciando Backend (Node.js)..." -ForegroundColor Green
Write-Host "Ejecutando en: http://localhost:3000" -ForegroundColor Cyan

# Iniciar en nueva ventana de PowerShell
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$backendPath'; npm run dev`""

# 5. Iniciar Frontend
Write-Host ""
Write-Host "5️⃣  Iniciando Frontend (Vite)..." -ForegroundColor Green
Write-Host "Ejecutando en: http://localhost:5173" -ForegroundColor Cyan

Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$frontendPath'; npm run dev`""

# 6. Información final
Write-Host ""
Write-Host "==================================" -ForegroundColor Green
Write-Host "✓ BravoCRM Iniciado" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Servicios:" -ForegroundColor Yellow
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "  PgAdmin:   http://localhost:5050" -ForegroundColor Cyan
Write-Host "  Database:  localhost:5432" -ForegroundColor Cyan
Write-Host ""
Write-Host "👤 Usuarios de Prueba (solo local):" -ForegroundColor Yellow
Write-Host "  Admin:    admin@local.test / ChangeMe123!" -ForegroundColor Cyan
Write-Host "  Manager:  manager@local.test / ChangeMe123!" -ForegroundColor Cyan
Write-Host ""
Write-Host "📖 Guía de Testing:" -ForegroundColor Yellow
Write-Host "  Ver: QA_TESTING_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  IMPORTANTE:" -ForegroundColor Yellow
Write-Host "  - Se han abierto 2 nuevas ventanas PowerShell (Backend y Frontend)" -ForegroundColor Yellow
Write-Host "  - Mantén estas ventanas abiertas mientras desarrollas" -ForegroundColor Yellow
Write-Host "  - Para detener todo: cierra las ventanas y ejecuta: docker-compose down" -ForegroundColor Yellow
Write-Host ""

Pop-Location
Pop-Location

Write-Host "Presiona Enter para cerrar esta ventana..." -ForegroundColor Yellow
Read-Host
