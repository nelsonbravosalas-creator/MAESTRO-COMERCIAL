// Flujo de facturación completo: Adjudicado → Emisión → Pago → Cierre.
//
// 1. 'Cerrada': estado terminal de la cotización cuando todas sus facturas
//    están pagadas. Se agrega al ENUM quote_status.
// 2. invoice_count_max: cuántas facturas puede generar la cotización (1 o 2).
//    Se configura al adjudicar; bloquea la creación de facturas adicionales.
// 3. sii_document / sii_document_name / sii_document_size: almacén del PDF
//    emitido por el SII. El upload de este archivo mueve la factura de
//    'draft' a 'issued'.

exports.shorthands = undefined

exports.up = pgm => {
  // ALTER TYPE ADD VALUE no puede ejecutarse dentro de una transacción en
  // PostgreSQL < 16. node-pg-migrate envuelve todo en BEGIN/COMMIT por
  // defecto, así que desactivamos esa transacción para esta migración.
  pgm.noTransaction()
  pgm.sql(`
    ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'Cerrada' AFTER 'Adjudicada';

    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS invoice_count_max SMALLINT NOT NULL DEFAULT 1;

    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS sii_document      BYTEA,
      ADD COLUMN IF NOT EXISTS sii_document_name TEXT,
      ADD COLUMN IF NOT EXISTS sii_document_size INT;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE invoices
      DROP COLUMN IF EXISTS sii_document,
      DROP COLUMN IF EXISTS sii_document_name,
      DROP COLUMN IF EXISTS sii_document_size;
    ALTER TABLE quotations
      DROP COLUMN IF EXISTS invoice_count_max;
    -- El valor 'Cerrada' del ENUM no se puede eliminar en PostgreSQL sin
    -- recrear el tipo. Se deja intencionalmente para no afectar datos existentes.
  `)
}
