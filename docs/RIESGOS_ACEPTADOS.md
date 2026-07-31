# Riesgos aceptados — dependencias y arquitectura

**Actualizado:** 2026-07-30 (remediación C-09).

## Vulnerabilidades de dependencias

Estado al cerrar C-09: `npm audit --omit=dev` reporta **0 vulnerabilidades** en
`/`, `/backend` y `/frontend`. Se resolvieron eliminando dependencias no usadas
(`bcrypt` nativo, `uuid`, `xlsx` — ninguna tenía referencias reales en el código),
actualizando `body-parser`/`dompurify` de forma automática, y subiendo
`react-router` a la major 8 (breaking, verificado con `tsc`, la suite de tests y
`vite build`, todos en verde).

No queda ninguna vulnerabilidad conocida sin parchear al momento de escribir esto.
Si `npm audit` vuelve a reportar algo sin fix disponible, documentarlo aquí con:
paquete, por qué no se puede actualizar/reemplazar todavía, mitigación mientras
tanto, y fecha de revisión.

## AC-9.7 — Dependencias runtime duplicadas entre `package.json` raíz y `backend/`

**No resuelto a propósito en este sprint.** El `package.json` de la raíz duplica
manualmente las dependencias de `backend/src/app.ts` (`express`, `pg`, `cors`,
`jsonwebtoken`, `bcryptjs`, `winston`, `dotenv`, y ahora `helmet`,
`express-rate-limit`, `zod`, `@sentry/node`). Esto **no es un descuido**: es el
mecanismo por el cual la función serverless `api/index.ts` obtiene esas
dependencias en Vercel, ya que `vercel.json` solo ejecuta `npm install` explícito
dentro de `frontend/`, y Vercel instala el `package.json` raíz por defecto para
las funciones — pero no instala automáticamente `backend/package.json`.

**Por qué no se convirtió a npm workspaces ahora:** es un cambio de arquitectura
de build con impacto directo en cómo Vercel resuelve dependencias para la función
serverless. No se puede verificar sin desplegar de verdad, y un error ahí rompe
el login de producción. Se prefirió minimizar el blast radius de este sprint
(mantener el patrón existente, solo mantenerlo sincronizado) sobre una
refactorización de build sin forma de probarla end-to-end aquí.

**Mitigación actual:** cualquier dependencia nueva que use `backend/src/app.ts`
(o algo que importe transitivamente) debe agregarse también al `package.json`
raíz con la misma versión. Si no, el runtime de Vercel puede fallar con
`Cannot find module` en producción aunque los tests locales pasen.

**Revisión sugerida:** al planificar el siguiente cambio de infraestructura de
despliegue (por ejemplo, si se separa el backend a su propio servicio), evaluar
migrar a npm workspaces o eliminar la duplicación por completo.

## Riesgo operacional a vigilar (no es una vulnerabilidad)

El equipo de auditoría original reportó un fallo de `@rolldown/binding-linux-x64-gnu`
al correr `npm test` en Linux. No se pudo reproducir en este entorno (Windows).
La primera corrida real de `.github/workflows/ci.yml` en `ubuntu-latest` es la
prueba definitiva; si falla por esto, la causa más probable es un
`package-lock.json` que no registra el binding opcional para esa plataforma —
regenerar el lockfile corriendo `npm install` (no `npm ci`) una vez en un entorno
Linux y commitear el resultado.
