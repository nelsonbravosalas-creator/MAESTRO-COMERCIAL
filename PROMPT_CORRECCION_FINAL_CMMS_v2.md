# PROMPT DE CORRECCIÓN FINAL — CMMS HVAC PRO IA STUDIO
## Versión 2.0 — Post-auditoría senior con código fuente verificado
## Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO | Rama: main
## Archivo central: server.ts (2837 líneas) — ES EL ÚNICO BACKEND

---

## ⚠️ LEE ESTO ANTES DE TOCAR CUALQUIER ARCHIVO

### ARQUITECTURA REAL VERIFICADA (no asumir otra)

```
Browser (React + Dexie IndexedDB)
    │
    │ fetch HTTP
    ▼
server.ts  ← EXPRESS MONOLÍTICO — aquí vive TODO el backend
    │         Puerto 3000 local / Vercel via rewrite "/(.*)" → /api/server
    │
    ├─ /api/health          GET   → ping
    ├─ /api/auth            POST  → login PIN+correo
    ├─ /api/ocr             POST  → Gemini OCR placas HVAC
    ├─ /api/:table          GET   → pull datos por tabla
    ├─ /api/sync/:table     GET   → alias del anterior
    └─ /api/sync            POST  → push cambios desde cliente
         │
         ▼
    Neon PostgreSQL (@neondatabase/serverless)
    ó  /src/db/mock_db_store.json  (fallback offline)
```

**NO existen archivos `/api/assets.ts`, `/api/work-orders.ts` ni similares.**
**TODO se corrige en `server.ts` y en `src/lib/syncEngine.ts`.**

### ARCHIVO ÚNICO AUTORIZADO PARA BACKEND
```
server.ts          ← ÚNICA fuente de verdad del backend
```

### ARCHIVOS AUTORIZADOS PARA FRONTEND
```
src/lib/syncEngine.ts     ← corregir URLs de endpoints
src/db/mockDb.ts          ← verificar aliases de tablas (no reescribir)
vercel.json               ← reemplazar completamente (ver sección V)
```

### ARCHIVOS PROHIBIDOS — NO TOCAR BAJO NINGUNA CIRCUNSTANCIA
```
package.json · tsconfig.json · vite.config.ts · index.html
src/components/ui/*       ← todos los componentes de UI
src/pages/*               ← todas las páginas React (solo syncEngine)
*.css  ·  tailwind.config.*
```

---

## SECCIÓN I — DECISIÓN DE ARQUITECTURA DE DATOS

### Instrucción de Nelson (origen de este prompt):
> "Elimina las tablas de DB que no están vinculadas a ninguna ruta.
>  Unifica las rutas para que los datos en la sincronización queden
>  dirigidos exclusivamente a Clientes. Las otras tablas bórralas."

### Análisis de tablas con y sin ruta activa

Verificado en `server.ts`: el `switch(table)` dentro de `GET /api/:table` sirve
datos para estas tablas. El `POST /api/sync` acepta escritura si `table` está en
`ALLOWED_TABLES`. Todo lo demás no tiene ruta que lo mueva.

```
TABLAS CON RUTA ACTIVA Y VINCULADAS A DATOS DE CLIENTES — CONSERVAR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 assets                  → equipos HVAC del cliente (tiene cliente_id)
 work_orders             → órdenes de trabajo del cliente
 reports                 → informes técnicos del cliente
 preventive_maintenance  → planes PM del cliente
 inventory               → repuestos/inventario del cliente
 users                   → técnicos y usuarios del sistema
 clientes                → tabla maestra de clientes (CANÓNICA ELEGIDA)
 calendar                → eventos y agenda del cliente

TABLAS SIN RUTA ACTIVA — ELIMINAR DE ensureTables() Y DE LA DB:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 clients           → duplicado JSON-blob de clientes, sin ruta GET propia
 branches          → sucursales, sin ruta GET en el switch
 events            → alias de calendar, sin uso activo
 clients           → duplicado de clientes
 catalog_asset_types → catálogo sin ruta activa
 settings          → configuración sin ruta activa
 ordenes_servicio  → duplicado funcional de work_orders
 audit_logs        → solo escritura, sin ruta GET

TABLAS cmms_* — ELIMINAR TODAS (familia normalizada sin ninguna ruta):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 cmms_clientes · cmms_users · cmms_equipos · cmms_tickets
 cmms_mantenimientos · cmms_ot_eventos · cmms_ot_comentarios
 cmms_informes_mantenimiento · cmms_sla_config · cmms_pm_planes
 cmms_pm_plantillas · cmms_checklist_plantillas · cmms_push_subscriptions
 cmms_one_shot_migrations · cmms_idempotency_keys · cmms_auth_failures
 cmms_usuarios_clientes
```

