# Matriz de permisos — BravoCRM

**Referencia única** del modelo de autorización por rol. Cualquier cambio de
permisos empieza aquí, se refleja en el backend (`roleMiddleware` en cada router)
y luego en el frontend (`usePermissions`, solo UX — el control real es el backend).

| Recurso | Acción | admin | manager | user |
|---|---|:--:|:--:|:--:|
| Cotizaciones | listar / ver | ✅ | ✅ | ✅ |
| Cotizaciones | crear / editar | ✅ | ✅ | ✅ |
| Cotizaciones | cambiar estado (emitir/adjudicar/anular) | ✅ | ✅ | ❌ |
| Cotizaciones | eliminar | ✅ | ❌ | ❌ |
| Proyectos | ver / registrar avance y costos | ✅ | ✅ | ✅ |
| Proyectos | crear / editar | ✅ | ✅ | ✅ |
| Proyectos | eliminar | ✅ | ❌ | ❌ |
| Clientes | crear / editar | ✅ | ✅ | ✅ |
| Clientes | eliminar | ✅ | ❌ | ❌ |
| Facturas | ver | ✅ | ✅ | ✅ |
| Facturas | emitir / cambiar estado | ✅ | ✅ | ❌ |
| Facturas | eliminar | ✅ | ❌ | ❌ |
| Catálogo | crear / editar | ✅ | ✅ | ❌ |
| Catálogo | eliminar | ✅ | ❌ | ❌ |
| Configuración | modificar | ✅ | ❌ | ❌ |

## Estado de implementación (2026-07-30)

Aplicado con `roleMiddleware` en el backend:

- `DELETE /api/quotations/:id` → `admin`
- `PATCH|PUT /api/quotations/:id/status` → `admin`, `manager`
- `DELETE /api/projects/:id` → `admin`
- `DELETE /api/clients/:id` → `admin`
- `DELETE /api/invoices/:id` → `admin`
- `PATCH|PUT /api/invoices/:id/status` → `admin`, `manager`
- `POST|PUT|DELETE /api/catalog/*` → `admin`, `manager` (crear/editar) / `admin` (eliminar) — ya existía
- `PATCH /api/config/:key` → `admin` — ya existía

Verificado con `backend/src/api/__tests__/permissions.test.ts` (matriz rol × endpoint).

## Gap conocido — no cubierto en este sprint

Los sub-recursos de proyecto (`DELETE /api/projects/:id/costs/:costId`,
`DELETE /api/projects/:id/assignments/:userId`,
`DELETE /api/projects/:projectId/tasks/:taskId`) hoy solo requieren estar
autenticado, sin restricción de rol. No estaban en la evidencia original del
hallazgo C-10 y no se tocaron para no cambiar comportamiento sin una decisión
explícita sobre si un `user` debe poder quitar su propia asignación/tarea.
Definir la regla y aplicarla es trabajo pendiente de seguimiento.

## Frontend

`frontend/src/hooks/usePermissions.ts` expone banderas (`canDeleteQuotation`,
`canChangeQuotationStatus`, etc.) derivadas del rol de la sesión activa, usadas
para ocultar/deshabilitar botones según esta tabla. **Es solo UX**: el control
que importa es el `roleMiddleware` del backend, probado arriba.
