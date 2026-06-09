# PROMPT DE CORRECCIÓN DEFINITIVO — CMMS HVAC PRO IA STUDIO
## Versión 3.0 — Basado en Auditoría DBA Senior con 35 tablas verificadas en producción Neon
## Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO | Rama: main
## Fuente de verdad: Auditoría forense DBA + server.ts (2837 líneas) + vercel.json verificado

---

## ⚠️ INSTRUCCIONES DE SEGURIDAD — LEER ANTES DE EJECUTAR CUALQUIER ACCIÓN

Eres un agente de corrección quirúrgica. Tu única misión es aplicar las correcciones
listadas en este prompt, en el orden indicado, sobre los archivos autorizados.

### REGLAS ABSOLUTAS

1. Lee cada archivo COMPLETO antes de modificar cualquier línea.
2. Modifica SOLO los archivos de la lista de ARCHIVOS AUTORIZADOS.
3. Realiza UN archivo a la vez. Reporta al terminar: `[ARCHIVO] → [cambio] → [línea N]`.
4. NO refactorices, NO renombres variables, NO cambies lógica que funciona.
5. NO elimines código sin reemplazar con el equivalente corregido.
6. Si encuentras ambigüedad, márcala con `// AUDITORIA: revisar con Nelson` y continúa.
7. NO toques bajo ninguna circunstancia:
   `package.json · tsconfig.json · vite.config.ts · index.html`
   `src/pages/* · src/components/ui/* · *.css · tailwind.config.*`

### ARCHIVOS AUTORIZADOS

```
BACKEND (un solo archivo):
  server.ts                     ← único backend, Express monolítico

FRONTEND (solo sync):
  src/lib/syncEngine.ts         ← corregir URLs y payload
  src/db/database.ts            ← verificar alias de tablas Dexie (no reescribir)

INFRAESTRUCTURA:
  vercel.json                   ← reemplazar completo
  scripts/init-db.ts            ← si existe: alinear al schema canónico
```

---

## ARQUITECTURA REAL VERIFICADA (no asumir ninguna otra)

```
Browser (React + Vite + Zustand)
    │
    │  Dexie IndexedDB (stores locales offline)
    │       │
    │  syncEngine.ts
    │       │ fetch HTTP
    ▼       ▼
server.ts  ←── EXPRESS MONOLÍTICO (todo el backend aquí)
    │            Puerto 3000 local
    │            Vercel: rewrite "/(.*)" → /api/server
    │
    ├── GET  /api/health
    ├── POST /api/auth (login PIN)
    ├── POST /api/ocr  (Gemini OCR placas HVAC)
    ├── GET  /api/:table          ← pull: lee Neon → cliente
    ├── GET  /api/sync/:table     ← alias del anterior
    └── POST /api/sync            ← push: cliente → Neon
              │
              ▼
         Neon PostgreSQL  ─ fallback ─→  mock_db_store.json
```

**IMPORTANTE**: No existen archivos `/api/assets.ts`, `/api/work-orders.ts` ni similares.
Todo el backend vive en `server.ts`. El vercel.json actual tiene rewrites hacia rutas
inexistentes (`/api/work-orders/[id]/complete` etc.) — eso se corrige en la Sección VII.

---

## ESTADO REAL DE LA BASE DE DATOS (35 tablas auditadas en producción Neon)

La auditoría DBA ejecutó `SELECT * FROM information_schema.tables` en producción
y obtuvo el siguiente inventario real. Esta es la fuente de verdad.

### GRUPO A — TABLAS CANÓNICAS (conservar, son la fuente de verdad)
```
clientes      → maestra de tenants/clientes. TODAS las demás tablas operacionales
                 deben tener cliente_id FK → clientes(id)
sucursales    → sedes por cliente. FK: sucursales.cliente_id → clientes(id)
assets        → equipos HVAC. FK: assets.cliente_id → clientes(id)
                                   assets.sucursal_id → sucursales(id)
users         → técnicos y usuarios. FK: users.cliente_id → clientes(id)
```

