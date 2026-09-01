// El N° de factura deja de rellenarse con un folio autogenerado engañoso
// (F-<timestamp>) al generar la orden de facturación: ahora queda NULL
// ("Pendiente N° X", calculado en el frontend) hasta que alguien lo
// ingresa a mano con el folio real del SII. La restricción UNIQUE se
// mantiene — Postgres permite múltiples NULL sin conflicto.
//
// Backfill: limpia a NULL los folios ya generados automáticamente que
// nadie alcanzó a editar (coinciden exactamente con el patrón que genera
// hoy `F-${Date.now()...}` en backend/src/api/invoices.ts), sin tocar
// ningún folio real que un usuario haya ingresado.
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE invoices ALTER COLUMN number DROP NOT NULL;
    UPDATE invoices SET number = NULL WHERE number ~ '^F-[0-9]{6}$';
  `)
}

exports.down = pgm => {
  // No se puede recuperar el folio autogenerado original (nunca se guardó
  // aparte) — down solo revierte la restricción, dejando NOT NULL sobre
  // los NULL existentes fallaría, así que primero hay que rellenarlos.
  pgm.sql(`
    UPDATE invoices SET number = 'SIN-FOLIO-' || id WHERE number IS NULL;
    ALTER TABLE invoices ALTER COLUMN number SET NOT NULL;
  `)
}
