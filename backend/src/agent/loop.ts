import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { callLlmWithTools, GeminiContent, GeminiPart } from '../services/llm'
import { AgentContext, AgentRunResult, AgentStepRecord, AgentToolResult } from './types'
import { defaultToolRegistry, ToolRegistry } from './registry'
import {
  scrubPii,
  PERSONA_PROMPT,
  ChatbotProactiveNote,
  errorMessage,
} from '../services/chatbotOps'

export const MAX_STEPS = 5
export const WALL_CLOCK_BUDGET_MS = 40_000

function sanitizeForAudit(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return scrubPii(obj)
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj
  if (Array.isArray(obj)) return obj.map(sanitizeForAudit)
  if (typeof obj === 'object') {
    const res: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (/rut|email|telefono|phone/i.test(k)) {
        res[k] = '[REDACTED]'
      } else {
        res[k] = sanitizeForAudit(v)
      }
    }
    return res
  }
  return String(obj)
}

function buildAgentSystemPrompt(ctx: AgentContext): string {
  return [
    PERSONA_PROMPT,
    '',
    'Eres el Agente Comercial Inteligente de BravoCRM / Maestro-Comercial.',
    'Tu objetivo es asistir al usuario en todo el ciclo comercial HVAC con criterio profesional, rigor técnico y precisión financiera.',
    '',
    'Capacidades disponibles (herramientas):',
    '- buscar_catalogo: consultar ítems y precios de lista en los catálogos mecánico y eléctrico.',
    '- consultar_regla / ensenar_regla: leer o definir tarifas de colación, viáticos y comunas de la RM.',
    '- consultar_precio_web: averiguar precios actuales de mercado en Chile para materiales o insumos que no están en el catálogo.',
    '- calcular_items_automaticos: estimar mano de obra y viáticos según días, dotación y comuna.',
    '- crear_cotizacion: crear formalmente una cotización para un cliente registrado.',
    '- modificar_cotizacion: agregar nuevos ítems a una cotización abierta.',
    '- ver_cotizacion: examinar el contenido de una cotización.',
    '',
    'Reglas operacionales:',
    '1. Planificación autónoma: si la instrucción requiere varios pasos (ej. averiguar precio de un material antes de cotizar), ejecuta primero la consulta y luego la creación/modificación.',
    '2. NUNCA inventes precios de materiales ni totales: usa buscar_catalogo o consultar_precio_web.',
    '3. Si faltan datos indispensables (como el nombre del cliente para cotizar), pide el dato directamente al usuario.',
    '4. Sé conciso y profesional en tu respuesta final en español.',
    '',
    ...(ctx.recentTurns.length
      ? [
          '## Historial reciente de la conversación (para resolver referencias ambiguas):',
          ...ctx.recentTurns.map(
            t => `${t.role === 'user' ? 'Usuario' : 'Asistente'}: ${scrubPii(t.text)}`
          ),
          '',
        ]
      : []),
    ...(ctx.graphContext
      ? ['## Apuntes y hechos aprendidos (memoria del negocio):', ctx.graphContext, '']
      : []),
  ].join('\n')
}

async function recordRunStart(pool: Pool, runId: string, ctx: AgentContext): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO agent_runs (id, tenant_id, user_id, instruction, status, model)
       VALUES ($1, $2, $3, $4, 'running', $5)`,
      [runId, ctx.tenantId ?? null, ctx.userId, ctx.instruction.slice(0, 4000), ctx.model]
    )
  } catch (err) {
    logger.error('AgentLoop: error al registrar inicio de run', { error: errorMessage(err), runId })
  }
}

async function recordStepAudit(
  pool: Pool,
  runId: string,
  tenantId: string | null | undefined,
  step: AgentStepRecord
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO agent_steps (run_id, tenant_id, idx, tool, input, output_summary, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
       ON CONFLICT (run_id, idx) DO NOTHING`,
      [
        runId,
        tenantId ?? null,
        step.idx,
        step.tool,
        JSON.stringify(sanitizeForAudit(step.input)),
        JSON.stringify(sanitizeForAudit(step.outputSummary)),
        step.durationMs,
        step.error ?? null,
      ]
    )
  } catch (err) {
    logger.error('AgentLoop: error al registrar paso de agente', {
      error: errorMessage(err),
      runId,
      idx: step.idx,
    })
  }
}

async function recordRunEnd(
  pool: Pool,
  runId: string,
  status: string,
  stepsUsed: number,
  tokensIn: number,
  tokensOut: number,
  durationMs: number,
  error?: string
): Promise<void> {
  try {
    await pool.query(
      `UPDATE agent_runs
       SET status = $1, steps_used = $2, tokens_in = $3, tokens_out = $4, duration_ms = $5, error = $6, updated_at = NOW()
       WHERE id = $7`,
      [status, stepsUsed, tokensIn, tokensOut, durationMs, error ?? null, runId]
    )
  } catch (err) {
    logger.error('AgentLoop: error al finalizar registro de run', {
      error: errorMessage(err),
      runId,
    })
  }
}

