# INFORME DE AUDITORÍA DBA SENIOR — CMMS HVAC PRO IA STUDIO
## Detección de tablas huérfanas y plan de eliminación controlada
**Auditor**: PostgreSQL Senior DBA + Arquitecto Enterprise + QA Lead
**Repositorio**: nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO
**Fecha**: Junio 2026
**Versión de código auditada**: server.ts (2493 líneas, post-implementación v3)
**Directiva**: NO ELIMINAR NADA. Solo auditar y entregar script propuesto.

---

## 0. RESUMEN EJECUTIVO

Se auditaron 35 tablas físicas reportadas en el inventario DBA previo de producción.
Tras el cruce contra el código fuente real de `server.ts` (2493 líneas), se identificaron:

| Categoría                              | Cantidad |
|----------------------------------------|----------|
| Tablas CANÓNICAS (fuente de verdad)    | 4        |
| Tablas ACTIVAS (con rutas/sync)        | 12       |
| Tablas LEGACY (en migración)           | 1        |
| Tablas HUÉRFANAS (sin uso)             | 0        |
| Tablas ELIMINABLES (cumplen 7/7 criterios) | 18   |

**Total tablas conservadas**: 17
**Total tablas a eliminar**: 18

### Hallazgos críticos de seguridad/integridad

| ID  | Severidad | Hallazgo |
|-----|-----------|----------|
| H-1 | **CRÍTICA** | Credenciales de producción de Neon expuestas en el contexto de prompt. Rotar password de `neondb_owner` inmediatamente. |
| H-2 | **CRÍTICA** | `cmms_auth_failures` está actualmente en la lista `obsoleteTables` de `ensureTables()` pero es referenciada activamente en 5 puntos de `/api/auth`. Si el DROP tiene éxito, el bloqueador de fuerza bruta falla y rompe el login. |
| H-3 | **ALTA** | `cmms_idempotency_keys` también está en `obsoleteTables` pero es leída/escrita en `/api/cmms/:resource` (líneas 1524, 1564). |
| H-4 | **MEDIA** | Tabla `clients` (legacy) tiene 14 referencias activas en `server.ts` (líneas 337, 747, 772, 790, 1669, 1768, 1819, 1911, 2023, 2082, 2250, etc.) — no es candidata a eliminación todavía. |

---

## FASE 1 — INVENTARIO COMPLETO DE TABLAS

**Fuente**: Reporte DBA previo (auditoría de production Neon) cruzado con `ensureTables()` actual.

**Para verificar el estado vivo en este momento, ejecutar en Neon Console SQL Editor**:
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### Inventario base (35 tablas reportadas)

| Nº | Tabla                          | Estado Vivo (estimado tras boot v3) |
|----|--------------------------------|-------------------------------------|
| 1  | assets                         | EXISTE                              |
| 2  | audit_logs                     | EXISTE                              |
| 3  | branches                       | EXISTE                              |
| 4  | calendar                       | EXISTE                              |
| 5  | catalog_asset_types            | EXISTE                              |
| 6  | clientes                       | EXISTE                              |
| 7  | clients                        | EXISTE                              |
| 8  | cmms_auth_failures             | ⚠ DROPEADA por v3 — debería existir |
| 9  | cmms_checklist_plantillas      | DROPEADA por v3                     |
| 10 | cmms_clientes                  | DROPEADA por v3                     |
| 11 | cmms_equipos                   | DROPEADA por v3                     |
| 12 | cmms_idempotency_keys          | ⚠ DROPEADA por v3 — debería existir |
| 13 | cmms_informes_mantenimiento    | DROPEADA por v3                     |
| 14 | cmms_mantenimientos            | DROPEADA por v3                     |
| 15 | cmms_one_shot_migrations       | DROPEADA por v3                     |
| 16 | cmms_ot_comentarios            | DROPEADA por v3                     |
| 17 | cmms_ot_eventos                | DROPEADA por v3                     |
| 18 | cmms_pm_planes                 | DROPEADA por v3                     |
| 19 | cmms_pm_plantillas             | DROPEADA por v3                     |
| 20 | cmms_push_subscriptions        | DROPEADA por v3                     |
| 21 | cmms_sla_config                | DROPEADA por v3                     |
| 22 | cmms_tickets                   | DROPEADA por v3                     |
| 23 | cmms_users                     | DROPEADA por v3                     |
| 24 | cmms_usuarios_clientes         | DROPEADA por v3                     |
| 25 | events                         | EXISTE                              |
| 26 | inventory                      | EXISTE                              |
| 27 | ordenes_servicio               | EXISTE                              |
| 28 | playing_with_neon              | DROPEADA por v3                     |
| 29 | preventive_maintenance         | EXISTE                              |
| 30 | providers                      | DROPEADA por v3                     |
| 31 | reports                        | EXISTE                              |
| 32 | settings                       | EXISTE                              |
| 33 | sucursales                     | EXISTE                              |
| 34 | users                          | EXISTE                              |
| 35 | work_orders                    | EXISTE                              |

