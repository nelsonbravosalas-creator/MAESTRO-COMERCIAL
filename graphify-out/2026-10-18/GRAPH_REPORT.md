# Graph Report - MAESTRO-COMERCIAL (2026-10-15)

## Corpus Check

- 227 files · ~179,831 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 38 file(s) not represented in the graph (top: .css 16, (none) 15, .bat 4)

## Summary

- 1976 nodes · 3636 edges · 141 communities (98 shown, 43 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 101 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `dde9df53`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- POST /api/quotations
- api/chatbot.ts
- Quotations.tsx
- api/auth.ts
- Mailer
- ensureTables() — función C-1: crea tablas canónicas, migra clients→clientes, agrega cliente_id, elimina tablas obsoletas
- ENTITY_TYPE_MAP (assets->equipos, workOrders->ordenes_trabajo, maintenance->mantenimiento_preventivo, parts->repuestos, technicians->tecnicos)
- api.ts
- backend/package.json
- api/projects.ts
- tabla clientes (CANÓNICA)
- design-audit.ts
- Projects.tsx
- package.json
- validate
- Dashboard.tsx
- ref_pg
- PROMPT QA POST-IMPLEMENTACIÓN v4.0
- maestro-store.ts
- CRUD Cotizaciones (T3.2)
- api/quotations.ts
- frontend/package.json
- server-dev.ts
- Catalogo.tsx
- fixtures.ts
- PROMPT DE AUDITORÍA SENIOR — CMMS HVAC PRO IA STUDIO
- docxExport.ts
- compilerOptions
- compilerOptions
- devDependencies
- loop.ts
- devDependencies
- Invoices.test.tsx
- react
- chatbotGraph.ts
- ADR 0001: un solo entrypoint de aplicación
- authThrottle.ts
- Projects.test.tsx
- types/index.ts
- scripts
- server.ts (Express monolítico, 2837 líneas)
- chatbotOps.ts
- devDependencies
- compilerOptions
- dependencies
- app.ts
- 1700000002000_0002-project-tasks.js
- ref_vitest
- htmlExport.ts
- check-bundle-budget.mjs
- dependencies
- Workflow: CI
- api/invoices.ts
- BravoCRM
- api/index.ts
- uiStore.ts
- Plan de recuperación ante desastres (DR) — BravoCRM
- frontend/eslint.config.js
- Backend DEV MODE (puerto 3000, npm run dev:json)
- dependencies
- ref_express
- CLAUDE.md
- post-checkout
- Login.tsx
- tabla clientes (canónica, maestra de tenants)
- scripts
- ProjectsGantt.tsx
- BravoCRM
- scripts
- manifest.json
- quotations-import.test.ts
- ADR: Almacenamiento del token de sesión (JWT Bearer + localStorage)
- chatStore.ts
- BravoCRM — Plataforma de Gestión Comercial
- Clasificación de datos personales — BravoCRM
- C-1: Script SQL de purga de 17 tablas huérfanas
- Proyecto CMMS HVAC PRO IA Studio (Los Cabros)
- tabla clients (legacy, dual de clientes para Dexie offline)
- createQuotationsRouter
- compilerOptions
- post-commit
- src/db/database.ts (alias tablas Dexie)
- vercel.json
- Registro de actividades de tratamiento — BravoCRM (borrador técnico)
- Despliegue — BravoCRM (Vercel autodeploy + CI)
- App.tsx
- ProjectFull
- engines
- weeklyCommercialSummary.ts
- .prettierrc.json
- CatalogAutocomplete.tsx
- api/clients.ts
- Backend (API, localhost:3000)
- tsconfig.build.json
- authMiddleware
- Checklist de PR (pruebas, seguridad, impacto RNF)
- frontend/index.html (shell de la app, PWA 'Maestro Comercial')
- vite.config.ts
- permissions.test.ts
- Soft-delete (deleted_at)
- A-17: antipatrón de conexiones en serverless
- smoke.sh
- Hallazgos bloqueados por acceso externo
- C-05: fallback de usuarios hardcodeados eliminado
- BUG #4: Error Handling
- A-11: API sin contrato/versionado/paginación (alcance reducido)
- sw.js
- requestId / cabecera x-request-id
- Plan de remediación (C-xx / A-xx)
- engines
- tabla work_orders
- Presupuesto de bundle (71,8kB gzip, check-bundle-budget.mjs)
- SLO Disponibilidad (99,5% mensual)
- App Icon (192x192)
- MAESTRO-COMERCIAL App Icon (512x512)
- Logo NBYB (Ingeniería y Servicios Bravo SPA)
- PROMPT_CORRECCION_v3_DBA_AUDITORIA.md

## God Nodes (most connected - your core abstractions)

1. `useMaestro` - 40 edges
2. `createChatbotRouter()` - 33 edges
3. `createQuotationsRouter()` - 33 edges
4. `logger` - 29 edges
5. `authMiddleware()` - 26 edges
6. `supertest` - 23 edges
7. `react` - 22 edges
8. `validate()` - 21 edges
9. `CategoryId` - 20 edges
10. `recordGraphFacts()` - 19 edges

## Surprising Connections (you probably didn't know these)

- `A-07: Un solo entrypoint de servidor (resuelto, C-06/C-07)` --implements--> `handler()` [EXTRACTED]
  docs/INFRA.md → api/index.ts
- `Job vercel-function (tipa api/index.ts con dependencias de la raíz)` --references--> `handler()` [EXTRACTED]
  .github/workflows/ci.yml → api/index.ts
- `Claim 'kind' distingue access vs refresh token` --implements--> `authMiddleware()` [EXTRACTED]
  docs/ADR_TOKEN_STORAGE.md → backend/src/middleware/auth.ts
- `Mailer` --implements--> `NoopMailer (fallback sin proveedor configurado)` [EXTRACTED]
  backend/src/services/mailer.ts → docs/EMAIL_SETUP.md
- `Mailer` --implements--> `Opción A: Resend + dominio propio (SPF/DKIM/DMARC)` [EXTRACTED]
  backend/src/services/mailer.ts → docs/EMAIL_SETUP.md

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **Fragmentación pre-ADR: cuatro definiciones distintas de 'el backend' unificadas en app.ts** — docs_adr_0001_entrypoint_unico_app_ts, docs_adr_0001_entrypoint_unico_server_ts, docs_adr_0001_entrypoint_unico_server_dev_ts, docs_adr_0001_entrypoint_unico_api_index_ts [EXTRACTED 1.00]
- **Prerrequisitos obligatorios antes de ejecutar el script DROP** — docs_historico_auditoria_dba_huerfanas_v1_h1_credencial_neon, docs_historico_auditoria_dba_huerfanas_v1_backup_pre_cleanup_branch, docs_historico_auditoria_dba_huerfanas_v1_prompt_v4, docs_historico_auditoria_dba_huerfanas_v1_drop_script [EXTRACTED 1.00]
- **Tablas listadas en obsoleteTables pese a uso activo (bug de boot)** — docs_historico_auditoria_dba_huerfanas_v1_obsoletetables, docs_historico_auditoria_dba_huerfanas_v1_cmms_auth_failures, docs_historico_auditoria_dba_huerfanas_v1_cmms_idempotency_keys [EXTRACTED 1.00]
- **Brecha de cumplimiento de protección de datos a cerrar antes de diciembre 2026** — docs_registro_tratamiento_ley_21719, docs_registro_tratamiento_arco, docs_registro_tratamiento_anonimizacion [INFERRED 0.75]
- **Tablas con FK hacia clientes (hub canónico post v3)** — docs_historico_auditoria_dba_huerfanas_v1_clientes, docs_historico_auditoria_dba_huerfanas_v1_sucursales, docs_historico_auditoria_dba_huerfanas_v1_assets, docs_historico_auditoria_dba_huerfanas_v1_users, docs_historico_auditoria_dba_huerfanas_v1_work_orders, docs_historico_auditoria_dba_huerfanas_v1_reports, docs_historico_auditoria_dba_huerfanas_v1_preventive_maintenance, docs_historico_auditoria_dba_huerfanas_v1_audit_logs [INFERRED 0.85]
- **Diseño de automatización segura de migraciones en producción: motivado por el incidente, garantizado por expand-migrate-contract** — docs_migraciones_migrate_production_job, docs_migraciones_expand_migrate_contract, docs_migraciones_incident_20260909 [INFERRED 0.85]
- **Gate de CI/CD pendiente (A-09): branch protection + deploy en paralelo a Vercel** — docs_despliegue_overview, docs_despliegue_branchprotection, github_workflows_ci_workflow, docs_hallazgos_bloqueados_a09cd [INFERRED 0.85]
- **Cadena de integridad de respaldo y recuperación** — github_workflows_backup_workflow, github_workflows_backup_pgrestorelist, docs_dr_runbook_overview, docs_dr_runbook_restauracion [INFERRED 0.85]
- **Secret PROD_DATABASE_URL compartido entre workflows programados** — docs_infra_proddatabaseurl, github_workflows_backup_workflow, github_workflows_ci_migrateproductionjob, github_workflows_cleanup_sessions_workflow, github_workflows_weekly_commercial_summary_workflow [INFERRED 0.95]

## Communities (141 total, 43 thin omitted)

### Community 0 - "POST /api/quotations"

Cohesion: 0.67
Nodes (3): POST /api/quotations, Módulo Facturas (próximo), Módulo Proyectos (próximo)

### Community 1 - "api/chatbot.ts"

Cohesion: 0.12
Nodes (26): buildIntentPrompt(), buildPriceExtractionPrompt(), buildPriceSearchPrompt(), ChatbotProactiveNote, createChatbotRouter(), errorMessage(), findClientByName(), logAction() (+18 more)

### Community 2 - "Quotations.tsx"

Cohesion: 0.09
Nodes (46): GET /api/quotations, db.json (persistencia), Módulo Clientes (próximo), Módulo Reportes (próximo), Estados de cotización: Draft/Sent/Accepted/Rejected, Quotations.css, React 19 + TypeScript, patch() (+38 more)

### Community 3 - "api/auth.ts"

Cohesion: 0.08
Nodes (29): createAuthRouter(), expiresInSeconds(), hashToken(), safeUser(), signAccessToken(), signRefreshToken(), buildApp(), FakeUser (+21 more)

### Community 4 - "Mailer"

Cohesion: 0.13
Nodes (11): Mailer, ResendMailer, SmtpMailer, A-04: POST /api/auth/forgot-password, NoopMailer (fallback sin proveedor configurado), Configuración de correo transaccional — BravoCRM, Opción A: Resend + dominio propio (SPF/DKIM/DMARC), Opción B: SMTP Gmail con contraseña de aplicación (+3 more)

### Community 5 - "ensureTables() — función C-1: crea tablas canónicas, migra clients→clientes, agrega cliente_id, elimina tablas obsoletas"

Cohesion: 0.12
Nodes (33): ALLOWED_TABLES — constante C-2: lista las 8 tablas canónicas permitidas para sync, POST /api/ocr — handler C-5: OCR de placas HVAC vía Gemini, Tabla 'assets' — equipos HVAC del cliente (cliente_id), Tabla 'calendar' — eventos y agenda del cliente, Tabla 'clientes' — tabla maestra canónica de tenants (elegida sobre 'clients'), Tabla 'clients' — duplicado JSON-blob en inglés, sin ruta GET propia, migrada y eliminada, Repositorio nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO (rama main), Familia de tablas cmms_* (17 tablas normalizadas: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, etc.) — sin ninguna ruta activa, eliminadas en bloque (+25 more)

### Community 6 - "ENTITY_TYPE_MAP (assets->equipos, workOrders->ordenes_trabajo, maintenance->mantenimiento_preventivo, parts->repuestos, technicians->tecnicos)"

Cohesion: 0.08
Nodes (33): api/assets/[id].ts, api/assets.ts, API_ENDPOINTS — URLs canónicas kebab-case (work-orders, parts, no inventory), api/maintenance/[id].ts, api/maintenance.ts, api/parts/[id].ts, api/parts.ts, api/sync/pull.ts (+25 more)

### Community 7 - "api.ts"

Cohesion: 0.04
Nodes (54): ApiError, ChatbotProactiveNote, ChatbotRule, clearAuth(), CommercialBriefingAlert, CommercialBriefingResponse, CursorPage, del() (+46 more)

### Community 8 - "backend/package.json"

Cohesion: 0.06
Nodes (32): bcryptjs, body-parser, cors, dotenv, eslint, @eslint/js, express, express-rate-limit (+24 more)

### Community 9 - "api/projects.ts"

Cohesion: 0.15
Nodes (19): VALID_STATUS, capLimitQuerySchema, isoDateStr, money, nonEmptyStr(), nonNegativeNumber, optionalStr(), paginationQuerySchema (+11 more)

### Community 10 - "tabla clientes (CANÓNICA)"

Cohesion: 0.09
Nodes (31): ALLOWED_TABLES / TABLE_ALIAS_MAP (líneas 528-552), tabla assets (CANÓNICA), tabla audit_logs (ACTIVA, auditoría sin triggers), Neon branch "backup-pre-cleanup" (R-5), tabla clientes (CANÓNICA), tabla clients (LEGACY en migración), tabla cmms_auth_failures (bloqueador brute-force), tabla cmms_clientes (raíz FK del bloque legacy) (+23 more)

### Community 11 - "design-audit.ts"

Cohesion: 0.10
Nodes (26): AC-9.7: dependencias runtime duplicadas root/backend, Job CI vercel-function, BASELINE_PATH, contrast(), countCssColors(), cssColorCounts(), DesignBaseline, hexToRgb() (+18 more)

### Community 12 - "Projects.tsx"

Cohesion: 0.16
Nodes (18): Projects, CATEGORY_LABELS, CostosTab(), CreateModalProps, emptyCostForm(), EquipoTab(), fmtCLP(), isCritical() (+10 more)

### Community 13 - "package.json"

Cohesion: 0.06
Nodes (30): bcryptjs, body-parser, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken (+22 more)

### Community 14 - "validate"

Cohesion: 0.14
Nodes (19): CATEGORIES, createCatalogRouter(), groupedCatalog(), createConfigRouter(), createElectricalCatalogRouter(), buildApp(), makeFakeDb(), roleMiddleware() (+11 more)

### Community 15 - "Dashboard.tsx"

Cohesion: 0.08
Nodes (21): GET /api/dashboard/kpis, CostIndicator component, Dashboard.css, ACCENT_TEXT, AGING_TRAMOS, CAT_COLORS, CAT_LABELS, Dashboard() (+13 more)

### Community 16 - "ref_pg"

Cohesion: 0.21
Nodes (11): computeQuotationDelta(), LearningObservation, LearningTracePayload, normalizeDesc(), QuotationDelta, recordLearningFeedback(), TraceLineItem, generateMorningBriefing() (+3 more)

### Community 17 - "PROMPT QA POST-IMPLEMENTACIÓN v4.0"

Cohesion: 0.11
Nodes (26): ALLOWED_TABLES, GET /api/assets endpoint (duplicada, eliminada), POST /api/assets endpoint, /api/auth endpoint, POST /api/cmms/:resource endpoint, POST /api/sync endpoint, Bug crítico #1 — cmms_auth_failures en DROP list, Bug crítico #2 — GET /api/assets duplicada sombrea switch de sync (+18 more)

### Community 18 - "maestro-store.ts"

Cohesion: 0.08
Nodes (40): ImportQuotationResult, RawQuotation, { MockApiError }, SAMPLE_QUOTATIONS, baseCorrelative(), calcCat(), CatalogSaveError, cloneQuoteWithCorrelative() (+32 more)

### Community 19 - "CRUD Cotizaciones (T3.2)"

Cohesion: 0.11
Nodes (25): Backend API (localhost:3000), BravoCRM, BUG #1: JWT Validation, BUG #3: Soft-Delete, Checklist Final (pre Fases 5-8), CostIndicator (componente dashboard), CRUD Clientes (T3.1), CRUD Cotizaciones (T3.2) (+17 more)

### Community 20 - "api/quotations.ts"

Cohesion: 0.06
Nodes (46): applyQuotationImport(), CATEGORY_COLORS, CATEGORY_IDS, CATEGORY_LABELS, fetchUfValue(), findCatalogMatch(), isValidRut(), LOCKED_STATUSES (+38 more)

### Community 21 - "frontend/package.json"

Cohesion: 0.09
Nodes (22): browserslist, engines, node, eslint, @eslint/js, globals, typescript, vite (+14 more)

### Community 22 - "server-dev.ts"

Cohesion: 0.11
Nodes (19): addDaysISO(), app, AuthReq, buildQuotationFull(), calcInvoiceBalance(), calcQuotationTotals(), DB, DB_PATH (+11 more)

### Community 23 - "Catalogo.tsx"

Cohesion: 0.16
Nodes (17): Catalogo, avgPrice(), CAT_META, Catalogo(), CATS, CatTable(), maxPrice(), minPrice() (+9 more)

### Community 24 - "fixtures.ts"

Cohesion: 0.17
Nodes (15): BOTONES, DASHBOARD_VACIO, frontend_e2e_fixtures_expect, fakeProject(), mockOneProject(), openChatPanel(), openScreen(), Screen (+7 more)

### Community 25 - "PROMPT DE AUDITORÍA SENIOR — CMMS HVAC PRO IA STUDIO"

Cohesion: 0.06
Nodes (34): ⚠️ AVISO CRÍTICO ANTES DE EJECUTAR, CONTEXTO ADICIONAL PARA IA STUDIO, CORRECCIONES MANUALES (NO requieren código), CORRECCIONES REQUERIDAS — ARCHIVO POR ARCHIVO, CORRECCIÓN C-1: server.ts — Resolver FK dual en assets (LÍNEAS ~540-625), CORRECCIÓN C-2: server.ts — Validación de firma en validateWorkOrderPayload (~LÍNEAS 65-85), CORRECCIÓN C-3: server.ts — Modelo Gemini inexistente (~LÍNEA 780 aprox), CORRECCIÓN C-4: server.ts — Agregar tablas cmms_* a ALLOWED_TABLES y TABLE_ALIAS_MAP (+26 more)

### Community 26 - "docxExport.ts"

Cohesion: 0.22
Nodes (19): Align, blank(), C, clientRow(), darkCell(), downloadDocx(), equivalentRow(), fmtDateLong() (+11 more)

### Community 27 - "compilerOptions"

Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowSyntheticDefaultImports, esModuleInterop, isolatedModules, jsx, lib, module (+12 more)

### Community 28 - "compilerOptions"

Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, ignoreDeprecations, lib, module, moduleResolution (+11 more)

### Community 29 - "devDependencies"

Cohesion: 0.10
Nodes (20): devDependencies, @axe-core/playwright, esbuild, eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+12 more)

