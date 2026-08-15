// OC (Orden de Compra) en cotizaciones adjudicadas.
//
// Agrega a la tabla quotations los campos necesarios para registrar
// la recepción de la OC u otro medio de aceptación formal del cliente:
//
//   oc_number        — Número o código de la OC (texto libre)
//   oc_date          — Fecha de la OC
//   oc_conditions    — Condiciones comerciales (texto libre)
//   oc_document      — Archivo adjunto (PDF/PNG/HTML) almacenado como BYTEA
//   oc_document_name — Nombre original del archivo adjunto
//   oc_document_size — Tamaño en bytes del archivo adjunto

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS oc_number        TEXT,
      ADD COLUMN IF NOT EXISTS oc_date          DATE,
      ADD COLUMN IF NOT EXISTS oc_conditions    TEXT,
      ADD COLUMN IF NOT EXISTS oc_document      BYTEA,
      ADD COLUMN IF NOT EXISTS oc_document_name TEXT,
      ADD COLUMN IF NOT EXISTS oc_document_size INT;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE quotations
      DROP COLUMN IF EXISTS oc_number,
      DROP COLUMN IF EXISTS oc_date,
      DROP COLUMN IF EXISTS oc_conditions,
      DROP COLUMN IF EXISTS oc_document,
      DROP COLUMN IF EXISTS oc_document_name,
      DROP COLUMN IF EXISTS oc_document_size;
  `)
}