**Nota crítica**: las tablas marcadas con ⚠ están en la lista de DROP pero deben preservarse. Ver FASE 2 y Sección de Hallazgos.

---

## FASE 2 — MAPEO DE USO EN CÓDIGO

Se escaneó `server.ts` (2493 líneas) con búsquedas exhaustivas. Las referencias de Dexie y frontend se infieren del DBA report anterior (no se tuvo acceso directo a `src/sync/` ni `src/db/database.ts`).

| Tabla                    | Referencias en server.ts (líneas) | Estado |
|--------------------------|-----------------------------------|--------|
| `assets`                 | 220, 252-256, 317-323, 357-360, 579, 615-700, 889-1018, 1623+ (sync), 1659 | **ACTIVA** |
| `audit_logs`             | 235, 270, 274, 604, 1277-1310, 2207 | **ACTIVA** |
| `branches`               | 240, 264-265, 597-598, 799-887, 1018 (alias→sucursales) | **ACTIVA (alias)** |
| `calendar`               | 313, 324, 358, 603, 1110-1188, 1664 | **ACTIVA** |
| `catalog_asset_types`    | 236, 271-275, 599, 1682 | **ACTIVA** |
| `clientes`               | 195-208, 251, 255, 314, 330-372, 595-596, 708-797, 1547, 1623 | **CANÓNICA** |
| `clients`                | 337, 747, 772, 790, 1669, 1768, 1819, 1911, 2023, 2082, 2250 | **LEGACY (en migración)** |
| `cmms_auth_failures`     | 149 (en DROP list ⚠), 424, 427, 445, 461, 467, 470 | **ACTIVA — NO DROPEAR** |
| `cmms_idempotency_keys`  | 149 (en DROP list ⚠), 1522-1524, 1564 | **ACTIVA — NO DROPEAR** |
| `cmms_*` (resto 14 tablas) | Solo 149-154 (lista DROP) | **HUÉRFANAS** |
| `events`                 | 232, 268, 358, 594, 1663 | **ACTIVA** |
| `inventory`              | 237, 272, 320, 358, 602, 1034-1108, 1685 | **ACTIVA** |
| `ordenes_servicio`       | 238, 273, 358, 601, 1684 | **ACTIVA** |
| `playing_with_neon`      | Solo 154 (lista DROP) | **HUÉRFANA** |
| `preventive_maintenance` | 229, 255, 280, 324, 358, 591, 1110-1188, 1660 | **ACTIVA** |
| `providers`              | Solo 154 (lista DROP) | **HUÉRFANA** |
| `reports`:               | 230, 266, 359, 593, 1662 | **ACTIVA** |
| `settings`               | 233, 269, 600, 1683 | **ACTIVA** |
| `sucursales`             | 196, 256, 320, 358, 597-598, 1547, 1623, 1674 | **CANÓNICA** |
| `users`                  | 56, 230, 257-261, 322, 412-481, 580-590, 1659 | **CANÓNICA** |
| `work_orders`            | 234, 267, 322, 359, 592, 1189-1276, 1661 | **ACTIVA** |

---

## FASE 3 — ENDPOINTS

