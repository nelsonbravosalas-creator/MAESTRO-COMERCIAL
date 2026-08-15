// Log de actividad por cotización
exports.shorthands = undefined

exports.up = pgm => {
  pgm.noTransaction()
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
        CREATE TYPE activity_type AS ENUM ('llamada','reunion','correo','nota_interna','otro');
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS quotation_activities (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quotation_id  UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      activity_type activity_type NOT NULL DEFAULT 'nota_interna',
      content       TEXT NOT NULL,
      created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_quotation_activities_q ON quotation_activities(quotation_id, created_at DESC);
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS quotation_activities;
    DROP TYPE IF EXISTS activity_type;
  `)
}