### GRUPO B — TABLAS OPERACIONALES ACTIVAS (conservar, tienen rutas y referencias en código)
```
work_orders             → src/pages/WorkOrders.tsx, server.ts
reports                 → src/pages/InformesHVAC.tsx, server.ts
preventive_maintenance  → src/pages/Mantenimientos.tsx, server.ts
inventory               → src/pages/InventarioInterno.tsx, server.ts
calendar                → src/pages/Planificacion.tsx, server.ts
events                  → src/pages/Consola.tsx, server.ts (log de sync)
catalog_asset_types     → src/pages/Configuracion.tsx, server.ts
settings                → src/pages/Configuracion.tsx, server.ts
audit_logs              → server.ts (trazabilidad interna)
branches                → src/pages/Administracion.tsx, server.ts (alias de sucursales)
ordenes_servicio        → src/pages/OrdenesServicio.tsx, server.ts
cmms_auth_failures      → server.ts (bloqueador de fuerza bruta en login) ← CONSERVAR
```

### GRUPO C — TABLAS LEGACY (acción específica requerida)
```
clients         → representación dual de clientes para compatibilidad offline Dexie.
                  ACCIÓN: migrar datos a 'clientes' y dejar en modo lectura.
                  NO eliminar hasta confirmar migración exitosa.

cmms_idempotency_keys → endpoint /api/cmms/:resource (inactivo).
                  ACCIÓN: eliminar en la misma ventana que las cmms_* (ver Grupo D).
```

### GRUPO D — TABLAS HUÉRFANAS (eliminar con CASCADE — 0% impacto confirmado por DBA)
```
-- Artefactos Neon:
playing_with_neon         → tabla sandbox de Neon, sin uso alguno

-- Mockups obsoletos:
providers                 → remanente de modelo cancelado, sin referencias
cmms_one_shot_migrations  → registro huérfano sin uso en servidor ni controladores

-- Familia cmms_* (14 tablas — arquitectura relacional normalizada abandonada):
-- Orden correcto de DROP respetando FK internas del bloque legacy:
cmms_usuarios_clientes    → FK → cmms_clientes + cmms_users
cmms_checklist_plantillas → FK → cmms_clientes
cmms_informes_mantenimiento → FK → cmms_clientes + cmms_equipos + cmms_users
cmms_sla_config           → FK → cmms_clientes
cmms_pm_planes            → FK → cmms_clientes
cmms_pm_plantillas        → FK → cmms_clientes
cmms_push_subscriptions   → FK → cmms_users
cmms_ot_comentarios       → FK → cmms_tickets + cmms_clientes + cmms_users
cmms_ot_eventos           → FK → cmms_tickets + cmms_clientes + cmms_users
cmms_mantenimientos       → FK → cmms_clientes + cmms_equipos + cmms_tickets
cmms_tickets              → FK → cmms_clientes + cmms_users + cmms_equipos
cmms_equipos              → FK → cmms_clientes
cmms_users                → (tabla hoja del bloque legacy)
cmms_clientes             → (raíz del bloque legacy)

NOTA: CASCADE en el DROP resuelve automáticamente todas las FK internas del bloque.
```

### FK ACTIVAS DEL BLOQUE OPERACIONAL (estas deben quedar intactas)
```
sucursales.cliente_id          → clientes(id)
assets.cliente_id              → clientes(id)
assets.sucursal_id             → sucursales(id)
reports.cliente_id             → clientes(id)
users.cliente_id               → clientes(id)
events.cliente_id              → clientes(id)
settings.cliente_id            → clientes(id)
catalog_asset_types.cliente_id → clientes(id)
calendar.cliente_id            → clients(id)      ← FK a 'clients' (legacy), ver C-2
inventory.cliente_id           → clients(id)      ← FK a 'clients' (legacy), ver C-2
preventive_maintenance.cliente_id → clients(id)   ← FK a 'clients' (legacy), ver C-2
ordenes_servicio.cliente_id    → clients(id)      ← FK a 'clients' (legacy), ver C-2
audit_logs.cliente_id          → clients(id)      ← FK a 'clients' (legacy), ver C-2
```