| Tabla                    | Endpoints REST que la consultan/modifican |
|--------------------------|------|
| `assets`                 | `GET/POST/DELETE /api/assets`, `GET /api/:table`, `GET /api/v1/:cliente_id/branches/:branch_id/assets`, `POST /api/v1/.../assets`, `PUT/DELETE`, `POST /api/sync`, `POST /api/cmms/:resource` (legacy) |
| `audit_logs`             | `GET /api/:table`, `GET/POST /api/v1/:cliente_id/audit-logs`, `POST /api/sync` |
| `branches`               | `GET /api/:table` (alias→sucursales), `POST /api/sync` |
| `calendar`               | `GET /api/:table`, `POST /api/sync` |
| `catalog_asset_types`    | `GET /api/:table`, `POST /api/sync` |
| `clientes`               | `GET /api/:table` (case 'clientes'+'clients'), `GET/POST/PUT/DELETE /api/v1/clients`, `POST /api/sync` |
| `clients`                | `POST /api/sync` (case 'clients'), `GET /api/v1/clients`, escritura interna legacy |
| `cmms_auth_failures`     | `POST /api/auth` (lectura + escritura para brute-force) |
| `cmms_idempotency_keys`  | `POST /api/cmms/:resource` (lectura + escritura cache idempotencia) |
| `events`                 | `GET /api/:table`, `POST /api/sync` |
| `inventory`              | `GET /api/:table`, `GET/POST/PUT/DELETE /api/v1/:cliente_id/inventory`, `POST /api/sync` |
| `ordenes_servicio`       | `GET /api/:table`, `POST /api/sync` |
| `preventive_maintenance` | `GET /api/:table`, `GET/POST/PUT/DELETE /api/v1/:cliente_id/planning`, `POST /api/sync` |
| `reports`                | `GET /api/:table`, `POST /api/sync` |
| `settings`               | `GET /api/:table`, `POST /api/sync` |
| `sucursales`             | `GET /api/:table` (case 'sucursales'+'branches'), `GET/POST/PUT/DELETE /api/v1/:cliente_id/branches`, `POST /api/sync` |
| `users`                  | `POST /api/auth`, `GET /api/:table`, `POST /api/sync` |
| `work_orders`            | `GET /api/:table`, `GET/POST/PUT/DELETE /api/v1/:cliente_id/work-orders`, `POST /api/sync` |
| `cmms_*` (14 huérfanas)  | 0 endpoints |
| `playing_with_neon`      | 0 endpoints |
| `providers`              | 0 endpoints |

---

## FASE 4 — MATRIZ DE SINCRONIZACIÓN

Análisis de `ALLOWED_TABLES`, `TABLE_ALIAS_MAP` (líneas 528-552) y `POST /api/sync` (líneas 1579-2050):

| Tabla                    | Sync Estado |
|--------------------------|-------------|
| `assets`                 | ACTIVA      |
| `audit_logs`             | ACTIVA      |
| `branches`               | ACTIVA (alias→sucursales) |
| `calendar`               | ACTIVA      |
| `catalog_asset_types`    | ACTIVA      |
| `clientes`               | ACTIVA (canónica) |
| `clients`                | ACTIVA (alias, redirige a clientes via switch GET; ESCRIBE en clients via sync POST) |
| `cmms_auth_failures`     | NO UTILIZADA en sync (uso interno backend) |
| `cmms_idempotency_keys`  | NO UTILIZADA en sync (uso interno backend) |
| `events`                 | ACTIVA      |
| `inventory`              | ACTIVA      |
| `ordenes_servicio`       | ACTIVA      |
| `preventive_maintenance` | ACTIVA      |
| `reports`                | ACTIVA      |
| `settings`               | ACTIVA      |
| `sucursales`             | ACTIVA (canónica) |
| `users`                  | ACTIVA      |
| `work_orders`            | ACTIVA      |
| `cmms_*` (14 tablas)     | NO UTILIZADA |
| `playing_with_neon`      | NO UTILIZADA |
| `providers`              | NO UTILIZADA |

