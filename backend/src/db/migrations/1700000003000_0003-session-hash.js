// A-02: las sesiones existentes tenían el refresh token en texto plano en
// `refresh_token`. Antes de renombrar la columna a `refresh_token_hash`, se
// revocan todas las sesiones vigentes: después del rename, el valor almacenado
// seguiría siendo el token en claro (no un hash real), y la única forma segura
// de tratarlo es invalidarlo — nadie puede volver a autenticarse con un
// refresh token viejo, que es exactamente el comportamiento correcto.
//
// Condicional a propósito: schema.sql (la migración 0001-baseline) ya crea la
// tabla con el nombre nuevo `refresh_token_hash` directamente, así que en una
// base de datos nueva esta migración no tiene nada que renombrar.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    UPDATE sessions SET revoked_at = NOW() WHERE revoked_at IS NULL;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'sessions' AND column_name = 'refresh_token'
      ) THEN
        ALTER TABLE sessions RENAME COLUMN refresh_token TO refresh_token_hash;
      END IF;
    END;
    $$;
  `)
}

exports.down = pgm => {
  pgm.sql(`ALTER TABLE sessions RENAME COLUMN refresh_token_hash TO refresh_token;`)
}