---

## CORRECCIÓN C-0 — PREREQUISITO MANUAL (hacer ANTES de cualquier código)

**Sin esto, todo lo demás falla. No es código, es configuración de infraestructura.**

```
□ MANUAL-1: Neon Console → proyecto CMMS HVAC PRO
            → Settings → Connection Security → IP Allow
            → Deshabilitar restricción de IP (o agregar 0.0.0.0/0 para desarrollo)
            MOTIVO: Vercel serverless usa IPs rotativas que Neon bloquea.
                    Sin esto el sync nunca llega a la DB.

□ MANUAL-2: Vercel Dashboard → proyecto → Settings → Environment Variables
            Verificar que existen con valores válidos:
            DATABASE_URL     → cadena de conexión Neon (pooled, con ?sslmode=require)
            GEMINI_API_KEY   → clave válida de Google AI Studio
            JWT_SECRET       → string aleatorio para firmar tokens

□ MANUAL-3: Backup de producción antes de ejecutar drops
            En Neon Console → Branching → crear branch "backup-pre-cleanup"
            Esto permite rollback instantáneo si algo falla.
```

---

## CORRECCIÓN C-1 — Ejecutar script SQL de purga de tablas huérfanas en Neon

### Cuándo ejecutar
Solo después de MANUAL-3 (backup creado). Ejecutar en Neon Console → SQL Editor.

### Script SQL — copiar y ejecutar íntegro

```sql
-- ═══════════════════════════════════════════════════════════════════
-- CMMS-HVAC-PRO — SCRIPT DE DEPRECACIÓN CONTROLADA DE TABLAS HUÉRFANAS
-- Auditoría DBA Senior — Junio 2026
-- EJECUTAR: Neon Console → SQL Editor (no en código de aplicación)
-- PREREQUISITO: Backup/branch creado en MANUAL-3
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── Bloque 1: Artefactos Neon y mockups ─────────────────────────────
DROP TABLE IF EXISTS "playing_with_neon"        CASCADE;
DROP TABLE IF EXISTS "providers"                CASCADE;
DROP TABLE IF EXISTS "cmms_one_shot_migrations" CASCADE;
DROP TABLE IF EXISTS "cmms_idempotency_keys"    CASCADE;

-- ── Bloque 2: Familia cmms_* en orden de dependencias ───────────────
-- El CASCADE elimina automáticamente todos los constraints FK internos.
DROP TABLE IF EXISTS "cmms_usuarios_clientes"       CASCADE;
DROP TABLE IF EXISTS "cmms_checklist_plantillas"    CASCADE;
DROP TABLE IF EXISTS "cmms_informes_mantenimiento"  CASCADE;
DROP TABLE IF EXISTS "cmms_sla_config"              CASCADE;
DROP TABLE IF EXISTS "cmms_pm_planes"               CASCADE;
DROP TABLE IF EXISTS "cmms_pm_plantillas"           CASCADE;
DROP TABLE IF EXISTS "cmms_push_subscriptions"      CASCADE;
DROP TABLE IF EXISTS "cmms_ot_comentarios"          CASCADE;
DROP TABLE IF EXISTS "cmms_ot_eventos"              CASCADE;
DROP TABLE IF EXISTS "cmms_mantenimientos"           CASCADE;
DROP TABLE IF EXISTS "cmms_tickets"                 CASCADE;
DROP TABLE IF EXISTS "cmms_equipos"                 CASCADE;
DROP TABLE IF EXISTS "cmms_users"                   CASCADE;
DROP TABLE IF EXISTS "cmms_clientes"                CASCADE;

-- ── Bloque 3: Verificación post-purga ───────────────────────────────
-- Este SELECT debe devolver 0 filas. Si devuelve algo, el DROP falló.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'playing_with_neon','providers','cmms_one_shot_migrations',
    'cmms_idempotency_keys','cmms_usuarios_clientes','cmms_checklist_plantillas',
    'cmms_informes_mantenimiento','cmms_sla_config','cmms_pm_planes',
    'cmms_pm_plantillas','cmms_push_subscriptions','cmms_ot_comentarios',
    'cmms_ot_eventos','cmms_mantenimientos','cmms_tickets','cmms_equipos',
    'cmms_users','cmms_clientes'
  );
-- Si el resultado es 0 filas → COMMIT. Si hay filas → ROLLBACK y revisar.

COMMIT;

-- ── Post-verificación: tablas que deben quedar activas ───────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Resultado esperado (18 tablas):
-- assets, audit_logs, branches, calendar, catalog_asset_types, clientes,
-- clients, cmms_auth_failures, events, inventory, ordenes_servicio,
-- preventive_maintenance, reports, settings, sucursales, users,
-- work_orders + cualquier otra tabla del sistema que no sea cmms_*
```

