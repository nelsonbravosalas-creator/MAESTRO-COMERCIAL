# PROMPT DE AUDITORÍA SENIOR — CMMS HVAC PRO IA STUDIO
## Rol: Auditor Senior de Software y Base de Datos
## Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO
## Fecha auditoría: Junio 2026

---

## ⚠️ AVISO CRÍTICO ANTES DE EJECUTAR

Este prompt fue generado por un auditor externo que leyó el código fuente real del repositorio.
El prompt anterior de corrección contenía SUPOSICIONES INCORRECTAS sobre la arquitectura.
Este prompt reemplaza y corrige ese trabajo previo con hallazgos verificados en el código.

---

## TU ROL Y MISIÓN

Eres un agente de corrección quirúrgica con acceso de lectura/escritura al repositorio.
Tu misión es corregir ÚNICAMENTE las inconsistencias documentadas en este prompt,
basadas en la auditoría del código fuente real (server.ts, TECHNICAL_DOCUMENTATION.md, ARCHITECTURE.md).

### REGLAS ABSOLUTAS DE OPERACIÓN

1. Lee PRIMERO cada archivo completo antes de modificar cualquier línea.
2. Modifica SOLO los archivos listados en cada sección. Si necesitas tocar otro archivo, detente y reporta.
3. NO refactorices, NO renombres variables, NO cambies lógica que funciona.
4. NO elimines código existente sin reemplazarlo con el equivalente corregido.
5. Realiza UN archivo a la vez. Al terminar cada archivo reporta: `[ARCHIVO] → [cambio exacto] → [línea N]`.
6. Si encuentras código ambiguo, márcalo con `// AUDITORIA: revisar con Nelson` y continúa.
7. NO toques: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, archivos CSS/Tailwind, componentes UI puros en `src/components/ui/`.

---

## HALLAZGOS DE AUDITORÍA — CÓDIGO FUENTE REAL

### HALLAZGO #0 — ARQUITECTURA REAL (diferente a lo documentado)

La auditoría del `server.ts` (2837 líneas) reveló que la arquitectura REAL es:

```
ARQUITECTURA REAL VERIFICADA:
─────────────────────────────────────────────────────────────
Frontend React + Vite
    ↓ fetch HTTP
server.ts (Express monolítico, NO funciones serverless /api/*.ts)
    ↓ @neondatabase/serverless
Neon PostgreSQL
    ↑ fallback
createMockSql() → /src/db/mock_db_store.json (modo offline)
─────────────────────────────────────────────────────────────
```

**IMPLICACIÓN CRÍTICA**: El prompt anterior asumía funciones serverless en `/api/assets.ts`,
`/api/work-orders.ts`, etc. ESAS FUNCIONES NO EXISTEN en el repositorio actual.
Todo el backend vive en `server.ts`. Las correcciones se aplican ahí.

### HALLAZGO #1 — ESQUEMA DE TABLAS NEON (nombre real verificado)

El código real en `server.ts` → `ensureTables()` crea estas tablas con estos nombres EXACTOS:

```
TABLAS PRINCIPALES (patrón JSON blob — toda la data en columna 'data' JSONB):
──────────────────────────────────────────────────────────────────────────────
assets              → uuid_sync PK, tag UNIQUE, nombre, tipo, marca, modelo,
                      serie, ubicacion, area, capacidad, voltaje, corriente,
                      refrigerante, fecha_instalacion, estado, cliente_id,
                      sucursal_id, latitud, longitud, updated_at, created_at, deleted_at

work_orders         → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at
reports             → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at
preventive_maintenance → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at
users               → uuid_sync PK, id TEXT UNIQUE, nombre, correo UNIQUE, perfil,
                      pin, activo, data JSONB, updated_at, created_at, deleted_at
inventory           → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at
events              → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at
clients             → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at
branches            → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at
ordenes_servicio    → uuid_sync PK, id TEXT, data JSONB, updated_at, created_at, deleted_at

TABLAS CMMS PREFIJADAS (esquema normalizado, con FK estrictas):
──────────────────────────────────────────────────────────────────────────────
cmms_clientes       → id PK, nombre, version, creado_en
cmms_users          → id PK, nombre, correo UNIQUE, perfil, pin, activo, version, creado_en
cmms_equipos        → tag PK, nombre, cliente_id FK→cmms_clientes, deleted_at, version
cmms_tickets        → id PK, cliente_id FK, tag FK, solicitante_id FK, asignado_user_id FK,
                      supervisor_id FK, deleted_at, version
cmms_mantenimientos → id PK, cliente_id FK, tag FK, ot_id FK, deleted_at, version
cmms_ot_eventos     → id SERIAL PK, ticket_id FK, cliente_id FK, tipo, actor_user_id,
                      actor_nombre, payload JSONB, created_at, deleted_at, version
cmms_ot_comentarios → id SERIAL PK, ticket_id FK, cliente_id FK, autor_user_id,
                      autor_nombre, texto, created_at, deleted_at, version
cmms_informes_mantenimiento → id PK, cliente_id FK, equipo_tag FK, tecnico_user_id FK,
                      firmado_por_user_id FK, deleted_at, version
cmms_sla_config, cmms_pm_planes, cmms_pm_plantillas, cmms_checklist_plantillas
cmms_push_subscriptions, cmms_one_shot_migrations
cmms_usuarios_clientes → user_id + cliente_id (tabla de relación M:N)
cmms_idempotency_keys, cmms_auth_failures
```

**⚠️ INCONSISTENCIA CRÍTICA DETECTADA**: Existen DOS familias de tablas paralelas para la misma
entidad — la familia JSON-blob (`assets`, `work_orders`, etc.) y la familia normalizada
(`cmms_equipos`, `cmms_tickets`, etc.) — y NO HAY sincronización entre ellas.
Esto es el origen de la mayoría de bugs de datos.

### HALLAZGO #2 — ALIAS DE TABLAS EN EL SYNC (TABLE_ALIAS_MAP real)

El servidor tiene un mapa de alias EN EL CÓDIGO que el front PUEDE usar:

```typescript
// Esto existe en server.ts y ES FUNCIONAL:
const TABLE_ALIAS_MAP: Record<string, string> = {
  'activos':      'assets',
  'usuarios':     'users',
  'mantenimientos': 'preventive_maintenance',
  'tickets':      'work_orders',
  'informes':     'reports',
  'eventos':      'events',
  'clientes':     'clients',
  'sucursales':   'branches',
  'inventario':   'inventory'
};

// TABLAS PERMITIDAS para GET/POST sync:
const ALLOWED_TABLES = [
  'assets', 'users', 'preventive_maintenance', 'work_orders',
  'reports', 'events', 'clients', 'branches',
  'catalog_asset_types', 'settings', 'ordenes_servicio', 'audit_logs', 'inventory'
];
```

**⚠️ INCONSISTENCIA**: Las tablas `cmms_*` NO están en `ALLOWED_TABLES`.
Eso significa que el sync bidireccional Dexie ↔ Neon NO sincroniza la familia `cmms_*` nunca.
Los datos quedan en la familia JSON-blob, pero la UI que lee de `cmms_equipos` queda vacía.

### HALLAZGO #3 — ENDPOINT SYNC REAL

El endpoint de sincronización real en server.ts es:

```
GET  /api/:table           → pull (lee desde Neon hacia cliente)
GET  /api/sync/:table      → pull (alias del anterior)
POST /api/sync             → push (escribe desde cliente hacia Neon)
```

**⚠️ INCONSISTENCIA**: El front (syncEngine.ts y Dexie) probablemente llama a `/api/sync`
(POST singular) pero el pull podría estar usando `/api/sync/pull` (que NO existe en el servidor).
El servidor responde a `/api/sync/:table` donde `:table` es el nombre de la tabla,
NO `/api/sync/push` ni `/api/sync/pull`.

### HALLAZGO #4 — DOBLE FK CONFLICTIVA EN assets