### Tabla canónica de clientes: `clientes` (no `clients`)

La tabla `clientes` es la tabla maestra. Todos los registros de todas las tablas
activas deben tener `cliente_id` que referencia `clientes.id`. La tabla `clients`
(JSON-blob, inglés) se elimina. Sus datos se migran a `clientes` antes de borrarla.

---

## SECCIÓN II — CORRECCIÓN C-1: Reescribir `ensureTables()` en server.ts

### Qué hacer
Reemplazar la función `ensureTables()` completa (desde la línea `async function ensureTables()` 
hasta su cierre `}`) por la versión limpia que aparece a continuación.

**Regla**: NO toques ningún otro bloque de `server.ts`. Solo reemplaza `ensureTables()`.

### Código de reemplazo completo para `ensureTables()`

```typescript
async function ensureTables() {
  try {
    const sql = getSql();
    console.log("📦 Inicializando esquema de base de datos...");

    // ── PASO 1: Migrar datos de tablas antiguas antes de eliminarlas ──────────

    // Migrar clients → clientes (si clients tiene datos)
    try {
      await sql`
        INSERT INTO clientes (id, uuid_sync, data, updated_at, created_at, deleted_at)
        SELECT
          COALESCE(id, uuid_sync),
          uuid_sync,
          data,
          updated_at,
          created_at,
          deleted_at
        FROM clients
        WHERE COALESCE(id, uuid_sync) IS NOT NULL
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (e) { /* clients puede no existir aún */ }

    // ── PASO 2: Crear tablas canónicas activas ────────────────────────────────

    // Tabla maestra de clientes (CANÓNICA)
    await sql`
      CREATE TABLE IF NOT EXISTS clientes (
        id          TEXT PRIMARY KEY,
        uuid_sync   TEXT UNIQUE,
        data        JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  BIGINT,
        created_at  BIGINT,
        deleted_at  BIGINT
      )
    `;

    // Cliente por defecto para desarrollo
    await sql`
      INSERT INTO clientes (id, uuid_sync, data, updated_at, created_at)
      VALUES (
        'cliente-default-001',
        'cliente-default-001',
        '{"nombre":"Cliente Default","empresa":"CMMS HVAC PRO"}'::jsonb,
        0, 0
      )
      ON CONFLICT (id) DO NOTHING
    `;

    // Usuarios del sistema
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        uuid_sync   TEXT PRIMARY KEY,
        id          TEXT UNIQUE,
        nombre      TEXT,
        correo      TEXT UNIQUE,
        perfil      TEXT,
        pin         TEXT,
        activo      BOOLEAN DEFAULT true,
        cliente_id  TEXT REFERENCES clientes(id) ON DELETE RESTRICT,
        data        JSONB,
        updated_at  BIGINT,
        created_at  BIGINT,
        deleted_at  BIGINT
      )
    `;

    // Activos / Equipos HVAC
    await sql`
      CREATE TABLE IF NOT EXISTS assets (
        uuid_sync           TEXT PRIMARY KEY,
        tag                 TEXT UNIQUE,
        nombre              TEXT NOT NULL,
        tipo                TEXT,
        marca               TEXT,
        modelo              TEXT,
        serie               TEXT,
        ubicacion           TEXT,
        area                TEXT,
        capacidad           TEXT,
        voltaje             TEXT,
        corriente           TEXT,
        refrigerante        TEXT,
        fecha_instalacion   TEXT,
        vida_util           INTEGER DEFAULT 10,
        estado              TEXT DEFAULT 'operativo',
        ultimo_mantenimiento TEXT,
        proximo_mantenimiento TEXT,
        horas_operacion     INTEGER DEFAULT 0,
        tecnicos            JSONB,
        notas               TEXT,
        cliente_id          TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
        latitud             DOUBLE PRECISION,
        longitud            DOUBLE PRECISION,
        updated_at          BIGINT,
        created_at          BIGINT,
        deleted_at          BIGINT
      )
    `;

    // Órdenes de trabajo
    await sql`
      CREATE TABLE IF NOT EXISTS work_orders (
        uuid_sync   TEXT PRIMARY KEY,
        id          TEXT,
        cliente_id  TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
        data        JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  BIGINT,
        created_at  BIGINT,
        deleted_at  BIGINT
      )
    `;

    // Informes técnicos
    await sql`
      CREATE TABLE IF NOT EXISTS reports (
        uuid_sync   TEXT PRIMARY KEY,
        id          TEXT,
        cliente_id  TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
        data        JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  BIGINT,
        created_at  BIGINT,
        deleted_at  BIGINT
      )
    `;

    // Mantenimiento preventivo
    await sql`
      CREATE TABLE IF NOT EXISTS preventive_maintenance (
        uuid_sync   TEXT PRIMARY KEY,
        id          TEXT,
        cliente_id  TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
        data        JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  BIGINT,
        created_at  BIGINT,
        deleted_at  BIGINT
      )
    `;

    // Inventario de repuestos
    await sql`
      CREATE TABLE IF NOT EXISTS inventory (
        uuid_sync   TEXT PRIMARY KEY,
        id          TEXT,
        cliente_id  TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
        data        JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  BIGINT,
        created_at  BIGINT,
        deleted_at  BIGINT
      )
    `;

    // Calendario / eventos
    await sql`
      CREATE TABLE IF NOT EXISTS calendar (
        uuid_sync   TEXT PRIMARY KEY,
        id          TEXT,
        cliente_id  TEXT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
        data        JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  BIGINT,
        created_at  BIGINT,
        deleted_at  BIGINT
      )
    `;

    // ── PASO 3: Migraciones de columnas para tablas que ya pueden existir ─────

    const addColIfMissing = async (table: string, col: string, type: string) => {
      try {
        await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      } catch (e) { /* ignorar "already exists" */ }
    };

    // Asegurar cliente_id en todas las tablas operacionales
    for (const table of ['assets', 'work_orders', 'reports', 'preventive_maintenance', 'inventory', 'calendar']) {
      await addColIfMissing(table, 'cliente_id', 'TEXT');
      await addColIfMissing(table, 'deleted_at', 'BIGINT');
    }
    await addColIfMissing('users', 'cliente_id', 'TEXT');
    await addColIfMissing('users', 'deleted_at', 'BIGINT');

    // Rellenar cliente_id vacío con el cliente por defecto
    for (const table of ['assets', 'work_orders', 'reports', 'preventive_maintenance', 'inventory', 'calendar', 'users']) {
      try {
        await sql.unsafe(`
          UPDATE ${table}
          SET cliente_id = 'cliente-default-001'
          WHERE cliente_id IS NULL OR cliente_id = ''
        `);
      } catch (e) { /* ignorar si tabla no existe */ }
    }

    // ── PASO 4: Índices de rendimiento por cliente ────────────────────────────

    const tryIndex = async (q: string) => { try { await sql.unsafe(q); } catch (e) {} };

    await tryIndex(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_uuid ON clientes (uuid_sync)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_assets_cliente ON assets (cliente_id, uuid_sync)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets (tag)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_wo_cliente ON work_orders (cliente_id, uuid_sync)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_reports_cliente ON reports (cliente_id, uuid_sync)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_pm_cliente ON preventive_maintenance (cliente_id, uuid_sync)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_inv_cliente ON inventory (cliente_id, uuid_sync)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_cal_cliente ON calendar (cliente_id, uuid_sync)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_users_correo ON users (correo)`);
    await tryIndex(`CREATE INDEX IF NOT EXISTS idx_users_cliente ON users (cliente_id)`);

    // ── PASO 5: Agregar UNIQUE en uuid_sync donde falte ───────────────────────

    const tryUnique = async (q: string) => { try { await sql.unsafe(q); } catch (e) {} };

    for (const table of ['clientes', 'assets', 'work_orders', 'reports', 'preventive_maintenance', 'inventory', 'calendar', 'users']) {
      await tryUnique(`ALTER TABLE ${table} ADD CONSTRAINT uq_${table}_uuid UNIQUE (uuid_sync)`);
    }

    // ── PASO 6: Eliminar tablas obsoletas sin ruta activa ─────────────────────
    // Se eliminan en orden inverso de dependencias para no violar FK.
    // DROP IF EXISTS es seguro: no falla si la tabla no existe.

    const obsoleteTables = [
      // Familia cmms_* completa (normalizada, sin ninguna ruta activa)
      'cmms_usuarios_clientes',
      'cmms_push_subscriptions',
      'cmms_checklist_plantillas',
      'cmms_pm_plantillas',
      'cmms_pm_planes',
      'cmms_sla_config',
      'cmms_informes_mantenimiento',
      'cmms_ot_comentarios',
      'cmms_ot_eventos',
      'cmms_mantenimientos',
      'cmms_tickets',
      'cmms_equipos',
      'cmms_auth_failures',
      'cmms_idempotency_keys',
      'cmms_one_shot_migrations',
      'cmms_users',
      'cmms_clientes',
      // Familia JSON-blob duplicada o sin ruta
      'ordenes_servicio',
      'catalog_asset_types',
      'settings',
      'events',      // alias de calendar, sin uso
      'audit_logs',  // solo escritura, sin GET
      'branches',    // sin ruta activa
      'clients',     // duplicado de clientes (datos ya migrados en PASO 1)
      // Tablas legacy renombradas que pueden quedar como fantasmas
      'activos',
      'usuarios',
      'mantenimientos',
      'tickets',
      'informes',
      'sucursales',
    ];

    for (const t of obsoleteTables) {
      try {
        await sql.unsafe(`DROP TABLE IF EXISTS ${t} CASCADE`);
        console.log(`🗑️  Tabla obsoleta eliminada: ${t}`);
      } catch (e: any) {
        console.warn(`No se pudo eliminar ${t}: ${e.message}`);
      }
    }

    console.log("✅ Esquema de base de datos listo — solo tablas con ruta activa conservadas");

  } catch (error) {
    console.error("❌ Error inicializando base de datos:", error);
  }
}
```

---

## SECCIÓN II-B — CORRECCIÓN DEL MIDDLEWARE requireCliente en server.ts

### Qué hacer
El middleware `requireCliente` actualmente consulta la tabla `users` buscando `cliente_id`.
Después de la limpieza de tablas, debe consultar exclusivamente `clientes` como tabla canónica.

Encuentra la función `requireCliente` en server.ts. Reemplaza SOLO el bloque de
validación de `userIdHeader` (el que hace `SELECT * FROM users WHERE id = ...`).
El resto del middleware no se toca.

```typescript
// REEMPLAZAR este bloque dentro de requireCliente:
// ANTES buscaba en 'users' y luego en tabla cmms_*
// DESPUÉS busca solo en 'users' con cliente_id verificado contra 'clientes'