### CONSERVAR EXPLÍCITAMENTE (NO incluir en el DROP):
```
cmms_auth_failures   → activo en server.ts como bloqueador de fuerza bruta en /api/auth
clients              → compatibilidad offline Dexie (ver C-2 para migración controlada)
```

---

## CORRECCIÓN C-2 — server.ts: Migrar FK de 'clients' a 'clientes' y unificar sync

### Problema verificado
La auditoría DBA identificó que 5 tablas operacionales tienen FK apuntando a `clients`
(tabla legacy JSON-blob) en lugar de `clientes` (tabla canónica):

```
calendar.cliente_id            → clients(id)   ← INCORRECTO
inventory.cliente_id           → clients(id)   ← INCORRECTO
preventive_maintenance.cliente_id → clients(id) ← INCORRECTO
ordenes_servicio.cliente_id    → clients(id)   ← INCORRECTO
audit_logs.cliente_id          → clients(id)   ← INCORRECTO
```

### Qué hacer en server.ts
Encuentra la función `ensureTables()`. Dentro de ella, agrega el siguiente bloque
de migración de FK **después** del bloque de creación de tablas existente y **antes**
del cierre de la función. NO toques el resto de `ensureTables()`.

```typescript
// ── MIGRACIÓN DE FK: clients → clientes (agregar al final de ensureTables) ──
// Este bloque se ejecuta una vez por arranque y es idempotente.
try {
  console.log("🔄 Migrando datos de 'clients' a 'clientes'...");

  // 1. Copiar registros de clients que no existan en clientes
  await sql`
    INSERT INTO clientes (id, uuid_sync, data, updated_at, created_at, deleted_at)
    SELECT
      COALESCE(id::text, uuid_sync),
      uuid_sync,
      data,
      updated_at,
      created_at,
      deleted_at
    FROM clients
    WHERE COALESCE(id::text, uuid_sync) IS NOT NULL
    ON CONFLICT (id) DO NOTHING
  `;

  // 2. Actualizar cliente_id huérfano en tablas operacionales
  //    (registros que apuntan a clients.id que ya está en clientes.id)
  for (const tbl of ['calendar', 'inventory', 'preventive_maintenance', 'ordenes_servicio', 'audit_logs']) {
    try {
      await sql.unsafe(`
        UPDATE ${tbl} t
        SET cliente_id = c.id
        FROM clients c
        JOIN clientes cl ON cl.id = c.id::text OR cl.uuid_sync = c.uuid_sync
        WHERE t.cliente_id = c.id::text
          AND t.cliente_id NOT IN (SELECT id FROM clientes)
      `);
    } catch (e: any) {
      console.warn(`FK migration skip for ${tbl}: ${e.message}`);
    }
  }

  // 3. Reasignar a 'cliente-default-001' los registros que quedan huérfanos
  for (const tbl of ['calendar', 'inventory', 'preventive_maintenance', 'ordenes_servicio', 'audit_logs', 'assets', 'work_orders', 'reports', 'users', 'events', 'settings', 'catalog_asset_types']) {
    try {
      await sql.unsafe(`
        UPDATE ${tbl}
        SET cliente_id = 'cliente-default-001'
        WHERE cliente_id IS NULL
           OR cliente_id = ''
           OR cliente_id NOT IN (SELECT id FROM clientes)
      `);
    } catch (e: any) {
      console.warn(`Default clienteId skip for ${tbl}: ${e.message}`);
    }
  }

  console.log("✅ Migración FK clients → clientes completada.");
} catch (e: any) {
  console.warn("⚠️ Migración FK parcial (puede ser primera ejecución):", e.message);
}
```