En `ensureTables()` existe esta secuencia contradictoria:

```typescript
// LÍNEA ~550: agrega FK hacia cmms_clientes (tabla normalizada)
await sql`ALTER TABLE assets ADD CONSTRAINT fk_assets_cliente
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT`;

// LÍNEA ~620: intenta agregar FK hacia clients (tabla JSON-blob) — CONFLICTO
await sql`ALTER TABLE assets ADD COLUMN IF NOT EXISTS cliente_id TEXT REFERENCES clients(id)`;
```

`assets.cliente_id` tiene FK a `clientes` (tabla normalizada) Y el código intenta agregar FK
a `clients` (tabla JSON-blob). Ambas tablas son diferentes. En Neon esto falla silenciosamente
(el `try/catch` absorbe el error) dejando la FK inconsistente dependiendo del orden de ejecución.

### HALLAZGO #5 — RENAME DE TABLAS AL ARRANQUE (riesgo de pérdida de datos)

En `ensureTables()` al inicio:

```typescript
try { await sql`ALTER TABLE IF EXISTS activos RENAME TO assets`; } catch (e) {}
try { await sql`ALTER TABLE IF EXISTS usuarios RENAME TO users`; } catch (e) {}
try { await sql`ALTER TABLE IF EXISTS mantenimientos RENAME TO preventive_maintenance`; } catch (e) {}
try { await sql`ALTER TABLE IF EXISTS tickets RENAME TO work_orders`; } catch (e) {}
try { await sql`ALTER TABLE IF EXISTS informes RENAME TO reports`; } catch (e) {}
try { await sql`ALTER TABLE IF EXISTS eventos RENAME TO events`; } catch (e) {}
try { await sql`ALTER TABLE IF EXISTS clientes RENAME TO clients`; } catch (e) {}
try { await sql`ALTER TABLE IF EXISTS sucursales RENAME TO branches`; } catch (e) {}
```

**⚠️ PROBLEMA**: Luego de renombrar, el código crea `clientes` y `sucursales` de nuevo como
tablas NUEVAS con esquema diferente (normalizado). Esto significa que si alguna vez existió
una tabla `clientes` con datos, fue renombrada a `clients` y una nueva `clientes` vacía fue creada.
Los datos de clientes están en `clients` (JSON-blob) pero las FK de integridad apuntan a `clientes` (normalizada nueva).

### HALLAZGO #6 — VALIDACIÓN DE CIERRE DE OT SIN MAPEO EN SYNC

La función `validateWorkOrderPayload` en server.ts valida que para cerrar una OT se requiere:
- `firma_conformidad_base64` → campo dentro del JSONB `data`
- `checklist` / `checklists` / `checklist_items` → también dentro de `data`

**⚠️ INCONSISTENCIA**: Si Dexie guarda la firma bajo `firmas.tecnico` (según TECHNICAL_DOCUMENTATION.md)
pero el validador del servidor busca `firma_conformidad_base64` directamente, el cierre de OT
siempre fallará con el error de validación aunque el técnico haya firmado.

**Mapping verificado en TECHNICAL_DOCUMENTATION.md**:
```
data.firmas.tecnico         ← así lo guarda Dexie/EditorInforme
data.firma_conformidad_base64  ← así lo busca validateWorkOrderPayload en server.ts
```

### HALLAZGO #7 — MODELO GEMINI INEXISTENTE

En el handler `/api/ocr` del server.ts:

```typescript
const result = await client.models.generateContent({
  model: 'gemini-3.5-flash',   // ← ESTE MODELO NO EXISTE
  ...
});
```

El modelo correcto actual es `gemini-1.5-flash` o `gemini-2.0-flash`. `gemini-3.5-flash` no existe
y causa un error 404 de la API de Gemini en cada llamada OCR.

### HALLAZGO #8 — SYNC LOOP: tabla `sync_queue` en Dexie vs server