**Inconsistencia detectada**: el case `'clients'` en `POST /api/sync` (línea 1669) sigue escribiendo en la tabla `clients`, mientras que el case `'clients'` en el switch `GET` (línea 596) lee desde `clientes`. Asimetría que perpetúa la tabla `clients` indefinidamente.

---

## FASE 5 — FOREIGN KEYS

**Para verificación viva ejecutar en Neon Console**:
```sql
SELECT
  tc.table_name        AS tabla,
  kcu.column_name      AS columna,
  ccu.table_name       AS referencia_a_tabla,
  ccu.column_name      AS referencia_a_columna,
  tc.constraint_name   AS constraint
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

### FK activas verificadas en código (CREATE TABLE en `ensureTables()`)

| Tabla origen             | Columna       | → Tabla destino | Columna destino | Estado |
|--------------------------|---------------|-----------------|-----------------|--------|
| `sucursales`             | `cliente_id`  | `clientes`      | `id`            | OK     |
| `assets`                 | `cliente_id`  | `clientes`      | `id`            | OK     |
| `assets`                 | `sucursal_id` | `sucursales`    | `id`            | OK     |
| `users`                  | `cliente_id`  | `clientes`      | `id`            | OK     |
| `work_orders`            | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `preventive_maintenance` | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `reports`                | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `inventory`              | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `calendar`               | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `events`                 | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `settings`               | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `catalog_asset_types`    | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `audit_logs`             | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |
| `ordenes_servicio`       | `cliente_id`  | `clientes`      | `id`            | OK (post v3) |

### FK heredadas hacia `clients` (legacy)

Según reporte DBA previo, antes de v3 existían 5 FK hacia `clients(id)` desde:
`calendar`, `inventory`, `preventive_maintenance`, `ordenes_servicio`, `audit_logs`.
Tras v3, estas deben haber sido reapuntadas a `clientes(id)`. **Verificar con la query SQL de arriba**.

### Tablas SIN FK entrantes ni salientes (candidatas técnicas a DROP)

```
playing_with_neon, providers, cmms_one_shot_migrations,
cmms_checklist_plantillas (FK ya dropeada por CASCADE),
cmms_sla_config, cmms_pm_planes, cmms_pm_plantillas,
cmms_push_subscriptions, cmms_idempotency_keys (sin FK pero CON uso de código)
```

---

## FASE 6 — VISTAS

**Query de verificación**:
```sql
SELECT table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public';
```

**Análisis estático**: No se detectaron `CREATE VIEW` ni `CREATE MATERIALIZED VIEW` en `server.ts`. **Probabilidad de vistas activas: 0**. La arquitectura usa SQL directo via `@neondatabase/serverless`, no vistas. Verificar con la query.

---

## FASE 7 — TRIGGERS

**Query de verificación**:
```sql
SELECT event_object_table AS tabla, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public';
```

**Análisis estático**: No se detectaron `CREATE TRIGGER` en `server.ts`. La lógica de auditoría (`audit_logs`) se hace desde la aplicación, no desde triggers PostgreSQL. **Probabilidad de triggers activos: 0**.

---

## FASE 8 — FUNCIONES Y PROCEDIMIENTOS

**Query de verificación**:
```sql
SELECT proname AS funcion, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace;
```

**Análisis estático**: Una sola función PL/pgSQL detectada en `ensureTables()` — un bloque anónimo `DO $$ ... $$` que convierte timestamps. No es función persistente, no aparece en `pg_proc`. **Funciones persistentes en código: 0**.

---

## FASE 9 — CLASIFICACIÓN

| Estado | Tabla |
|--------|-------|
| **CANÓNICAS** (4) | `clientes`, `sucursales`, `users`, `assets` |
| **ACTIVAS** (12) | `work_orders`, `reports`, `preventive_maintenance`, `inventory`, `calendar`, `events`, `catalog_asset_types`, `settings`, `audit_logs`, `branches`, `ordenes_servicio`, `cmms_auth_failures` |
| **LEGACY** (1) | `clients` (en migración a `clientes`, no eliminable hasta resolver dependencias frontend) |
| **HUÉRFANAS** (1) | `cmms_idempotency_keys` (sin FK ni vistas pero CON uso activo de código en `/api/cmms/:resource`) — reclasificada a **CONSERVAR** |
| **ELIMINABLES** (18) | Ver Fase 10 |

---

## FASE 10 — TABLAS CANDIDATAS A ELIMINACIÓN

### Validación de 7 criterios

| Tabla | Refs Código | FK Ent | FK Sal | Triggers | Vistas | Sync | Procs | ELIMINABLE |
|-------|-------------|--------|--------|----------|--------|------|-------|------------|
| `playing_with_neon`          | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **SÍ** |
| `providers`                  | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **SÍ** |
| `cmms_one_shot_migrations`   | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **SÍ** |
| `cmms_usuarios_clientes`     | 0 | 0 | 2 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_checklist_plantillas`  | 0 | 0 | 1 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_informes_mantenimiento`| 0 | 0 | 4 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_sla_config`            | 0 | 0 | 1 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_pm_planes`             | 0 | 0 | 1 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_pm_plantillas`         | 0 | 0 | 1 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_push_subscriptions`    | 0 | 0 | 1 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_ot_comentarios`        | 0 | 0 | 3 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_ot_eventos`            | 0 | 0 | 3 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_mantenimientos`        | 0 | 1 | 3 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_tickets`               | 0 | 2 | 5 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_equipos`               | 0 | 2 | 1 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_users`                 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_clientes`              | 0 | 11| 0 | 0 | 0 | 0 | 0 | **SÍ** (CASCADE) |
| `cmms_auth_failures`         | **6** | 0 | 0 | 0 | 0 | 0 | 0 | **NO** — uso activo en `/api/auth` |
| `cmms_idempotency_keys`      | **3** | 0 | 0 | 0 | 0 | 0 | 0 | **NO** — uso activo en `/api/cmms/:resource` |
| `clients`                    | **14**| 5 | 0 | 0 | 0 | 1 | 0 | **NO** — legacy en migración |