if (userIdHeader) {
  const uId = String(userIdHeader).trim();
  const queryUser = await sql`
    SELECT u.uuid_sync, u.cliente_id
    FROM users u
    WHERE u.id = ${uId} OR u.uuid_sync = ${uId}
  `;
  if (queryUser.length > 0) {
    const uClienteId = queryUser[0].cliente_id;
    if (uClienteId && uClienteId !== clienteId && uClienteId !== 'cliente-default-001') {
      return res.status(403).json({
        success: false,
        error: `Acceso no autorizado: usuario ${uId} pertenece al cliente ${uClienteId}, no a ${clienteId}.`
      });
    }
  }
}
```

---

## SECCIÓN III — CORRECCIÓN C-2: Unificar ALLOWED_TABLES y TABLE_ALIAS_MAP en server.ts

### Qué hacer
Encuentra las constantes `ALLOWED_TABLES` y `TABLE_ALIAS_MAP` en server.ts.
Reemplaza ambas por las versiones canónicas siguientes. NO toques nada más.

```typescript
// ─── TABLAS CANÓNICAS CON RUTA ACTIVA ─────────────────────────────────────
// Estas son las ÚNICAS tablas que el sync puede leer y escribir.
// Todas tienen cliente_id → datos aislados por cliente.
const ALLOWED_TABLES = [
  'clientes',               // tabla maestra — acceso especial solo GET
  'assets',                 // equipos HVAC
  'work_orders',            // órdenes de trabajo
  'reports',                // informes técnicos
  'preventive_maintenance', // planes de mantenimiento preventivo
  'inventory',              // repuestos e inventario
  'users',                  // técnicos y usuarios
  'calendar',               // eventos y agenda
] as const;

