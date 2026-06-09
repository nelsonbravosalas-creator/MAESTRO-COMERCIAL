# BravoCRM - Modo Development Rápido

## ✨ Novedades

Se ha creado **server-dev.ts** que permite ejecutar el backend **sin PostgreSQL**:
- Usa archivo `db.json` como base de datos temporal
- Perfecto para desarrollo rápido y testing
- Todo funciona desde el navegador

---

## 🚀 INICIAR EN MODO DEV RÁPIDO

### Opción 1: Automático (Recomendado)

#### Terminal 1 - Backend (Puerto 3000)
```bash
cd backend
npm run dev:json
```

Esperado:
```
╔════════════════════════════════════════╗
║     BravoCRM Backend - DEV MODE        ║
╠════════════════════════════════════════╣
║ 🚀 Puerto: 3000
║ 📊 Database: JSON (db.json)
║ 🔒 JWT Secret: dev-secret
╚════════════════════════════════════════╝
```

#### Terminal 2 - Frontend (Puerto 5173)
```bash
cd frontend
npm run dev
```

Esperado:
```
VITE v8.0.16 ready in 2068 ms
➜ Local: http://localhost:5173
```

### Opción 2: Ejecutable Combinado

Si quieres iniciar ambos en una sola ventana:
```bash
cd backend && npm run dev:json &
cd frontend && npm run dev
```

---

## 🌐 ACCESO EN NAVEGADOR

Una vez que ambos servidores estén corriendo:

```
Frontend: http://localhost:5173
Backend:  http://localhost:3000
```

---

## 👤 CREDENCIALES DE PRUEBA

```
ADMIN:
  Email: nbravo.nbyb@gmail.com
  Password: 3571

MANAGER:
  Email: hmeza.nbyb@gmail.com
  Password: 4321
```

---

## 📊 ENDPOINTS DISPONIBLES

### Health Check
```
GET http://localhost:3000/api/health

Response:
{
  "status": "ok",
  "database": "json-dev",
  "mode": "DEVELOPMENT (JSON Mode)"
}
```

### Login
```
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "nbravo.nbyb@gmail.com",
  "password": "3571"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { ... },
  "expiresIn": 604800
}
```

### Clientes
```
GET    http://localhost:3000/api/clients
POST   http://localhost:3000/api/clients

{
  "name": "Nueva Empresa",
  "email": "empresa@example.com",
  "phone": "555-0001",
  "address": "Av. Principal 123",
  "ruc": "20123456789"
}
```

### Cotizaciones
```
GET    http://localhost:3000/api/quotations
POST   http://localhost:3000/api/quotations

{
  "client_id": "client-001",
  "items": [
    {
      "description": "Instalación AC",
      "quantity": 2,
      "unit_price": 1500,
      "cost": 800
    }
  ]
}
```

### Proyectos
```
GET    http://localhost:3000/api/projects
POST   http://localhost:3000/api/projects

{
  "client_id": "client-001",
  "quotation_id": "quotation-001",
  "name": "Mi Proyecto",
  "start_date": "2026-06-09T00:00:00Z"
}
```

### Facturas
```
GET    http://localhost:3000/api/invoices
POST   http://localhost:3000/api/invoices

{
  "client_id": "client-001",
  "project_id": "project-001",
  "items": [ ... ],
  "payment_condition": "cash"
}
```

### Dashboard KPIs
```
GET http://localhost:3000/api/dashboard/kpis

Response:
{
  "kpis": {
    "total_invoiced": 0,
    "total_costs": 0,
    "margin": 0,
    "margin_percentage": 0,
    "projects_in_progress": 0,
    "pending_quotations": 0
  }
}
```

---

## 📁 BASE DE DATOS

El archivo `db.json` contiene toda la data:

```
backend/db.json
```

- **Formato:** JSON plano
- **Almacenamiento:** Archivo local
- **Persistencia:** Cambios se guardan automáticamente
- **Para reset:** Elimina el archivo, se regenerará con datos por defecto

---

## 🔄 FLUJO TÍPICO DE DESARROLLO

1. **Inicia Backend (Terminal 1):**
   ```bash
   cd backend && npm run dev:json
   ```

2. **Inicia Frontend (Terminal 2):**
   ```bash
   cd frontend && npm run dev
   ```

3. **Abre navegador:**
   ```
   http://localhost:5173
   ```

4. **Login:**
   - Email: nbravo.nbyb@gmail.com
   - Password: 3571

5. **Prueba funcionalidades:**
   - Crear clientes
   - Crear cotizaciones
   - Crear proyectos
   - Crear facturas
   - Ver dashboard KPIs

6. **Edita código:**
   - Frontend: Cambios se aplican automáticamente (HMR)
   - Backend: Cambios se aplican automáticamente (tsx watch)

7. **Verifica en navegador:**
   - Abre DevTools (F12)
   - Verifica Network tab para ver requests
   - Verifica Console para logs

---

## 🧪 TESTING RÁPIDO CON POSTMAN/INSOMNIA

1. **Obtén el JWT:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"nbravo.nbyb@gmail.com","password":"3571"}'
   ```

2. **Usa el token en requests posteriores:**
   ```bash
   curl -X GET http://localhost:3000/api/clients \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```

---

## 🐛 TROUBLESHOOTING

### "Port 3000 already in use"
```bash
# Busca el proceso
lsof -i :3000

# O simplemente intenta otro puerto
PORT=3001 npm run dev:json
```

### "Cannot find module 'tsx'"
```bash
npm install tsx --save-dev
npm run dev:json
```

### "db.json not found"
- El archivo se crea automáticamente si no existe
- Si tienes problemas, copia `backend/db.json.template` a `backend/db.json`

### "CORS error"
- Verifica que el backend esté en `http://localhost:3000`
- Frontend hace requests a `http://localhost:3000/api/*`
- El CORS debe estar habilitado (está configurado)

---

## 📝 DIFERENCIAS: DEV vs PRODUCCIÓN

| Aspecto | Dev (JSON) | Producción |
|---------|-----------|------------|
| Database | JSON file (db.json) | PostgreSQL (Neon) |
| Authentication | JWT simple | JWT + bcrypt hashing |
| Logs | Console | Winston logger + files |
| CORS | Abierto localhost | Restringido a dominio |
| Validación | Básica | Completa |
| Error Handling | Simple | Detallado con logging |

---

## ✨ PRÓXIMAS MEJORAS

Cuando pasen QA:

1. **Integración con PostgreSQL real**
2. **Validaciones completas**
3. **Logging con Winston**
4. **Sync con Neon (cloud)**
5. **Deploy a Vercel**

---

## 📖 DOCUMENTACIÓN RELACIONADA

- `INICIO_RAPIDO.txt` - Inicio rápido general
- `QA_TESTING_GUIDE.md` - Casos de prueba
- `SETUP_LOCAL.md` - Setup detallado con Docker
- `README.md` - Documentación técnica

---

**¡Lista para desarrollar! 🚀**
