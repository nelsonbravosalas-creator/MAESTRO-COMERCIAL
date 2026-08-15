// Fecha de próximo seguimiento para cotizaciones Enviadas
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS follow_up_date DATE;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE quotations DROP COLUMN IF EXISTS follow_up_date;
  `)
}