// ─── ALIASES DE NOMBRES (Dexie usa estos nombres en el cliente) ────────────
// El cliente puede enviar cualquiera de estos nombres en el campo 'table'
// del payload de sync. El servidor lo resuelve al nombre canónico de Neon.
const TABLE_ALIAS_MAP: Record<string, string> = {
  // Español → canónico inglés (por compatibilidad con Dexie stores en español)
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
  'calendario':             'calendar',
  'eventos':                'calendar',
};
```

---

## SECCIÓN IV — CORRECCIÓN C-3: Reemplazar switch GET con filtro por cliente_id

### Qué hacer
Encuentra el handler `app.get(["/api/:table", "/api/sync/:table"], ...)` en server.ts.
Dentro de ese handler, reemplaza el bloque `switch (table)` completo por el siguiente.

**Regla**: NO toques la validación de tabla (`resolveTable`) ni el resto del handler.
Solo reemplaza el switch interno.

```typescript
// Leer cliente_id del query param para filtrar datos por tenant
const clienteId = req.query.clienteId
  || req.query.cliente_id
  || req.headers['x-client-id']
  || req.headers['x-cliente-id']
  || 'cliente-default-001';

const since = req.query.since ? Number(req.query.since) : 0;
let rows: any[] = [];

switch (table) {

  case 'clientes':
    // Solo devuelve el cliente propio del tenant solicitante
    rows = await sql`
      SELECT * FROM clientes
      WHERE id = ${String(clienteId)}
         OR uuid_sync = ${String(clienteId)}
    `;
    break;

  case 'assets':
    rows = await sql`
      SELECT * FROM assets
      WHERE cliente_id = ${String(clienteId)}
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 1000
    `;
    break;

  case 'work_orders':
    rows = await sql`
      SELECT * FROM work_orders
      WHERE cliente_id = ${String(clienteId)}
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 1000
    `;
    break;

  case 'reports':
    rows = await sql`
      SELECT * FROM reports
      WHERE cliente_id = ${String(clienteId)}
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 1000
    `;
    break;

  case 'preventive_maintenance':
    rows = await sql`
      SELECT * FROM preventive_maintenance
      WHERE cliente_id = ${String(clienteId)}
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 1000
    `;
    break;

  case 'inventory':
    rows = await sql`
      SELECT * FROM inventory
      WHERE cliente_id = ${String(clienteId)}
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 1000
    `;
    break;

  case 'users':
    rows = await sql`
      SELECT uuid_sync, id, nombre, correo, perfil, activo, cliente_id, data, updated_at, created_at
      FROM users
      WHERE (cliente_id = ${String(clienteId)} OR cliente_id = 'cliente-default-001')
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 500
    `;
    // Nunca devolver el campo pin en el GET
    rows = rows.map(({ pin, ...rest }) => rest);
    break;

  case 'calendar':
    rows = await sql`
      SELECT * FROM calendar
      WHERE cliente_id = ${String(clienteId)}
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 1000
    `;
    break;

  default:
    rows = [];
}
```

---

## SECCIÓN V — CORRECCIÓN C-4: Reemplazar POST /api/sync para respetar cliente_id

### Qué hacer
Encuentra el handler `app.post("/api/sync", ...)` en server.ts.
Dentro del handler, justo después de que se extrae la tabla del body y se resuelve con
`resolveTable()`, agrega la inyección de `cliente_id` en el payload antes del UPSERT.

No reescribas el handler completo. Agrega SOLO este bloque después de la resolución de tabla:

```typescript
// ── Inyectar cliente_id en todo registro que entra por sync ──────────────
// Garantiza que ningún dato se guarde sin propietario de tenant.
const clienteIdSync = req.body.clienteId
  || req.body.cliente_id
  || req.headers['x-client-id']
  || req.headers['x-cliente-id']
  || 'cliente-default-001';

