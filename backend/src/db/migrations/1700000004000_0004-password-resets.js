// A-04: tabla de tokens de recuperación de contraseña. Solo se guarda el hash
// del token (mismo patrón que A-02 con los refresh tokens), nunca el valor en
// claro.
//
// IF NOT EXISTS a propósito: schema.sql (0001-baseline) ya incluye esta tabla
// para instalaciones nuevas, así que en una base de datos recién creada esta
// migración no tiene nada que hacer. En una base de datos existente que venía
// de antes de A-04 (con 0001 marcado como ya aplicado vía --fake), esta sí
// crea la tabla de verdad.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_pwreset_user ON password_resets (user_id) WHERE used_at IS NULL;
  `)
}

exports.down = pgm => {
  pgm.sql(`DROP TABLE IF EXISTS password_resets;`)
}