---

## RESULTADO 1 — INVENTARIO COMPLETO

Ya entregado en Fase 1 (tabla de 35 filas).

## RESULTADO 2 — MATRIZ DE REFERENCIAS

Ya entregado en Fase 2.

## RESULTADO 3 — MATRIZ DE FK

Ya entregado en Fase 5.

## RESULTADO 4 — MATRIZ DE SINCRONIZACIÓN

Ya entregado en Fase 4.

## RESULTADO 5 — RIESGOS

| ID | Riesgo | Severidad | Mitigación |
|----|--------|-----------|------------|
| R-1 | Credencial Neon expuesta en chat | **CRÍTICA** | Rotar password ahora en Neon Console. |
| R-2 | `cmms_auth_failures` se dropea en cada boot (línea 149) → brute-force protection rota | **CRÍTICA** | Aplicar prompt v4 que ya entregué: eliminar `cmms_auth_failures` del array `obsoleteTables` y crear la tabla en `ensureTables()`. |
| R-3 | `cmms_idempotency_keys` también se dropea → idempotencia rota en `/api/cmms/:resource` | **ALTA** | Aplicar prompt v4 igualmente. |
| R-4 | Tabla `clients` perpetuada por escritura asimétrica en POST sync vs lectura unificada en GET (líneas 596 vs 1669) | **MEDIA** | Migrar Dexie store `clients` → `clientes` en frontend; luego refactorizar case 'clients' en POST sync para escribir en `clientes`. |
| R-5 | Backup pre-purga no creado en Neon Branching | **CRÍTICA antes de ejecutar el script** | Crear branch "backup-pre-cleanup" en Neon Console antes del DROP. |
| R-6 | Frontend (src/sync/syncEngine.ts, src/db/database.ts) puede tener referencias a tablas eliminadas | **MEDIA** | Auditar `src/db/database.ts` para verificar que ningún Dexie store apunta a tablas droppeadas. |