### Community 30 - "loop.ts"

Cohesion: 0.06
Nodes (55): buildAgentSystemPrompt(), MAX_STEPS, recordRunEnd(), recordRunStart(), recordStepAudit(), runAgentLoop(), sanitizeForAudit(), WALL_CLOCK_BUDGET_MS (+47 more)

### Community 31 - "devDependencies"

Cohesion: 0.10
Nodes (20): devDependencies, eslint, @eslint/js, globals, node-pg-migrate, supertest, tsx, @types/bcryptjs (+12 more)

### Community 32 - "Invoices.test.tsx"

Cohesion: 0.21
Nodes (11): clp(), DetalleFactura(), fecha(), hoy(), Invoices(), NuevaFactura(), FACTURAS, getInvoices (+3 more)

### Community 33 - "react"

Cohesion: 0.13
Nodes (12): Logistica, KPIs, CITIES, IDX, M, CityDistances, loadCityDistances(), useCityDistances() (+4 more)

### Community 34 - "chatbotGraph.ts"

Cohesion: 0.15
Nodes (27): applyClientPatterns(), buildLlmGraphContext(), CatalogMatch, clienteNodeId(), ClientPattern, comunaNodeId(), countsFromMetadata(), findCatalogMatch() (+19 more)

### Community 35 - "ADR 0001: un solo entrypoint de aplicación"