export async function runAgentLoop(
  ctx: AgentContext,
  registry: ToolRegistry = defaultToolRegistry
): Promise<AgentRunResult> {
  const startTime = Date.now()
  await recordRunStart(ctx.pool, ctx.runId, ctx)

  const functionDeclarations = registry.toFunctionDeclarations(ctx.userRole)
  const systemInstruction = buildAgentSystemPrompt(ctx)

  const contents: GeminiContent[] = [
    {
      role: 'user',
      parts: [{ text: scrubPii(ctx.instruction) }],
    },
  ]

  let stepCount = 0
  let totalTokensIn = 0
  let totalTokensOut = 0
  const recordedSteps: Array<{ tool: string; summary: string; durationMs: number }> = []
  const accumulatedNotes: ChatbotProactiveNote[] = []
  let lastMutatedQuotation: unknown = undefined
  let lastMutatedRule: unknown = undefined
  let lastPriceData: AgentToolResult['priceData'] = undefined

  let finalReply = ''
  let status: AgentRunResult['status'] = 'done'

  try {
    while (stepCount < MAX_STEPS) {
      const elapsedMs = Date.now() - startTime
      const remainingTimeMs = WALL_CLOCK_BUDGET_MS - elapsedMs
      if (remainingTimeMs < 4_000) {
        status = 'budget_exhausted'
        finalReply =
          finalReply ||
          'He alcanzado el límite de tiempo de ejecución para esta instrucción. He registrado los avances completados.'
        break
      }

      const turn = await callLlmWithTools(contents, {
        model: ctx.model,
        systemInstruction,
        functionDeclarations,
        timeoutMs: Math.min(25_000, remainingTimeMs),
      })

      totalTokensIn += turn.usage.tokensIn
      totalTokensOut += turn.usage.tokensOut

      if (turn.functionCalls.length === 0) {
        finalReply = turn.text
        break
      }

      // El modelo pidió ejecutar una o más herramientas.
      // Agregamos el turno completo del modelo a la conversación.
      contents.push(turn.modelContent)

      const responseParts: GeminiPart[] = []

      for (const call of turn.functionCalls) {
        stepCount++
        const stepStart = Date.now()
        const tool = registry.getTool(call.name)

        let toolResult: AgentToolResult
        let stepError: string | undefined = undefined

        if (!tool) {
          stepError = `Herramienta desconocida: "${call.name}"`
          toolResult = {
            output: { error: stepError },
            summary: `Intento de llamada a herramienta desconocida: ${call.name}`,
          }
        } else {
          try {
            toolResult = await tool.execute(call.args, ctx)
          } catch (err) {
            stepError = errorMessage(err)
            toolResult = {
              output: { error: stepError },
              summary: `Error ejecutando ${call.name}: ${stepError}`,
            }
          }
        }

        const stepDuration = Date.now() - stepStart
        recordedSteps.push({
          tool: call.name,
          summary: toolResult.summary,
          durationMs: stepDuration,
        })

        if (toolResult.mutatedQuotation) lastMutatedQuotation = toolResult.mutatedQuotation
        if (toolResult.mutatedRule) lastMutatedRule = toolResult.mutatedRule
        if (toolResult.notas) accumulatedNotes.push(...toolResult.notas)
        if (toolResult.priceData) lastPriceData = toolResult.priceData

        await recordStepAudit(ctx.pool, ctx.runId, ctx.tenantId, {
          idx: stepCount,
          tool: call.name,
          input: call.args,
          outputSummary: toolResult.output,
          durationMs: stepDuration,
          error: stepError,
        })

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: toolResult.output,
            ...(call.id ? { id: call.id } : {}),
          },
        })
      }

      contents.push({
        role: 'user',
        parts: responseParts,
      })
    }

    if (!finalReply) {
      if (stepCount >= MAX_STEPS) {
        status = 'budget_exhausted'
        finalReply = `Completé ${stepCount} pasos de análisis. Revisa los resultados ejecutados.`
      } else {
        finalReply = 'Operación procesada con éxito.'
      }
    }
  } catch (err) {
    status = 'error'
    const msg = errorMessage(err)
    logger.error('AgentLoop: error durante el ciclo de ejecución', { error: msg, runId: ctx.runId })
    await recordRunEnd(
      ctx.pool,
      ctx.runId,
      status,
      stepCount,
      totalTokensIn,
      totalTokensOut,
      Date.now() - startTime,
      msg
    )
    throw err
  }

  const totalDuration = Date.now() - startTime
  await recordRunEnd(
    ctx.pool,
    ctx.runId,
    status,
    stepCount,
    totalTokensIn,
    totalTokensOut,
    totalDuration
  )

  return {
    runId: ctx.runId,
    reply: finalReply,
    status,
    steps: recordedSteps,
    notas: accumulatedNotes.length ? accumulatedNotes : undefined,
    quotation: lastMutatedQuotation,
    rule: lastMutatedRule,
    material: lastPriceData?.material,
    precio_medio: lastPriceData?.precio_medio,
    muestras: lastPriceData?.muestras,
    advertencia: lastPriceData?.advertencia,
  }
}
