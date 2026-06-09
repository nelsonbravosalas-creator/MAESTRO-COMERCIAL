# PROMPT MAESTRO — CMMS HVAC PRO IA STUDIO
## Corrección de rutas, endpoints y sincronización Front → API → Neon DB
### Versión: 1.0 | Proyecto: Los Cabros | Repo: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO

---

## ⚠️ INSTRUCCIONES DE SEGURIDAD — LEER ANTES DE EJECUTAR

**Eres un agente de corrección quirúrgica. Tu única misión es corregir los archivos listados en la sección "ARCHIVOS AUTORIZADOS". Tienes PROHIBIDO modificar cualquier archivo fuera de esa lista.**

### REGLAS ABSOLUTAS DE OPERACIÓN

1. **NO tocar ningún archivo que no esté en la lista "ARCHIVOS AUTORIZADOS"**. Si crees que necesitas modificar otro archivo, detente y pregunta al usuario primero.
2. **NO refactorizar, NO renombrar variables, NO cambiar lógica de negocio** que no esté directamente relacionada con las rutas y columnas descritas en este prompt.
3. **NO cambiar nombres de funciones, interfaces TypeScript, ni tipos** que ya existen, a menos que se indique explícitamente.
4. **NO eliminar código existente** salvo los fragmentos exactos indicados. Siempre reemplazar, nunca borrar sin reemplazar.
5. **NO modificar `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`** bajo ninguna circunstancia.
6. **NO tocar archivos de estilos CSS/Tailwind**, componentes de UI puros (botones, modales, layouts) ni archivos en `src/components/ui/`.
7. **NO modificar lógica de autenticación, sesión ni variables de entorno** (`.env`, `.env.example`).
8. **Antes de escribir cualquier código**, muestra el path exacto del archivo que vas a modificar y el fragmento específico que cambiarás. Espera confirmación si tienes dudas.
9. **Realiza UN archivo a la vez**. Al terminar cada archivo, lista los cambios aplicados en formato: `[ARCHIVO] → [qué se cambió] → [por qué]`.
10. **Si encuentras código ambiguo** o que podría tener efectos secundarios, NO lo modifiques. Márcalo con un comentario `// TODO: revisar con Nelson` y continúa.

---

## CONTEXTO DEL PROYECTO

### Stack tecnológico (NO cambiar)
- **Frontend**: React + TypeScript + Vite, desplegado en Vercel
- **Base de datos**: Neon PostgreSQL (serverless), tablas con nombres en **español**
- **Offline/sync**: Dexie.js (IndexedDB local), con nombres de stores en **inglés** — esta discrepancia es conocida y se corrige en la capa API, NO en Dexie
- **API**: Funciones serverless en `/api/` desplegadas en Vercel
- **ORM/queries**: SQL directo con `@neondatabase/serverless`
- **Sync engine**: archivo `src/lib/syncEngine.ts` (existe una sola versión canónica, ver abajo)

### Estructura de carpetas relevante (solo referencia, NO modificar estructura)
```
/
├── api/                        ← Serverless functions de Vercel
│   ├── assets.ts
│   ├── assets/[id].ts
│   ├── work-orders.ts
│   ├── work-orders/[id].ts
│   ├── maintenance.ts
│   ├── maintenance/[id].ts
│   ├── parts.ts
│   ├── parts/[id].ts
│   ├── technicians.ts
│   ├── dashboard/kpis.ts
│   ├── dashboard/upcoming.ts
│   ├── dashboard/alerts.ts
│   └── sync/
│       ├── push.ts
│       └── pull.ts
├── src/
│   ├── lib/
│   │   ├── syncEngine.ts       ← ÚNICO archivo canónico de sync
│   │   ├── db.ts               ← Configuración Dexie
│   │   └── api.ts              ← Cliente HTTP centralizado
│   ├── hooks/
│   │   └── useApi.ts
│   └── pages/
│       ├── Assets.tsx
│       ├── WorkOrders.tsx
│       ├── Maintenance.tsx
│       ├── Parts.tsx
│       ├── Technicians.tsx
│       └── Dashboard.tsx
├── vercel.json                 ← AUTORIZADO solo para agregar rutas faltantes
└── scripts/
    └── init-db.ts              ← AUTORIZADO para corregir schema
```

