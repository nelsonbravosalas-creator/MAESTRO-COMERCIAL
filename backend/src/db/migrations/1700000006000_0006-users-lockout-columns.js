// A-03 (bloqueo por intentos fallidos): `users.failed_login_attempts` y
// `users.locked_until` existen en schema.sql desde hace tiempo, pero la base de
// producción venía de una versión anterior del archivo y nunca las recibió.
//
// El desvío quedó invisible porque 0001-baseline se marcó con `--fake` sobre esa
// base preexistente: --fake registra la migración como aplicada, pero no puede
// reconciliar un esquema que ya diverge. El síntoma era un login roto —
// api/auth.ts:87 selecciona ambas columnas, así que la consulta fallaba entera
// con "column failed_login_attempts does not exist" pese a que la API arrancaba.
//
// Aditiva e idempotente: en una base creada desde schema.sql estas columnas ya
// existen y esta migración no hace nada. El DEFAULT 0 rellena las filas
// existentes sin necesidad de backfill.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS failed_login_attempts SMALLINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until          TIMESTAMPTZ;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS failed_login_attempts,
      DROP COLUMN IF EXISTS locked_until;
  `)
}