Según TECHNICAL_DOCUMENTATION.md, Dexie tiene una tabla `sync_queue` y el syncEngine envía al
endpoint `/api/sync`. El servidor acepta POST a `/api/sync` genérico pero el handler real
procesa por `entity_type` o `table`. Si el payload de `sync_queue` no incluye el campo `table`
exactamente como lo espera el servidor (usando los nombres de ALLOWED_TABLES en inglés),
el servidor rechaza con "Invalid table".

---

## CORRECCIONES REQUERIDAS — ARCHIVO POR ARCHIVO

### CORRECCIÓN C-1: server.ts — Resolver FK dual en assets (LÍNEAS ~540-625)

**Archivo**: `server.ts`
**Problema**: FK doble conflictiva en `assets.cliente_id`
**Acción**: Eliminar la línea que intenta agregar FK hacia `clients` (JSON-blob)
ya que la FK canónica debe apuntar a `clientes` (tabla normalizada con datos reales).

Busca y elimina SOLO esta línea dentro del bloque de columnas operacionales (~línea 620):
```typescript
// ELIMINAR esta línea:
try { await sql`ALTER TABLE assets ADD COLUMN IF NOT EXISTS cliente_id TEXT REFERENCES clients(id)`; } catch (e) {}
```

Reemplazarla por:
```typescript
// No agregar FK aquí — ya existe fk_assets_cliente hacia clientes definida arriba
// La FK hacia clients (JSON-blob) es incorrecta y genera conflicto
```

### CORRECCIÓN C-2: server.ts — Validación de firma en validateWorkOrderPayload (~LÍNEAS 65-85)

**Archivo**: `server.ts`
**Problema**: El validador busca `firma_conformidad_base64` pero Dexie guarda en `firmas.tecnico`
**Acción**: Ampliar el validador para buscar en ambas rutas sin romper la validación existente.

Encuentra la función `validateWorkOrderPayload`. Reemplaza el bloque de detección de firma:

```typescript
// ANTES (reemplazar estas líneas):
const signature = target.firma || target.firma_conformidad_base64 || (target.payload && target.payload.firma_conformidad_base64);

// DESPUÉS (busca en todas las rutas posibles según TECHNICAL_DOCUMENTATION.md):
const signature = target.firma
  || target.firma_conformidad_base64
  || (target.firmas && (target.firmas.tecnico || target.firmas.cliente))
  || (target.payload && target.payload.firma_conformidad_base64)
  || (target.data && target.data.firma_conformidad_base64)
  || (target.data && target.data.firmas && target.data.firmas.tecnico);
```

### CORRECCIÓN C-3: server.ts — Modelo Gemini inexistente (~LÍNEA 780 aprox)

**Archivo**: `server.ts`
**Problema**: `model: 'gemini-3.5-flash'` no existe en la API de Google
**Acción**: Cambiar SOLO el string del nombre del modelo.

```typescript
// ANTES:
model: 'gemini-3.5-flash',

// DESPUÉS:
model: 'gemini-2.0-flash',
```

### CORRECCIÓN C-4: server.ts — Agregar tablas cmms_* a ALLOWED_TABLES y TABLE_ALIAS_MAP

**Archivo**: `server.ts`
**Problema**: Las tablas `cmms_*` no son accesibles desde el sync, dejando la familia
normalizada sin datos sincronizados.
**Acción**: Agregar aliases en `TABLE_ALIAS_MAP` y entradas en `ALLOWED_TABLES`.

Encuentra la constante `ALLOWED_TABLES` (array). Agrega al final del array:
```typescript
const ALLOWED_TABLES = [
  'assets', 'users', 'preventive_maintenance', 'work_orders',
  'reports', 'events', 'clients', 'branches',
  'catalog_asset_types', 'settings', 'ordenes_servicio', 'audit_logs', 'inventory',
  // AUDITORIA C-4: agregar acceso a familia normalizada cmms_*
  'cmms_equipos', 'cmms_tickets', 'cmms_mantenimientos', 'cmms_informes_mantenimiento',
  'cmms_clientes', 'cmms_users', 'cmms_ot_eventos', 'cmms_ot_comentarios'
];
```