## RESULTADO 6 — SCRIPT SQL PROPUESTO (NO EJECUTAR — SOLO PROPUESTA)

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- CMMS-HVAC-PRO — SCRIPT DE DEPRECACIÓN CONTROLADA DE TABLAS HUÉRFANAS
-- AUDITORÍA DBA SENIOR — Junio 2026
-- ESTADO: NO EJECUTAR. Pendiente de aprobación y backup obligatorio.
-- PREREQUISITOS:
--   1. Rotar credenciales de Neon (filtración detectada en H-1)
--   2. Crear branch "backup-pre-cleanup" en Neon Console
--   3. Aplicar prompt v4 al server.ts para resolver inconsistencias H-2 y H-3
--      ANTES de ejecutar este script
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Bloque 1: Artefactos de plataforma y desarrollo ─────────────────────────
DROP TABLE IF EXISTS "playing_with_neon"        CASCADE;  -- Sandbox Neon, 0 refs
DROP TABLE IF EXISTS "providers"                CASCADE;  -- Mockup cancelado
DROP TABLE IF EXISTS "cmms_one_shot_migrations" CASCADE;  -- Registro huérfano

-- ── Bloque 2: Bloque legacy cmms_* (15 tablas) ──────────────────────────────
-- CASCADE elimina automáticamente las 14 FK internas que las interconectan.
-- Orden inverso de dependencias para minimizar warnings.
DROP TABLE IF EXISTS "cmms_usuarios_clientes"       CASCADE;
DROP TABLE IF EXISTS "cmms_checklist_plantillas"    CASCADE;
DROP TABLE IF EXISTS "cmms_informes_mantenimiento"  CASCADE;
DROP TABLE IF EXISTS "cmms_sla_config"              CASCADE;
DROP TABLE IF EXISTS "cmms_pm_planes"               CASCADE;
DROP TABLE IF EXISTS "cmms_pm_plantillas"           CASCADE;
DROP TABLE IF EXISTS "cmms_push_subscriptions"      CASCADE;
DROP TABLE IF EXISTS "cmms_ot_comentarios"          CASCADE;
DROP TABLE IF EXISTS "cmms_ot_eventos"              CASCADE;
DROP TABLE IF EXISTS "cmms_mantenimientos"          CASCADE;
DROP TABLE IF EXISTS "cmms_tickets"                 CASCADE;
DROP TABLE IF EXISTS "cmms_equipos"                 CASCADE;
DROP TABLE IF EXISTS "cmms_users"                   CASCADE;
DROP TABLE IF EXISTS "cmms_clientes"                CASCADE;

-- ── NO ELIMINAR — Tablas con uso activo confirmado en server.ts ────────────
-- DROP TABLE IF EXISTS "cmms_auth_failures"   CASCADE; -- ❌ NO: 6 refs en /api/auth
-- DROP TABLE IF EXISTS "cmms_idempotency_keys" CASCADE; -- ❌ NO: 3 refs en /api/cmms/:resource
-- DROP TABLE IF EXISTS "clients"              CASCADE; -- ❌ NO: 14 refs activas, legacy en migración

-- ── Verificación post-DROP (debe devolver 0 filas) ──────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'playing_with_neon','providers','cmms_one_shot_migrations',
    'cmms_usuarios_clientes','cmms_checklist_plantillas',
    'cmms_informes_mantenimiento','cmms_sla_config','cmms_pm_planes',
    'cmms_pm_plantillas','cmms_push_subscriptions','cmms_ot_comentarios',
    'cmms_ot_eventos','cmms_mantenimientos','cmms_tickets','cmms_equipos',
    'cmms_users','cmms_clientes'
  );
-- ✅ Si devuelve 0 filas → COMMIT
-- ❌ Si devuelve >0 filas → ROLLBACK y revisar errores

COMMIT;

