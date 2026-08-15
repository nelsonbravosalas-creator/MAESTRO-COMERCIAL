// Timestamps de ciclo comercial + trigger automático
exports.shorthands = undefined

exports.up = pgm => {
  pgm.noTransaction()
  pgm.sql(`
    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS sent_at    TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS closed_at  TIMESTAMPTZ;

    CREATE OR REPLACE FUNCTION fn_quotation_cycle_timestamps()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.status = 'Enviada' AND OLD.status != 'Enviada' THEN
        NEW.sent_at := NOW();
      END IF;
      IF NEW.status = 'Adjudicada' AND OLD.status != 'Adjudicada' THEN
        NEW.awarded_at := NOW();
      END IF;
      IF NEW.status = 'Cerrada' AND OLD.status != 'Cerrada' THEN
        NEW.closed_at := NOW();
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_quotation_cycle ON quotations;
    CREATE TRIGGER trg_quotation_cycle
      BEFORE UPDATE ON quotations
      FOR EACH ROW EXECUTE FUNCTION fn_quotation_cycle_timestamps();
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_quotation_cycle ON quotations;
    DROP FUNCTION IF EXISTS fn_quotation_cycle_timestamps();
    ALTER TABLE quotations
      DROP COLUMN IF EXISTS sent_at,
      DROP COLUMN IF EXISTS awarded_at,
      DROP COLUMN IF EXISTS closed_at;
  `)
}