Cohesion: 0.12
Nodes (18): ADR 0001: un solo entrypoint de aplicación, api/index.ts (handler de Vercel), backend/src/app.ts (única definición de middlewares/routers/errores), backend/src/server.ts (npm run dev), 0009-billing-flow (migración), .github/workflows/ci.yml, Regla expand → migrate → contract, Incidente 2026-09-09: columna loss_reason faltante en producción (+10 more)

### Community 36 - "authThrottle.ts"

Cohesion: 0.09
Nodes (27): AuthThrottleOptions, createAuthThrottle(), ipAndEmailKey(), ipKey(), motivo(), buildApp(), FakeState, MENSAJE (+19 more)

### Community 37 - "Projects.test.tsx"

Cohesion: 0.21
Nodes (8): frontend_src_index, OverviewTab(), render(), rerender(), initSentry(), sentryEnabled, react-dom, @sentry/react

### Community 38 - "types/index.ts"

Cohesion: 0.07
Nodes (35): BravoCRMDatabase, db, ApiError, ApiResponse, AppConfig, AuditAction, AuditLog, CatalogItem (+27 more)

### Community 39 - "scripts"

Cohesion: 0.13
Nodes (15): scripts, build, cleanup:sessions, dev, dev:json, lint, migrate, migrate:create (+7 more)

