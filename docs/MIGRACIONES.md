# Migraciones de base de datos — BravoCRM

Desde C-11, el esquema se versiona con [node-pg-migrate](https://github.com/salsita/node-pg-migrate)
en `backend/src/db/migrations/`. `schema.sql` y los `migration_v*.sql` sueltos
dejaron de ser la forma de crear/actualizar la base de datos — son código muerto
histórico, no algo que haya que volver a correr a mano.

## Por qué se hizo así

Antes de esto no había forma de saber qué versión de esquema corría en
producción: `schema.sql` (montado por `docker-compose.yml`) y los archivos
`migration_v2/v3/v4/v5` sueltos se solapaban y hasta se contradecían entre sí
(por ejemplo, `migration_v2_missing.sql` creaba `quotations.status` con default
`'Emitida'`, mientras que `schema.sql` ya usaba `'Borrador'`). Al armar la
migración base se detectó además que `project_tasks` — usada activamente por
`backend/src/api/projects.ts` — nunca estuvo en `schema.sql`: una base de datos
nueva levantada solo con `docker-compose` no tenía esa tabla.

## Migraciones actuales

| Archivo                               | Contenido                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `1700000001000_0001-baseline.js`      | Todo `schema.sql` (estado acumulado real, incluye lo que antes eran migration_v2/v4/v5)       |
| `1700000002000_0002-project-tasks.js` | Tabla `project_tasks` (antes `migration_v3_project_tasks.sql`, nunca aplicada a `schema.sql`) |

Ambas leen el SQL desde los archivos existentes en `backend/src/db/` (no lo
duplican) para que siga habiendo una sola fuente de verdad del DDL.

La tabla no es exhaustiva: de la `0003` en adelante cada migración se explica
en su propio encabezado y el listado real es el directorio. La última es
`1700000019000_0019-auth-throttle.js` (tabla `auth_throttle`: el contador de
intentos de login compartido entre instancias serverless — ver
`backend/src/middleware/authThrottle.ts`).

Desde la `0003`, una migración nueva **no** actualiza `schema.sql`: ese archivo
es la foto congelada que consume `0001-baseline`. Las migraciones posteriores
usan `IF NOT EXISTS` para ser idempotentes sobre bases que ya venían creadas.

## Comandos

```bash
cd backend
npm run migrate:up              # aplica todas las migraciones pendientes
npm run migrate:down            # revierte la última migración
npm run migrate:create -- nombre-de-la-migracion   # crea un archivo nuevo
```

`node-pg-migrate` crea y mantiene la tabla `pgmigrations` para saber qué se
aplicó y en qué orden. Lee `DATABASE_URL` del entorno (mismo que usa la app).

## Regla para migraciones nuevas

**Compatibilidad hacia atrás:** expand → migrate → contract. Una migración
nueva no debe romper el código que todavía no se desplegó (y viceversa,
un rollback de código no debe dejar el esquema en un estado que el código
anterior no entienda). En la práctica:

- Agregar una columna: siempre con `DEFAULT` o `NULL`-able, nunca `NOT NULL`
  sin default sobre una tabla con filas.
- Quitar una columna: primero dejar de usarla en el código (deploy), después
  quitarla del esquema (otra migración, otro deploy).
- Cada migración corre en su propia transacción (comportamiento por defecto de
  node-pg-migrate): si falla a la mitad, no deja la base de datos a medio
  migrar.
- Escribir siempre un `down` reversible, salvo que sea genuinamente imposible
  (ej. la migración baseline) — en ese caso, `exports.down = false` explícito
  y un comentario que diga por qué.

## CI

El job `integration` de `.github/workflows/ci.yml` levanta un Postgres 15 real,
corre `npm run migrate:up` contra él y después la suite de tests del backend.
Si una migración rompe algo, CI falla ahí, no en producción.

Además, el job **`migrate-production`** del mismo archivo corre
`npm run migrate:up` contra la base de datos real (`secrets.PROD_DATABASE_URL`,
Neon) en cada push a `master` — esto cierra el punto "Automatizar la ejecución
de migraciones" que quedaba pendiente más abajo. Decisiones de diseño:

- **Sin `needs`, corre en paralelo al resto de los jobs.** Vercel despliega
  apenas llega el push y no espera a que CI termine (`docs/DESPLIEGUE.md`), así
  que encadenar este job detrás de `quality`/`integration` solo agrandaría la
  ventana entre "el código nuevo ya está en producción" y "el esquema nuevo ya
  está aplicado" — sin eliminarla, porque de todas formas no se puede bloquear
  el despliegue de Vercel desde GitHub Actions. Correrlo cuanto antes minimiza
  esa ventana en vez de agrandarla.
- **Es seguro que corra sin esperar al resto de CI** porque (a) cada migración
  corre en su propia transacción — si falla, no deja el esquema a medias — y
  (b) la regla de arriba (expand → migrate → contract) garantiza que el código
  de un push nunca depende de una columna o tabla que ese mismo push recién
  esté creando. El incidente que motivó esto no fue una carrera de
  milisegundos: fue que el paso manual no se ejecutaba durante semanas.
- **Reusa el secret `PROD_DATABASE_URL`**, el mismo que ya usan `backup.yml` y
  `cleanup-sessions.yml` — no hay nada nuevo que configurar en GitHub si esos
  workflows ya funcionan.
- **El secret se verifica en el primer paso, antes del checkout y del
  `npm ci`**, y viaja por `env:` en vez de interpolado dentro del `run:`. Un
  `${{ secrets.X }}` incrustado en el script se expande como texto antes de que
  bash lo lea: una contraseña con comillas o `$` rompería el script, o peor,
  se ejecutaría.
- Un `concurrency.group: migrate-production` evita que dos pushes seguidos
  corran `migrate:up` contra producción al mismo tiempo.

**Incidente que motivó esto (2026-09-09):** el paso manual documentado más
abajo no se ejecutó desde `0009-billing-flow` (2026-08-15) hasta que un 500
real en producción (`column "loss_reason" does not exist`, al marcar una
cotización como "Perdida") delató que faltaban 9 migraciones. Eran todas
aditivas (los `DROP` viven en `down`), así que no hubo pérdida de datos, pero
sí semanas de funcionalidad rota en producción por drift de esquema.

## Pendiente (fuera de este sprint)

- Ejecutar `npm run migrate:up` contra la base de datos de producción real
  (Neon) y confirmar que el resultado coincide con el estado actual — no se
  pudo verificar en este entorno por no tener acceso a esa base de datos.
- ~~Automatizar la ejecución de migraciones como paso previo al deploy~~ —
  hecho, ver la sección CI de arriba.
