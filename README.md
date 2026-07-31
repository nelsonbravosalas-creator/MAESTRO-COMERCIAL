# BravoCRM - Plataforma de Gestión Comercial

Aplicación full-stack para gestión integral del ciclo comercial: cotizaciones, planificación, ejecución y facturación.

## 🎯 Características

- **Cotizaciones**: Crear, gestionar y trackear cotizaciones con cálculo automático de totales
- **Planificación**: Convertir cotizaciones aceptadas en proyectos con asignación de recursos
- **Ejecución**: Registrar avance, consumo de recursos y costos en tiempo real
- **Facturación**: Generar facturas con números secuenciales, condiciones de pago y vencimiento
- **Dashboard**: Indicadores de costos, márgenes y estado de proyectos
- **Reportes**: PDF/DOCX de cotizaciones y facturas
- **Usuarios**: Sistema de roles (admin, manager, user) con JWT, sesiones revocables y recuperación de contraseña

## 🏗️ Arquitectura

```
maestro-comercial/
├── frontend/          [React 19 + TypeScript + Vite + Zustand]
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── stores/
│       └── types/
├── backend/           [Node.js + Express + TypeScript + PostgreSQL]
│   └── src/
│       ├── api/            (routers, uno por recurso)
│       ├── middleware/
│       ├── schemas/        (validación zod)
│       ├── services/       (mailer, etc.)
│       ├── db/migrations/  (node-pg-migrate)
│       └── app.ts          (única definición de la app — ver docs/adr/0001)
├── api/index.ts       [handler serverless de Vercel]
└── docs/               documentación técnica, ADRs y runbooks
```

## 🚀 Inicio Rápido

### Con Docker (recomendado)

```bash
docker compose up -d postgres
cd backend && npm install && npm run migrate:up
```

Ver `docs/SETUP_LOCAL.md` para el paso a paso completo.

### Frontend

```bash
cd frontend
npm install
npm run dev        # Desarrollo
npm run build      # Producción
```

### Backend

```bash
cd backend
npm install
cp .env.example .env   # completar JWT_SECRET, DATABASE_URL, ALLOWED_ORIGINS
npm run migrate:up     # crea el esquema (ver docs/MIGRACIONES.md)
npm run dev             # Desarrollo
npm run build            # Compilar TypeScript
npm start                 # Producción
```

## 📊 Stack Tecnológico

### Frontend

- React 19 + TypeScript + Vite
- Zustand (state management)
- Recharts (gráficos)
- jsPDF + html2canvas + docx (exportación)

### Backend

- Node.js + Express + TypeScript
- PostgreSQL (Neon) + node-pg-migrate
- JWT + bcryptjs + sesiones revocables (refresh token hasheado, rotación)
- Zod (validación de entradas)
- Winston (logging) + Sentry opcional

## 🔑 Creación del primer usuario admin

No hay credenciales por defecto. El primer administrador se crea (o se promueve, si el
correo ya existe) llamando al endpoint protegido por `ADMIN_SETUP_SECRET`:

```bash
curl -X POST "$API_URL/api/admin/setup" \
  -H "content-type: application/json" \
  -d '{"secret":"<ADMIN_SETUP_SECRET>","email":"tu@correo.cl","password":"<contraseña de 8+ caracteres>","name":"Tu Nombre"}'
```

Si `ADMIN_SETUP_SECRET` no está configurado en el entorno, el endpoint responde `503`
(deshabilitado por seguridad). Ver `backend/.env.example`.

Los usuarios ya creados pueden recuperar su contraseña desde la pantalla de login
(`POST /api/auth/forgot-password`) — requiere tener un proveedor de correo
configurado, ver `docs/EMAIL_SETUP.md`.

## 📚 Documentación

| Documento                     | Contenido                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `docs/SETUP_LOCAL.md`         | Levantar el proyecto localmente paso a paso                                     |
| `docs/MIGRACIONES.md`         | Cómo funcionan las migraciones de base de datos                                 |
| `docs/MATRIZ_PERMISOS.md`     | Qué puede hacer cada rol (admin/manager/user)                                   |
| `docs/INCIDENT_RUNBOOK.md`    | Qué hacer cuando algo se rompe en producción                                    |
| `docs/DR_RUNBOOK.md`          | Plan de recuperación ante desastres                                             |
| `docs/EMAIL_SETUP.md`         | Configurar el proveedor de correo (SPF/DKIM/DMARC)                              |
| `docs/INFRA.md`               | WAF, restricción de red, checklist de infraestructura                           |
| `docs/CLASIFICACION_DATOS.md` | Qué datos personales se guardan y por qué                                       |
| `docs/RIESGOS_ACEPTADOS.md`   | Decisiones de riesgo aceptado, documentadas y con fecha de revisión             |
| `docs/adr/`                   | Decisiones de arquitectura                                                      |
| `docs/historico/`             | Documentos de fases anteriores del proyecto (auditorías previas, prompts de IA) |

## 🤝 Contribución

Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, etc.), validado por commitlint en un hook local y en CI.
`master` requiere pull request con los checks de `.github/workflows/ci.yml` en verde.

## 📄 Licencia

Privado - Nelson Bravo Salas
