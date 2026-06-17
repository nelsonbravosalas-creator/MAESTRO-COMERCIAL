-- Maestro Comercial v3 — project_tasks table
-- Run once against the production database

CREATE TABLE IF NOT EXISTS project_tasks (
  id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID             NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT             NOT NULL,
  description  TEXT,
  assignee_id  UUID             REFERENCES users(id) ON DELETE SET NULL,
  category_id  cost_category_id,
  start_date   DATE,
  end_date     DATE,
  progress_pct SMALLINT         NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  status       TEXT             NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','in_progress','done','blocked')),
  sort_order   SMALLINT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  created_by   UUID             REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_task_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS ix_tasks_project_id ON project_tasks (project_id);
CREATE INDEX IF NOT EXISTS ix_tasks_assignee   ON project_tasks (assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_tasks_status     ON project_tasks (project_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tasks_updated_at') THEN
    CREATE TRIGGER trg_tasks_updated_at
      BEFORE UPDATE ON project_tasks
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
  END IF;
END;
$$;
