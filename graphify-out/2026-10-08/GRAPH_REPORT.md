# Graph Report - MAESTRO-COMERCIAL (2026-10-07)

## Corpus Check

- 198 files · ~140,404 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 36 file(s) not represented in the graph (top: .css 15, (none) 14, .bat 4)

## Summary

- 1714 nodes · 2908 edges · 139 communities (98 shown, 41 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 95 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)

- Flujo de Cotizaciones
- Routers Admin y Dashboard
- Sync Offline Dexie
- Router de Autenticacion
- Resumen Comercial Semanal
- Tablas Canonicas CMMS
- Endpoints de Assets
- Cliente API Frontend
- Dependencias Backend
- API Clientes y Proyectos
- Auditoria Tablas DBA
- CI y Auditoria de Diseno
- Costos de Proyectos
- Dependencias Raiz
- Catalogo y Router Clientes
- Dashboard KPIs
- Tests de Accesibilidad
- Endpoints Legacy Assets
- Store Maestro de Precios
- Bugs y Checklist BravoCRM
- Esquemas de Cotizaciones
- Dependencias Frontend
- Servidor Dev Offline
- Autocompletado de Catalogo
- API Cotizaciones
- Validacion de Entorno
- Exportacion a Word
- TSConfig Frontend
- TSConfig Backend
- Dev Dependencies Testing
- Costeo y Errores API
- Dev Dependencies Lint
- Modelos de Factura
- Logistica y Distancias
- API Facturas
- ADR Entrypoint Unico
- Tests Seguimiento Facturas
- Despliegue Vercel y CI
- Rutas Principales App
- Scripts NPM
- Endpoints Nucleo server.ts
- UI Gestion de Clientes
- Dev Dependencies Git Hooks
- TSConfig Raiz
- Dependencias Runtime Backend
- Rate Limiting
- Migracion Baseline
- Hallazgos de Seguridad
- Correcciones CMMS Sync
- Presupuesto de Bundle
- Dependencias Runtime (dup)
- Router de Cotizaciones
- Throttle de Autenticacion
- Fases BravoCRM
- Handler Vercel API
- Pipeline CI y Staging
- Backup y Recuperacion DR
- Tablas Duales Clientes-Assets
- Endpoints REST Core
- Dependencias Export-Dexie
- UI Toast y Confirmacion
- Gantt de Proyectos
- Config y Validacion API
- Login JWT LocalStorage
- Tablas Legacy CMMS
- Scripts Dev Backend
- Config ESLint
- Infra Produccion Neon-Postgres
- Scripts Build y Lint
- Manifest PWA
- Tests Importacion Cotizaciones
- Seguridad JWT y CORS
- Runbook de Incidentes
- Documentacion Arquitectura
- Clasificacion Datos Personales
- Auditoria Forense CMMS
- Sync Dexie-Neon Dual Schema
- Migracion FK Clientes
- UI Facturas
- TSConfig Node
- Tests Paginacion
- Prompt Correccion DBA v3
- Config Vercel Rewrites
- Cumplimiento Legal Datos
- Inicializacion Sentry
- Tests API Clientes
- Tests Pagos Facturas
- Configuracion CORS
- Paginacion por Cursor
- Kanban de Proyectos
- Config Prettier
- Tests OC Cotizaciones
- Tests Estado Cotizaciones
- Stack Local de Desarrollo
- TSConfig Build
- Gap de Permisos por Rol
- RNF y Checklist de PR
- Shell PWA
- Config Vite
- Modulos Comerciales Proximos
- Derechos ARCO y Anonimizacion
- Antipatron Conexiones Serverless
- Smoke Test Script
- Engines Node (dup)
- Server Dev sin Fallback
- Base de Datos JSON Local
- Logging de Errores
- API Sin Versionado
- Service Worker Precache
- Trazabilidad de Requests
- Plantillas de Auditoria
- Engines Node
- Tabla Work Orders
- Presupuesto de Bundle Detalle
- SLO de Disponibilidad
- Icono App 192px
- Icono App 512px
- Logo NBYB

## God Nodes (most connected - your core abstractions)

1. `useMaestro` - 39 edges
2. `createQuotationsRouter()` - 33 edges
3. `authMiddleware()` - 24 edges
4. `logger` - 22 edges
5. `supertest` - 20 edges
6. `validate()` - 19 edges
7. `react` - 19 edges
8. `createAuthRouter()` - 18 edges
9. `downloadDocx()` - 18 edges
10. `compilerOptions` - 18 edges

## Surprising Connections (you probably didn't know these)

- `Mailer` --implements--> `Opción B: SMTP Gmail con contraseña de aplicación` [EXTRACTED]
  backend/src/services/mailer.ts → docs/EMAIL_SETUP.md
- `Claim 'kind' distingue access vs refresh token` --implements--> `authMiddleware()` [EXTRACTED]
  docs/ADR_TOKEN_STORAGE.md → backend/src/middleware/auth.ts
- `Mailer` --implements--> `NoopMailer (fallback sin proveedor configurado)` [EXTRACTED]
  backend/src/services/mailer.ts → docs/EMAIL_SETUP.md
- `Mailer` --implements--> `Opción A: Resend + dominio propio (SPF/DKIM/DMARC)` [EXTRACTED]
  backend/src/services/mailer.ts → docs/EMAIL_SETUP.md
