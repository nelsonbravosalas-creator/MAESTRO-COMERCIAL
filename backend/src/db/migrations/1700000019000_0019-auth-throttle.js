// Contador de intentos de autenticación compartido entre instancias.
//
// `express-rate-limit` guarda su estado en el MemoryStore del proceso. En
// serverless cada instancia tibia tiene el suyo, así que el límite de 5
// intentos por 15 minutos de /api/auth/login era en realidad 5 × N instancias
// — y N lo elige la plataforma según la carga, que es justo lo que sube
// durante un ataque de fuerza bruta. INCIDENT_RUNBOOK.md describía ese
// comportamiento como una ventaja; no lo es.
//
// Esta tabla da el estado compartido que falta, sin introducir Redis. Es una
// ventana fija: `window_start` marca el inicio y `attempt_count` acumula hasta
// que la ventana vence, momento en el que la misma sentencia UPSERT la
// reinicia (ver middleware/authThrottle.ts). Una ventana deslizante sería más
// precisa pero exige guardar una fila por intento; para frenar fuerza bruta
// la diferencia no cambia nada y el costo de almacenamiento sí.
exports.shorthands = undefined

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS auth_throttle (
      bucket_key    TEXT PRIMARY KEY,
      window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempt_count INTEGER     NOT NULL DEFAULT 0
    );
    -- Sirve al DELETE de poda de scripts/cleanupSessions.ts, no a la lectura
    -- del middleware (esa va por la PK).
    CREATE INDEX IF NOT EXISTS ix_auth_throttle_window ON auth_throttle (window_start);
  `)
}

exports.down = pgm => {
  pgm.sql(`DROP TABLE IF EXISTS auth_throttle;`)
}