Encuentra `TABLE_ALIAS_MAP`. Agrega al final del objeto:
```typescript
const TABLE_ALIAS_MAP: Record<string, string> = {
  'activos':        'assets',
  'usuarios':       'users',
  'mantenimientos': 'preventive_maintenance',
  'tickets':        'work_orders',
  'informes':       'reports',
  'eventos':        'events',
  'clientes_json':  'clients',
  'sucursales_json':'branches',
  'inventario':     'inventory',
  // AUDITORIA C-4: aliases hacia familia normalizada
  'equipos':        'cmms_equipos',
  'ordenes':        'cmms_tickets',
  'planes_pm':      'cmms_mantenimientos',
  'informes_mant':  'cmms_informes_mantenimiento',
};
```

### CORRECCIÓN C-5: server.ts — Agregar handler GET para cmms_equipos y cmms_tickets en switch

**Archivo**: `server.ts`
**Problema**: El `switch(table)` en el handler GET `/api/:table` no tiene casos para
las tablas `cmms_*`, por lo que caen en `default: rows = []` y devuelven vacío.
**Acción**: Agregar casos al switch existente.

Encuentra el `switch (table)` dentro del handler `app.get(["/api/:table", "/api/sync/:table"])`.
SOLO agrega estos casos nuevos al final del switch (antes del `default`):

```typescript
case 'cmms_equipos':
  rows = await sql`SELECT * FROM cmms_equipos WHERE deleted_at IS NULL ORDER BY tag ASC LIMIT 1000`;
  break;
case 'cmms_tickets':
  rows = await sql`SELECT * FROM cmms_tickets WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1000`;
  break;
case 'cmms_mantenimientos':
  rows = await sql`SELECT * FROM cmms_mantenimientos WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1000`;
  break;
case 'cmms_informes_mantenimiento':
  rows = await sql`SELECT * FROM cmms_informes_mantenimiento WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1000`;
  break;
case 'cmms_clientes':
  rows = await sql`SELECT * FROM cmms_clientes ORDER BY id ASC LIMIT 1000`;
  break;
case 'cmms_users':
  rows = await sql`SELECT * FROM cmms_users WHERE activo = true ORDER BY id ASC LIMIT 1000`;
  break;
case 'cmms_ot_eventos':
  rows = await sql`SELECT * FROM cmms_ot_eventos WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1000`;
  break;
case 'cmms_ot_comentarios':
  rows = await sql`SELECT * FROM cmms_ot_comentarios WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1000`;
  break;
```

### CORRECCIÓN C-6: src/lib/syncEngine.ts — Corregir URLs de endpoints sync

**Archivo**: `src/lib/syncEngine.ts`
**Problema**: El sync engine probablemente llama a `/api/sync/push` y `/api/sync/pull`
que NO existen en server.ts. El servidor expone:
- PULL: `GET /api/:table` o `GET /api/sync/:table`  (el table como segmento de ruta)
- PUSH: `POST /api/sync`                             (payload con `table` en el body)

**Acción**: Abre `src/lib/syncEngine.ts` y verifica CADA llamada fetch hacia la API de sync.

Si encuentras llamadas tipo `fetch('/api/sync/push', ...)` → cambiar a `fetch('/api/sync', ...)`
Si encuentras llamadas tipo `fetch('/api/sync/pull', ...)` → cambiar a `fetch('/api/sync/' + tableName, ...)`
Si encuentras llamadas tipo `fetch('/api/sync/status', ...)` → este endpoint no existe; reemplazar
  por `fetch('/api/health', ...)` para verificar conectividad.

Después verifica el payload del POST. Debe tener esta estructura para ser aceptado por server.ts:
```typescript
// Estructura CORRECTA del payload para POST /api/sync:
{
  table: 'assets',          // nombre exacto de ALLOWED_TABLES (en inglés)
  operation: 'upsert',      // 'upsert' | 'delete'
  data: {
    uuid_sync: '...',       // obligatorio — PK de todas las tablas
    // ... resto de campos
  }
}
```