// Si el payload tiene un campo 'data' (JSONB), inyectar también ahí
if (req.body.data && typeof req.body.data === 'object') {
  req.body.data.cliente_id = req.body.data.cliente_id || clienteIdSync;
}
// Inyectar en el nivel raíz del payload
req.body.cliente_id = req.body.cliente_id || clienteIdSync;
```

---

## SECCIÓN VI — CORRECCIÓN C-5: Corregir modelo Gemini en /api/ocr

### Qué hacer
Encuentra en server.ts el handler `app.post("/api/ocr", ...)`.
Dentro de ese handler, busca y reemplaza SOLO la línea del nombre del modelo.

```typescript
// ANTES (incorrecto — este modelo no existe):
model: 'gemini-3.5-flash',

// DESPUÉS (correcto):
model: 'gemini-2.0-flash',
```

---

## SECCIÓN VII — CORRECCIÓN C-6: Corregir validación de firma en validateWorkOrderPayload

### Qué hacer
Encuentra la función `validateWorkOrderPayload` en server.ts (~línea 65).
Dentro de esa función, reemplaza SOLO la línea de detección de `signature`:

```typescript
// ANTES (no detecta firmas guardadas por Dexie/EditorInforme):
const signature = target.firma
  || target.firma_conformidad_base64
  || (target.payload && target.payload.firma_conformidad_base64);

