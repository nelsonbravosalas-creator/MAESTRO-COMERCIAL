import { Pool, PoolClient } from 'pg'

export interface ChatbotRule<T = unknown> {
  id: string
  rule_key: string
  value: T
  unit: string | null
  notes: string | null
  created_at: string
}

export async function getCurrentRule<T = unknown>(
  db: Pool | PoolClient,
  ruleKey: string
): Promise<ChatbotRule<T> | null> {
  const result = await db.query(
    `SELECT id, rule_key, value, unit, notes, created_at
       FROM chatbot_rules
      WHERE rule_key = $1 AND superseded_at IS NULL
      LIMIT 1`,
    [ruleKey]
  )
  return result.rows[0] ?? null
}

export async function listCurrentRules(db: Pool | PoolClient): Promise<ChatbotRule[]> {
  const result = await db.query(
    `SELECT id, rule_key, value, unit, notes, created_at
       FROM chatbot_rules
      WHERE superseded_at IS NULL
      ORDER BY rule_key`
  )
  return result.rows
}

/**
 * Enseñar una regla = "supersede + insert" en una transacción: nunca se
 * actualiza la fila vigente, se marca `superseded_at` y se inserta una nueva
 * (ver migración 0021). Da auditoría completa — quién la enseñó, cuándo, y
 * qué decía antes — sin necesitar una tabla de historial aparte.
 */
export async function teachRule(
  pool: Pool,
  ruleKey: string,
  value: unknown,
  opts: { unit?: string | null; notes?: string | null; userId: string | null },
  _retrying = false
): Promise<ChatbotRule> {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query(
      `UPDATE chatbot_rules SET superseded_at = NOW() WHERE rule_key = $1 AND superseded_at IS NULL`,
      [ruleKey]
    )
    const inserted = await db.query(
      `INSERT INTO chatbot_rules (rule_key, value, unit, notes, created_by)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       RETURNING id, rule_key, value, unit, notes, created_at`,
      [ruleKey, JSON.stringify(value), opts.unit ?? null, opts.notes ?? null, opts.userId]
    )
    await db.query('COMMIT')
    return inserted.rows[0]
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    // 23505 = violación del índice único ix_chatbot_rules_current: dos
    // usuarios enseñaron la MISMA regla casi al mismo tiempo. La segunda
    // transacción queda bloqueada en el UPDATE hasta que la primera hace
    // COMMIT, y para entonces su propio UPDATE ya no encuentra ninguna fila
    // vigente que marcar — reintentar una vez (ahora sí la hay) basta; no
    // hace falta SELECT FOR UPDATE para un caso this raro.
    const code = error instanceof Object ? (error as { code?: string }).code : undefined
    if (code === '23505' && !_retrying) {
      return teachRule(pool, ruleKey, value, opts, true)
    }
    throw error
  } finally {
    db.release()
  }
}

// Misma normalización que `normalizeText` en api/quotations.ts (sin tildes,
// minúsculas) para que "Ñuñoa" calce con "nunoa" tal como quedó sembrada la
// lista en la migración 0021.
const normalizeComuna = (value: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** null = no hay regla sembrada todavía (no confundir con "false"). */
export async function isComunaEnSantiago(
  db: Pool | PoolClient,
  comuna: string | null | undefined
): Promise<boolean | null> {
  if (!comuna) return null
  const rule = await getCurrentRule<string[]>(db, 'comunas_region_metropolitana')
  if (!rule || !Array.isArray(rule.value)) return null
  const normalized = normalizeComuna(comuna)
  return rule.value.some(c => normalizeComuna(c) === normalized)
}