- `Política de retención: 7 diarios + 4 semanales + 12 mensuales` --semantically_similar_to--> `Procedimiento de restauración (pg_restore en BD limpia, nunca producción)` [INFERRED] [semantically similar]
  .github/workflows/backup.yml → docs/DR_RUNBOOK.md

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **Secret PROD_DATABASE_URL compartido entre workflows programados** — docs_infra_proddatabaseurl, github_workflows_backup_workflow, github_workflows_ci_migrateproductionjob, github_workflows_cleanup_sessions_workflow, github_workflows_weekly_commercial_summary_workflow [INFERRED 0.95]
- **Gate de CI/CD pendiente (A-09): branch protection + deploy en paralelo a Vercel** — docs_despliegue_overview, docs_despliegue_branchprotection, github_workflows_ci_workflow, docs_hallazgos_bloqueados_a09cd [INFERRED 0.85]
- **Cadena de integridad de respaldo y recuperación** — github_workflows_backup_workflow, github_workflows_backup_pgrestorelist, docs_dr_runbook_overview, docs_dr_runbook_restauracion [INFERRED 0.85]
- **Fragmentación pre-ADR: cuatro definiciones distintas de 'el backend' unificadas en app.ts** — docs_adr_0001_entrypoint_unico_app_ts, docs_adr_0001_entrypoint_unico_server_ts, docs_adr_0001_entrypoint_unico_server_dev_ts, docs_adr_0001_entrypoint_unico_api_index_ts [EXTRACTED 1.00]
- **Diseño de automatización segura de migraciones en producción: motivado por el incidente, garantizado por expand-migrate-contract** — docs_migraciones_migrate_production_job, docs_migraciones_expand_migrate_contract, docs_migraciones_incident_20260909 [INFERRED 0.85]
- **Brecha de cumplimiento de protección de datos a cerrar antes de diciembre 2026** — docs_registro_tratamiento_ley_21719, docs_registro_tratamiento_arco, docs_registro_tratamiento_anonimizacion [INFERRED 0.75]
- **Tablas con FK hacia clientes (hub canónico post v3)** — docs_historico_auditoria_dba_huerfanas_v1_clientes, docs_historico_auditoria_dba_huerfanas_v1_sucursales, docs_historico_auditoria_dba_huerfanas_v1_assets, docs_historico_auditoria_dba_huerfanas_v1_users, docs_historico_auditoria_dba_huerfanas_v1_work_orders, docs_historico_auditoria_dba_huerfanas_v1_reports, docs_historico_auditoria_dba_huerfanas_v1_preventive_maintenance, docs_historico_auditoria_dba_huerfanas_v1_audit_logs [INFERRED 0.85]
- **Tablas listadas en obsoleteTables pese a uso activo (bug de boot)** — docs_historico_auditoria_dba_huerfanas_v1_obsoletetables, docs_historico_auditoria_dba_huerfanas_v1_cmms_auth_failures, docs_historico_auditoria_dba_huerfanas_v1_cmms_idempotency_keys [EXTRACTED 1.00]
- **Prerrequisitos obligatorios antes de ejecutar el script DROP** — docs_historico_auditoria_dba_huerfanas_v1_h1_credencial_neon, docs_historico_auditoria_dba_huerfanas_v1_backup_pre_cleanup_branch, docs_historico_auditoria_dba_huerfanas_v1_prompt_v4, docs_historico_auditoria_dba_huerfanas_v1_drop_script [EXTRACTED 1.00]
- **Familias de tablas paralelas sin sincronización (JSON-blob vs normalizada)** — docs_historico_auditoria_senior_cmms_hvac_pro_assets_table, docs_historico_auditoria_senior_cmms_hvac_pro_cmms_equipos_table, docs_historico_auditoria_senior_cmms_hvac_pro_tablealiasmap [INFERRED 0.85]
- **Conflicto de FK entre assets, clientes y clients** — docs_historico_auditoria_senior_cmms_hvac_pro_assets_table, docs_historico_auditoria_senior_cmms_hvac_pro_clientes_table, docs_historico_auditoria_senior_cmms_hvac_pro_clients_table [EXTRACTED 1.00]
- **Pipeline de sincronización Dexie → syncEngine → Neon** — docs_historico_auditoria_senior_cmms_hvac_pro_dexie, docs_historico_auditoria_senior_cmms_hvac_pro_syncengine_ts, docs_historico_auditoria_senior_cmms_hvac_pro_neon_postgresql [INFERRED 0.85]

## Communities (139 total, 41 thin omitted)

### Community 0 - "Flujo de Cotizaciones"

Cohesion: 0.08
Nodes (47): GET /api/quotations, db.json (persistencia), Módulo Clientes (próximo), Módulo Reportes (próximo), Estados de cotización: Draft/Sent/Accepted/Rejected, Quotations.css, React 19 + TypeScript, patch() (+39 more)

### Community 1 - "Routers Admin y Dashboard"

Cohesion: 0.09
Nodes (30): createAdminRouter(), secretMatches(), createDashboardRouter(), allowedOrigins, app, pool, captureException(), sentryEnabled (+22 more)

### Community 2 - "Sync Offline Dexie"

Cohesion: 0.08
Nodes (34): BravoCRMDatabase, db, ApiError, ApiResponse, AppConfig, AuditAction, AuditLog, CatalogItem (+26 more)

### Community 3 - "Router de Autenticacion"

Cohesion: 0.09
Nodes (26): createAuthRouter(), expiresInSeconds(), hashToken(), safeUser(), signAccessToken(), signRefreshToken(), buildApp(), FakeUser (+18 more)

### Community 4 - "Resumen Comercial Semanal"