### Community 40 - "server.ts (Express monolítico, 2837 líneas)"

Cohesion: 0.16
Nodes (15): constante ALLOWED_TABLES (server.ts), POST /api/auth (login PIN), GET /api/health, POST /api/ocr (Gemini OCR placas HVAC), POST /api/sync (push), C-3: Reemplazo de ALLOWED_TABLES y TABLE_ALIAS_MAP, C-5: Inyección de cliente_id en POST /api/sync, C-6: Modelo Gemini inexistente en /api/ocr (+7 more)

### Community 41 - "chatbotOps.ts"

Cohesion: 0.14
Nodes (23): buildAutoLineItems(), ImportLinea, getGraphNode(), materialNodeId(), assertClientHasRut(), buildPriceExtractionPrompt(), buildPriceSearchPrompt(), ClientRecord (+15 more)

### Community 42 - "devDependencies"

Cohesion: 0.13
Nodes (15): devDependencies, @commitlint/cli, @commitlint/config-conventional, concurrently, husky, lint-staged, prettier, @types/bcryptjs (+7 more)

### Community 43 - "compilerOptions"

Cohesion: 0.13
Nodes (14): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, ignoreDeprecations, lib, module, moduleResolution, outDir (+6 more)

### Community 44 - "dependencies"

Cohesion: 0.14
Nodes (14): dependencies, bcryptjs, body-parser, cors, dotenv, express, express-rate-limit, helmet (+6 more)

