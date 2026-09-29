// Dos categorías nuevas de costeo: "Materiales Mecánico" (mec) y "Materiales
// Eléctricos" (ele) — no reemplazan "Provisión de Materiales" (mat), se
// agregan aparte.
//
// - 'mec' sigue el patrón compartido de siempre: vive en `catalog_items`
//   junto a las demás categorías (columna `category_id`).
// - 'ele' tiene su propia tabla `electrical_catalog_items` (pedido
//   explícito, sin necesidad técnica de campos distintos — el costeo de
//   una cotización de todas formas sigue usando `quotation_line_items` con
//   `category_id='ele'`, por eso el enum necesita el valor igual que 'mec').
//
// ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción en
// PostgreSQL < 16 (mismo motivo que la migración 0009).
exports.shorthands = undefined

exports.up = pgm => {
  pgm.noTransaction()
  pgm.sql(`
    ALTER TYPE cost_category_id ADD VALUE IF NOT EXISTS 'mec';
    ALTER TYPE cost_category_id ADD VALUE IF NOT EXISTS 'ele';

    CREATE TABLE IF NOT EXISTS electrical_catalog_items (
      id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      description TEXT          NOT NULL,
      unit_name   TEXT          NOT NULL,
      unit_price  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      is_active   BOOLEAN       NOT NULL DEFAULT true,
      sort_order  SMALLINT      NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uix_electrical_catalog_item
      ON electrical_catalog_items (lower(description));
    CREATE INDEX IF NOT EXISTS ix_electrical_catalog_active
      ON electrical_catalog_items (is_active) WHERE is_active = true;

    DO $$ BEGIN
      CREATE TRIGGER trg_electrical_catalog_items_updated_at
        BEFORE UPDATE ON electrical_catalog_items
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS electrical_catalog_items;
  `)
  // 'mec'/'ele' no se pueden quitar del enum sin recrear el tipo — se dejan
  // intencionalmente (mismo criterio que otras migraciones de este repo que
  // agregan valores a un ENUM, ver 0009-billing-flow.js).
}