Cohesion: 0.08
Nodes (25): AlertQuotation, buildEmailHtml(), buildMarkdownSummary(), ExecutivePerformance, generateWeeklyCommercialSummary(), GlobalKpis, RECIPIENTS, TopClient (+17 more)

### Community 5 - "Tablas Canonicas CMMS"

Cohesion: 0.12
Nodes (33): ALLOWED_TABLES — constante C-2: lista las 8 tablas canónicas permitidas para sync, POST /api/ocr — handler C-5: OCR de placas HVAC vía Gemini, Tabla 'assets' — equipos HVAC del cliente (cliente_id), Tabla 'calendar' — eventos y agenda del cliente, Tabla 'clientes' — tabla maestra canónica de tenants (elegida sobre 'clients'), Tabla 'clients' — duplicado JSON-blob en inglés, sin ruta GET propia, migrada y eliminada, Repositorio nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO (rama main), Familia de tablas cmms_* (17 tablas normalizadas: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, etc.) — sin ninguna ruta activa, eliminadas en bloque (+25 more)

### Community 6 - "Endpoints de Assets"

Cohesion: 0.08
Nodes (33): api/assets/[id].ts, api/assets.ts, API_ENDPOINTS — URLs canónicas kebab-case (work-orders, parts, no inventory), api/maintenance/[id].ts, api/maintenance.ts, api/parts/[id].ts, api/parts.ts, api/sync/pull.ts (+25 more)

### Community 7 - "Cliente API Frontend"

Cohesion: 0.08
Nodes (25): clearAuth(), CursorPage, del(), doRefresh(), ElectricalCatalogRow, get(), getToken(), ImportQuotationReport (+17 more)

### Community 8 - "Dependencias Backend"

Cohesion: 0.06
Nodes (31): bcryptjs, body-parser, cors, dotenv, eslint, @eslint/js, express, express-rate-limit (+23 more)

### Community 9 - "API Clientes y Proyectos"

Cohesion: 0.11
Nodes (26): withContacts(), normalizeStatus(), VALID_STATUS, clientCreateSchema, clientUpdateSchema, contactCreateSchema, contactSchema, contactUpdateSchema (+18 more)

### Community 10 - "Auditoria Tablas DBA"

Cohesion: 0.09
Nodes (31): ALLOWED_TABLES / TABLE_ALIAS_MAP (líneas 528-552), tabla assets (CANÓNICA), tabla audit_logs (ACTIVA, auditoría sin triggers), Neon branch "backup-pre-cleanup" (R-5), tabla clientes (CANÓNICA), tabla clients (LEGACY en migración), tabla cmms_auth_failures (bloqueador brute-force), tabla cmms_clientes (raíz FK del bloque legacy) (+23 more)

### Community 11 - "CI y Auditoria de Diseno"

Cohesion: 0.10
Nodes (26): AC-9.7: dependencias runtime duplicadas root/backend, Job CI vercel-function, BASELINE_PATH, contrast(), countCssColors(), cssColorCounts(), DesignBaseline, hexToRgb() (+18 more)

### Community 12 - "Costos de Proyectos"

Cohesion: 0.11
Nodes (27): CATEGORY_LABELS, CostForm, CostosTab(), CostosTabProps, CreateModalProps, emptyCostForm(), EquipoTab(), EquipoTabProps (+19 more)

### Community 13 - "Dependencias Raiz"

Cohesion: 0.06
Nodes (30): bcryptjs, body-parser, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken (+22 more)

### Community 14 - "Catalogo y Router Clientes"

Cohesion: 0.16
Nodes (20): CATEGORIES, createCatalogRouter(), groupedCatalog(), createClientsRouter(), createConfigRouter(), createElectricalCatalogRouter(), createInvoicesRouter(), createProjectsRouter() (+12 more)

### Community 15 - "Dashboard KPIs"

Cohesion: 0.08
Nodes (21): GET /api/dashboard/kpis, CostIndicator component, Dashboard.css, ACCENT_TEXT, AGING_TRAMOS, CAT_COLORS, CAT_LABELS, Dashboard() (+13 more)

### Community 16 - "Tests de Accesibilidad"

Cohesion: 0.18
Nodes (14): BOTONES, DASHBOARD_VACIO, frontend_e2e_fixtures_expect, fakeProject(), mockOneProject(), openScreen(), Screen, SCREENS (+6 more)

### Community 17 - "Endpoints Legacy Assets"

Cohesion: 0.11
Nodes (26): ALLOWED_TABLES, GET /api/assets endpoint (duplicada, eliminada), POST /api/assets endpoint, /api/auth endpoint, POST /api/cmms/:resource endpoint, POST /api/sync endpoint, Bug crítico #1 — cmms_auth_failures en DROP list, Bug crítico #2 — GET /api/assets duplicada sombrea switch de sync (+18 more)

### Community 18 - "Store Maestro de Precios"

Cohesion: 0.12
Nodes (24): ImportQuotationResult, baseCorrelative(), DEFAULT_CATALOGS, DEFAULT_CATEGORIES, DEFAULT_COMMERCIAL, DEFAULT_COMMERCIAL_MAINTENANCE, DEFAULT_EXCLUSIONS, DEFAULT_EXCLUSIONS_MAINTENANCE (+16 more)

### Community 19 - "Bugs y Checklist BravoCRM"

