import { Pool } from 'pg'
import { AgentContext, AgentTool, AgentToolResult } from './types'
import type { ToolRegistry } from './registry'
import { httpError } from '../utils/httpError'
import { errorMessage } from '../services/chatbotOps'

// Control de escrituras: una herramienta 'write' del agente no se ejecuta
// durante el run. Se registra aquí como propuesta y el usuario la confirma
// (o la cancela) desde el chat. Así el asistente nunca cambia una cotización
// ni una regla sin que la persona vea exactamente qué se va a hacer.

export const PENDING_ACTION_TTL_MINUTES = 15

export interface PendingActionRef {
  id: string
  tool: string
  summary: string
  expires_at: string
}

export function describeWriteAction(
  tool: AgentTool | undefined,
  name: string,
  args: Record<string, unknown>
): string {
  return tool?.describe ? tool.describe(args) : `Ejecutar ${name}`
}

export async function createPendingAction(
  pool: Pool,
  input: {
    runId: string
    tenantId?: string | null
    userId: string
    tool: string
    args: Record<string, unknown>
    summary: string
  }
): Promise<PendingActionRef> {
  // Misma propuesta ya pendiente (mismo usuario, herramienta y args): se reutiliza
  // en vez de duplicarla, para no dejar dos botones de confirmar la misma acción.
  const argsJson = JSON.stringify(input.args)
  const dup = await pool.query(
    `SELECT id, expires_at FROM agent_pending_actions
      WHERE user_id = $1 AND tool = $2 AND args = $3::jsonb
        AND status = 'pending' AND expires_at > NOW()
      LIMIT 1`,
    [input.userId, input.tool, argsJson]
  )
  if (dup.rows.length > 0) {
    const existing = dup.rows[0] as { id: string; expires_at: Date | string }
    return {
      id: existing.id,
      tool: input.tool,
      summary: input.summary,
      expires_at: new Date(existing.expires_at).toISOString(),
    }
  }
  const { rows } = await pool.query(
    `INSERT INTO agent_pending_actions (run_id, tenant_id, user_id, tool, args, summary, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW() + INTERVAL '${PENDING_ACTION_TTL_MINUTES} minutes')
     RETURNING id, expires_at`,
    [input.runId, input.tenantId ?? null, input.userId, input.tool, argsJson, input.summary]
  )
  const row = rows[0] as { id: string; expires_at: Date | string }
  return {
    id: row.id,
    tool: input.tool,
    summary: input.summary,
    expires_at: new Date(row.expires_at).toISOString(),
  }
}

// Explica por qué una acción no se pudo reclamar. Cuenta como "no encontrada"
// cualquier id que no sea del usuario, para no revelar acciones ajenas.
async function rejectionFor(pool: Pool, id: string, userId: string): Promise<Error> {
  const { rows } = await pool.query(
    `SELECT status, user_id, expires_at <= NOW() AS expired
       FROM agent_pending_actions WHERE id = $1`,
    [id]
  )
  const row = rows[0] as { status: string; user_id: string; expired: boolean } | undefined
  if (!row || row.user_id !== userId) {
    return httpError('Acción no encontrada', 404)
  }
  if (row.status === 'pending' && row.expired) {
    await pool.query(
      `UPDATE agent_pending_actions SET status = 'expired', resolved_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [id]
    )
    return httpError('La acción expiró. Pídela de nuevo para revisarla.', 410)
  }
  return httpError('La acción ya fue resuelta.', 409)
}

export interface ConfirmedAction {
  reply: string
  result: AgentToolResult
}

export async function confirmPendingAction(
  pool: Pool,
  registry: ToolRegistry,
  input: { id: string; userId: string; userRole?: string; model: string }
): Promise<ConfirmedAction> {
  // Reclamo atómico: solo una petición puede pasar de 'pending' a 'confirmed',
  // así que un doble clic o una reintentada no ejecuta la escritura dos veces.
  const claimed = await pool.query(
    `UPDATE agent_pending_actions
        SET status = 'confirmed', resolved_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > NOW()
      RETURNING run_id, tenant_id, tool, args`,
    [input.id, input.userId]
  )
  if ((claimed.rowCount ?? 0) === 0) {
    throw await rejectionFor(pool, input.id, input.userId)
  }
  const row = claimed.rows[0] as {
    run_id: string
    tenant_id: string | null
    tool: string
    args: Record<string, unknown>
  }

  const tool = registry.getToolsForRole(input.userRole).find(t => t.name === row.tool)
  if (!tool || tool.kind !== 'write') {
    await markResolved(
      pool,
      input.id,
      'failed',
      'La herramienta ya no está disponible para tu rol.'
    )
    throw httpError('La herramienta ya no está disponible para tu rol.', 403)
  }

  const ctx: AgentContext = {
    pool,
    userId: input.userId,
    userRole: input.userRole,
    instruction: 'Confirmación de acción pendiente del usuario',
    quotationId: null,
    recentTurns: [],
    graphContext: '',
    runId: row.run_id,
    tenantId: row.tenant_id,
    model: input.model,
  }

  let result: AgentToolResult
  try {
    result = await tool.execute(row.args, ctx)
  } catch (err) {
    const msg = errorMessage(err)
    await markResolved(pool, input.id, 'failed', msg)
    // Un 4xx de la herramienta (p. ej. 409 por cambio posterior) conserva su estado.
    const status = (err as { status?: number }).status
    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw httpError(msg, status)
    }
    throw httpError(`No se pudo ejecutar la acción: ${msg}`, 500)
  }

  await pool.query(`UPDATE agent_pending_actions SET result_summary = $2 WHERE id = $1`, [
    input.id,
    result.summary,
  ])
  return { reply: result.summary, result }
}

async function markResolved(
  pool: Pool,
  id: string,
  status: 'failed',
  error: string
): Promise<void> {
  await pool.query(`UPDATE agent_pending_actions SET status = $2, error = $3 WHERE id = $1`, [
    id,
    status,
    error,
  ])
}

export async function cancelPendingAction(
  pool: Pool,
  input: { id: string; userId: string }
): Promise<void> {
  const res = await pool.query(
    `UPDATE agent_pending_actions
        SET status = 'cancelled', resolved_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > NOW()
      RETURNING id`,
    [input.id, input.userId]
  )
  if ((res.rowCount ?? 0) === 0) {
    throw await rejectionFor(pool, input.id, input.userId)
  }
}