Si el syncEngine usa la estructura incorrecta (por ejemplo `entityType` en lugar de `table`,
o `id` en lugar de `uuid_sync`), corregir solo esas claves del payload.

### CORRECCIÓN C-7: src/db/mockDb.ts — Verificar que mock replica el schema real

**Archivo**: `src/db/mockDb.ts`
**Problema**: El mock puede tener un schema distinto al real, causando que tests en modo offline
pasen pero fallen en producción con Neon.
**Acción**: Abrir el archivo y verificar que las tablas del mock coincidan con `ALLOWED_TABLES`.
Si hay tablas con nombres en español (`activos`, `tickets`, etc.) en el mock pero inglés en Neon,
agregar alias en el mock que resuelvan igual que `TABLE_ALIAS_MAP` en server.ts.
NO reescribir el mock. Solo agregar la resolución de aliases si no existe.

---

## CORRECCIONES MANUALES (NO requieren código)

### MANUAL-1: Neon Console — IP Allowlist

Hasta que esto esté resuelto, el sync siempre fallará desde Vercel serverless:
```
1. Ir a https://console.neon.tech
2. Proyecto CMMS HVAC PRO → Settings → Connection Security
3. IP Allow: deshabilitar restricción O agregar 0.0.0.0/0
4. Para producción: usar DATABASE_URL con ?connection_limit=5&pool_timeout=10
   para evitar agotamiento de conexiones en Vercel serverless
```

### MANUAL-2: Variable GEMINI_API_KEY

El servidor falla silenciosamente si no está definida. Verificar en:
- Vercel Dashboard → Project → Settings → Environment Variables
- Que exista `GEMINI_API_KEY` con valor válido para producción Y preview

### MANUAL-3: Resolver ambigüedad de tabla `clientes` vs `clients`

Esta es una decisión de arquitectura que requiere tu confirmación, Nelson:

**Situación actual**:
- `clients` (JSON-blob, EN): creada por el código legacy, puede tener datos reales
- `clientes` (normalizada, ES): creada nueva vacía, tiene FK activas

**Opciones** (elegir una antes de ejecutar C-1):
- Opción A: Migrar datos de `clients` a `clientes` y usar `clientes` como canónica
- Opción B: Hacer que `clientes` sea la vista/alias de `clients` para las FK
- Opción C: Mantener ambas y sincronizar via trigger (mayor complejidad)

**Recomendación del auditor**: Opción A. El código ya tiene la migración parcial en
`ensureTables()` (el INSERT INTO clientes ... SELECT FROM clients). Completarla y hacer
que todas las FK apunten a `clientes`.

---

## ORDEN DE EJECUCIÓN SEGURO

```
FASE 0 — MANUAL (sin código, máxima prioridad):
  □ MANUAL-1: resolver Neon IP Allowlist
  □ MANUAL-2: verificar GEMINI_API_KEY en Vercel
  □ MANUAL-3: decidir clientes vs clients (bloquea C-1)

FASE 1 — Correcciones aisladas en server.ts (bajo riesgo):
  □ C-3: corregir nombre modelo Gemini (~1 línea)
  □ C-2: ampliar detección de firma en validateWorkOrderPayload (~5 líneas)

FASE 2 — Correcciones de schema y acceso a datos:
  □ C-1: resolver FK dual en assets (requiere decisión MANUAL-3 primero)
  □ C-4: agregar tablas cmms_* a ALLOWED_TABLES y TABLE_ALIAS_MAP
  □ C-5: agregar casos al switch GET para cmms_*

FASE 3 — Capa de sync (mayor riesgo, hacer al final):
  □ C-6: corregir URLs en syncEngine.ts
  □ C-7: verificar mock db aliases

FASE 4 — VERIFICACIÓN POST-CORRECCIÓN:
  □ Ejecutar: GET /api/health → debe devolver { status: "ok" }
  □ Ejecutar: GET /api/assets → debe devolver array (no error)
  □ Ejecutar: GET /api/cmms_equipos → debe devolver array (antes devolvía [])
  □ Ejecutar: POST /api/ocr con imagen → no debe dar error 404 de Gemini
  □ Crear OT firmada → no debe ser bloqueada si firma está en data.firmas.tecnico
```