---

## CORRECCIÓN C-3 — server.ts: Reemplazar ALLOWED_TABLES y TABLE_ALIAS_MAP

### Qué hacer
Encuentra las constantes `ALLOWED_TABLES` y `TABLE_ALIAS_MAP` en server.ts.
Reemplaza AMBAS íntegramente. NO toques nada más.

```typescript
// ─── TABLAS CON RUTA ACTIVA — ÚNICO SET AUTORIZADO PARA SYNC ──────────────
// Fuente: Auditoría DBA Senior Junio 2026 — 35 tablas verificadas en producción.
// Todas tienen cliente_id y participan en rutas GET /api/:table y POST /api/sync.
const ALLOWED_TABLES = [
  // Canónicas (fuente de verdad de tenant)
  'clientes',
  'sucursales',
  // Operacionales activas confirmadas por auditoría
  'assets',
  'work_orders',
  'reports',
  'preventive_maintenance',
  'inventory',
  'calendar',
  'events',
  'catalog_asset_types',
  'settings',
  'audit_logs',
  'branches',
  'ordenes_servicio',
  'users',
  // Legacy sync (compatibilidad Dexie offline — mantener hasta migración completa)
  'clients',
] as const;

// ─── ALIASES DE NOMBRES ─────────────────────────────────────────────────────
// Dexie usa nombres en español. El servidor resuelve al nombre canónico de Neon.
// El cliente puede enviar cualquier alias en el campo 'table' del payload sync.
const TABLE_ALIAS_MAP: Record<string, string> = {
  // Español → canónico
  'activos':                'assets',
  'equipos':                'assets',
  'ordenes_trabajo':        'work_orders',
  'ordenes':                'work_orders',
  'tickets':                'work_orders',
  'informes':               'reports',
  'informes_tecnicos':      'reports',
  'mantenimiento':          'preventive_maintenance',
  'mantenimientos':         'preventive_maintenance',
  'planes_pm':              'preventive_maintenance',
  'inventario':             'inventory',
  'repuestos':              'inventory',
  'usuarios':               'users',
  'tecnicos':               'users',
  'clientes_lista':         'clientes',
  'cliente':                'clientes',
  'calendario':             'calendar',
  'eventos_calendario':     'calendar',
  'eventos_sync':           'events',
  'sucursal':               'sucursales',
  'sedes':                  'sucursales',
  'ramas':                  'branches',
  'configuracion':          'settings',
  'catalogo':               'catalog_asset_types',
  'ordenes_servicio':       'ordenes_servicio',   // ya es el nombre canónico
};
```

---

## CORRECCIÓN C-4 — server.ts: Agregar filtro cliente_id en el switch GET

### Qué hacer
Encuentra el handler `app.get(["/api/:table", "/api/sync/:table"], ...)`.
Dentro del switch de ese handler, verifica que CADA case filtra por `cliente_id`.
Si algún case devuelve `SELECT *` sin filtro de tenant, agrégalo.

El patrón correcto para cada case es:

