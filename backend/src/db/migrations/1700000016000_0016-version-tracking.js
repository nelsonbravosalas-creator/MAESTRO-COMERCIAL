// Motivo de versión + referencia a versión padre
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS version_reason    TEXT,
      ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES quotations(id) ON DELETE SET NULL;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE quotations
      DROP COLUMN IF EXISTS version_reason,
      DROP COLUMN IF EXISTS parent_version_id;
  `)
}
