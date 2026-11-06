// Cubicador agentico: borradores de cubicacion y parametros editables.
//
// cubicador_borradores guarda la entrevista y el resultado de una cubicacion
// mientras el usuario la afina, antes de ingresarla como cotizacion. Vence a los
// 7 dias y usa `version` para control optimista de concurrencia.
// cubicador_parametros guarda constantes de calculo editables (clave -> valor).
//
// Migracion aditiva: la base de produccion la comparte otro bot. `down` borra
// solo estas dos tablas. Ambas llevan tenant_id nullable (rumbo multi-empresa).

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS cubicador_borradores (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID,
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quotation_id UUID,
      perfil       TEXT NOT NULL,
      estado       TEXT NOT NULL DEFAULT 'entrevista'
                     CHECK (estado IN ('entrevista', 'cubicado', 'ingresado', 'cancelado')),
      ficha        JSONB NOT NULL DEFAULT '{}',
      resultado    JSONB,
      version      INT NOT NULL DEFAULT 1,
      expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_cubicador_borradores_user_estado
      ON cubicador_borradores (user_id, estado);

    CREATE TABLE IF NOT EXISTS cubicador_parametros (
      clave      TEXT PRIMARY KEY,
      tenant_id  UUID,
      valor      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS cubicador_borradores;
    DROP TABLE IF EXISTS cubicador_parametros;
  `)
}