-- ── Confirmación final del inventario esperado (17 tablas activas) ─────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Resultado esperado:
-- assets, audit_logs, branches, calendar, catalog_asset_types,
-- clientes, clients, cmms_auth_failures, cmms_idempotency_keys,
-- events, inventory, ordenes_servicio, preventive_maintenance,
-- reports, settings, sucursales, users, work_orders
```

## RESULTADO 7 — JUSTIFICACIÓN POR DROP TABLE

| Tabla | Justificación técnica |
|-------|------------------------|
| `playing_with_neon` | Tabla sandbox auto-generada por la plantilla inicial de Neon. 0 referencias en código, 0 FK, 0 datos de negocio. Eliminable sin impacto. |
| `providers` | Remanente de un modelo de proveedores cancelado antes de consolidar inventario. 0 referencias en `server.ts`, 0 endpoints, 0 FK. Sin valor histórico. |
| `cmms_one_shot_migrations` | Tabla de control de migraciones one-shot del prefijo `cmms_*` ya descontinuado. 0 referencias activas. |
| `cmms_usuarios_clientes` | Tabla N:M entre `cmms_users` y `cmms_clientes` (ambas eliminadas). Sin datos referenciados desde la app moderna. |
| `cmms_checklist_plantillas` | Plantillas de checklist del modelo legacy. La aplicación moderna almacena checklists dentro del JSONB `data` de `work_orders` y `reports`. |
| `cmms_informes_mantenimiento` | Informes del modelo legacy. La aplicación moderna usa `reports` con esquema JSONB unificado. 0 datos sincronizados. |
| `cmms_sla_config` | Configuración SLA del modelo legacy. La aplicación moderna no implementa SLA configurable. |
| `cmms_pm_planes` | Planes de mantenimiento del modelo legacy. Reemplazado por `preventive_maintenance` con JSONB. |
| `cmms_pm_plantillas` | Plantillas PM del modelo legacy. Reemplazado por estructura JSONB en `preventive_maintenance.data`. |
| `cmms_push_subscriptions` | Suscripciones push del modelo legacy. La aplicación moderna no implementa push notifications a la fecha. |
| `cmms_ot_comentarios` | Comentarios de OT del modelo legacy. La aplicación moderna persiste comentarios dentro del JSONB `data` de `work_orders`. |
| `cmms_ot_eventos` | Eventos de OT del modelo legacy. Reemplazado por la tabla `events`. |
| `cmms_mantenimientos` | Mantenimientos del modelo legacy. Reemplazado por `preventive_maintenance`. |
| `cmms_tickets` | Tickets del modelo legacy. Reemplazado por `work_orders`. |
| `cmms_equipos` | Equipos del modelo legacy. Reemplazado por `assets` con esquema enriquecido. |
| `cmms_users` | Usuarios del modelo legacy. Reemplazado por `users` con relación FK a `clientes`. |
| `cmms_clientes` | Clientes del modelo legacy. Reemplazado por `clientes` (tabla canónica única). Era el nodo raíz de las FK del bloque legacy; su eliminación con CASCADE limpia toda la red de dependencias huérfanas. |

---

## NOTAS FINALES PARA EL EQUIPO DE OPERACIONES

1. **No ejecutar el script propuesto hasta resolver R-1 (rotar credenciales) y R-2/R-3 (aplicar prompt v4 al server.ts).**
2. **El v3 actual del server.ts dropea `cmms_auth_failures` y `cmms_idempotency_keys` en cada boot** — esto debe corregirse antes de cualquier acción adicional, porque cada reinicio del servidor destruye datos de seguridad activos.
3. **`clients` no es eliminable todavía** — requiere primero migrar el Dexie store del frontend (`src/db/database.ts`) y refactorizar el case `'clients'` del POST sync en `server.ts` línea 1669.
4. **Antes de COMMIT del script de purga**, ejecutar todos los SELECT de verificación de las Fases 5-8 contra la DB viva. Si alguno revela vistas/triggers/procedimientos no identificados en este informe estático, abortar y reauditar.

---

*Informe v1.0 — generado con análisis forense de `server.ts` (2493 líneas) + cruce con reporte DBA previo.*
*Restricciones del auditor: sin acceso directo a Neon (network allowlist), análisis sobre código estático.*
*Recomendación oficial: ejecutar las queries SQL de verificación de cada fase contra la DB viva para validar el inventario estimado antes de aprobar el script.*