// DESPUÉS (detecta todas las rutas donde Dexie puede guardar la firma):
const signature =
  target.firma
  || target.firma_conformidad_base64
  || (target.firmas && (target.firmas.tecnico || target.firmas.cliente))
  || (target.signatures && target.signatures.technician)
  || (target.payload && target.payload.firma_conformidad_base64)
  || (target.data && target.data.firma_conformidad_base64)
  || (target.data && target.data.firmas && target.data.firmas.tecnico);
```

---

## SECCIÓN VIII — CORRECCIÓN C-7: Reemplazar vercel.json completo

### Qué hacer
Reemplaza el contenido completo del archivo `vercel.json` por lo siguiente.

Las rutas antiguas apuntaban a funciones serverless que no existen (`/api/work-orders/[id]/complete`).
La única ruta real es el servidor Express monolítico en `server.ts`.

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

**Por qué**: Vercel ya tiene el rewrite catch-all `/(.*) → /api/server` que dirige
TODO al Express. Las 4 rutas adicionales del vercel.json anterior apuntaban a
`/api/work-orders/[id]/complete` y similares — archivos que no existen en el repo.
Dejarlas causa que Vercel las busque como funciones serverless y devuelva 500.
Con solo el catch-all, Express maneja todas las rutas correctamente.

---

## SECCIÓN IX — CORRECCIÓN C-8: Corregir syncEngine.ts

### Qué hacer
Abre `src/lib/syncEngine.ts`. Verifica y corrige SOLO los siguientes puntos.
NO reescribas la lógica de sync. Solo corrige URLs y nombres de tabla.

#### 9.1 — URLs de endpoints

Busca cualquier llamada `fetch` con estas URLs incorrectas y reemplaza:

```typescript
// INCORRECTO → CORRECTO
'/api/sync/push'    →  '/api/sync'
'/api/sync/pull'    →  '/api/sync/' + tableName
'/api/sync/status'  →  '/api/health'
'/api/sync/pull/' + tableName  →  '/api/sync/' + tableName  (ya correcto)
```

#### 9.2 — Estructura del payload para POST /api/sync

El servidor `server.ts` espera este formato exacto en el body del POST `/api/sync`.
Si el syncEngine envía una estructura diferente, corrige SOLO los nombres de campos:

```typescript
// ESTRUCTURA CORRECTA del payload para POST /api/sync
{
  table: 'assets',            // nombre canónico o alias reconocido por TABLE_ALIAS_MAP
  operation: 'upsert',        // 'upsert' | 'delete'
  clienteId: 'cliente-xxx',   // tenant del registro — OBLIGATORIO
  data: {
    uuid_sync: 'uuid-v4-...',  // PK universal — OBLIGATORIO en todos los registros
    cliente_id: 'cliente-xxx', // también dentro del objeto data
    updated_at: Date.now(),    // timestamp epoch ms
    // ... resto de campos del registro
  }
}
```

#### 9.3 — Nombres de tabla en los stores de Dexie

Si el syncEngine itera stores de Dexie y los mapea a tablas Neon, verifica que
use los nombres del `TABLE_ALIAS_MAP` actualizado. Ejemplo correcto:

```typescript
const DEXIE_TO_NEON: Record<string, string> = {
  'activos':         'assets',
  'equipos':         'assets',
  'ordenes_trabajo': 'work_orders',
  'informes':        'reports',
  'mantenimientos':  'preventive_maintenance',
  'inventario':      'inventory',
  'usuarios':        'users',
  'calendario':      'calendar',
  'clientes':        'clientes',
};
```

Si ya existe un mapa similar con nombres correctos, NO lo reemplaces.
Solo agrega las entradas que falten.

---

## SECCIÓN X — ORDEN DE EJECUCIÓN

```
FASE 0 — Decisiones manuales (sin código, hacer PRIMERO):
  □ Neon Console → deshabilitar IP allowlist para que Vercel pueda conectar
  □ Vercel Dashboard → confirmar que DATABASE_URL está configurada
  □ Vercel Dashboard → confirmar que GEMINI_API_KEY está configurada