### Community 45 - "app.ts"

Cohesion: 0.08
Nodes (26): allowedOrigins, app, pool, buildCorsOptions(), buildCorsOriginChecker(), CorsOriginCallback, env, envSchema (+18 more)

### Community 46 - "1700000002000_0002-project-tasks.js"

Cohesion: 0.15
Nodes (9): fs, path, schemaPath, fs, path, sqlPath, Tabla project_tasks, ref_fs (+1 more)

### Community 47 - "ref_vitest"

Cohesion: 0.07
Nodes (16): buildApp(), FakeQuotation, makeFakeDb(), buildApp(), makeFakeDb(), buildApp(), makeFakeDb(), baseRow (+8 more)

### Community 48 - "htmlExport.ts"

Cohesion: 0.23
Nodes (11): ClientFormProps, fmtDecimal, FREQUENCY_LABELS, VISITS_PER_YEAR, MasterClient, MasterContact, quotationContact(), downloadHtml() (+3 more)

### Community 49 - "check-bundle-budget.mjs"

Cohesion: 0.14
Nodes (13): alcanzable, cityChunkKey, distDir, eagerAssets, entry, html, indexHtmlPath, manifest (+5 more)

### Community 50 - "dependencies"

Cohesion: 0.14
Nodes (14): dependencies, bcryptjs, body-parser, cors, dotenv, express, express-rate-limit, helmet (+6 more)

### Community 51 - "Workflow: CI"

Cohesion: 0.22
Nodes (9): C-06/A-12: Pipeline de CI (tipos, lint, tests con cobertura, audit, scan de secretos, build), Bloqueo de cuenta tras 10 intentos fallidos (30 min), GET /api/health, Runbook de incidentes — BravoCRM, Job commitlint (Conventional Commits en cada PR), Job e2e (Playwright contra build de producción, vite preview), Job secrets (gitleaks-action), Workflow: CI (+1 more)

### Community 52 - "api/invoices.ts"

Cohesion: 0.08
Nodes (24): createInvoicesRouter(), resolveDueDate(), buildApp(), makeFakeDb(), buildApp(), makeFakeDb(), basePayload, buildApp() (+16 more)

### Community 53 - "BravoCRM"

Cohesion: 0.15
Nodes (13): BravoCRM, docker-compose.yml, Docker Desktop, Fases 1-4 (Setup Base, Auth JWT, CRUD, Dashboard KPIs) - completadas, Fases 5-8 (Sincronizacion Neon, Error handling, Refactor frontend, Deploy Vercel+Neon) - pendientes, Git (opcional), Neon (PostgreSQL / sincronizacion online-first), Node.js 18+ (+5 more)

### Community 54 - "api/index.ts"

Cohesion: 0.43
Nodes (6): AppHandler, buildUnavailableApp(), describeStartupError(), handler(), HAS_DB, loadApp()

### Community 55 - "uiStore.ts"

Cohesion: 0.26
Nodes (10): ConfirmDialogHost(), ToastHost(), dismissToast(), resolveConfirm(), UiConfirmRequest, UiState, UiToast, useUiStore (+2 more)

### Community 56 - "Plan de recuperación ante desastres (DR) — BravoCRM"

Cohesion: 0.21
Nodes (12): Backup externo diario (C-12), Plan de recuperación ante desastres (DR) — BravoCRM, Point-in-time recovery de Neon, Procedimiento de restauración (pg_restore en BD limpia, nunca producción), RPO objetivo: 24 horas, RTO objetivo: 4 horas (no validado), Simulacro trimestral de restauración (no implementado), Job alert-on-failure (issue de GitHub + Slack opcional) (+4 more)

### Community 57 - "frontend/eslint.config.js"

Cohesion: 0.22
Nodes (8): ref_eslint_js, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, ref_globals, typescript-eslint, @typescript-eslint/eslint-plugin, @typescript-eslint/parser

### Community 58 - "Backend DEV MODE (puerto 3000, npm run dev:json)"

