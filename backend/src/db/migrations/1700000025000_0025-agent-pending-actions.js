// Control de escrituras del agente: las herramientas de tipo 'write' no se
// ejecutan de inmediato. Quedan como acciones pendientes (agent_pending_actions)
// hasta que el usuario que originó el run las confirma o cancela.
//
// Cada fila guarda los argumentos exactos que el usuario vio en la propuesta,
// para que la confirmación ejecute lo mismo que se mostró y nada más.

exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS agent_pending_actions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id         UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      tenant_id      UUID,
      user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool           TEXT NOT NULL,
      args           JSONB NOT NULL DEFAULT '{}',
      summary        TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'confirmed', 'cancelled', 'failed', 'expired')),
      result_summary TEXT,
      error          TEXT,
      expires_at     TIMESTAMPTZ NOT NULL,
      resolved_at    TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ix_agent_pending_actions_user_status
      ON agent_pending_actions (user_id, status);
    CREATE INDEX IF NOT EXISTS ix_agent_pending_actions_run
      ON agent_pending_actions (run_id);
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS agent_pending_actions;
  `)
}
