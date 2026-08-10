// Módulo de gestión de facturación (Fase 1). La emisión sigue siendo del SII;
// esto es control de cobranza: pagos, vencimientos, seguimiento y factoring.
//
// Tres decisiones de modelo que vale la pena dejar escritas:
//
// 1. Los pagos van en su propia tabla, no en campos de `invoices`. En Chile el
//    abono parcial es la norma, y con un solo `status` no se puede representar
//    "pagaron 2 de 6,5 millones". Además da historial de cobranza gratis.
//
// 2. El estado de pago NO se guarda: se deriva en `v_invoice_balance` a partir
//    de total − pagos − notas de crédito. Un estado guardado a mano siempre
//    termina desincronizado del dinero real; uno derivado no puede mentir.
//
// 3. El factoring es una tabla aparte y no un booleano, porque tiene ciclo de
//    vida propio (cesión → anticipo → liquidación) y costo financiero que se
//    necesita poder reportar.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    -- ── Tipos ────────────────────────────────────────────────────────────
    DO $$ BEGIN
      CREATE TYPE payment_method AS ENUM
        ('transferencia', 'cheque', 'efectivo', 'tarjeta', 'otro');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    -- Condiciones de pago reales. El enum anterior (payment_cond) mezclaba
    -- condición con estado: 'partial' no es una forma de pactar el pago sino el
    -- resultado de haber recibido un abono — eso ahora lo dice v_invoice_balance.
    DO $$ BEGIN
      CREATE TYPE payment_term AS ENUM
        ('contado', 'dias_15', 'dias_30', 'dias_60', 'dias_90');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    -- Tipo de documento tributario del SII. La nota de crédito (61) importa:
    -- rebaja lo adeudado, y sin modelarla el saldo queda mal calculado.
    DO $$ BEGIN
      CREATE TYPE sii_doc_type AS ENUM ('factura_afecta', 'factura_exenta', 'nota_credito');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE financing_type AS ENUM ('factoring', 'confirming');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE financing_status AS ENUM ('cedida', 'anticipada', 'liquidada', 'rechazada');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    -- ── Campos de seguimiento en invoices ────────────────────────────────
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS observations   TEXT,
      ADD COLUMN IF NOT EXISTS follow_up_date DATE,
      ADD COLUMN IF NOT EXISTS doc_type       sii_doc_type NOT NULL DEFAULT 'factura_afecta',
      ADD COLUMN IF NOT EXISTS payment_term   payment_term NOT NULL DEFAULT 'dias_30',
      -- Una nota de crédito referencia a la factura que rebaja.
      ADD COLUMN IF NOT EXISTS credits_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

    -- Traspasa la condición de pago vieja a la nueva antes de descartarla.
    -- 'partial' cae a dias_30 porque nunca fue una condición: era un estado.
    --
    -- Condicional a propósito: en una base nueva schema.sql ya crea la tabla con
    -- payment_term directamente y payment_cond no existe, así que el UPDATE
    -- fallaría con "column payment_cond does not exist". Mismo patrón que 0003.
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'invoices' AND column_name = 'payment_cond'
      ) THEN
        UPDATE invoices SET payment_term = CASE payment_cond::text
          WHEN 'cash'   THEN 'contado'::payment_term
          WHEN 'credit' THEN 'dias_30'::payment_term
          ELSE 'dias_30'::payment_term
        END
        WHERE payment_cond IS NOT NULL;

        ALTER TABLE invoices DROP COLUMN payment_cond;
      END IF;
    END;
    $$;

    DROP TYPE IF EXISTS payment_cond;

    CREATE INDEX IF NOT EXISTS ix_invoices_due_date
      ON invoices (due_date) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS ix_invoices_follow_up
      ON invoices (follow_up_date) WHERE deleted_at IS NULL AND follow_up_date IS NOT NULL;

    -- ── Pagos (abonos) ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id   UUID           NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      paid_at      DATE           NOT NULL DEFAULT CURRENT_DATE,
      amount       NUMERIC(14,2)  NOT NULL CHECK (amount > 0),
      method       payment_method NOT NULL DEFAULT 'transferencia',
      reference    TEXT,
      observations TEXT,
      created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      created_by   UUID           REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS ix_payments_invoice ON invoice_payments (invoice_id);
    CREATE INDEX IF NOT EXISTS ix_payments_date    ON invoice_payments (paid_at DESC);

    -- ── Factoring / confirming ───────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS invoice_factoring (
      id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id         UUID             NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      type               financing_type   NOT NULL DEFAULT 'factoring',
      company            TEXT             NOT NULL,
      ceded_at           DATE             NOT NULL DEFAULT CURRENT_DATE,
      advance_amount     NUMERIC(14,2)    NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
      rate_pct           NUMERIC(6,3)     CHECK (rate_pct IS NULL OR rate_pct >= 0),
      cost_amount        NUMERIC(14,2)    NOT NULL DEFAULT 0 CHECK (cost_amount >= 0),
      expected_settle_at DATE,
      settled_at         DATE,
      status             financing_status NOT NULL DEFAULT 'cedida',
      observations       TEXT,
      created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
      created_by         UUID             REFERENCES users(id) ON DELETE SET NULL,
      -- Una factura se cede una sola vez a la vez.
      CONSTRAINT uq_factoring_invoice UNIQUE (invoice_id)
    );

    CREATE INDEX IF NOT EXISTS ix_factoring_status ON invoice_factoring (status);

    DROP TRIGGER IF EXISTS trg_factoring_updated_at ON invoice_factoring;
    CREATE TRIGGER trg_factoring_updated_at
      BEFORE UPDATE ON invoice_factoring FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

    -- ── Vista de saldos y estado derivado ────────────────────────────────
    -- Sigue el patrón de v_quotation_totals / v_project_spending: el dinero se
    -- calcula, no se almacena.
    CREATE OR REPLACE VIEW v_invoice_balance AS
    SELECT
      i.id AS invoice_id,
      i.total_amount,
      COALESCE(p.pagado, 0)                                   AS paid_amount,
      COALESCE(nc.creditado, 0)                               AS credited_amount,
      i.total_amount - COALESCE(p.pagado, 0) - COALESCE(nc.creditado, 0) AS balance,
      -- Días de mora: positivo = vencida hace N días. NULL si no hay vencimiento.
      CASE WHEN i.due_date IS NULL THEN NULL
           ELSE (CURRENT_DATE - i.due_date) END               AS days_overdue,
      CASE
        WHEN i.status = 'cancelled'                                          THEN 'anulada'
        WHEN i.total_amount - COALESCE(p.pagado,0) - COALESCE(nc.creditado,0) <= 0
                                                                             THEN 'pagada'
        WHEN COALESCE(p.pagado, 0) > 0 AND i.due_date IS NOT NULL
             AND i.due_date < CURRENT_DATE                                   THEN 'parcial_vencida'
        WHEN COALESCE(p.pagado, 0) > 0                                       THEN 'parcial'
        WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE            THEN 'vencida'
        WHEN i.due_date IS NOT NULL AND i.due_date <= CURRENT_DATE + 7       THEN 'por_vencer'
        ELSE 'al_dia'
      END                                                     AS payment_state
    FROM invoices i
    LEFT JOIN (
      SELECT invoice_id, SUM(amount) AS pagado
        FROM invoice_payments GROUP BY invoice_id
    ) p ON p.invoice_id = i.id
    LEFT JOIN (
      -- Notas de crédito que rebajan esta factura.
      SELECT credits_invoice_id AS invoice_id, SUM(total_amount) AS creditado
        FROM invoices
       WHERE doc_type = 'nota_credito' AND deleted_at IS NULL
         AND credits_invoice_id IS NOT NULL
       GROUP BY credits_invoice_id
    ) nc ON nc.invoice_id = i.id
    WHERE i.deleted_at IS NULL;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP VIEW IF EXISTS v_invoice_balance;
    DROP TABLE IF EXISTS invoice_factoring;
    DROP TABLE IF EXISTS invoice_payments;

    DO $$ BEGIN
      CREATE TYPE payment_cond AS ENUM ('cash', 'credit', 'partial');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payment_cond payment_cond NOT NULL DEFAULT 'credit';

    ALTER TABLE invoices
      DROP COLUMN IF EXISTS observations,
      DROP COLUMN IF EXISTS follow_up_date,
      DROP COLUMN IF EXISTS doc_type,
      DROP COLUMN IF EXISTS payment_term,
      DROP COLUMN IF EXISTS credits_invoice_id;

    DROP TYPE IF EXISTS financing_status;
    DROP TYPE IF EXISTS financing_type;
    DROP TYPE IF EXISTS sii_doc_type;
    DROP TYPE IF EXISTS payment_term;
    DROP TYPE IF EXISTS payment_method;
  `)
}