FASE 1 — Cambios atómicos de bajo riesgo en server.ts:
  □ C-5: corregir nombre modelo Gemini (1 línea)
  □ C-6: ampliar detección de firma en validateWorkOrderPayload (~5 líneas)

FASE 2 — Cambio de schema (impacto alto, hacerlo con DB de respaldo):
  □ C-1: reemplazar ensureTables() completa
         → ejecutar después: npm run dev y verificar logs "✅ Esquema listo"
         → verificar en Neon Console que tablas cmms_* desaparecen

FASE 3 — Rutas y lógica de sync:
  □ C-2: reemplazar ALLOWED_TABLES y TABLE_ALIAS_MAP
  □ C-3: reemplazar switch GET con filtro cliente_id
  □ C-4: agregar inyección cliente_id en POST /api/sync

FASE 4 — Infraestructura y cliente:
  □ C-7: reemplazar vercel.json
  □ C-8: corregir syncEngine.ts (URLs + payload + alias de tablas)

FASE 5 — VERIFICACIÓN POST-CORRECCIÓN:
  □ GET  /api/health                           → { status: "ok" }
  □ GET  /api/clientes?clienteId=cliente-default-001  → array con 1 cliente
  □ GET  /api/assets?clienteId=cliente-default-001    → array (vacío o con datos)
  □ GET  /api/cmms_equipos                     → 400 "Invalid table" (eliminada)
  □ GET  /api/clients                          → 400 "Invalid table" (eliminada)
  □ POST /api/ocr con imagen de placa          → respuesta JSON sin error 404 Gemini
  □ POST /api/sync con tabla='assets'          → { success: true }
  □ POST /api/sync con tabla='cmms_equipos'    → 400 "Invalid table"
  □ Crear informe con firma en data.firmas.tecnico → no debe ser bloqueado
```

---

## REPORTE OBLIGATORIO AL FINALIZAR

Al terminar cada corrección, generar una línea de reporte:

```
REPORTE FINAL — CMMS HVAC PRO IA STUDIO v2.0
═════════════════════════════════════════════════════════════════
C-1  ensureTables() reemplazada         → líneas [N-M] de server.ts
C-2  ALLOWED_TABLES / TABLE_ALIAS_MAP   → líneas [N-M] de server.ts
C-3  switch GET con cliente_id          → líneas [N-M] de server.ts
C-4  POST /api/sync cliente_id inject   → líneas [N-M] de server.ts
C-5  Gemini model corregido             → línea [N] de server.ts
C-6  validateWorkOrderPayload firma     → línea [N] de server.ts
C-7  vercel.json reemplazado            → archivo completo
C-8  syncEngine.ts URLs + payload       → líneas [N-M]

TABLAS ELIMINADAS DE Neon (DROP IF EXISTS CASCADE):
  [lista de tablas que el log confirmó eliminadas]

TABLAS CONSERVADAS (las únicas que deben existir):
  ✅ clientes
  ✅ assets
  ✅ work_orders
  ✅ reports
  ✅ preventive_maintenance
  ✅ inventory
  ✅ users
  ✅ calendar

ARCHIVOS NO MODIFICADOS:
  ✅ package.json · tsconfig.json · vite.config.ts · index.html
  ✅ src/pages/* · src/components/ui/*

PENDIENTES MANUALES:
  ⚠ [lista o "ninguno"]
```

---

*Prompt v2.0 — generado con lectura directa de server.ts (2837 líneas), vercel.json (24 líneas), package.json (64 líneas)*
*Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO — rama main — Junio 2026*
*Decisión de arquitectura Nelson: sync unificado hacia tabla canónica `clientes` | tablas sin ruta eliminadas*
