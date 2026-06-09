# PROMPT QA POST-IMPLEMENTACIÓN — CMMS HVAC PRO IA STUDIO
## Versión 4.0 — Auditoría de código fuente real (server.ts 2493 líneas verificadas)
## Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO
## Estado: Post-corrección v3 — verificación de regresiones y bugs residuales

---

## ⚠️ CONTEXTO DE ESTA CORRECCIÓN

La implementación anterior (v3) aplicó correctamente la mayoría de las correcciones.
Sin embargo, la lectura forense del `server.ts` real entregado reveló **4 bugs críticos
introducidos o no resueltos** durante esa implementación. Este prompt corrige SOLO esos 4
bugs sin tocar nada que ya funcione.

**Principio de esta corrección: mínima intervención quirúrgica.**
Cada sección indica exactamente qué líneas tocar. Nada más.

---

## REGLAS ABSOLUTAS (igual que versiones anteriores)

1. Lee el archivo completo antes de modificar cualquier línea.
2. Modifica SOLO `server.ts`. Ningún otro archivo en esta ronda.
3. UN bug a la vez. Reporta al terminar cada uno: `[BUG] → [línea N] → [cambio aplicado]`.
4. NO refactorices nada que funcione. Solo corrige los 4 bugs documentados.
5. NO toques: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/pages/*`, `src/components/*`.

---

## BUG CRÍTICO #1 — cmms_auth_failures incluida en la lista DROP (líneas 149-154)

### Problema verificado en código real
La variable `obsoleteTables` en `ensureTables()` incluye `'cmms_auth_failures'` en la
lista de tablas a eliminar con `DROP TABLE IF EXISTS ... CASCADE`.

```
LÍNEA 149: 'cmms_idempotency_keys', 'cmms_auth_failures',  ← PROBLEMA
```

**Consecuencia real**: cada vez que el servidor arranca, elimina la tabla que bloquea
los intentos de login por fuerza bruta. Los atacantes tienen un vector abierto:
reiniciar el servidor limpia todos los contadores de intentos fallidos. Además, las
líneas 424, 445, 461, 467 y 470 escriben y leen activamente `cmms_auth_failures`
durante el flujo de `/api/auth`. Si la tabla no existe, el login falla con un error 500.

### Corrección — Reemplazar SOLO el array `obsoleteTables` (líneas 148-154)

**ANTES** (código actual, problemático):
```typescript
    const obsoleteTables = [
      'cmms_idempotency_keys', 'cmms_auth_failures', 'cmms_usuarios_clientes', 
      'cmms_informes_mantenimiento', 'cmms_sla_config', 'cmms_pm_planes', 
      'cmms_pm_plantillas', 'cmms_checklist_plantillas', 'cmms_push_subscriptions', 
      'cmms_ot_eventos', 'cmms_ot_comentarios', 'cmms_tickets', 
      'cmms_mantenimientos', 'cmms_equipos', 'cmms_users', 'cmms_clientes',
      'playing_with_neon', 'providers', 'cmms_one_shot_migrations'
    ];
```

**DESPUÉS** (eliminar `cmms_auth_failures` y `cmms_idempotency_keys` de la lista):
```typescript
    const obsoleteTables = [
      // cmms_auth_failures: CONSERVADA — bloqueador activo de fuerza bruta en /api/auth
      // cmms_idempotency_keys: CONSERVADA — usada como fallback en /api/cmms/:resource
      'cmms_usuarios_clientes', 
      'cmms_informes_mantenimiento', 'cmms_sla_config', 'cmms_pm_planes', 
      'cmms_pm_plantillas', 'cmms_checklist_plantillas', 'cmms_push_subscriptions', 
      'cmms_ot_eventos', 'cmms_ot_comentarios', 'cmms_tickets', 
      'cmms_mantenimientos', 'cmms_equipos', 'cmms_users', 'cmms_clientes',
      'playing_with_neon', 'providers', 'cmms_one_shot_migrations'
    ];
```

### Asegurar que cmms_auth_failures existe al arrancar

Inmediatamente DESPUÉS del bucle `for (const table of obsoleteTables)`, agrega este bloque:

```typescript
    // Garantizar que la tabla de seguridad de autenticación existe siempre
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS cmms_auth_failures (
          id          SERIAL PRIMARY KEY,
          email       TEXT NOT NULL,
          ip          TEXT,
          attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_auth_failures_email
        ON cmms_auth_failures (LOWER(email), attempted_at)
      `;
    } catch (e: any) {
      console.warn('cmms_auth_failures ya existe o error menor:', e.message);
    }
```

---

## BUG CRÍTICO #2 — Ruta GET /api/assets duplicada sombrea el switch de sync (líneas 615-631)

### Problema verificado en código real
Express registra rutas en orden de declaración. La cadena de rutas es:

```
LÍNEA 554: app.get(["/api/:table", "/api/sync/:table"], ...)   ← switch con filtro cliente_id
LÍNEA 615: app.get("/api/assets", ...)                         ← ruta específica SIN filtro cliente_id
```

Cuando Express recibe `GET /api/assets`, evalúa las rutas en orden. La ruta de la
línea 554 captura primero (`:table` hace match con `assets`), pero **a continuación
existe una segunda ruta específica** en la línea 615 que nunca es alcanzada.

El problema real es el opuesto al que parece: la línea 615 existe pero está muerta
(unreachable) porque la línea 554 ya capturó la request. Sin embargo, la línea 615
tiene lógica diferente: no filtra por `cliente_id` y busca por `tag`. Esta funcionalidad
(buscar equipo por tag) está perdida.

Adicionalmente, `app.post("/api/assets")` en la línea 633 SÍ es alcanzada porque el
switch de la línea 554 solo cubre `GET`. Pero `app.post("/api/assets")` en línea 633
no verifica `cliente_id` — escribe en `assets` sin tenant.

### Corrección

**Paso 1**: Eliminar la ruta `app.get("/api/assets", ...)` de las líneas 615-631 completas
(desde `app.get("/api/assets"` hasta el `});` de cierre de esa función).

**Paso 2**: Dentro del `switch(table)` del handler genérico (línea 554), el case `'assets'`
ya existe y filtra por `cliente_id`. Agrega soporte para búsqueda por `tag` dentro de ese
mismo case:

```typescript
// REEMPLAZAR el case 'assets' existente en el switch por este:
case 'assets':
  const tagFilter = req.query.tag as string | undefined;
  if (tagFilter) {
    // Búsqueda por tag específico — mantiene filtro de tenant
    rows = await sql`
      SELECT * FROM assets
      WHERE tag = ${tagFilter}
        AND (cliente_id = ${clienteId} OR cliente_id = 'cliente-default-001')
        AND deleted_at IS NULL
    `;
  } else {
    rows = await sql`
      SELECT * FROM assets
      WHERE (cliente_id = ${clienteId} OR cliente_id = 'cliente-default-001')
        AND (updated_at > ${since} OR updated_at IS NULL)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT 1000
    `;
  }
  break;
```

**Paso 3**: En `app.post("/api/assets")` (línea 633), agregar extracción de `cliente_id`
al inicio del handler, antes del primer `if`:

```typescript
// AGREGAR al inicio del handler app.post("/api/assets"), justo después de "const sql = getSql();":
const clienteIdPost = String(
  req.body.cliente_id
  || req.body.clienteId
  || req.headers['x-client-id']
  || req.headers['x-cliente-id']
  || 'cliente-default-001'
);
// Inyectar en el body para que los INSERT posteriores lo incluyan
if (!req.body.cliente_id) req.body.cliente_id = clienteIdPost;
```

---

## BUG CRÍTICO #3 — Ruta /api/cmms/:resource activa con tablas ya eliminadas (línea 1500)

### Problema verificado en código real
La ruta `app.post("/api/cmms/:resource", ...)` en la línea 1500 sigue activa y referencia:
- `cmms_equipos`, `cmms_tickets`, `cmms_mantenimientos` (ya eliminadas por el DROP)
- `cmms_idempotency_keys` (en la lista original de DROP, aunque la corregimos en Bug #1)

Cualquier request a `/api/cmms/equipos` ahora devuelve un error 500 porque intenta
hacer `SELECT FROM cmms_equipos` que ya no existe. Peor aún, la ruta mapea:
```
resource='assets'  → cmms_equipos   (eliminada)
resource='work_orders' → cmms_tickets (eliminada)
```
Esto significa que si algún componente del frontend llama a `/api/cmms/assets`,
obtiene un 500 en lugar de datos reales.

### Corrección — Reemplazar el handler completo de /api/cmms/:resource

Encuentra el handler `app.post("/api/cmms/:resource", ...)` en la línea 1500.
Reemplaza el handler completo (desde `app.post("/api/cmms/:resource"` hasta
su `});` de cierre) por este handler que redirige limpiamente a las tablas canónicas:

```typescript
  // /api/cmms/:resource — ruta de compatibilidad legacy
  // Redirige a las tablas canónicas activas. Las tablas cmms_* originales han sido deprecadas.
  app.post("/api/cmms/:resource", requireCliente, async (req: any, res: any) => {
    try {
      const resource = req.params.resource;

      // Mapa de recursos legacy → tablas canónicas activas
      const legacyToCanonical: Record<string, string> = {
        'equipos':               'assets',
        'cmms_equipos':          'assets',
        'assets':                'assets',
        'tickets':               'work_orders',
        'cmms_tickets':          'work_orders',
        'work_orders':           'work_orders',
        'mantenimientos':        'preventive_maintenance',
        'cmms_mantenimientos':   'preventive_maintenance',
        'preventive_maintenance':'preventive_maintenance',
        'informes':              'reports',
        'cmms_informes_mantenimiento': 'reports',
        'ot_eventos':            'events',
        'cmms_ot_eventos':       'events',
        'ot_comentarios':        'audit_logs',
        'cmms_ot_comentarios':   'audit_logs',
        'clientes':              'clientes',
        'cmms_clientes':         'clientes',
        'usuarios':              'users',
        'cmms_users':            'users',
      };

      const canonicalTable = legacyToCanonical[resource];
      if (!canonicalTable) {
        return res.status(410).json({
          success: false,
          error: `El recurso '${resource}' ha sido deprecado y eliminado. Use /api/v1/:cliente_id/:recurso o /api/sync.`,
          canonical_tables: Object.keys(legacyToCanonical)
        });
      }

      // Redirigir al sync canónico
      return res.status(301).json({
        success: false,
        error: `Endpoint legacy. Use POST /api/sync con table='${canonicalTable}'.`,
        redirect: `/api/sync`,
        payload_example: {
          table: canonicalTable,
          operation: 'upsert',
          clienteId: req.clienteId,
          data: req.body
        }
      });

    } catch (error: any) {
      console.error('Error en /api/cmms/:resource:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
```

---

## BUG CRÍTICO #4 — Lógica de resolveTable con alias circular (líneas 536-554)

### Problema verificado en código real
El `TABLE_ALIAS_MAP` contiene:
```typescript
'clientes': 'clientes',   // alias que apunta a sí mismo
'sucursales': 'sucursales', // alias que apunta a sí mismo
```

Y la función `resolveTable` es:
```typescript
function resolveTable(name: string): string | null {
  if (ALLOWED_TABLES.includes(name)) return name;      // paso 1
  return TABLE_ALIAS_MAP[name] || null;                 // paso 2
}
```

Para `name='clients'`: paso 1 falla (está en ALLOWED_TABLES → devuelve `'clients'`).
Para `name='clientes'`: paso 1 pasa (está en ALLOWED_TABLES → devuelve `'clientes'`).

El alias `'clients': 'clientes'` en el MAP nunca se ejecuta porque `'clients'` está
en `ALLOWED_TABLES` y el paso 1 lo devuelve directamente como `'clients'`.
Esto significa que cuando el syncEngine envía `table: 'clients'`, el servidor busca
en la tabla `clients` (legacy), **no en `clientes` (canónica)**.

Hay además una inconsistencia: `'branches'` está en `ALLOWED_TABLES` pero el switch
GET tiene `case 'branches'` que consulta `sucursales`. Esto funciona por casualidad
pero es frágil.

### Corrección — Reemplazar ALLOWED_TABLES, TABLE_ALIAS_MAP y resolveTable

Reemplaza las tres definiciones juntas (líneas 528-552):

```typescript
  // ─── TABLAS CANÓNICAS — ÚNICO SET AUTORIZADO PARA SYNC ────────────────────
  // Fuente: Auditoría DBA Senior — 35 tablas verificadas en producción Neon.
  // Solo estas tablas tienen rutas GET y POST activas en este servidor.
  const ALLOWED_TABLES = [
    'clientes',               // maestra de tenants — tabla canónica única
    'sucursales',             // sedes por cliente — tabla canónica única
    'assets',
    'users',
    'preventive_maintenance',
    'work_orders',
    'reports',
    'events',
    'catalog_asset_types',
    'settings',
    'ordenes_servicio',
    'audit_logs',
    'inventory',
    'calendar',
  ];

  // ─── ALIASES DE NOMBRES DEXIE → NEON ──────────────────────────────────────
  // El cliente (syncEngine) puede usar cualquiera de estos nombres.
  // IMPORTANTE: 'clients' y 'branches' NO están en ALLOWED_TABLES para forzar
  // el paso por este alias map y resolver a la tabla canónica correcta.
  const TABLE_ALIAS_MAP: Record<string, string> = {
    // Legacy inglés → canónico
    'clients':                'clientes',     // legacy JSON-blob → tabla maestra
    'branches':               'sucursales',   // legacy alias → tabla canónica
    // Español → canónico inglés
    'activos':                'assets',
    'equipos':                'assets',
    'usuarios':               'users',
    'tecnicos':               'users',
    'mantenimientos':         'preventive_maintenance',
    'mantenimiento':          'preventive_maintenance',
    'planes_pm':              'preventive_maintenance',
    'tickets':                'work_orders',
    'ordenes_trabajo':        'work_orders',
    'informes':               'reports',
    'informes_tecnicos':      'reports',
    'eventos':                'events',
    'eventos_sync':           'events',
    'inventario':             'inventory',
    'repuestos':              'inventory',
    'calendario':             'calendar',
    'configuracion':          'settings',
    'catalogo':               'catalog_asset_types',
    'sucursal':               'sucursales',
    'sedes':                  'sucursales',
    'cliente':                'clientes',
    'clientes_lista':         'clientes',
  };

  function resolveTable(name: string): string | null {
    // Primero verificar alias (tiene prioridad para forzar canonicalización)
    if (TABLE_ALIAS_MAP[name]) return TABLE_ALIAS_MAP[name];
    // Luego verificar tabla canónica directamente
    if (ALLOWED_TABLES.includes(name)) return name;
    return null;
  }
```

---

## VERIFICACIÓN POST-CORRECCIÓN

Ejecuta estas verificaciones en orden después de reiniciar el servidor:

```
□ 1. Login con PIN incorrecto 5 veces seguidas
      ESPERADO: respuesta 429 o mensaje de bloqueo después del intento 3-5
      SI FALLA: Bug #1 no fue corregido — cmms_auth_failures sigue dropeándose

□ 2. GET /api/assets?clienteId=cliente-default-001
      ESPERADO: { success: true, data: [...] } con filtro de tenant
      SI FALLA: Bug #2 — ruta duplicada o case del switch incorrecto

□ 3. GET /api/assets?tag=EQUIPO-001&clienteId=cliente-default-001
      ESPERADO: { success: true, data: { tag: 'EQUIPO-001', ... } } (objeto único)
      SI FALLA: Bug #2 — búsqueda por tag no integrada al switch

□ 4. POST /api/cmms/equipos (con body cualquiera)
      ESPERADO: { success: false, error: "Endpoint legacy. Use POST /api/sync..." }
               Status 301 (no 500)
      SI FALLA: Bug #3 — handler legacy no reemplazado

□ 5. POST /api/sync con body { table: 'clients', clienteId: 'x', data: { uuid_sync: 'y' } }
      ESPERADO: upsert en tabla 'clientes' (canónica), no en 'clients'
      VERIFICAR EN NEON: SELECT * FROM clientes WHERE uuid_sync = 'y'
      SI FALLA: Bug #4 — resolveTable no prioriza alias map

□ 6. POST /api/sync con body { table: 'branches', clienteId: 'x', data: { uuid_sync: 'z' } }
      ESPERADO: upsert en tabla 'sucursales', no error "Invalid table"
      SI FALLA: Bug #4 — 'branches' eliminado de ALLOWED_TABLES sin alias

□ 7. GET /api/clientes?clienteId=cliente-default-001
      ESPERADO: array con el registro del cliente por defecto
      SI FALLA: verificar case 'clientes' en el switch GET

□ 8. GET /api/clients?clienteId=cliente-default-001
      ESPERADO: mismo resultado que /api/clientes (alias resuelto por resolveTable)
      SI FALLA: Bug #4 — alias 'clients'→'clientes' no funciona
```

---

## REPORTE OBLIGATORIO AL FINALIZAR

```
REPORTE QA POST-IMPLEMENTACIÓN v4.0
════════════════════════════════════════════════════════════════
Bug #1  cmms_auth_failures eliminada del DROP     → línea [N] server.ts
        CREATE TABLE IF NOT EXISTS auth_failures  → línea [N] server.ts
Bug #2  Ruta GET /api/assets duplicada eliminada  → líneas [N-M] server.ts
        Case 'assets' con soporte tag integrado   → línea [N] server.ts
        POST /api/assets con cliente_id           → línea [N] server.ts
Bug #3  Handler /api/cmms/:resource reemplazado   → líneas [N-M] server.ts
Bug #4  resolveTable + ALLOWED_TABLES + ALIAS_MAP → líneas [N-M] server.ts

Verificaciones post-corrección:
  □ 1. Login brute-force bloqueado      → [ PASS / FAIL ]
  □ 2. GET /api/assets con tenant       → [ PASS / FAIL ]
  □ 3. GET /api/assets?tag=X            → [ PASS / FAIL ]
  □ 4. POST /api/cmms/equipos           → [ PASS 301 / FAIL ]
  □ 5. sync table='clients'→'clientes'  → [ PASS / FAIL ]
  □ 6. sync table='branches'→'sucursales'→ [ PASS / FAIL ]
  □ 7. GET /api/clientes                → [ PASS / FAIL ]
  □ 8. GET /api/clients (alias)         → [ PASS / FAIL ]

Archivos NO modificados en esta ronda:
  ✅ package.json · tsconfig.json · vite.config.ts
  ✅ src/pages/* · src/components/* · vercel.json
  ✅ src/lib/syncEngine.ts · src/db/database.ts
```

---

*Prompt v4.0 — generado con lectura forense del server.ts real (2493 líneas)*
*Bugs detectados: 4 críticos no reportados en implementación anterior*
*Bugs verificados correctos en implementación anterior: C-2 migración clients→clientes ✅,*
*C-3 switch GET con cliente_id ✅, C-5 Gemini gemini-2.0-flash ✅, C-6 validateWorkOrderPayload firma ✅*
*Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO — rama main — Junio 2026*
```