Cohesion: 0.17
Nodes (12): POST /api/auth/login, /api/clients (GET, POST), GET /api/dashboard/kpis, GET /api/health, /api/invoices (GET, POST), /api/projects (GET, POST), /api/quotations (GET, POST), Backend DEV MODE (puerto 3000, npm run dev:json) (+4 more)

### Community 59 - "dependencies"

Cohesion: 0.17
Nodes (12): dependencies, dexie, docx, html2canvas, jspdf, lucide-react, react, react-dom (+4 more)

### Community 60 - "ref_express"

Cohesion: 0.13
Nodes (19): createAdminRouter(), secretMatches(), buildApp(), { SETUP_SECRET }, pool, readSeedUsers(), SeedUser, seedUsers() (+11 more)

### Community 63 - "Login.tsx"

Cohesion: 0.20
Nodes (10): POST /api/auth/login, App.tsx (refactorizado), JWT token management (localStorage), Login.css, run-dev.bat, Login(), LoginProps, Mode (+2 more)

### Community 64 - "tabla clientes (canónica, maestra de tenants)"

Cohesion: 0.22
Nodes (11): GET /api/:table, /api/sync/:table (pull), C-4: Filtro cliente_id obligatorio en switch GET, tabla assets (equipos HVAC), tabla branches (alias de sucursales), tabla catalog_asset_types, tabla clientes (canónica, maestra de tenants), tabla events (log de sync), tabla reports (+3 more)

### Community 65 - "scripts"

Cohesion: 0.18
Nodes (11): scripts, build, check:deps-sync, dev, dev:backend, dev:frontend, format, format:check (+3 more)

### Community 66 - "ProjectsGantt.tsx"

Cohesion: 0.15
Nodes (14): api, addDays(), diffDays(), formatMonthYear(), NewTaskFormProps, parseDate(), ProjectsGantt(), RowItem (+6 more)

### Community 67 - "BravoCRM"

Cohesion: 0.22
Nodes (10): bcrypt hashing (auth producción), BravoCRM, INICIO_RAPIDO.txt, Neon (cloud), PostgreSQL, QA_TESTING_GUIDE.md, README.md, SETUP_LOCAL.md (+2 more)

### Community 68 - "scripts"

Cohesion: 0.20
Nodes (10): scripts, build, build:lan, dev, lint, preview, serve:lan, test (+2 more)

### Community 69 - "manifest.json"

Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 70 - "quotations-import.test.ts"

Cohesion: 0.28
Nodes (7): buildApp(), cloneState(), makeFakeDb(), query(), normRut(), payload(), State

### Community 71 - "ADR: Almacenamiento del token de sesión (JWT Bearer + localStorage)"

Cohesion: 0.22
Nodes (9): backend/src/middleware/**tests**/auth.test.ts (test de token legado sin kind), CORS allowlist explícita (C-03), Helmet — cabeceras de seguridad HTTP (C-04), JWT_EXPIRY = 1 hora (A-02), Claim 'kind' distingue access vs refresh token, ADR: Almacenamiento del token de sesión (JWT Bearer + localStorage), Riesgo residual: XSS roba token de localStorage (Alto), Umbral eslint --max-warnings (ratchet ascendente) (+1 more)

### Community 72 - "chatStore.ts"

Cohesion: 0.23
Nodes (14): ChatMessageResponse, ChatRecentTurn, ChatPanel(), isSafeUrl(), ChatMessage, ChatState, clearChat(), loadCommercialBriefing() (+6 more)

### Community 73 - "BravoCRM — Plataforma de Gestión Comercial"

Cohesion: 0.13
Nodes (17): backend/src/app.ts (única definición de la app), backend/src/server.ts (solo app.listen()), ADR 0001: Entrypoint único (docs/adr/0001-entrypoint-unico.md), Bloqueo de geografía (no implementado, decisión de negocio pendiente), A-06: IP Allowlist Neon + rotación de DATABASE_URL, Infraestructura, perímetro y red — BravoCRM, A-07: Un solo entrypoint de servidor (resuelto, C-06/C-07), Matriz de permisos por rol (docs/MATRIZ_PERMISOS.md) (+9 more)

### Community 74 - "Clasificación de datos personales — BravoCRM"

Cohesion: 0.25
Nodes (9): client_contacts (nombre, email, teléfono, cargo), clients.rut, Encargados de tratamiento externos (Vercel, Neon, Sentry, Resend), isValidRut (quotations.ts), Clasificación de datos personales — BravoCRM, Decisión: pgcrypto para RUT postergado (AC-5.8), sessions.ip_address / sessions.user_agent, users.name / users.email (empleado) (+1 more)

### Community 75 - "C-1: Script SQL de purga de 17 tablas huérfanas"

Cohesion: 0.33
Nodes (6): Familia cmms_* (14 tablas, arquitectura relacional normalizada abandonada: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, cmms_mantenimientos, cmms_pm_planes, cmms_pm_plantillas, cmms_sla_config, cmms_checklist_plantillas, cmms_usuarios_clientes, cmms_ot_comentarios, cmms_ot_eventos, cmms_push_subscriptions, cmms_informes_mantenimiento), C-1: Script SQL de purga de 17 tablas huérfanas, tabla cmms_idempotency_keys (endpoint /api/cmms/:resource inactivo), tabla cmms_one_shot_migrations (registro huérfano), tabla playing_with_neon (sandbox Neon), tabla providers (modelo cancelado)

### Community 76 - "Proyecto CMMS HVAC PRO IA Studio (Los Cabros)"

