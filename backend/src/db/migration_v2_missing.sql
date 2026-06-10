-- Maestro Comercial v2 - migracion idempotente para bases parcialmente inicializadas.

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS catalog_items (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  cost_category_id NOT NULL,
  description  TEXT             NOT NULL,
  unit_name    TEXT             NOT NULL,
  unit_price   NUMERIC(14,2)    NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  is_active    BOOLEAN          NOT NULL DEFAULT true,
  sort_order   SMALLINT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uix_catalog_item ON catalog_items (category_id, lower(description));
CREATE INDEX IF NOT EXISTS ix_catalog_category ON catalog_items (category_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS clients (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  rut         TEXT,
  activity    TEXT,
  address     TEXT,
  city        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uix_clients_rut ON clients (rut) WHERE deleted_at IS NULL AND rut IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_clients_name ON clients (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS client_contacts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  cargo      TEXT,
  email      TEXT,
  phone      TEXT,
  is_primary BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_contacts_client_id ON client_contacts (client_id);

CREATE TABLE IF NOT EXISTS quotations (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  correlative TEXT         NOT NULL,
  client_id   UUID         NOT NULL REFERENCES clients(id),
  contact_id  UUID         REFERENCES client_contacts(id) ON DELETE SET NULL,
  enduser     TEXT,
  ref         TEXT,
  date        DATE         NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status      quote_status NOT NULL DEFAULT 'Emitida',
  oper_state  oper_state,
  uf_value    NUMERIC(10,2) NOT NULL,
  iva_pct     SMALLINT     NOT NULL DEFAULT 19 CHECK (iva_pct BETWEEN 0 AND 100),
  notes       TEXT,
  version     SMALLINT     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_quotations_correlative UNIQUE (correlative)
);
CREATE INDEX IF NOT EXISTS ix_quotations_client_id ON quotations (client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_quotations_status ON quotations (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_quotations_date ON quotations (date DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS quotation_categories (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID             NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  category_id  cost_category_id NOT NULL,
  label        TEXT             NOT NULL,
  margin_pct   NUMERIC(5,2)     NOT NULL DEFAULT 30 CHECK (margin_pct >= 0 AND margin_pct < 100),
  color        TEXT,
  note         TEXT,
  sort_order   SMALLINT         NOT NULL DEFAULT 0,
  CONSTRAINT uq_quote_category UNIQUE (quotation_id, category_id)
);
CREATE INDEX IF NOT EXISTS ix_qcat_quotation_id ON quotation_categories (quotation_id);

CREATE TABLE IF NOT EXISTS quotation_line_items (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id    UUID             NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  category_id     cost_category_id NOT NULL,
  catalog_item_id UUID             REFERENCES catalog_items(id) ON DELETE SET NULL,
  description     TEXT             NOT NULL,
  unit_name       TEXT             NOT NULL,
  quantity        NUMERIC(12,3)    NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  days            SMALLINT         NOT NULL DEFAULT 1 CHECK (days >= 1),
  unit_price      NUMERIC(14,2)    NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  sort_order      SMALLINT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_qli_quotation_id ON quotation_line_items (quotation_id);
CREATE INDEX IF NOT EXISTS ix_qli_category ON quotation_line_items (quotation_id, category_id);

CREATE TABLE IF NOT EXISTS quotation_terms (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID      NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  term_type    term_type NOT NULL,
  content      TEXT      NOT NULL,
  sort_order   SMALLINT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_terms_quotation_id ON quotation_terms (quotation_id, term_type);

DROP VIEW IF EXISTS v_quotation_totals;
CREATE VIEW v_quotation_totals AS
SELECT
  q.id AS quotation_id,
  q.correlative,
  q.status,
  q.uf_value,
  q.iva_pct,
  COALESCE(SUM(qli.quantity * qli.days * qli.unit_price), 0) AS costo_neto,
  COALESCE(SUM(
    CASE WHEN qc.margin_pct < 100
      THEN (qli.quantity * qli.days * qli.unit_price) / NULLIF(1.0 - qc.margin_pct / 100.0, 0)
      ELSE qli.quantity * qli.days * qli.unit_price
    END
  ), 0) AS venta_neta,
  COALESCE(SUM(
    CASE WHEN qc.margin_pct < 100
      THEN (qli.quantity * qli.days * qli.unit_price) / NULLIF(1.0 - qc.margin_pct / 100.0, 0)
           - (qli.quantity * qli.days * qli.unit_price)
      ELSE 0
    END
  ), 0) AS beneficio_bruto
FROM quotations q
LEFT JOIN quotation_line_items qli ON qli.quotation_id = q.id
LEFT JOIN quotation_categories qc ON qc.quotation_id = q.id AND qc.category_id = qli.category_id
WHERE q.deleted_at IS NULL
GROUP BY q.id, q.correlative, q.status, q.uf_value, q.iva_pct;

CREATE TABLE IF NOT EXISTS projects (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID           REFERENCES quotations(id) ON DELETE SET NULL,
  client_id    UUID           NOT NULL REFERENCES clients(id),
  name         TEXT           NOT NULL,
  status       project_status NOT NULL DEFAULT 'planning',
  start_date   DATE,
  end_date     DATE,
  budget       NUMERIC(14,2)  NOT NULL DEFAULT 0,
  progress_pct SMALLINT       NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  created_by   UUID           REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_project_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ix_projects_client_id ON projects (client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_projects_status ON projects (status) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_assignments (
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS execution_costs (
  id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID             NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id cost_category_id,
  description TEXT             NOT NULL,
  quantity    NUMERIC(12,3)    NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price  NUMERIC(14,2)    NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  created_by  UUID             REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_excosts_project_id ON execution_costs (project_id);

DROP VIEW IF EXISTS v_project_spending;
CREATE VIEW v_project_spending AS
SELECT
  p.id AS project_id,
  p.name,
  p.budget,
  p.progress_pct,
  COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS gasto_real,
  p.budget - COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS saldo
FROM projects p
LEFT JOIN execution_costs ec ON ec.project_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.name, p.budget, p.progress_pct;

CREATE TABLE IF NOT EXISTS invoices (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID           REFERENCES projects(id) ON DELETE SET NULL,
  client_id    UUID           NOT NULL REFERENCES clients(id),
  number       TEXT           NOT NULL,
  date         DATE           NOT NULL DEFAULT CURRENT_DATE,
  payment_cond payment_cond   NOT NULL DEFAULT 'credit',
  due_date     DATE,
  net_amount   NUMERIC(14,2)  NOT NULL DEFAULT 0,
  tax_amount   NUMERIC(14,2)  NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2)  NOT NULL DEFAULT 0,
  is_factored  BOOLEAN        NOT NULL DEFAULT false,
  status       invoice_status NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  created_by   UUID           REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_invoices_number UNIQUE (number),
  CONSTRAINT ck_invoice_due_date CHECK (due_date IS NULL OR due_date >= date)
);
CREATE INDEX IF NOT EXISTS ix_invoices_client_id ON invoices (client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_invoices_status ON invoices (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_invoices_date ON invoices (date DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS invoice_items (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id             UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  quotation_line_item_id UUID          REFERENCES quotation_line_items(id) ON DELETE SET NULL,
  description            TEXT          NOT NULL,
  quantity               NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price             NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  sort_order             SMALLINT      NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_inv_items_invoice_id ON invoice_items (invoice_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL    PRIMARY KEY,
  entity_type TEXT         NOT NULL,
  entity_id   UUID         NOT NULL,
  action      audit_action NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  user_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  ip_address  INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_new_data ON audit_logs USING GIN (new_data);

CREATE TABLE IF NOT EXISTS sync_events (
  id          BIGSERIAL   PRIMARY KEY,
  client_uid  TEXT        NOT NULL,
  entity_type TEXT        NOT NULL,
  entity_id   UUID        NOT NULL,
  action      audit_action NOT NULL,
  payload     JSONB       NOT NULL,
  server_seq  BIGINT,
  applied_at  TIMESTAMPTZ,
  conflict    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_sync_pending ON sync_events (client_uid, created_at) WHERE applied_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_sync_entity ON sync_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_sync_seq ON sync_events (server_seq);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_catalog_items_updated_at') THEN
    CREATE TRIGGER trg_catalog_items_updated_at BEFORE UPDATE ON catalog_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clients_updated_at') THEN
    CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contacts_updated_at') THEN
    CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON client_contacts FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_quotations_updated_at') THEN
    CREATE TRIGGER trg_quotations_updated_at BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_qli_updated_at') THEN
    CREATE TRIGGER trg_qli_updated_at BEFORE UPDATE ON quotation_line_items FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_projects_updated_at') THEN
    CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_excosts_updated_at') THEN
    CREATE TRIGGER trg_excosts_updated_at BEFORE UPDATE ON execution_costs FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoices_updated_at') THEN
    CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;