Cohesion: 0.11
Nodes (25): Backend API (localhost:3000), BravoCRM, BUG #1: JWT Validation, BUG #3: Soft-Delete, Checklist Final (pre Fases 5-8), CostIndicator (componente dashboard), CRUD Clientes (T3.1), CRUD Cotizaciones (T3.2) (+17 more)

### Community 20 - "Esquemas de Cotizaciones"

Cohesion: 0.08
Nodes (23): ACTIVITY_TYPES, CATEGORY_IDS, categoryInputSchema, FREQUENCIES, KINDS, lineItemInputSchema, LOSS_REASONS, OPER_STATES (+15 more)

### Community 21 - "Dependencias Frontend"

Cohesion: 0.08
Nodes (23): browserslist, engines, node, eslint, @eslint/js, globals, typescript, vitest (+15 more)

### Community 22 - "Servidor Dev Offline"

Cohesion: 0.12
Nodes (17): addDaysISO(), app, AuthReq, buildQuotationFull(), calcInvoiceBalance(), calcQuotationTotals(), DB, DB_PATH (+9 more)

### Community 23 - "Autocompletado de Catalogo"

Cohesion: 0.12
Nodes (19): Catalogo, CatalogAutocomplete(), DIST_ITEM, DropPos, fmtCLP, Props, avgPrice(), CAT_META (+11 more)

### Community 24 - "API Cotizaciones"

Cohesion: 0.13
Nodes (20): CATEGORY_COLORS, CATEGORY_IDS, CATEGORY_LABELS, fetchUfValue(), findCatalogMatch(), isValidRut(), normalizeRut(), normalizeRutDigits() (+12 more)

### Community 25 - "Validacion de Entorno"

Cohesion: 0.15
Nodes (14): env, envSchema, EnvValidationError, loadEnv(), validEnv, AuthRequest, isAccessToken(), optionalAuth() (+6 more)

### Community 26 - "Exportacion a Word"

Cohesion: 0.20
Nodes (20): Align, blank(), C, clientRow(), darkCell(), downloadDocx(), equivalentRow(), fmtDateLong() (+12 more)

### Community 27 - "TSConfig Frontend"

Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowSyntheticDefaultImports, esModuleInterop, isolatedModules, jsx, lib, module (+12 more)

### Community 28 - "TSConfig Backend"

Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, ignoreDeprecations, lib, module, moduleResolution (+11 more)

### Community 29 - "Dev Dependencies Testing"

Cohesion: 0.10
Nodes (20): devDependencies, @axe-core/playwright, esbuild, eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+12 more)

### Community 30 - "Costeo y Errores API"

Cohesion: 0.15
Nodes (17): api, ApiError, CosteoRow(), calcCat(), generateCorrelative(), emptyItems(), makeCategory(), makeItem() (+9 more)

### Community 31 - "Dev Dependencies Lint"

Cohesion: 0.11
Nodes (19): devDependencies, eslint, @eslint/js, globals, node-pg-migrate, supertest, tsx, @types/bcryptjs (+11 more)

### Community 32 - "Modelos de Factura"

Cohesion: 0.13
Nodes (17): Invoice, InvoiceDetail, InvoicePayment, InvoicePaymentState, InvoiceSummary, Invoices, clp(), DetalleFactura() (+9 more)

### Community 33 - "Logistica y Distancias"

Cohesion: 0.13
Nodes (12): Logistica, KPIs, CITIES, IDX, M, CityDistances, loadCityDistances(), useCityDistances() (+4 more)

### Community 34 - "API Facturas"

Cohesion: 0.16
Nodes (16): resolveDueDate(), DOC_TYPE, factoringUpsertSchema, FINANCING_STATUS, FINANCING_TYPE, invoiceCreateSchema, invoiceDocumentSchema, invoiceFollowUpSchema (+8 more)

### Community 35 - "ADR Entrypoint Unico"

Cohesion: 0.12
Nodes (18): ADR 0001: un solo entrypoint de aplicación, api/index.ts (handler de Vercel), backend/src/app.ts (única definición de middlewares/routers/errores), backend/src/server.ts (npm run dev), 0009-billing-flow (migración), .github/workflows/ci.yml, Regla expand → migrate → contract, Incidente 2026-09-09: columna loss_reason faltante en producción (+10 more)

### Community 36 - "Tests Seguimiento Facturas"

Cohesion: 0.13
Nodes (7): buildApp(), makeFakeDb(), basePayload, buildApp(), makeFakeDb(), baseRow, ref_vitest

### Community 37 - "Despliegue Vercel y CI"

Cohesion: 0.16
Nodes (16): Branch protection de GitHub (gate pendiente para cerrar A-09), Variables de entorno requeridas en Vercel, Flujo actual: Vercel despliega en paralelo a CI (gap A-09), migrate-production resuelve migraciones automáticas pre-deploy (A-09 parcial), Despliegue — BravoCRM (Vercel autodeploy + CI), Rollback: vercel rollback / Promote to Production, Opción B: SMTP Gmail con contraseña de aplicación, A-09: CD con gates, migraciones y rollback (parcial) (+8 more)

### Community 38 - "Rutas Principales App"

Cohesion: 0.14
Nodes (13): App(), Clients, Dashboard, Maintenance, NavSyncButton(), Page, Projects, Quotations (+5 more)

### Community 39 - "Scripts NPM"

Cohesion: 0.13
Nodes (15): scripts, build, cleanup:sessions, dev, dev:json, lint, migrate, migrate:create (+7 more)

### Community 40 - "Endpoints Nucleo server.ts"