Cohesion: 0.25
Nodes (9): Dexie.js — IndexedDB local offline, stores en inglés, Neon PostgreSQL (serverless, tablas en español), @neondatabase/serverless — SQL directo (ORM/queries), Problema 7: Neon IP allowlist — acción manual de infraestructura, no resoluble por el agente IA, Proyecto CMMS HVAC PRO IA Studio (Los Cabros), Stack frontend React + TypeScript + Vite (desplegado en Vercel), Repo nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO, Política de corrección quirúrgica: lista cerrada de 18 ARCHIVOS AUTORIZADOS, prohibido tocar nada fuera de ella (reduce riesgo de regresión del agente IA) (+1 more)

### Community 77 - "tabla clients (legacy, dual de clientes para Dexie offline)"

Cohesion: 0.25
Nodes (8): C-2: Migración de FK 'clients' → 'clientes' y unificación de sync, función ensureTables() (server.ts), tabla audit_logs, tabla calendar, tabla clients (legacy, dual de clientes para Dexie offline), tabla inventory, tabla ordenes_servicio, tabla preventive_maintenance

### Community 78 - "createQuotationsRouter"

Cohesion: 0.16
Nodes (20): applyQuotationUpdate(), createQuotationsRouter(), errorCode(), errorMessage(), fullQuotation(), normalizeFrequency(), normalizeKind(), normalizeOperState() (+12 more)

### Community 79 - "compilerOptions"

Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 81 - "src/db/database.ts (alias tablas Dexie)"

Cohesion: 0.50
Nodes (4): C-7: Detección incompleta de firma en validateWorkOrderPayload, src/db/database.ts (alias tablas Dexie), Dexie IndexedDB (stores offline), función validateWorkOrderPayload (server.ts)

### Community 82 - "vercel.json"

Cohesion: 0.20
Nodes (9): C-8: Rewrites de vercel.json apuntando a rutas inexistentes, maxDuration, buildCommand, functions, api/index.ts, headers, outputDirectory, rewrites (+1 more)

### Community 83 - "Registro de actividades de tratamiento — BravoCRM (borrador técnico)"

Cohesion: 0.29
Nodes (7): docs/CLASIFICACION_DATOS.md, DPA (Data Processing Agreement) pendiente por proveedor, docs/DR_RUNBOOK.md, Ley 19.628 (Chile, vigente), Ley 21.719 (Chile, vigencia diciembre 2026), Registro de actividades de tratamiento — BravoCRM (borrador técnico), RPO/RTO (24h/4h)

### Community 84 - "Despliegue — BravoCRM (Vercel autodeploy + CI)"

Cohesion: 0.21
Nodes (13): Branch protection de GitHub (gate pendiente para cerrar A-09), Variables de entorno requeridas en Vercel, Flujo actual: Vercel despliega en paralelo a CI (gap A-09), migrate-production resuelve migraciones automáticas pre-deploy (A-09 parcial), Despliegue — BravoCRM (Vercel autodeploy + CI), Rollback: vercel rollback / Promote to Production, A-09: CD con gates, migraciones y rollback (parcial), Secret PROD_DATABASE_URL (compartido entre backup.yml, cleanup-sessions.yml y ci.yml→migrate-production) (+5 more)

### Community 85 - "App.tsx"

Cohesion: 0.14
Nodes (13): App(), ChatPanel, Clients, Dashboard, Maintenance, NavSyncButton(), Page, Quotations (+5 more)

### Community 86 - "ProjectFull"

Cohesion: 0.20
Nodes (11): CostosTabProps, EquipoTabProps, OverviewTabProps, ProjectDetailProps, Props, fmt(), ProjectsKanban(), ProjectStatus (+3 more)

### Community 88 - "weeklyCommercialSummary.ts"

Cohesion: 0.24
Nodes (9): AlertQuotation, buildEmailHtml(), buildMarkdownSummary(), ExecutivePerformance, generateWeeklyCommercialSummary(), GlobalKpis, RECIPIENTS, TopClient (+1 more)

### Community 90 - ".prettierrc.json"

Cohesion: 0.33
Nodes (5): arrowParens, printWidth, semi, singleQuote, trailingComma

### Community 91 - "CatalogAutocomplete.tsx"

Cohesion: 0.29
Nodes (7): CatalogAutocomplete(), DIST_ITEM, DropPos, fmtCLP, Props, ItemRowProps, CatalogItemUI

### Community 92 - "api/clients.ts"

Cohesion: 0.21
Nodes (10): createClientsRouter(), withContacts(), buildApp(), FakeState, makeFakeDb(), clientCreateSchema, clientUpdateSchema, contactCreateSchema (+2 more)

### Community 93 - "Backend (API, localhost:3000)"

Cohesion: 0.50
Nodes (5): Backend (API, localhost:3000), Base de Datos (PostgreSQL, localhost:5432), Frontend (React, localhost:5173), PgAdmin (localhost:5050), start-bravocrm.bat

### Community 94 - "tsconfig.build.json"

Cohesion: 0.50
Nodes (3): exclude, extends, ./tsconfig.json

### Community 95 - "authMiddleware"

Cohesion: 0.29
Nodes (10): createDashboardRouter(), authMiddleware(), AuthRequest, isAccessToken(), optionalAuth(), TokenPayload, buildApp(), sign() (+2 more)

### Community 96 - "Checklist de PR (pruebas, seguridad, impacto RNF)"

