# BravoCRM - Plataforma de Gestión Comercial

Aplicación full-stack para gestión integral del ciclo comercial: cotizaciones, planificación, ejecución y facturación.

## 🎯 Características

- **Cotizaciones**: Crear, gestionar y trackear cotizaciones con cálculo automático de totales
- **Planificación**: Convertir cotizaciones aceptadas en proyectos con asignación de recursos
- **Ejecución**: Registrar avance, consumo de recursos y costos en tiempo real
- **Facturación**: Generar facturas con números secuenciales, condiciones de pago y vencimiento
- **Dashboard**: Indicadores de costos, márgenes y estado de proyectos
- **Reportes**: PDF de cotizaciones/facturas, Excel de análisis de costos
- **Usuarios**: Sistema de perfiles (admin, manager, user) con autenticación JWT

## 🏗️ Arquitectura

```
maestro-comercial/
├── frontend/          [React 19 + TypeScript + Vite + Zustand]
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── stores/
│       ├── services/
│       └── types/
├── backend/          [Node.js + Express + TypeScript + PostgreSQL]
│   └── src/
│       ├── api/
│       ├── middleware/
│       ├── db/
│       └── server.ts
└── docs/
```

## 🚀 Inicio Rápido

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
cp .env.example .env
npm run dev        # Desarrollo
npm run build      # Compilar TypeScript
npm start          # Producción
```

## 📋 Fases de Implementación

- [x] **FASE 1**: Setup Base - Estructura y bundlers
- [ ] **FASE 2**: Database & Auth - Schema y JWT
- [ ] **FASE 3**: Core Modules - CRUD de módulos
- [ ] **FASE 4**: Dashboard & Costos - KPIs y gráficos
- [ ] **FASE 5**: Sync Service - Sincronización
- [ ] **FASE 6**: Error Handling - Logging centralizado
- [ ] **FASE 7**: Frontend Polish - UI/UX
- [ ] **FASE 8**: Deployment - Vercel + Neon

## 📊 Stack Tecnológico

### Frontend
- React 19.2
- TypeScript 6.0
- Vite 8.0
- Zustand (state management)
- Recharts (gráficos)
- jsPDF + html2canvas (PDF export)
- XLSX (Excel export)

### Backend
- Node.js
- Express 4.18
- PostgreSQL (Neon)
- JWT (autenticación)
- bcrypt (contraseñas)
- Winston (logging)

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

## 🐛 4 Bugs Corregidos

1. **JWT Validation** - Middleware correcto con try-catch
2. **Sync Concurrency** - Transacciones DB con lock optimista
3. **Soft-Delete** - WHERE deleted_at IS NULL en todas las queries
4. **Error Handling** - Middleware centralizado con Winston logger

## 📝 Variables de Entorno

Backend (`.env`):
```
DATABASE_URL=postgresql://user:pass@db.neon.tech/bravocrm
JWT_SECRET=your-secret-key
PORT=3000
NODE_ENV=development
```

## 🤝 Contribución

Proyecto en desarrollo activo bajo arquitectura full-stack.

## 📄 Licencia

Privado - Nelson Bravo Salas
