// Presentacion por subsistemas de las cotizaciones de mantencion:
// - 4 regimenes nuevos en el enum mtc_frequency.
// - columna quotations.mtc_config (JSONB, NULL = un sistema, presentacion
//   detallada, sin consumibles).
//
// ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transaccion que
// luego use el valor (mismo motivo que las migraciones 0009, 0011, 0014, 0020).
exports.shorthands = undefined

exports.up = pgm => {
  pgm.noTransaction()
  for (const v of ['bimestral', 'cuatrimestral', 'especial', 'unico'])
    pgm.sql(`ALTER TYPE mtc_frequency ADD VALUE IF NOT EXISTS '${v}'`)
  pgm.sql('ALTER TABLE quotations ADD COLUMN IF NOT EXISTS mtc_config JSONB')
}

// PostgreSQL no permite quitar valores de un enum: el down solo quita la columna.
exports.down = pgm => {
  pgm.sql('ALTER TABLE quotations DROP COLUMN IF EXISTS mtc_config')
}