Cohesion: 0.50
Nodes (4): RNF y SLOs (docs/RNF_Y_SLOS.md), Checklist de PR (pruebas, seguridad, impacto RNF), roleMiddleware para rutas con rol específico, Validación de body con zod en rutas de escritura

### Community 97 - "frontend/index.html (shell de la app, PWA 'Maestro Comercial')"

Cohesion: 0.50
Nodes (4): frontend/index.html (shell de la app, PWA 'Maestro Comercial'), /src/main.tsx (punto de montaje React), manifest.json (manifiesto PWA), sw.js (service worker, registro PWA)

### Community 117 - "permissions.test.ts"

Cohesion: 0.14
Nodes (12): createProjectsRouter(), normalizeStatus(), buildApp(), fakePool, routes, buildApp(), FakeState, makeFakeDb() (+4 more)

### Community 118 - "Soft-delete (deleted_at)"

Cohesion: 0.67
Nodes (3): Función de anonimización propuesta para client_contacts, Derechos ARCO+ (acceso, rectificación, cancelación, oposición), Soft-delete (deleted_at)

### Community 119 - "A-17: antipatrón de conexiones en serverless"

Cohesion: 0.67
Nodes (3): A-17: antipatrón de conexiones en serverless, @neondatabase/serverless (dependencia eliminada, cero usos reales), Prueba de carga k6 (no ejecutada, 50 usuarios concurrentes)

### Community 121 - "Hallazgos bloqueados por acceso externo"

Cohesion: 0.33
Nodes (6): A-08: Entorno de staging (nada implementado), A-14: Pruebas contra PostgreSQL real (parcial), A-15: Pruebas end-to-end Playwright (no implementado), A-18: Plan de recuperación ante desastres (parcial), Hallazgos bloqueados por acceso externo, Job integration (Postgres 15 real + migrate:up + npm test)

### Community 139 - "PROMPT_CORRECCION_v3_DBA_AUDITORIA.md"

Cohesion: 0.33
Nodes (5): C-0: Prerequisitos manuales de infraestructura, Auditoría forense DBA Senior (35 tablas, Junio 2026), scripts/init-db.ts, Neon PostgreSQL (producción), Repositorio nelsonbravosalas-creator/CMMS-HVAC-PRO--IA-STUDIO

## Ambiguous Edges - Review These

- `POST /api/quotations` → `Módulo Proyectos (próximo)` [AMBIGUOUS]
  docs/historico/MODULO_COTIZACIONES_RESUMEN.md · relation: conceptually_related_to
- `db.json (persistencia)` → `Módulo Reportes (próximo)` [AMBIGUOUS]
  docs/historico/MODULO_COTIZACIONES_RESUMEN.md · relation: conceptually_related_to
- `src/db/mockDb.ts — aliases de tablas Dexie en frontend` → `src/lib/syncEngine.ts — motor de sincronización frontend` [AMBIGUOUS]
  docs/historico/PROMPT_CORRECCION_FINAL_CMMS_v2.md · relation: shares_data_with
- `tabla clientes (canónica, maestra de tenants)` → `Familia cmms_* (14 tablas, arquitectura relacional normalizada abandonada: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, cmms_mantenimientos, cmms_pm_planes, cmms_pm_plantillas, cmms_sla_config, cmms_checklist_plantillas, cmms_usuarios_clientes, cmms_ot_comentarios, cmms_ot_eventos, cmms_push_subscriptions, cmms_informes_mantenimiento)` [AMBIGUOUS]
  docs/historico/PROMPT_CORRECCION_v3_DBA_AUDITORIA.md · relation: conceptually_related_to

## Knowledge Gaps

- **776 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `arrowParens` (+771 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 956 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **43 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `POST /api/quotations` and `Módulo Proyectos (próximo)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `db.json (persistencia)` and `Módulo Reportes (próximo)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `src/db/mockDb.ts — aliases de tablas Dexie en frontend` and `src/lib/syncEngine.ts — motor de sincronización frontend`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `tabla clientes (canónica, maestra de tenants)` and `Familia cmms_* (14 tablas, arquitectura relacional normalizada abandonada: cmms_clientes, cmms_users, cmms_equipos, cmms_tickets, cmms_mantenimientos, cmms_pm_planes, cmms_pm_plantillas, cmms_sla_config, cmms_checklist_plantillas, cmms_usuarios_clientes, cmms_ot_comentarios, cmms_ot_eventos, cmms_push_subscriptions, cmms_informes_mantenimiento)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `supertest` connect `ref_vitest` to `api/auth.ts`, `authThrottle.ts`, `quotations-import.test.ts`, `backend/package.json`, `app.ts`, `validate`, `api/clients.ts`, `api/invoices.ts`, `permissions.test.ts`, `ref_express`, `loop.ts`, `authMiddleware`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `Invoices.test.tsx`, `Quotations.tsx`, `ProjectsGantt.tsx`, `Projects.test.tsx`, `api.ts`, `chatStore.ts`, `Projects.tsx`, `Dashboard.tsx`, `maestro-store.ts`, `Catalogo.tsx`, `App.tsx`, `frontend/package.json`, `uiStore.ts`, `ProjectFull`, `CatalogAutocomplete.tsx`, `Login.tsx`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `Problema 1: URLs incorrectas en frontend (camelCase/inventory vs kebab-case/parts real)` connect `ENTITY_TYPE_MAP (assets->equipos, workOrders->ordenes_trabajo, maintenance->mantenimiento_preventivo, parts->repuestos, technicians->tecnicos)` to `Quotations.tsx`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
