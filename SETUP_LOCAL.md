# BravoCRM - Setup Local Development

**Última actualización:** 2026-06-09

---

## 📋 Requisitos Previos

Antes de iniciar, asegúrate de tener instalado:

- **Docker Desktop** - [Descargar](https://www.docker.com/products/docker-desktop)
- **Node.js 18+** - [Descargar](https://nodejs.org)
- **Git** - [Descargar](https://git-scm.com)

Verifica instalación:
```bash
docker --version      # Docker version...
node --version        # v18.x.x o superior
npm --version         # 9.x.x o superior
```

---

## 🚀 Inicio Rápido (Opción 1: Automático)

### Windows - Ejecutable .bat

1. **Abre Explorador de Archivos**
2. Navega a: `C:\Users\The Pirata\Documents\Google Drive\APPS\MAESTRO COMERCIAL`
3. **Doble-click** en `start-bravocrm.bat`
4. Se abrirán ventanas automáticamente:
   - Backend en http://localhost:3000
   - Frontend en http://localhost:5173
5. Espera 30-60 segundos a que todo cargue

### macOS/Linux - Script PowerShell

```bash
cd "C:\Users\The Pirata\Documents\Google Drive\APPS\MAESTRO COMERCIAL"
./start-bravocrm.ps1
```

---

## 🛠️ Setup Manual (Opción 2)

Si prefieres iniciar paso a paso:

### Paso 1: Iniciar PostgreSQL con Docker

```bash
cd "C:\Users\The Pirata\Documents\Google Drive\APPS\MAESTRO COMERCIAL"
docker-compose up -d
```

Verifica que PostgreSQL esté corriendo:
```bash
docker-compose ps
```

Deberías ver: `bravocrm_db ... Up (healthy)`

### Paso 2: Iniciar Backend

```bash
cd backend
npm install  # Si es primera vez
npm run build
npm run seed  # Crea usuarios iniciales
npm run dev
```

Esperado:
```
🚀 Server is running at http://localhost:3000
Connected to PostgreSQL database
```

### Paso 3: Iniciar Frontend (nueva terminal)

```bash
cd frontend
npm install  # Si es primera vez
npm run dev
```

Esperado:
```
VITE v8.0.16 ready in 2068 ms
➜ Local: http://localhost:5173
```

---

## 🌐 Acceder a la Aplicación

Una vez que todo está corriendo:

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| **Frontend** | http://localhost:5173 | Ver abajo ↓ |
| **Backend API** | http://localhost:3000 | JWT Bearer Token |
| **PgAdmin** | http://localhost:5050 | admin / admin |
| **Base de Datos** | localhost:5432 | bravocrm_user / bravocrm_password |

### 👤 Usuarios de Prueba

```
Admin:
  Email: nbravo.nbyb@gmail.com
  Password: 3571

Manager:
  Email: hmeza.nbyb@gmail.com
  Password: 4321
```

---

## 📊 Acceder a PgAdmin (Administración BD)

1. Abre http://localhost:5050
2. Login: `admin@bravocrm.local` / `admin`
3. Agregar servidor:
   - Hostname: `postgres` (o `localhost`)
   - Port: `5432`
   - Username: `bravocrm_user`
   - Password: `bravocrm_password`
   - Database: `bravocrm`

---

## 🧪 Testing

Sigue la guía: **QA_TESTING_GUIDE.md**

```
Flujo típico:
1. Login en Frontend
2. Crear Cliente
3. Crear Cotización con Items
4. Convertir a Proyecto
5. Crear Factura
6. Verificar KPIs en Dashboard
```

---

## 🛑 Detener Servicios

### Opción 1: Ejecutable .bat
Doble-click en `stop-bravocrm.bat`

### Opción 2: Terminal
```bash
cd "C:\Users\The Pirata\Documents\Google Drive\APPS\MAESTRO COMERCIAL"
docker-compose down
```

---

## 📝 Logs y Debugging

### Ver logs del Backend
```bash
cd backend
npm run dev  # Logs en tiempo real
```

### Ver logs de Docker
```bash
docker-compose logs -f postgres
docker-compose logs -f pgadmin
```

### Ver logs en archivos
```bash
backend/logs/error.log      # Errores
backend/logs/combined.log   # Todo
```

### Acceder a terminal PostgreSQL
```bash
docker exec -it bravocrm_db psql -U bravocrm_user -d bravocrm
```

---

## 🔧 Troubleshooting

### "Docker no está instalado"
**Solución:** Instala Docker Desktop desde https://www.docker.com/products/docker-desktop

### "Port 5432 already in use"
**Solución:** 
```bash
docker-compose down
docker ps -a
docker rm bravocrm_db  # Si existe
docker-compose up -d   # Reinicia
```

### "Connection refused to localhost:5432"
**Espera 10-15 segundos** a que PostgreSQL esté listo después de `docker-compose up -d`

### "Cannot find module tsx"
**Solución:**
```bash
cd backend
npm install tsx --save-dev
npm run dev
```

### "ECONNREFUSED localhost:3000"
**Significa:** Backend no está corriendo. Inicia con `npm run dev` en carpeta `backend`

### Base de datos vacía
**Solución:** Ejecuta seed script
```bash
cd backend
npm run seed
```

---

## 📈 Arquitectura Local

```
┌─────────────────────────────────────────┐
│          NAVEGADOR (localhost)           │
├────────────────┬──────────────────────────┤
│  Frontend      │  Backend                 │
│  Vite React    │  Express Node.js         │
│  :5173         │  :3000                   │
├────────────────┴──────────────────────────┤
│  Docker Compose                           │
│  ├─ PostgreSQL (bravocrm_db)  :5432      │
│  ├─ PgAdmin (pgadmin)         :5050      │
│  └─ Network: bravocrm_network            │
└─────────────────────────────────────────┘
```

---

## 🚀 Próximos Pasos

Después de verificar que todo funciona:

1. **Pruebas QA** - Ejecuta QA_TESTING_GUIDE.md
2. **Fases 5-8** - Sincronización y deployment
3. **Deploy a Vercel** - Frontend + API
4. **Deploy a Neon** - Base de datos PostgreSQL en cloud

---

## 📞 Soporte

Si tienes problemas:

1. **Verifica los logs** - Ver sección "Logs y Debugging"
2. **Usa PgAdmin** - Accede a http://localhost:5050 para ver estado BD
3. **Reinicia todo** - `docker-compose down && docker-compose up -d`
4. **Limpia caché** - Borra carpeta `node_modules` y ejecuta `npm install` nuevamente

---

**¡Listo para hacer QA! 🎉**