---

## ARCHIVOS AUTORIZADOS PARA MODIFICACIÓN

Solo puedes tocar estos archivos. Ningún otro.

```
1.  src/lib/api.ts
2.  src/pages/Assets.tsx             (solo las llamadas fetch/API, no el JSX)
3.  src/pages/WorkOrders.tsx         (solo las llamadas fetch/API, no el JSX)
4.  src/pages/Maintenance.tsx        (solo las llamadas fetch/API, no el JSX)
5.  src/pages/Parts.tsx              (solo las llamadas fetch/API, no el JSX)
6.  src/lib/syncEngine.ts            (eliminar duplicado, corregir mapeo de nombres)
7.  api/assets.ts
8.  api/assets/[id].ts
9.  api/work-orders.ts
10. api/work-orders/[id].ts
11. api/maintenance.ts
12. api/maintenance/[id].ts
13. api/parts.ts
14. api/parts/[id].ts
15. api/sync/push.ts
16. api/sync/pull.ts
17. vercel.json                      (SOLO agregar rutas faltantes, no eliminar existentes)
18. scripts/init-db.ts               (SOLO agregar tablas faltantes, no eliminar existentes)
```

---

## PROBLEMA 1 — URLs incorrectas en el frontend

### Descripción
El frontend llama endpoints con nombres incorrectos. Los serverless functions de Vercel usan kebab-case y nombres en inglés, pero el frontend tiene inconsistencias.

### Correcciones requeridas en `src/lib/api.ts`

Verifica que el cliente API centralizado use exactamente estas URLs base. Si `api.ts` no existe, créalo. Si ya existe, **solo corrige las constantes de URL, no toques la lógica de fetch, headers ni manejo de errores existente**.

```typescript
// URLS CANÓNICAS — estas son las únicas correctas
export const API_ENDPOINTS = {
  // Activos / Equipos HVAC
  assets:           '/api/assets',
  assetById:        (id: string) => `/api/assets/${id}`,

  // Órdenes de trabajo — usar kebab-case, NO camelCase
  workOrders:       '/api/work-orders',           // ← CORRECTO (no /api/workOrders)
  workOrderById:    (id: string) => `/api/work-orders/${id}`,
  workOrderComplete:(id: string) => `/api/work-orders/${id}/complete`,

  // Mantenimiento preventivo
  maintenance:      '/api/maintenance',
  maintenanceById:  (id: string) => `/api/maintenance/${id}`,
  maintenanceExec:  (id: string) => `/api/maintenance/${id}/execute`,

  // Repuestos — usar /api/parts, NO /api/inventory
  parts:            '/api/parts',                 // ← CORRECTO (no /api/inventory)
  partById:         (id: string) => `/api/parts/${id}`,
  partAdjust:       (id: string) => `/api/parts/${id}/adjust`,

  // Técnicos
  technicians:      '/api/technicians',
  technicianById:   (id: string) => `/api/technicians/${id}`,

  // Dashboard
  dashboardKpis:    '/api/dashboard/kpis',
  dashboardUpcoming:'/api/dashboard/upcoming',
  dashboardAlerts:  '/api/dashboard/alerts',

  // Sync
  syncPush:         '/api/sync/push',
  syncPull:         '/api/sync/pull',
  syncStatus:       '/api/sync/status',
} as const;
```

### Correcciones en páginas (solo buscar y reemplazar URLs hardcodeadas)

En cada archivo de página (`Assets.tsx`, `WorkOrders.tsx`, `Maintenance.tsx`, `Parts.tsx`), **busca únicamente** cadenas de texto hardcodeadas con URLs incorrectas y reemplázalas por llamadas a `API_ENDPOINTS`. **No toques ningún otro código**.

Reemplazos exactos a hacer:

| URL incorrecta encontrada | Reemplazar por |
|--------------------------|----------------|
| `'/api/equipos'` | `API_ENDPOINTS.assets` |
| `'/api/workOrders'` | `API_ENDPOINTS.workOrders` |
| `'/api/inventory'` | `API_ENDPOINTS.parts` |
| `fetch('/api/work-orders/'+id+'/status')` | `fetch(API_ENDPOINTS.workOrderComplete(id))` |

---

## PROBLEMA 2 — Rutas faltantes en vercel.json

### Descripción
Las sub-rutas de completar OT, ejecutar PM y sync/status devuelven 404 porque no están declaradas en `vercel.json`.

### Corrección requerida en `vercel.json`

**REGLA**: Solo agrega las entradas faltantes al array `"rewrites"` o `"routes"`. NO elimines ni modifiques las entradas existentes.

Agrega estas rutas si no existen ya:

```json
{
  "source": "/api/work-orders/:id/complete",
  "destination": "/api/work-orders/[id]/complete"
},
{
  "source": "/api/maintenance/:id/execute",
  "destination": "/api/maintenance/[id]/execute"
},
{
  "source": "/api/parts/:id/adjust",
  "destination": "/api/parts/[id]/adjust"
},
{
  "source": "/api/sync/status",
  "destination": "/api/sync/status"
}
```

Si el `vercel.json` usa el formato `"functions"` en lugar de `"rewrites"`, adapta la sintaxis al formato ya existente. No cambies el formato global del archivo.

---

## PROBLEMA 3 — Schema mismatch: inglés (Dexie) vs español (Neon)

### Descripción
La capa API recibe datos de Dexie con nombres de campos en inglés y debe mapearlos a columnas Neon en español. El mapeo debe hacerse SOLO dentro de los archivos `api/*.ts`, nunca en el frontend ni en Dexie.

### Tabla de mapeo canónica (aplicar en todos los archivos api/)

#### Tabla `equipos` (Neon) ← store `assets` (Dexie)
```
Dexie field          → Neon column
─────────────────────────────────────
id                   → id
name                 → nombre
type                 → tipo
brand                → marca
model                → modelo
serialNumber         → numero_serie
location             → ubicacion
status               → estado
installDate          → fecha_instalacion
clientId             → cliente_id
lastUpdated          → ultima_actualizacion
```

#### Tabla `ordenes_trabajo` (Neon) ← store `workOrders` (Dexie)
```
Dexie field          → Neon column
─────────────────────────────────────
id                   → id
title                → titulo
description          → descripcion
type                 → tipo
priority             → prioridad
status               → estado
assetId              → equipo_id
assignedTo           → tecnico_id          ← CRÍTICO: este era el mismatch
scheduledDate        → fecha_programada
createdAt            → fecha_creacion
closedAt             → fecha_cierre
estimatedCost        → costo_estimado
actualCost           → costo_real
closingNotes         → notas_cierre
```

#### Tabla `mantenimiento_preventivo` (Neon) ← store `maintenance` (Dexie)
```
Dexie field          → Neon column
─────────────────────────────────────
id                   → id
name                 → nombre
assetId              → equipo_id
frequency            → frecuencia
nextDate             → proxima_fecha
lastDate             → ultima_fecha
status               → estado
checklistItems       → tareas_checklist    ← CRÍTICO: almacenar como JSON
assignedTo           → tecnico_asignado    ← CRÍTICO: campo faltante
```

#### Tabla `repuestos` (Neon) ← store `parts` (Dexie)
```
Dexie field          → Neon column
─────────────────────────────────────
id                   → id
code                 → codigo
name                 → nombre
description          → descripcion
currentStock         → stock_actual
minStock             → stock_minimo
unit                 → unidad
warehouseLocation    → ubicacion_bodega
supplierId           → proveedor_id
unitCost             → costo_unitario
```

### Implementación del mapeo en archivos API

En cada archivo `api/*.ts`, agrega funciones de mapeo puras. **Colócalas al inicio del archivo, antes de los handlers. No modifiques los handlers existentes salvo para llamar estas funciones**.

Ejemplo de patrón para `api/assets.ts`:

