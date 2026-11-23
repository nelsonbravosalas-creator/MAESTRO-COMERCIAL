// Estilo de documento y contexto del trabajo (plan 2026-11-23):
// - quotations.doc_style (TEXT, NULL = estilo actual; 'grouped_unit_price' =
//   precio unitario agrupado en vista previa y PDF).
// - quotations.work_context (JSONB, NULL = sin contexto): tarjeta "Contexto
//   del trabajo" con la proyeccion de recursos de Gemini y los recursos finales.
// - tabla work_context_examples: casos saneados (sin PII) que se usan como
//   few-shot en el analisis siguiente.
//
// Todo aditivo: no toca filas existentes. La base de produccion es compartida
// (ver memoria "Neon DB compartida"): no correr migrate:down en produccion.
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql('ALTER TABLE quotations ADD COLUMN IF NOT EXISTS doc_style TEXT')
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'quotations_doc_style_check'
      ) THEN
        ALTER TABLE quotations
          ADD CONSTRAINT quotations_doc_style_check
          CHECK (doc_style IS NULL OR doc_style IN ('default', 'grouped_unit_price'));
      END IF;
    END
    $$;
  `)
  pgm.sql('ALTER TABLE quotations ADD COLUMN IF NOT EXISTS work_context JSONB')

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS work_context_examples (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quotation_id      UUID REFERENCES quotations(id) ON DELETE SET NULL,
      kind              TEXT NOT NULL,
      tipo_trabajo      TEXT NOT NULL,
      context_sanitized JSONB NOT NULL,
      proyeccion        JSONB,
      recursos_finales  JSONB NOT NULL,
      diferencia        JSONB,
      nota              TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_work_context_examples_kind_tipo
      ON work_context_examples (kind, tipo_trabajo)
  `)
}

// Solo quita lo que agrega esta migracion.
exports.down = pgm => {
  pgm.sql('DROP INDEX IF EXISTS idx_work_context_examples_kind_tipo')
  pgm.sql('DROP TABLE IF EXISTS work_context_examples')
  pgm.sql('ALTER TABLE quotations DROP COLUMN IF EXISTS work_context')
  pgm.sql('ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_doc_style_check')
  pgm.sql('ALTER TABLE quotations DROP COLUMN IF EXISTS doc_style')
}