```typescript
// Extraer clienteId del request — agregar al inicio del handler GET (antes del switch):
const clienteId = String(
  req.query.clienteId
  || req.query.cliente_id
  || req.headers['x-client-id']
  || req.headers['x-cliente-id']
  || 'cliente-default-001'
);
const since = req.query.since ? Number(req.query.since) : 0;

// ── Patrón canónico de case (aplicar a todos los cases que no lo tengan) ──
// Reemplazar solo el SELECT interno de cada case que falte el filtro WHERE cliente_id:
case 'assets':
  rows = await sql`
    SELECT * FROM assets
    WHERE cliente_id = ${clienteId}
      AND (updated_at > ${since} OR updated_at IS NULL)
      AND deleted_at IS NULL
    ORDER BY updated_at ASC NULLS FIRST
    LIMIT 2000
  `;
  break;

// Aplicar el MISMO patrón para:
// work_orders, reports, preventive_maintenance, inventory, calendar,
// events, catalog_asset_types, settings, audit_logs, ordenes_servicio

// Para 'users' — nunca devolver el campo pin:
case 'users':
  const rawUsers = await sql`
    SELECT uuid_sync, id, nombre, correo, perfil, activo, cliente_id, data, updated_at, created_at
    FROM users
    WHERE (cliente_id = ${clienteId} OR cliente_id = 'cliente-default-001')
      AND (updated_at > ${since} OR updated_at IS NULL)
      AND deleted_at IS NULL
    ORDER BY updated_at ASC NULLS FIRST
    LIMIT 500
  `;
  rows = rawUsers.map(({ pin, ...rest }: any) => rest);
  break;

// Para 'clientes' — solo devuelve el tenant propio:
case 'clientes':
  rows = await sql`
    SELECT * FROM clientes
    WHERE id = ${clienteId}
       OR uuid_sync = ${clienteId}
  `;
  break;

// Para 'sucursales' — filtrar por cliente:
case 'sucursales':
case 'branches':
  rows = await sql`
    SELECT * FROM sucursales
    WHERE cliente_id = ${clienteId}
      AND (updated_at > ${since} OR updated_at IS NULL)
    ORDER BY updated_at ASC NULLS FIRST
    LIMIT 500
  `;
  break;

// Para 'clients' (legacy sync) — devolver solo los del tenant:
case 'clients':
  rows = await sql`
    SELECT * FROM clients
    WHERE (id::text = ${clienteId} OR uuid_sync = ${clienteId}
           OR data->>'cliente_id' = ${clienteId})
    LIMIT 100
  `;
  break;
```

---

## CORRECCIÓN C-5 — server.ts: Inyectar cliente_id en POST /api/sync

### Qué hacer
Encuentra el handler `app.post("/api/sync", ...)`.
Agrega SOLO este bloque después de que se extrae y resuelve el nombre de tabla,
antes del UPSERT. No reescribas el handler.

```typescript
// ── Garantizar cliente_id en todo registro que entra por sync ────────────
// Sin esto, registros quedan huérfanos y rompen las FK hacia clientes.
const clienteIdSync = String(
  req.body.clienteId
  || req.body.cliente_id
  || req.headers['x-client-id']
  || req.headers['x-cliente-id']
  || 'cliente-default-001'
);

// Inyectar en nivel raíz
if (!req.body.cliente_id) req.body.cliente_id = clienteIdSync;

// Inyectar también dentro del objeto 'data' si existe
if (req.body.data && typeof req.body.data === 'object') {
  if (!req.body.data.cliente_id) req.body.data.cliente_id = clienteIdSync;
}
```

---

## CORRECCIÓN C-6 — server.ts: Corregir modelo Gemini en /api/ocr

### Qué hacer
Busca en server.ts la línea exacta con el nombre del modelo Gemini.
Reemplaza SOLO esa línea:

```typescript
// ANTES — modelo inexistente (causa error 404 en cada OCR):
model: 'gemini-3.5-flash',

// DESPUÉS — modelo correcto disponible en la API de Google:
model: 'gemini-2.0-flash',
```

---

## CORRECCIÓN C-7 — server.ts: Corregir validateWorkOrderPayload

### Qué hacer
Encuentra la función `validateWorkOrderPayload` en server.ts.
Reemplaza SOLO la línea de detección de `signature`:

```typescript
// ANTES — no detecta firmas guardadas por Dexie en data.firmas.tecnico:
const signature = target.firma
  || target.firma_conformidad_base64
  || (target.payload && target.payload.firma_conformidad_base64);

// DESPUÉS — detecta todas las rutas posibles donde Dexie guarda la firma:
const signature =
  target.firma
  || target.firma_conformidad_base64
  || (target.firmas?.tecnico)
  || (target.firmas?.cliente)
  || (target.signatures?.technician)
  || (target.payload?.firma_conformidad_base64)
  || (target.data?.firma_conformidad_base64)
  || (target.data?.firmas?.tecnico)
  || (target.data?.firmas?.cliente);
```

---

## CORRECCIÓN C-8 — vercel.json: Reemplazar archivo completo

### Contexto
El `vercel.json` actual tiene 4 rewrites apuntando a rutas serverless inexistentes
(`/api/work-orders/[id]/complete`, `/api/maintenance/[id]/execute`, etc.).
Esos archivos no existen — Vercel los busca y devuelve 500.
Solo el catch-all `/(.*) → /api/server` es correcto.

### Reemplazar el archivo completo por:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/server"
    }
  ]
}
```

---

## CORRECCIÓN C-9 — syncEngine.ts: Corregir URLs y payload

### Qué hacer
Abre `src/lib/syncEngine.ts`. Corrige SOLO los siguientes puntos sin reescribir la lógica.

#### 9.1 — URLs de endpoints

```typescript
// INCORRECTO                    CORRECTO
'/api/sync/push'         →      '/api/sync'
'/api/sync/pull'         →      '/api/sync/' + tableName
'/api/sync/status'       →      '/api/health'
'/api/sync/pull/'+table  →      '/api/sync/' + table   (ya correcto si existe así)
```

#### 9.2 — Payload para POST /api/sync

```typescript
// ESTRUCTURA CORRECTA que acepta server.ts:
{
  table: 'assets',                    // nombre canónico o alias de TABLE_ALIAS_MAP
  operation: 'upsert',                // 'upsert' | 'delete'
  clienteId: 'cliente-xxx-id',        // OBLIGATORIO — identifica el tenant
  data: {
    uuid_sync: 'uuid-v4-aquí',        // OBLIGATORIO — PK universal
    cliente_id: 'cliente-xxx-id',     // también dentro del objeto data
    updated_at: Date.now(),           // timestamp epoch milisegundos
    // ... resto de campos del registro
  }
}
```

#### 9.3 — Mapa de nombres Dexie → Neon

```typescript
// Si existe un mapa de tabla en syncEngine.ts, verificar que incluya:
const DEXIE_TO_NEON: Record<string, string> = {
  'activos':                'assets',
  'equipos':                'assets',
  'ordenes_trabajo':        'work_orders',
  'tickets':                'work_orders',
  'informes':               'reports',
  'mantenimientos':         'preventive_maintenance',
  'inventario':             'inventory',
  'calendario':             'calendar',
  'eventos':                'events',
  'usuarios':               'users',
  'tecnicos':               'users',
  'sucursales':             'sucursales',
  'sedes':                  'sucursales',
  'clientes':               'clientes',
  'configuracion':          'settings',
  'catalogo':               'catalog_asset_types',
  'ordenes_servicio':       'ordenes_servicio',
  // Legacy sync:
  'clients':                'clients',
};
// Si ya existe un mapa similar: NO reemplazar, solo agregar entradas faltantes.
```

---

## ORDEN DE EJECUCIÓN (respetar el orden previene rollbacks)

```
FASE 0 — MANUAL (bloquea todo lo demás si no está hecho):
  □ MANUAL-1: Neon IP Allowlist → deshabilitar restricción
  □ MANUAL-2: Vercel ENV vars → DATABASE_URL, GEMINI_API_KEY, JWT_SECRET
  □ MANUAL-3: Neon Branching → crear branch "backup-pre-cleanup"

FASE 1 — SQL directo en Neon Console (sin tocar código):
  □ C-1: ejecutar script SQL DROP de 17 tablas huérfanas
         → verificar que SELECT post-purga devuelve 0 filas