Cohesion: 0.16
Nodes (15): constante ALLOWED_TABLES (server.ts), POST /api/auth (login PIN), GET /api/health, POST /api/ocr (Gemini OCR placas HVAC), POST /api/sync (push), C-3: Reemplazo de ALLOWED_TABLES y TABLE_ALIAS_MAP, C-5: Inyección de cliente_id en POST /api/sync, C-6: Modelo Gemini inexistente en /api/ocr (+7 more)

### Community 41 - "UI Gestion de Clientes"

Cohesion: 0.24
Nodes (12): ClientForm(), ClientFormProps, Clients(), emptyClient(), emptyContact(), withContactList(), frontend_src_styles_clients, MasterClient (+4 more)

### Community 42 - "Dev Dependencies Git Hooks"

Cohesion: 0.13
Nodes (15): devDependencies, @commitlint/cli, @commitlint/config-conventional, concurrently, husky, lint-staged, prettier, @types/bcryptjs (+7 more)

### Community 43 - "TSConfig Raiz"

Cohesion: 0.13
Nodes (14): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, ignoreDeprecations, lib, module, moduleResolution, outDir (+6 more)

### Community 44 - "Dependencias Runtime Backend"

Cohesion: 0.14
Nodes (14): dependencies, bcryptjs, body-parser, cors, dotenv, express, express-rate-limit, helmet (+6 more)

### Community 45 - "Rate Limiting"

Cohesion: 0.19
Nodes (10): adminSetupLimiter(), adminSetupLimiterOptions, apiLimiter(), apiLimiterOptions, forgotPasswordLimiter(), forgotPasswordLimiterOptions, loginLimiter(), loginLimiterOptions (+2 more)

### Community 46 - "Migracion Baseline"

Cohesion: 0.15
Nodes (9): fs, path, schemaPath, fs, path, sqlPath, Tabla project_tasks, ref_fs (+1 more)

### Community 47 - "Hallazgos de Seguridad"

Cohesion: 0.15
Nodes (14): A-01: Validación de entrada con zod en rutas de escritura, A-02: Sesiones revocables (refresh hasheado, rotación, logout/logout-all), A-03/A-04: Recuperación y política de contraseña (min 8 chars, reemplaza PIN), A-05: TLS rejectUnauthorized true + PII enmascarada en logs, C-10: RBAC en operaciones destructivas y cambios de estado, C-11: node-pg-migrate reemplaza scripts SQL sueltos, commitlint + husky (Conventional Commits), Remediación de hallazgos críticos (ALLOW_NO_PIN, credenciales hardcodeadas eliminadas) (+6 more)

### Community 48 - "Correcciones CMMS Sync"

Cohesion: 0.16
Nodes (14): Endpoints /api/:table, /api/sync/:table, POST /api/sync, ARCHITECTURE.md, CMMS HVAC PRO IA STUDIO (repositorio), CORRECCIÓN C-2: Ampliar detección de firma en validateWorkOrderPayload, CORRECCIÓN C-6: Corregir URLs de endpoints sync en syncEngine.ts, CORRECCIÓN C-7: Verificar schema del mock en mockDb.ts, createMockSql() / mock_db_store.json, Dexie (IndexedDB) / sync_queue (+6 more)

### Community 49 - "Presupuesto de Bundle"

Cohesion: 0.14
Nodes (13): alcanzable, cityChunkKey, distDir, eagerAssets, entry, html, indexHtmlPath, manifest (+5 more)

### Community 50 - "Dependencias Runtime (dup)"

Cohesion: 0.14
Nodes (14): dependencies, bcryptjs, body-parser, cors, dotenv, express, express-rate-limit, helmet (+6 more)

### Community 51 - "Router de Cotizaciones"

Cohesion: 0.17
Nodes (12): createQuotationsRouter(), fullQuotation(), normalizeFrequency(), normalizeKind(), normalizeOperState(), normalizeStatus(), paramString(), replaceChildren() (+4 more)

### Community 52 - "Throttle de Autenticacion"

Cohesion: 0.23
Nodes (10): AuthThrottleOptions, createAuthThrottle(), ipAndEmailKey(), ipKey(), motivo(), buildApp(), FakeState, MENSAJE (+2 more)

### Community 53 - "Fases BravoCRM"

Cohesion: 0.15
Nodes (13): BravoCRM, docker-compose.yml, Docker Desktop, Fases 1-4 (Setup Base, Auth JWT, CRUD, Dashboard KPIs) - completadas, Fases 5-8 (Sincronizacion Neon, Error handling, Refactor frontend, Deploy Vercel+Neon) - pendientes, Git (opcional), Neon (PostgreSQL / sincronizacion online-first), Node.js 18+ (+5 more)

### Community 54 - "Handler Vercel API"

Cohesion: 0.23
Nodes (11): AppHandler, buildUnavailableApp(), describeStartupError(), handler(), HAS_DB, loadApp(), backend/src/app.ts (única definición de la app), backend/src/server.ts (solo app.listen()) (+3 more)

### Community 55 - "Pipeline CI y Staging"

Cohesion: 0.17
Nodes (12): C-06/A-12: Pipeline de CI (tipos, lint, tests con cobertura, audit, scan de secretos, build), A-08: Entorno de staging (nada implementado), A-14: Pruebas contra PostgreSQL real (parcial), A-15: Pruebas end-to-end Playwright (no implementado), A-18: Plan de recuperación ante desastres (parcial), Hallazgos bloqueados por acceso externo, Job commitlint (Conventional Commits en cada PR), Job e2e (Playwright contra build de producción, vite preview) (+4 more)

