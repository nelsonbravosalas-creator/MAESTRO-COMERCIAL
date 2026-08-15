// Vincula facturas con cotizaciones de origen.
// Una cotización Adjudicada puede generar múltiples facturas (anticipo,
// estados de avance, término), por lo que es una relación N:1 en invoices.
// El N° de folio SII se ingresa manualmente; este campo es solo para
// trazabilidad interna del proceso de cobranza.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS ix_invoices_quotation_id
      ON invoices (quotation_id) WHERE deleted_at IS NULL AND quotation_id IS NOT NULL;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP INDEX IF EXISTS ix_invoices_quotation_id;
    ALTER TABLE invoices DROP COLUMN IF EXISTS quotation_id;
  `)
}
