// Agrega el tipo de cotización "mantención" (contratos de servicio
// recurrente) como un discriminador sobre la tabla quotations existente, en
// vez de una tabla paralela — reutiliza guardado/versionado/permisos ya
// probados. Ver plan: módulo "Mantenciones".
//
// CREATE TYPE no soporta IF NOT EXISTS en Postgres, por eso el bloque DO/
// EXCEPTION para que la migración sea segura de re-aplicar sobre una base
// donde 0001-baseline (schema.sql) ya haya creado estos tipos.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    DO $$ BEGIN
      CREATE TYPE quotation_kind AS ENUM ('project', 'maintenance');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE mtc_frequency AS ENUM ('mensual', 'trimestral', 'semestral', 'anual');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS kind                   quotation_kind NOT NULL DEFAULT 'project',
      ADD COLUMN IF NOT EXISTS equipment_count         INTEGER,
      ADD COLUMN IF NOT EXISTS equipment_description   TEXT,
      ADD COLUMN IF NOT EXISTS frequency               mtc_frequency,
      ADD COLUMN IF NOT EXISTS visits_per_year         SMALLINT,
      ADD COLUMN IF NOT EXISTS contract_start_date     DATE,
      ADD COLUMN IF NOT EXISTS show_uf_equivalent      BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS show_usd_equivalent     BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS usd_value               NUMERIC(10,2);

    CREATE INDEX IF NOT EXISTS ix_quotations_kind ON quotations (kind) WHERE deleted_at IS NULL;

    INSERT INTO app_config (key, value) VALUES ('dolar_value', '950')
    ON CONFLICT (key) DO NOTHING;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP INDEX IF EXISTS ix_quotations_kind;
    ALTER TABLE quotations
      DROP COLUMN IF EXISTS kind,
      DROP COLUMN IF EXISTS equipment_count,
      DROP COLUMN IF EXISTS equipment_description,
      DROP COLUMN IF EXISTS frequency,
      DROP COLUMN IF EXISTS visits_per_year,
      DROP COLUMN IF EXISTS contract_start_date,
      DROP COLUMN IF EXISTS show_uf_equivalent,
      DROP COLUMN IF EXISTS show_usd_equivalent,
      DROP COLUMN IF EXISTS usd_value;
    DROP TYPE IF EXISTS mtc_frequency;
    DROP TYPE IF EXISTS quotation_kind;
  `)
}
