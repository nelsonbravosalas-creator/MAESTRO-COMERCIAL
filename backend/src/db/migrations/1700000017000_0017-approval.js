// Aprobación interna + estado 'En revisión'
exports.shorthands = undefined

exports.up = pgm => {
  pgm.noTransaction()
  pgm.sql(`
    ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'En revisión' AFTER 'Emitida';
    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approval_notes TEXT;
    CREATE TABLE IF NOT EXISTS approval_thresholds (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      min_amount_clp NUMERIC(14,2),
      min_margin_pct NUMERIC(5,2),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS approval_thresholds;
    ALTER TABLE quotations
      DROP COLUMN IF EXISTS approved_by,
      DROP COLUMN IF EXISTS approved_at,
      DROP COLUMN IF EXISTS approval_notes;
  `)
}
