// Hitos por factura (criterio de emisión)
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS quotation_invoice_milestones (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quotation_id   UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      invoice_number SMALLINT NOT NULL CHECK (invoice_number BETWEEN 1 AND 2),
      description    TEXT NOT NULL,
      pct_of_total   NUMERIC(5,2),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (quotation_id, invoice_number)
    );
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS quotation_invoice_milestones;
  `)
}
