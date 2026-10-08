// Tabla de reglas que el asistente de cotizaciones aprende por chat (tarifas
// de colación/bonificación, qué comunas cuentan como "Santiago", etc.).
//
// Insert-only con "supersede": enseñar una regla nueva no actualiza la fila
// vigente, inserta una fila nueva y marca `superseded_at` en la anterior. Da
// auditoría completa (quién enseñó qué y cuándo, y qué decía antes) sin tabla
// de historial aparte — la "vigente" es simplemente la fila con
// `superseded_at IS NULL` para ese `rule_key` (ver índice parcial abajo).
//
// chatbot_actions es la bitácora de qué hizo el bot por instrucción de cada
// usuario (crear/modificar cotización, enseñar regla, consultar precio) —
// mismo espíritu que auth_throttle (migración 0019): estado compartido en
// Postgres, no en memoria de la instancia serverless.
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS chatbot_rules (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_key       TEXT NOT NULL,
      value          JSONB NOT NULL,
      unit           TEXT,
      notes          TEXT,
      created_by     UUID REFERENCES users(id),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      superseded_at  TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ix_chatbot_rules_current
      ON chatbot_rules (rule_key) WHERE superseded_at IS NULL;

    CREATE TABLE IF NOT EXISTS chatbot_actions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID REFERENCES users(id),
      instruction   TEXT NOT NULL,
      action_type   TEXT NOT NULL,
      quotation_id  UUID REFERENCES quotations(id),
      llm_provider  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_chatbot_actions_user ON chatbot_actions (user_id, created_at);

    -- Valores de referencia conservadores (investigación de mercado, no legal) —
    -- se corrigen por chat ("la colación es $X") apenas el usuario los vea mal.
    INSERT INTO chatbot_rules (rule_key, value, unit, notes) VALUES
      ('tarifa_colacion_diaria', '6000', 'CLP/persona/dia',
       'Valor semilla de referencia (mercado construccion/HVAC Chile 2026). Corregir por chat.'),
      ('tarifa_bonificacion_desplazamiento_diaria', '15000', 'CLP/persona/dia',
       'Valor semilla de referencia, sin pernoctacion (mercado construccion/HVAC Chile 2026). Corregir por chat.'),
      ('comunas_region_metropolitana',
       '["Cerrillos","Cerro Navia","Conchali","El Bosque","Estacion Central","Huechuraba","Independencia","La Cisterna","La Florida","La Granja","La Pintana","La Reina","Las Condes","Lo Barnechea","Lo Espejo","Lo Prado","Macul","Maipu","Nunoa","Pedro Aguirre Cerda","Penalolen","Providencia","Pudahuel","Quilicura","Quinta Normal","Recoleta","Renca","San Joaquin","San Miguel","San Ramon","Santiago","Vitacura"]',
       null,
       'Comunas consideradas "Santiago" para efectos de bonificacion por desplazamiento (nucleo urbano, provincia de Santiago). No incluye el resto de la Region Metropolitana (Puente Alto, Melipilla, Til Til, etc.) porque esas si suelen justificar bonificacion. Ajustar por chat si el criterio real es otro.')
    ON CONFLICT DO NOTHING;
  `)
}

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS chatbot_actions;
    DROP TABLE IF EXISTS chatbot_rules;
  `)
}
