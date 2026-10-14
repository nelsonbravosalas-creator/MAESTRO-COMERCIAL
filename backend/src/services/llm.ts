import { env } from '../config/env'
import { logger } from '../utils/logger'
import { httpError } from '../utils/httpError'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CallLlmOptions {
  model: string
  json?: boolean
  temperature?: number
  // Herramientas estilo Gemini (ej. [{ google_search: {} }]) para la
  // consulta de precios con busqueda web real. La API de Gemini rechaza
  // combinar una tool con responseMimeType: 'application/json' en la misma
  // llamada ("Tool use with a response mime type... is unsupported" /
  // "Controlled generation is not supported with Google_search tool",
  // verificado en el foro oficial de Google AI, oct-2026) -- por eso
  // `json` y `tools` nunca se usan juntos desde ningun caller.
  tools?: unknown[]
  /** Timeout de la llamada en ms (default 25s). El agente lo acota a su presupuesto restante. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 25_000

/**
 * POST a generateContent con el mismo manejo de errores para todos los
 * callers (503 sin key / sin cupo, 502 timeout / fallo / no-OK). Devuelve el
 * JSON crudo de la respuesta; cada caller extrae lo que necesita.
 */
async function postGemini(
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<GeminiResponse> {
  if (!env.GEMINI_API_KEY) {
    throw httpError('GEMINI_API_KEY no configurada', 503)
  }

  // Mismo patron que fetchUfValue() en api/quotations.ts: sin timeout propio,
  // una llamada colgada al proveedor externo se queda esperando hasta que
  // Vercel mate la función, arrastrando con ella el throttle/rate-limit del
  // usuario sin que este reciba nunca una respuesta. 25s por defecto porque
  // la consulta de precios (busqueda web real) tarda mas que una extraccion
  // de intencion simple.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    )
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    const message = error instanceof Error ? error.message : String(error)
    logger.error('LLM call failed', { model, timedOut, error: message })
    throw httpError(timedOut ? 'LLM call timed out' : 'LLM call failed', 502)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    logger.error('LLM call failed', {
      status: res.status,
      model,
      body: text.slice(0, 500),
    })
    // 429 (RESOURCE_EXHAUSTED) es cupo/facturacion de la API de Gemini, no un
    // error del sistema -- un 502 generico confundia esto con un bug. Mismo
    // status (503) y espiritu que el caso de GEMINI_API_KEY no configurada:
    // mensaje explicito en vez de fallar a ciegas.
    if (res.status === 429) {
      throw httpError(
        'El asistente esta sin cupo de uso en la API de Gemini por ahora (limite de cuota alcanzado). Intenta de nuevo en unos minutos.',
        503
      )
    }
    throw httpError(`LLM call failed (${res.status})`, 502)
  }

  return (await res.json()) as GeminiResponse
}

// gemini-3.6-flash viene con "thinking" prendido por defecto y SIN esto se
// factura como tokens de salida sin que nadie lo vea -- verificado en vivo:
// un "responde OK" gasto 88 de 98 tokens en thoughtsTokenCount. Un bot
// transaccional (parsear intencion, armar cotizacion) no necesita
// razonamiento multi-paso; esto lo apaga para no pagar ni agregar latencia
// por el. El agente puede pedir un presupuesto propio (AGENT_THINKING_BUDGET).
const generationConfigFor = (opts: {
  temperature?: number
  json?: boolean
  thinkingBudget?: number
}) => ({
  temperature: opts.temperature ?? 0.2,
  thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
  ...(opts.json ? { responseMimeType: 'application/json' } : {}),
})

// Wrapper deliberadamente delgado sobre la API de Gemini via fetch nativo de
// Node -- sin SDK nuevo, mismo espiritu que tenia el wrapper de Groq que
// reemplaza (OmniRoute, el gateway local del usuario en 127.0.0.1, no es
// alcanzable desde las funciones serverless de Vercel -- solo serviria para
// dev local, nunca para produccion).
export async function callLlm(messages: LlmMessage[], opts: CallLlmOptions): Promise<string> {
  // Gemini separa la instruccion de sistema de los `contents` (no hay un rol
  // 'system' dentro de contents) -- se concatenan los mensajes role:'system'
  // en `systemInstruction`. El resto mapea user->user, assistant->model (asi
  // nombra Gemini al turno del modelo).
  const systemText = messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n')
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

  const data = await postGemini(
    opts.model,
    {
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      contents,
      generationConfig: generationConfigFor(opts),
      ...(opts.tools ? { tools: opts.tools } : {}),
    },
    opts.timeoutMs
  )
  const content = data?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('')
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Respuesta de LLM sin contenido')
  }
  return content
}

// ── Function calling (agente) ────────────────────────────────

/** Parte de un turno de Gemini. Se conserva tal cual (incluida thoughtSignature) para reenviarla. */
export interface GeminiPart {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string }
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string }
  thoughtSignature?: string
  [key: string]: unknown
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiResponse {
  candidates?: Array<{ content?: { role?: string; parts?: GeminiPart[] }; finishReason?: string }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

export interface FunctionDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface CallLlmWithToolsOptions {
  model: string
  systemInstruction: string
  functionDeclarations: FunctionDeclaration[]
  temperature?: number
  thinkingBudget?: number
  timeoutMs?: number
}

export interface LlmToolTurn {
  /** Turno del modelo tal cual llego -- debe reenviarse completo en la siguiente llamada. */
  modelContent: GeminiContent
  functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }>
  text: string
  usage: { tokensIn: number; tokensOut: number }
}

/**
 * Una vuelta del bucle agentico: manda la conversacion (con los
 * functionResponse acumulados) y devuelve lo que el modelo decidio -- llamar
 * herramientas o responder en texto. El turno del modelo se devuelve crudo
 * porque Gemini exige que se reenvie con sus thoughtSignature intactas.
 */
export async function callLlmWithTools(
  contents: GeminiContent[],
  opts: CallLlmWithToolsOptions
): Promise<LlmToolTurn> {
  const data = await postGemini(
    opts.model,
    {
      systemInstruction: { parts: [{ text: opts.systemInstruction }] },
      contents,
      tools: opts.functionDeclarations.length
        ? [{ functionDeclarations: opts.functionDeclarations }]
        : undefined,
      generationConfig: generationConfigFor(opts),
    },
    opts.timeoutMs
  )
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const functionCalls = parts
    .filter(p => p.functionCall?.name)
    .map(p => ({
      name: p.functionCall!.name,
      args: p.functionCall!.args ?? {},
      ...(p.functionCall!.id ? { id: p.functionCall!.id } : {}),
    }))
  const text = parts.map(p => p.text ?? '').join('')
  if (functionCalls.length === 0 && !text.trim()) {
    throw new Error('Respuesta de LLM sin contenido')
  }
  return {
    modelContent: { role: 'model', parts },
    functionCalls,
    text,
    usage: {
      tokensIn: data?.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: data?.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}

/**
 * Parsea la respuesta del LLM como JSON. Aunque se pida `json: true`
 * (responseMimeType: application/json), el modelo a veces igual envuelve el
 * JSON en una frase o un bloque ```json — este fallback busca el primer
 * objeto `{...}` del texto antes de rendirse.
 */
export function parseLlmJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        // cae al throw de abajo
      }
    }
    throw new Error('No se pudo interpretar la respuesta del asistente como JSON')
  }
}
