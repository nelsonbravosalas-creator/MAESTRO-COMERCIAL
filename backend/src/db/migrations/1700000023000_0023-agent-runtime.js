// Runtime del agente comercial (Fase A-B): registro de ejecuciones
// (agent_runs) y auditoría de pasos de herramientas (agent_steps).
//
// MULTI-EMPRESA: nacen con columna `tenant_id UUID NULL` para no sumar
// deuda técnica hacia la futura migración multi-tenant (ver memoria
// rumbo-multi-tenant).
//
// PRIVACIDAD: los campos input y output_summary en agent_steps se guardan
// previamente redactados sin PII identificatoria de clientes.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID,
      user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
      instruction  TEXT NOT NULL,
      status       TEXT NOT NULL CHECK (status IN ('running', 'done', 'needs_input', 'budget_exhausted', 'error')),
      steps_used   INT NOT NULL DEFAULT 0,
      tokens_in    INT NOT NULL DEFAULT 0,
      tokens_out   INT NOT NULL DEFAULT 0,
      model        TEXT,
      duration_ms  INT,
      error        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_agent_runs_user ON agent_runs (user_id);
    CREATE INDEX IF NOT EXISTS ix_agent_runs_created ON agent_runs (created_at DESC);

    CREATE TABLE IF NOT EXISTS agent_steps (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id          UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      tenant_id       UUID,
      idx             INT NOT NULL,
      tool            TEXT NOT NULL,
      input           JSONB NOT NULL DEFAULT '{}',
      output_summary  JSONB DEFAULT '{}',
      duration_ms     INT,
      error           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_agent_step_idx UNIQUE (run_id, idx)
    );

    CREATE INDEX IF NOT EXISTS ix_agent_steps_run ON agent_steps (run_id, idx);
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS agent_steps;
    DROP TABLE IF EXISTS agent_runs;
  `)
}
