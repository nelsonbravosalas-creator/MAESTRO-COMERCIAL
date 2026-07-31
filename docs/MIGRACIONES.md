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

| Archivo | Contenido |
|---|---|
| `1700000001000_0001-baseline.js` | Todo `schema.sql` (estado acumulado real, incluye lo que antes eran migration_v2/v4/v5) |
| `1700000002000_0002-project-tasks.js` | Tabla `project_tasks` (antes `migration_v3_project_tasks.sql`, nunca aplicada a `schema.sql`) |

Ambas leen el SQL desde los archivos existentes en `backend/src/db/` (no lo
duplican) para que siga habiendo una sola fuente de verdad del DDL.

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

## Pendiente (fuera de este sprint)

- Ejecutar `npm run migrate:up` contra la base de datos de producción real
  (Neon) y confirmar que el resultado coincide con el estado actual — no se
  pudo verificar en este entorno por no tener acceso a esa base de datos.
- Automatizar la ejecución de migraciones como paso previo al deploy de
  Vercel (hoy es un paso manual: correr `npm run migrate:up` con el
  `DATABASE_URL` de producción antes de mergear un cambio de esquema).