FASE 2 — server.ts, cambios atómicos de bajo riesgo:
  □ C-6: corregir modelo Gemini (1 línea)
  □ C-7: ampliar detección de firma en validateWorkOrderPayload

FASE 3 — server.ts, migración de datos y rutas:
  □ C-2: agregar bloque de migración FK clients → clientes al final de ensureTables()
  □ C-3: reemplazar ALLOWED_TABLES y TABLE_ALIAS_MAP
  □ C-4: agregar filtro cliente_id en switch GET
  □ C-5: inyectar cliente_id en POST /api/sync

FASE 4 — Infraestructura y cliente:
  □ C-8: reemplazar vercel.json
  □ C-9: corregir syncEngine.ts URLs + payload + mapa de tablas

FASE 5 — VERIFICACIÓN POST-CORRECCIÓN:
  □ GET  /api/health                                    → { status: "ok" }
  □ GET  /api/clientes?clienteId=cliente-default-001    → array con 1 registro
  □ GET  /api/assets?clienteId=cliente-default-001      → array (vacío o con datos)
  □ GET  /api/cmms_equipos?clienteId=test               → 400 "Invalid table"
  □ GET  /api/playing_with_neon                         → 400 "Invalid table"
  □ POST /api/sync { table: 'assets', clienteId: '...' } → { success: true }
  □ POST /api/sync { table: 'cmms_tickets', ... }       → 400 "Invalid table"
  □ POST /api/ocr con imagen de placa HVAC              → JSON sin error 404 Gemini
  □ Crear informe con firma en data.firmas.tecnico       → no bloqueado
  □ Login con PIN incorrecto 5 veces                    → bloqueado (cmms_auth_failures activo)
```

---

## REPORTE OBLIGATORIO AL FINALIZAR

```
REPORTE FINAL — CMMS HVAC PRO IA STUDIO v3.0
═══════════════════════════════════════════════════════════════════
C-0  Prerequisitos manuales         → [ COMPLETOS / PENDIENTES ]
C-1  Script SQL DROP 17 tablas      → [ EJECUTADO / PENDIENTE ]
     Tablas eliminadas:             → [ lista desde log Neon ]
     Tablas huérfanas restantes:    → [ debe ser 0 ]
C-2  Migración FK clients→clientes  → líneas [N-M] server.ts
C-3  ALLOWED_TABLES + ALIAS_MAP     → líneas [N-M] server.ts
C-4  Filtro cliente_id GET switch   → líneas [N-M] server.ts
C-5  Inyección cliente_id POST sync → líneas [N-M] server.ts
C-6  Gemini model corregido         → línea [N] server.ts
C-7  validateWorkOrderPayload firma → línea [N] server.ts
C-8  vercel.json reemplazado        → archivo completo
C-9  syncEngine.ts corregido        → líneas [N-M]

TABLAS ACTIVAS POST-PURGA (deben ser exactamente estas 18):
  ✅ clientes  ✅ sucursales  ✅ assets      ✅ users
  ✅ work_orders  ✅ reports  ✅ preventive_maintenance
  ✅ inventory  ✅ calendar   ✅ events
  ✅ catalog_asset_types  ✅ settings  ✅ audit_logs
  ✅ branches  ✅ ordenes_servicio  ✅ clients
  ✅ cmms_auth_failures
  + cualquier tabla de sistema Neon (pg_*)

ARCHIVOS NO MODIFICADOS:
  ✅ package.json · tsconfig.json · vite.config.ts · index.html
  ✅ src/pages/* · src/components/ui/* · *.css

PENDIENTES MANUALES SIN RESOLVER:
  [ lista o "ninguno" ]
```

---

*Prompt v3.0 — generado sobre auditoría DBA Senior con 35 tablas verificadas en producción Neon*
*server.ts: 2837 líneas | vercel.json: 24 líneas | package.json: 64 líneas | tablas auditadas: 35*
*Decisión de arquitectura Nelson: sync unificado hacia clientes canónica | 17 tablas huérfanas eliminadas*
*Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO — rama main — Junio 2026*