### Community 56 - "Backup y Recuperacion DR"

Cohesion: 0.21
Nodes (12): Backup externo diario (C-12), Plan de recuperación ante desastres (DR) — BravoCRM, Point-in-time recovery de Neon, Procedimiento de restauración (pg_restore en BD limpia, nunca producción), RPO objetivo: 24 horas, RTO objetivo: 4 horas (no validado), Simulacro trimestral de restauración (no implementado), Job alert-on-failure (issue de GitHub + Slack opcional) (+4 more)

### Community 57 - "Tablas Duales Clientes-Assets"

Cohesion: 0.27
Nodes (12): assets (tabla JSON-blob), clientes (tabla normalizada, nueva), clients (tabla JSON-blob, legacy), cmms_equipos (familia normalizada), cmms_tickets (familia normalizada), CORRECCIÓN C-1: Resolver FK dual en assets, CORRECCIÓN C-5: Agregar casos switch GET para cmms_*, ensureTables() (+4 more)

### Community 58 - "Endpoints REST Core"

Cohesion: 0.17
Nodes (12): POST /api/auth/login, /api/clients (GET, POST), GET /api/dashboard/kpis, GET /api/health, /api/invoices (GET, POST), /api/projects (GET, POST), /api/quotations (GET, POST), Backend DEV MODE (puerto 3000, npm run dev:json) (+4 more)

### Community 59 - "Dependencias Export-Dexie"

Cohesion: 0.17
Nodes (12): dependencies, dexie, docx, html2canvas, jspdf, lucide-react, react, react-dom (+4 more)

### Community 60 - "UI Toast y Confirmacion"

Cohesion: 0.29
Nodes (9): ConfirmDialogHost(), ToastHost(), dismissToast(), resolveConfirm(), UiConfirmRequest, UiState, UiToast, useUiStore (+1 more)

### Community 61 - "Gantt de Proyectos"

Cohesion: 0.23
Nodes (10): addDays(), diffDays(), formatMonthYear(), NewTaskFormProps, parseDate(), ProjectsGantt(), RowItem, STATUS_COLOR (+2 more)

### Community 62 - "Config y Validacion API"

Cohesion: 0.29
Nodes (7): buildApp(), schema, ValidationSpec, configKeyParamSchema, configValueSchema, ref_express, ref_zod

### Community 63 - "Login JWT LocalStorage"

Cohesion: 0.20
Nodes (10): POST /api/auth/login, App.tsx (refactorizado), JWT token management (localStorage), Login.css, run-dev.bat, Login(), LoginProps, Mode (+2 more)

### Community 64 - "Tablas Legacy CMMS"

Cohesion: 0.22
Nodes (11): GET /api/:table, /api/sync/:table (pull), C-4: Filtro cliente_id obligatorio en switch GET, tabla assets (equipos HVAC), tabla branches (alias de sucursales), tabla catalog_asset_types, tabla clientes (canónica, maestra de tenants), tabla events (log de sync), tabla reports (+3 more)

### Community 65 - "Scripts Dev Backend"

Cohesion: 0.18
Nodes (11): scripts, build, check:deps-sync, dev, dev:backend, dev:frontend, format, format:check (+3 more)

### Community 66 - "Config ESLint"

Cohesion: 0.22
Nodes (8): ref_eslint_js, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, ref_globals, typescript-eslint, @typescript-eslint/eslint-plugin, @typescript-eslint/parser

### Community 67 - "Infra Produccion Neon-Postgres"

Cohesion: 0.22
Nodes (10): bcrypt hashing (auth producción), BravoCRM, INICIO_RAPIDO.txt, Neon (cloud), PostgreSQL, QA_TESTING_GUIDE.md, README.md, SETUP_LOCAL.md (+2 more)

### Community 68 - "Scripts Build y Lint"

Cohesion: 0.20
Nodes (10): scripts, build, build:lan, dev, lint, preview, serve:lan, test (+2 more)

### Community 69 - "Manifest PWA"

Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 70 - "Tests Importacion Cotizaciones"

Cohesion: 0.28
Nodes (7): buildApp(), cloneState(), makeFakeDb(), query(), normRut(), payload(), State

### Community 71 - "Seguridad JWT y CORS"

Cohesion: 0.22
Nodes (9): backend/src/middleware/**tests**/auth.test.ts (test de token legado sin kind), CORS allowlist explícita (C-03), Helmet — cabeceras de seguridad HTTP (C-04), JWT_EXPIRY = 1 hora (A-02), Claim 'kind' distingue access vs refresh token, ADR: Almacenamiento del token de sesión (JWT Bearer + localStorage), Riesgo residual: XSS roba token de localStorage (Alto), Umbral eslint --max-warnings (ratchet ascendente) (+1 more)

### Community 72 - "Runbook de Incidentes"

Cohesion: 0.22
Nodes (9): Rate limiting (login, admin/setup, forgot-password) + bloqueo de cuenta, Bloqueo de cuenta tras 10 intentos fallidos (30 min), auth_throttle — rate limit persistente en Postgres, GET /api/health, Runbook de incidentes — BravoCRM, Bloqueo de geografía (no implementado, decisión de negocio pendiente), A-06: IP Allowlist Neon + rotación de DATABASE_URL, Infraestructura, perímetro y red — BravoCRM (+1 more)

### Community 73 - "Documentacion Arquitectura"

