# ADR: almacenamiento del token de sesión (Bearer + localStorage)

**Estado:** aceptado (postergado), con fecha de revisión.
**Fecha:** 2026-07-30
**Contexto:** remediación C-05 del plan de hallazgos críticos.

## Decisión

Se mantiene el esquema actual: JWT en `Authorization: Bearer` firmado por el backend,
almacenado en `localStorage` del navegador (`frontend/src/api/api.ts`). **No** se migra
a cookie `httpOnly; Secure; SameSite=Strict` en este sprint.

## Por qué no se migra ahora

- El frontend es una SPA servida desde el mismo dominio que la API en Vercel
  (`vercel.json` reescribe `/api/*`), pero también se usa en modo LAN
  (`frontend/.env.lan`, `start-mobile.bat`) contra un backend en otra IP:puerto.
  Cookies con `SameSite=Strict`/`Lax` complican ese caso sin reestructurar el despliegue LAN.
- Migrar rompe el contrato de `frontend/src/api/api.ts` (todas las llamadas) y el flujo
  de refresh; es un cambio de superficie amplia que merece su propio sprint, no mezclarse
  con los 12 hallazgos críticos.

## Mitigaciones ya aplicadas mientras tanto

- CORS ahora es una allowlist explícita (`C-03`), no cualquier origen: reduce el vector
  más directo de exfiltración vía fetch desde un sitio de terceros.
- Sin `dangerouslySetInnerHTML` en el frontend (verificado); React escapa por defecto.
- Helmet añade cabeceras de seguridad HTTP (`C-04`).
- El access token expira en `JWT_EXPIRY` (8 h por defecto, configurable) — ventana de
  exposición acotada si un token es robado vía XSS.

## Riesgo residual

Un XSS exitoso en el frontend sigue permitiendo robar el token de `localStorage`. Este
riesgo queda documentado como **Alto** (no crítico) en la auditoría base y debe
abordarse cuando se implemente una Content-Security-Policy estricta para el frontend.

## Revisión

Revisar esta decisión antes de **2026-10-30** o si se agrega un dominio propio único
para producción (elimina la restricción de LAN que hoy complica usar cookies).
