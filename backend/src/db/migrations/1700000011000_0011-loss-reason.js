// Motivo de pérdida al marcar cotización como 'Perdida'
exports.shorthands = undefined

exports.up = pgm => {
  pgm.noTransaction()
  pgm.sql(`
    CREATE TYPE IF NOT EXISTS loss_reason AS ENUM (
      'precio','competidor','sin_presupuesto','timing','no_ejecutado','otro'
    );
    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS loss_reason loss_reason,
      ADD COLUMN IF NOT EXISTS loss_competitor TEXT,
      ADD COLUMN IF NOT EXISTS loss_notes TEXT;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE quotations
      DROP COLUMN IF EXISTS loss_reason,
      DROP COLUMN IF EXISTS loss_competitor,
      DROP COLUMN IF EXISTS loss_notes;
  `)
}