```typescript
// MAPEO DEXIE → NEON (agregar al inicio del archivo, no tocar lo demás)
function dexieToNeon_asset(d: Record<string, unknown>) {
  return {
    nombre:             d.name,
    tipo:               d.type,
    marca:              d.brand,
    modelo:             d.model,
    numero_serie:       d.serialNumber,
    ubicacion:          d.location,
    estado:             d.status ?? 'activo',
    fecha_instalacion:  d.installDate,
    cliente_id:         d.clientId,           // campo antes faltante
    ultima_actualizacion: new Date().toISOString(),
  };
}

function neonToDexie_asset(row: Record<string, unknown>) {
  return {
    id:           row.id,
    name:         row.nombre,
    type:         row.tipo,
    brand:        row.marca,
    model:        row.modelo,
    serialNumber: row.numero_serie,
    location:     row.ubicacion,
    status:       row.estado,
    installDate:  row.fecha_instalacion,
    clientId:     row.cliente_id,
    lastUpdated:  row.ultima_actualizacion,
  };
}
```

Replica este patrón para `work-orders.ts`, `maintenance.ts` y `parts.ts` usando la tabla de mapeo correspondiente.

---

## PROBLEMA 4 — Campos obligatorios faltantes en payloads

### Descripción
Al crear activos y planes PM, el frontend no envía campos que Neon tiene como NOT NULL.

### Corrección en `api/assets.ts` — handler POST

Dentro del handler POST, **antes de ejecutar el INSERT**, agrega validación de campos obligatorios. No cambies la estructura del handler, solo agrega este bloque de validación al inicio del handler POST:

```typescript
// Validación campos obligatorios — agregar al inicio del handler POST
const requiredFields = ['name', 'type', 'clientId'];
const missing = requiredFields.filter(f => !body[f]);
if (missing.length > 0) {
  return res.status(400).json({
    error: 'Campos obligatorios faltantes',
    fields: missing,
    mapping: missing.map(f => ({ dexie: f, neon: dexieToNeon_asset({[f]: null}) }))
  });
}
```

### Corrección en `api/maintenance.ts` — handler POST

Mismo patrón, campos obligatorios para mantenimiento preventivo:

```typescript
const requiredFields = ['name', 'assetId', 'frequency', 'nextDate', 'assignedTo'];
```

---

## PROBLEMA 5 — SyncEngine duplicado

### Descripción
Existen dos implementaciones de SyncEngine en el proyecto. Solo debe existir `src/lib/syncEngine.ts`. El duplicado debe eliminarse.

### Pasos exactos

1. Busca en todo el proyecto archivos que contengan la clase o función `SyncEngine` o `syncEngine`. Si encuentras más de una ubicación fuera de `src/lib/syncEngine.ts`, elimina el duplicado. **No elimines `src/lib/syncEngine.ts`**.

2. En el archivo canónico `src/lib/syncEngine.ts`, asegúrate de que el mapeo de entidades use la tabla canónica de este prompt:

```typescript
// En el método que construye el payload para /api/sync/push
// Asegúrate de que entity_type use estos valores exactos:
const ENTITY_TYPE_MAP = {
  assets:      'equipos',
  workOrders:  'ordenes_trabajo',
  maintenance: 'mantenimiento_preventivo',
  parts:       'repuestos',
  technicians: 'tecnicos',
} as const;
```

3. En `api/sync/push.ts`, el handler debe usar `entity_type` para saber a qué tabla Neon escribir. Si ya existe esta lógica, solo verifica que los nombres de tabla coincidan con `ENTITY_TYPE_MAP`. No reescribas la lógica completa.

---

## PROBLEMA 6 — Tablas faltantes en schema Neon

### Descripción
Las tablas `movimientos_inventario` y `sync_log` no existen en `scripts/init-db.ts`.

### Corrección en `scripts/init-db.ts`

**REGLA**: Solo agrega los CREATE TABLE faltantes al final del archivo. NO modifiques ni elimines los CREATE TABLE existentes.

Agrega al final:

```sql
-- Tabla de movimientos de inventario (faltaba en schema original)
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repuesto_id       UUID NOT NULL REFERENCES repuestos(id),
  tipo_movimiento   VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('entrada','salida','ajuste')),
  cantidad          INTEGER NOT NULL,
  motivo            TEXT,
  ot_id             UUID REFERENCES ordenes_trabajo(id),
  tecnico_id        UUID REFERENCES tecnicos(id),
  fecha             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de log de sincronización (faltaba en schema original)
CREATE TABLE IF NOT EXISTS sync_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(50) NOT NULL,
  operation     VARCHAR(10) NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
  entity_id     UUID NOT NULL,
  payload       JSONB,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','conflict')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_log_client ON sync_log(client_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_repuesto ON movimientos_inventario(repuesto_id);
```

---

## PROBLEMA 7 — Neon IP allowlist (acción manual requerida)

**Este problema NO puede resolverse con código.** Es una configuración de infraestructura.

Instrucción para Nelson (no para el agente IA):

```
ACCIÓN MANUAL REQUERIDA:
1. Ir a https://console.neon.tech
2. Seleccionar el proyecto CMMS HVAC PRO
3. Settings → IP Allow → deshabilitar restricción de IP
   O bien: agregar el rango 0.0.0.0/0 temporalmente para desarrollo
4. Para producción: usar variable de entorno NEON_PGBOUNCER=true
   y configurar connection pooling en lugar de IP allowlist
```

---

## ORDEN DE EJECUCIÓN RECOMENDADO

Ejecuta los cambios en este orden para minimizar riesgo de regresiones:

```
FASE 1 — Sin riesgo (solo agrega, no modifica):
  1. scripts/init-db.ts       → agrega tablas faltantes
  2. vercel.json              → agrega rutas faltantes

FASE 2 — Capa API (serverless, aislada del frontend):
  3. api/assets.ts            → agrega mapeo + validación
  4. api/work-orders.ts       → agrega mapeo
  5. api/work-orders/[id].ts  → agrega mapeo
  6. api/maintenance.ts       → agrega mapeo + validación
  7. api/parts.ts             → agrega mapeo
  8. api/parts/[id].ts        → agrega ajuste stock

FASE 3 — Capa de sync:
  9. api/sync/push.ts         → verifica ENTITY_TYPE_MAP
  10. api/sync/pull.ts        → verifica nombres de tabla
  11. src/lib/syncEngine.ts   → elimina duplicado, agrega ENTITY_TYPE_MAP

FASE 4 — Frontend (mayor riesgo, hacerlo al final):
  12. src/lib/api.ts          → corrige constantes de URL
  13. src/pages/Assets.tsx    → reemplaza URLs hardcodeadas
  14. src/pages/WorkOrders.tsx → reemplaza URLs hardcodeadas
  15. src/pages/Maintenance.tsx → reemplaza URLs hardcodeadas
  16. src/pages/Parts.tsx     → reemplaza URLs hardcodeadas
```

---

## VERIFICACIÓN POSTERIOR

Después de aplicar todos los cambios, el agente debe generar un reporte con este formato:

```
REPORTE DE CAMBIOS APLICADOS
=============================
Archivo: src/lib/api.ts
  - Cambio: [descripción exacta]
  - Líneas modificadas: [N a M]
  - Impacto: [qué resuelve]
  - Archivos afectados indirectamente: [lista]

[repetir para cada archivo]

ARCHIVOS NO MODIFICADOS (confirmación):
  ✅ package.json — no tocado
  ✅ tsconfig.json — no tocado
  ✅ vite.config.ts — no tocado
  ✅ src/components/ui/* — no tocados
  ✅ [resto de archivos fuera de la lista autorizada]

PENDIENTES MANUALES:
  ⚠ Neon IP allowlist — requiere acción en consola Neon
  ⚠ Ejecutar scripts/init-db.ts en Neon Console para crear tablas nuevas
```

---

*Prompt generado para: CMMS HVAC PRO IA Studio — Los Cabros*
*Fecha: Junio 2026*
*Repositorio: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO*
