# ADR 0001: un solo entrypoint de aplicación

**Estado:** aceptado e implementado.
**Fecha:** 2026-07-30/31 (remediación de hallazgos críticos y de riesgo alto).

## Contexto

El repositorio tenía hasta cuatro definiciones distintas de "el backend":

| Archivo                     | Rol original                                     | Problema                                                                                |
| --------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `backend/src/app.ts`        | El que corría en producción (vía `api/index.ts`) | CORS abierto, sin logging de peticiones que sí tenía `server.ts`                        |
| `backend/src/server.ts`     | `npm run dev`                                    | CORS distinto, no montaba `/api/admin`                                                  |
| `backend/src/server-dev.ts` | `npm run dev:json`                               | Un backend paralelo completo sobre `db.json`, con su propia lógica de negocio duplicada |
| `api/index.ts`              | Handler de Vercel                                | Tenía un fallback con usuarios hardcodeados si faltaba `DATABASE_URL`                   |

"Funciona en local" no garantizaba nada sobre producción porque literalmente
se ejecutaba código distinto.

## Decisión

`backend/src/app.ts` es la **única** definición de middlewares, routers y
manejo de errores. Todo lo demás delega en él:

```
app.ts        → única definición de la aplicación
server.ts     → import app from './app'; pool.connect().then(() => app.listen(env.PORT))
api/index.ts  → lazy-import de app.ts cuando hay DATABASE_URL; si no, responde 503
server-dev.ts → sigue existiendo como modo de desarrollo offline (db.json),
                pero ya no es una segunda implementación de negocio con
                secretos hardcodeados — ver C-05 de la remediación de críticos.
```

Ya se eliminó, en la remediación de críticos, el fallback con usuarios
hardcodeados de `api/index.ts` (`TEST_USERS`) y el `server-dev.js` duplicado
en JS suelto que existía además del `.ts`.

## Consecuencias

- Un middleware agregado en `app.ts` (request-id, helmet, rate limiting)
  aparece automáticamente en todos los modos de ejecución que importan `app`.
- `server-dev.ts` (modo JSON, sin Postgres) sigue siendo una implementación
  aparte a propósito — es una herramienta de desarrollo offline, no un
  sustituto de producción, y no debe crecer más lógica de negocio nueva.
  Cualquier feature nueva se implementa en `app.ts`/routers reales primero.
- `docker-compose.yml` + `npm run migrate:up` + `npm run seed` es el camino
  recomendado para desarrollo local con Postgres real (ver `docs/SETUP_LOCAL.md`),
  no `server-dev.ts`.

## Verificación

```bash
wc -l backend/src/server.ts api/index.ts   # ambos deben ser archivos chicos, sin lógica propia
```
