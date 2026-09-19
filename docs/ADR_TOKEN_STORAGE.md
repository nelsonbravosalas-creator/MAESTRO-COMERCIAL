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
- El access token expira en `JWT_EXPIRY` (**1 h** por defecto desde A-02, no 8 h como
  decía antes este documento; ver `backend/src/config/env.ts`) — ventana de exposición
  acotada si un token es robado vía XSS.
- **El refresh token ya no sirve como access token.** Los dos se firman con el mismo
  `JWT_SECRET`, así que hasta ahora un refresh de 30 días pasaba `jwt.verify` sin
  objeción y funcionaba como Bearer en cualquier endpoint protegido: la ventana de 1 h
  de arriba era, en la práctica, de 30 días. `backend/src/middleware/auth.ts` ahora
  mira el claim `kind` y rechaza todo lo que no sea un access token.

## Deuda conocida: el chequeo de `kind` es una lista negra, no blanca

`middleware/auth.ts` acepta un token si `kind === 'access'` **o si no trae
`kind`**, y rechaza cualquier otro valor. La segunda condición existe solo por
compatibilidad: los access tokens emitidos antes de ese cambio no llevan el
claim, y exigirlo habría devuelto 401 a todas las sesiones vivas en el momento
del despliegue.

Pasada una ventana de `JWT_EXPIRY` (1 h) desde el despliegue ya no queda
ninguno de esos tokens en circulación. A partir de ahí el chequeo puede
endurecerse a la forma estricta:

```ts
const isAccessToken = (decoded: TokenPayload) => decoded.kind === 'access'
```

Al hacerlo hay que borrar el test
`sigue aceptando un access token legado sin claim kind` de
`backend/src/middleware/__tests__/auth.test.ts`, que es el que fija hoy esa
compatibilidad a propósito.

En seguridad no cambia nada mientras `refresh` sea el único otro `kind` que la
aplicación emite; endurecerlo es higiene para cuando aparezca un tercer tipo de
token.

## Riesgo residual

Un XSS exitoso en el frontend sigue permitiendo robar el token de `localStorage`. Este
riesgo queda documentado como **Alto** (no crítico) en la auditoría base y debe
abordarse cuando se implemente una Content-Security-Policy estricta para el frontend.

## Revisión

Revisar esta decisión antes de **2026-10-30** o si se agrega un dominio propio único
para producción (elimina la restricción de LAN que hoy complica usar cookies).