---

## REPORTE ESPERADO AL FINALIZAR

Al completar todas las correcciones, generar este reporte:

```
REPORTE DE AUDITORÍA — CMMS HVAC PRO IA STUDIO
================================================
Fecha: [fecha]
Archivos modificados: [lista]

C-1 FK dual assets:     [APLICADO / PENDIENTE DECISION MANUAL-3]
C-2 Firma validación:   [APLICADO en línea N]
C-3 Gemini model:       [APLICADO — gemini-2.0-flash]
C-4 ALLOWED_TABLES:     [APLICADO — N tablas cmms_* agregadas]
C-5 Switch GET cmms_*:  [APLICADO — N casos agregados]
C-6 syncEngine URLs:    [APLICADO / NO REQUIRIÓ CAMBIO]
C-7 mock db:            [APLICADO / NO REQUIRIÓ CAMBIO]

Archivos NO tocados (confirmación):
  ✅ package.json
  ✅ tsconfig.json
  ✅ vite.config.ts
  ✅ src/components/ui/*
  ✅ [otros]

Pendientes manuales sin resolver:
  ⚠ [lista]

Hallazgos adicionales encontrados durante la corrección:
  [lista o "ninguno"]
```

---

## CONTEXTO ADICIONAL PARA IA STUDIO

### Stack real verificado en código fuente:
- **Backend**: Express.js monolítico en `server.ts` (2837 líneas), NO funciones serverless
- **Puerto local**: 3000
- **ORM**: `@neondatabase/serverless` con tagged template literals
- **Fallback offline**: `createMockSql()` → lee/escribe en `/src/db/mock_db_store.json`
- **Auth**: JWT mock + bcrypt para PIN, con tabla `cmms_auth_failures` para brute-force
- **IA**: Google GenAI SDK (`@google/genai`) para OCR de placas HVAC
- **Ruteo**: Wouter (frontend), Express (backend)
- **Estilos**: Tailwind CSS exclusivamente
- **Sync pattern**: Dexie (IndexedDB) → `sync_queue` → POST `/api/sync` → Neon PostgreSQL
- **Multi-tenant**: cliente_id en cada registro, middleware `requireCliente` en rutas protegidas

### Tablas de datos de aplicación (donde van los datos de pantalla):
| Pantalla/Módulo       | Tabla principal Neon    | Columnas clave datos operacionales           |
|-----------------------|-------------------------|----------------------------------------------|
| Activos/Equipos HVAC  | `assets`                | tag, nombre, tipo, marca, modelo, estado, cliente_id |
| Órdenes de Trabajo    | `work_orders`           | uuid_sync, id, data (JSONB con toda la OT)   |
| Informes técnicos     | `reports`               | uuid_sync, id, data (JSONB con informe completo) |
| Mantenimiento PM      | `preventive_maintenance`| uuid_sync, id, data (JSONB con plan PM)      |
| Inventario repuestos  | `inventory`             | uuid_sync, id, data (JSONB)                  |
| Usuarios              | `users`                 | uuid_sync, id, nombre, correo, perfil, pin   |
| Calendario            | `calendar`              | uuid_sync, id, cliente_id, data (JSONB)      |
| Equipos (normalizado) | `cmms_equipos`          | tag PK, nombre, cliente_id, deleted_at       |
| Tickets (normalizado) | `cmms_tickets`          | id PK, cliente_id, tag, asignado_user_id     |

---

*Auditoría generada con lectura directa del código fuente real.*
*server.ts: 2837 líneas | TECHNICAL_DOCUMENTATION.md: 111 líneas | ARCHITECTURE.md: 59 líneas*
*Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO — rama main — Junio 2026*
