// Selector de moneda única (CLP/UF/USD) en Cotizaciones y Mantención.
// Permite cambiar la moneda de visualización sin alterar los cálculos base (CLP).

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE quotations
    ADD COLUMN display_currency VARCHAR(3) NOT NULL DEFAULT 'CLP'
    CHECK (display_currency IN ('CLP', 'UF', 'USD'));
  `)
}

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE quotations
    DROP COLUMN display_currency;
  `)
}