Cohesion: 0.22
Nodes (9): ADR 0001: Entrypoint único (docs/adr/0001-entrypoint-unico.md), Matriz de permisos por rol (docs/MATRIZ_PERMISOS.md), Setup local (docs/SETUP_LOCAL.md), Configuración Dependabot (npm root/backend/frontend + github-actions), Arquitectura monorepo (frontend/backend/api/docs), Stack Backend: Node+Express+TS+PostgreSQL(Neon)+JWT+bcryptjs+Zod+Winston, BravoCRM — Plataforma de Gestión Comercial, Stack Frontend: React19+TS+Vite+Zustand+Recharts+jsPDF/docx (+1 more)

### Community 74 - "Clasificacion Datos Personales"

Cohesion: 0.25
Nodes (9): client_contacts (nombre, email, teléfono, cargo), clients.rut, Encargados de tratamiento externos (Vercel, Neon, Sentry, Resend), isValidRut (quotations.ts), Clasificación de datos personales — BravoCRM, Decisión: pgcrypto para RUT postergado (AC-5.8), sessions.ip_address / sessions.user_agent, users.name / users.email (empleado) (+1 more)

### Community 75 - "Auditoria Forense CMMS"

Cohesion: 0.22
Nodes (9): Familia cmms_* (14 tablas, arquitectura relacional normalizada abandonada: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, cmms_mantenimientos, cmms_pm_planes, cmms_pm_plantillas, cmms_sla_config, cmms_checklist_plantillas, cmms_usuarios_clientes, cmms_ot_comentarios, cmms_ot_eventos, cmms_push_subscriptions, cmms_informes_mantenimiento), C-0: Prerequisitos manuales de infraestructura, C-1: Script SQL de purga de 17 tablas huérfanas, Auditoría forense DBA Senior (35 tablas, Junio 2026), Neon PostgreSQL (producción), tabla cmms_idempotency_keys (endpoint /api/cmms/:resource inactivo), tabla cmms_one_shot_migrations (registro huérfano), tabla playing_with_neon (sandbox Neon) (+1 more)

### Community 76 - "Sync Dexie-Neon Dual Schema"

Cohesion: 0.25
Nodes (9): Dexie.js — IndexedDB local offline, stores en inglés, Neon PostgreSQL (serverless, tablas en español), @neondatabase/serverless — SQL directo (ORM/queries), Problema 7: Neon IP allowlist — acción manual de infraestructura, no resoluble por el agente IA, Proyecto CMMS HVAC PRO IA Studio (Los Cabros), Stack frontend React + TypeScript + Vite (desplegado en Vercel), Repo nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO, Política de corrección quirúrgica: lista cerrada de 18 ARCHIVOS AUTORIZADOS, prohibido tocar nada fuera de ella (reduce riesgo de regresión del agente IA) (+1 more)

### Community 77 - "Migracion FK Clientes"

Cohesion: 0.25
Nodes (8): C-2: Migración de FK 'clients' → 'clientes' y unificación de sync, función ensureTables() (server.ts), tabla audit_logs, tabla calendar, tabla clients (legacy, dual de clientes para Dexie offline), tabla inventory, tabla ordenes_servicio, tabla preventive_maintenance

### Community 78 - "UI Facturas"

Cohesion: 0.29
Nodes (7): fecha(), Invoices(), FACTURAS, getInvoices, getInvoiceSummary, render(), RESUMEN

### Community 79 - "TSConfig Node"

Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 80 - "Tests Paginacion"

Cohesion: 0.33
Nodes (3): buildApp(), FakeQuotation, makeFakeDb()

### Community 81 - "Prompt Correccion DBA v3"

Cohesion: 0.29
Nodes (6): C-7: Detección incompleta de firma en validateWorkOrderPayload, src/db/database.ts (alias tablas Dexie), Dexie IndexedDB (stores offline), scripts/init-db.ts, Repositorio nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO, función validateWorkOrderPayload (server.ts)

### Community 82 - "Config Vercel Rewrites"

Cohesion: 0.29
Nodes (6): C-8: Rewrites de vercel.json apuntando a rutas inexistentes, buildCommand, headers, outputDirectory, rewrites, version

### Community 83 - "Cumplimiento Legal Datos"

Cohesion: 0.29
Nodes (7): docs/CLASIFICACION_DATOS.md, DPA (Data Processing Agreement) pendiente por proveedor, docs/DR_RUNBOOK.md, Ley 19.628 (Chile, vigente), Ley 21.719 (Chile, vigencia diciembre 2026), Registro de actividades de tratamiento — BravoCRM (borrador técnico), RPO/RTO (24h/4h)

### Community 84 - "Inicializacion Sentry"

Cohesion: 0.33
Nodes (5): frontend_src_index, initSentry(), sentryEnabled, react-dom, @sentry/react

### Community 85 - "Tests API Clientes"

Cohesion: 0.40
Nodes (3): buildApp(), FakeState, makeFakeDb()

### Community 87 - "Configuracion CORS"

Cohesion: 0.47
Nodes (4): buildCorsOptions(), buildCorsOriginChecker(), CorsOriginCallback, ref_cors

### Community 88 - "Paginacion por Cursor"

Cohesion: 0.40
Nodes (5): buildPage(), CursorPage, CursorValue, decodeCursor(), encodeCursor()

### Community 89 - "Kanban de Proyectos"

Cohesion: 0.40
Nodes (5): fmt(), ProjectsKanban(), ProjectStatus, Props, STATUS_COLS

### Community 90 - "Config Prettier"

Cohesion: 0.33
Nodes (5): arrowParens, printWidth, semi, singleQuote, trailingComma

