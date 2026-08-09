# Riesgos aceptados — dependencias y arquitectura

**Actualizado:** 2026-07-31 (remediación de riesgo alto, A-11/A-16/A-17).

## A-17 — Antipatrón de conexiones en serverless

**Implementado:**

- `statement_timeout: 10_000` en el `Pool` de `app.ts` — una consulta lenta ya
  no puede retener una conexión indefinidamente (antes no había ningún límite).
- TLS validado (`rejectUnauthorized: true`, ver A-05) en vez de solo cifrado sin autenticar.
- `@neondatabase/serverless` **eliminado** del `package.json` raíz: estaba
  declarado pero nunca importado en ningún archivo real (`depcheck` manual vía
  grep confirmó cero usos) — exactamente el hallazgo de la evidencia original.

**No implementado — seguir usando `pg.Pool` clásico con `max: 5`, no el driver
HTTP de `@neondatabase/serverless` ni el endpoint _pooled_:**

Cambiar de driver reescribe la forma en que se ejecutan **todas** las queries
del backend (el driver HTTP de Neon no es un reemplazo drop-in de `pg` — no
soporta transacciones de la misma manera, y varios routers de este proyecto
usan `pool.connect()` + `BEGIN`/`COMMIT` explícitos). Es un cambio de alto
impacto que:

1. No se puede probar contra una Neon real en este entorno.
2. Si se hace mal, rompe silenciosamente las transacciones de
   `quotations.ts`/`invoices.ts`/`projects.ts` (creación con múltiples inserts
   relacionados) — el peor lugar posible para un bug sutil.

**Mitigación mientras tanto:** `max: 5` ya es conservador, y `statement_timeout`
evita que una conexión colgada consuma el pool completo. El riesgo real
("too many connections" bajo carga concurrente) sigue existiendo si el tráfico
crece — no se prueba con `k6` en este entorno (ver `A-17` en
`docs/HALLAZGOS_BLOQUEADOS.md`).

**Revisión sugerida:** antes de migrar el driver, conseguir el endpoint
_pooled_ de Neon (`...-pooler.neon.tech`) y cambiar solo la `DATABASE_URL` —
eso ya reduce el riesgo de agotar conexiones sin tocar una sola línea de
código, y es reversible con solo cambiar la variable de entorno de vuelta.

## A-11 — Alcance reducido de "API sin contrato, versionado ni paginación"

## A-11 — Alcance reducido de "API sin contrato, versionado ni paginación"

**Implementado:** paginación keyset real (`{ data, next_cursor, has_more }`)
en `GET /api/quotations`, el endpoint explícitamente señalado en la evidencia
original (`SELECT … FROM quotations … ORDER BY … ` sin `LIMIT`). `clients`,
`projects` e `invoices` recibieron un tope duro de filas (`?limit`, máx. 500)
en vez de paginación completa — mitiga el mismo riesgo (consulta sin límite)
sin la complejidad de construir un cursor para tres criterios de orden
distintos (alfabético por nombre, fecha de creación, fecha de factura) sin
poder probarlo contra Postgres real en este entorno.

**No implementado, diferido a propósito:**

- **Versionado `/api/v1`**: mover todas las rutas bajo un prefijo nuevo con
  `Deprecation` en las viejas toca cada router y cada llamada del frontend a
  la vez — alto radio de impacto para un cambio que no se puede probar en
  vivo aquí. El contrato actual (`/api/<recurso>`) se mantiene.
- **OpenAPI generado desde los esquemas zod** (`/api/docs`): valioso pero
  separable; no bloquea ningún riesgo de seguridad o disponibilidad.
- **Formato de error unificado en el 100% de los endpoints**: las rutas
  nuevas/tocadas en esta remediación devuelven `{ error, message, details? }`
  de forma consistente; homologar retroactivamente cada handler viejo es
  trabajo de estilo, no de riesgo, y se dejó fuera para no inflar el diff.
- **ETag/Cache-Control en `/api/config` y `/api/catalog`**: optimización de
  rendimiento menor, no un riesgo.

**Revisión sugerida:** si el volumen real de clientes/proyectos/facturas se
acerca al tope de 500, convertir esos tres listados al mismo patrón de cursor
que ya tiene `quotations` (la función `buildPage`/`decodeCursor` en
`backend/src/utils/pagination.ts` ya es reutilizable).

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

**Actualización — la mitigación manual falló y ahora está automatizada.** La
disciplina manual no se sostuvo: la raíz derivó a `express@5`, `body-parser@2` y
`dotenv@17` mientras `backend/` y toda la suite de tests seguían en `express@4`,
`body-parser@1` y `dotenv@16`. El resultado es peor que un `Cannot find module`,
porque no falla de forma visible: producción corría sobre majors que **ningún
test ejecutó nunca**, y `tsc` no lo detecta (los tipos básicos coinciden). Las
versiones se realinearon con `backend/package.json` y `scripts/check-deps-sync.mjs`
verifica la igualdad exacta de rangos en el job `vercel-function` de CI. El job
también corre ahora `npm audit --omit=dev` sobre la raíz, que antes solo se
auditaba en `backend/` y `frontend/` — es decir, justo las dependencias que sí
llegan a producción quedaban sin auditar.

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