### Community 93 - "Stack Local de Desarrollo"

Cohesion: 0.50
Nodes (5): Backend (API, localhost:3000), Base de Datos (PostgreSQL, localhost:5432), Frontend (React, localhost:5173), PgAdmin (localhost:5050), start-bravocrm.bat

### Community 94 - "TSConfig Build"

Cohesion: 0.50
Nodes (3): exclude, extends, ./tsconfig.json

### Community 95 - "Gap de Permisos por Rol"

Cohesion: 0.50
Nodes (4): Gap C-10: sub-recursos de proyecto sin restricción de rol, Matriz de permisos (modelo de autorización por rol) — BravoCRM, roleMiddleware (backend, control real de autorización), usePermissions (frontend hook, solo UX)

### Community 96 - "RNF y Checklist de PR"

Cohesion: 0.50
Nodes (4): RNF y SLOs (docs/RNF_Y_SLOS.md), Checklist de PR (pruebas, seguridad, impacto RNF), roleMiddleware para rutas con rol específico, Validación de body con zod en rutas de escritura

### Community 97 - "Shell PWA"

Cohesion: 0.50
Nodes (4): frontend/index.html (shell de la app, PWA 'Maestro Comercial'), /src/main.tsx (punto de montaje React), manifest.json (manifiesto PWA), sw.js (service worker, registro PWA)

### Community 117 - "Modulos Comerciales Proximos"

Cohesion: 0.67
Nodes (3): POST /api/quotations, Módulo Facturas (próximo), Módulo Proyectos (próximo)

### Community 118 - "Derechos ARCO y Anonimizacion"

Cohesion: 0.67
Nodes (3): Función de anonimización propuesta para client_contacts, Derechos ARCO+ (acceso, rectificación, cancelación, oposición), Soft-delete (deleted_at)

### Community 119 - "Antipatron Conexiones Serverless"

Cohesion: 0.67
Nodes (3): A-17: antipatrón de conexiones en serverless, @neondatabase/serverless (dependencia eliminada, cero usos reales), Prueba de carga k6 (no ejecutada, 50 usuarios concurrentes)

## Ambiguous Edges - Review These

- `POST /api/quotations` → `Módulo Proyectos (próximo)` [AMBIGUOUS]
  docs/historico/MODULO_COTIZACIONES_RESUMEN.md · relation: conceptually_related_to
- `db.json (persistencia)` → `Módulo Reportes (próximo)` [AMBIGUOUS]
  docs/historico/MODULO_COTIZACIONES_RESUMEN.md · relation: conceptually_related_to
- `src/lib/syncEngine.ts — motor de sincronización frontend` → `src/db/mockDb.ts — aliases de tablas Dexie en frontend` [AMBIGUOUS]
  docs/historico/PROMPT_CORRECCION_FINAL_CMMS_v2.md · relation: shares_data_with
- `tabla clientes (canónica, maestra de tenants)` → `Familia cmms_* (14 tablas, arquitectura relacional normalizada abandonada: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, cmms_mantenimientos, cmms_pm_planes, cmms_pm_plantillas, cmms_sla_config, cmms_checklist_plantillas, cmms_usuarios_clientes, cmms_ot_comentarios, cmms_ot_eventos, cmms_push_subscriptions, cmms_informes_mantenimiento)` [AMBIGUOUS]
  docs/historico/PROMPT_CORRECCION_v3_DBA_AUDITORIA.md · relation: conceptually_related_to

## Knowledge Gaps

- **702 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `arrowParens` (+697 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 859 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `POST /api/quotations` and `Módulo Proyectos (próximo)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `db.json (persistencia)` and `Módulo Reportes (próximo)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `src/lib/syncEngine.ts — motor de sincronización frontend` and `src/db/mockDb.ts — aliases de tablas Dexie en frontend`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `tabla clientes (canónica, maestra de tenants)` and `Familia cmms_* (14 tablas, arquitectura relacional normalizada abandonada: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, cmms_mantenimientos, cmms_pm_planes, cmms_pm_plantillas, cmms_sla_config, cmms_checklist_plantillas, cmms_usuarios_clientes, cmms_ot_comentarios, cmms_ot_eventos, cmms_push_subscriptions, cmms_informes_mantenimiento)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `supertest` connect `Router de Autenticacion` to `Routers Admin y Dashboard`, `Tests Seguimiento Facturas`, `Tests Importacion Cotizaciones`, `Dependencias Backend`, `Rate Limiting`, `Catalogo y Router Clientes`, `Tests Paginacion`, `Throttle de Autenticacion`, `Tests API Clientes`, `Tests Pagos Facturas`, `Validacion de Entorno`, `Tests OC Cotizaciones`, `Tests Estado Cotizaciones`, `Config y Validacion API`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `react` connect `Logistica y Distancias` to `Modelos de Factura`, `Flujo de Cotizaciones`, `Rutas Principales App`, `UI Gestion de Clientes`, `Costos de Proyectos`, `UI Facturas`, `Dashboard KPIs`, `Inicializacion Sentry`, `Dependencias Frontend`, `Autocompletado de Catalogo`, `Kanban de Proyectos`, `UI Toast y Confirmacion`, `Gantt de Proyectos`, `Login JWT LocalStorage`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `Runbook de incidentes — BravoCRM` connect `Runbook de Incidentes` to `Despliegue Vercel y CI`, `Documentacion Arquitectura`, `Rate Limiting`, `Pipeline CI y Staging`, `Backup y Recuperacion DR`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
