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

interface OmniRouteResponse {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: Array<{
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

async function postOpenAiCompatible(
  url: string,
  apiKey: string | undefined,
  body: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<OmniRouteResponse> {
  const baseUrl = url.replace(/\/+$/, '')
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`OpenAI-compatible LLM error status ${res.status}: ${errBody.slice(0, 200)}`)
    }
    return (await res.json()) as OmniRouteResponse
  } finally {
    clearTimeout(timer)
  }
}

export function getLocalLlmConfig() {
  if (env.LOCAL_LLM_URL) {
    return {
      url: env.LOCAL_LLM_URL,
      model: env.LOCAL_LLM_MODEL,
      apiKey: undefined,
      provider: 'Local-First LLM',
    }
  }
  if (env.OMNIROUTE_URL) {
    return {
      url: env.OMNIROUTE_URL,
      model: env.OMNIROUTE_MODEL,
      apiKey: env.OMNIROUTE_API_KEY,
      provider: 'OmniRoute',
    }
  }
  return null
}

// Wrapper deliberadamente híbrido: Local-First (OpenJarvis / Ollama / OmniRoute)
// para absorber el trabajo cotidiano con $0 costo y privacidad A-21, con
// degradación transparente a Gemini Cloud directo cuando es necesario.
export async function callLlm(messages: LlmMessage[], opts: CallLlmOptions): Promise<string> {
  const localConfig = getLocalLlmConfig()
  const strategy = env.LLM_ROUTING_STRATEGY

  if (strategy !== 'cloud_only' && localConfig) {
    try {
      const openAiMessages = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))
      const data = await postOpenAiCompatible(
        localConfig.url,
        localConfig.apiKey,
        {
          model: localConfig.model || opts.model,
          messages: openAiMessages,
          temperature: opts.temperature ?? 0.2,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        },
        opts.timeoutMs
      )
      const content = data?.choices?.[0]?.message?.content
      if (typeof content === 'string' && content.trim()) {
        return content
      }
    } catch (localErr) {
      const msg = localErr instanceof Error ? localErr.message : String(localErr)
      logger.warn(`${localConfig.provider} falló en callLlm; degradando a Gemini directo`, {
        error: msg,
      })
      if (strategy === 'local_only') {
        throw httpError(
          `Local LLM falló y el fallback está deshabilitado por LLM_ROUTING_STRATEGY=local_only: ${msg}`,
          503
        )
      }
    }
  }

  if (strategy === 'local_only') {
    throw httpError(
      'LLM_ROUTING_STRATEGY=local_only pero no hay ningún proveedor local configurado',
      503
    )
  }

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
 * herramientas o responder en texto.
 * Si OMNIROUTE_URL está configurada, delega primero a OmniRoute con formato
 * OpenAI Function Calling y degrada a Gemini directo ante cualquier error.
 */
export async function callLlmWithTools(
  contents: GeminiContent[],
  opts: CallLlmWithToolsOptions
): Promise<LlmToolTurn> {
  const localConfig = getLocalLlmConfig()
  const strategy = env.LLM_ROUTING_STRATEGY

  if (strategy !== 'cloud_only' && localConfig) {
    try {
      const openAiMessages: Array<Record<string, unknown>> = []
      if (opts.systemInstruction) {
        openAiMessages.push({ role: 'system', content: opts.systemInstruction })
      }
      for (const c of contents) {
        if (c.role === 'user') {
          const textParts = c.parts.filter(p => p.text)
          if (textParts.length > 0) {
            openAiMessages.push({
              role: 'user',
              content: textParts.map(p => p.text).join('\n'),
            })
          }
          for (const p of c.parts) {
            if (p.functionResponse) {
              openAiMessages.push({
                role: 'tool',
                tool_call_id: p.functionResponse.id || `call_${p.functionResponse.name}`,
                content: JSON.stringify(p.functionResponse.response ?? {}),
              })
            }
          }
        } else if (c.role === 'model') {
          const textParts = c.parts.filter(p => p.text)
          const fnParts = c.parts.filter(p => p.functionCall?.name)
          if (fnParts.length > 0) {
            openAiMessages.push({
              role: 'assistant',
              content: textParts.length > 0 ? textParts.map(p => p.text).join('\n') : null,
              tool_calls: fnParts.map(p => ({
                id: p.functionCall!.id || `call_${p.functionCall!.name}`,
                type: 'function',
                function: {
                  name: p.functionCall!.name,
                  arguments: JSON.stringify(p.functionCall!.args ?? {}),
                },
              })),
            })
          } else if (textParts.length > 0) {
            openAiMessages.push({
              role: 'assistant',
              content: textParts.map(p => p.text).join('\n'),
            })
          }
        }
      }

      const openAiTools =
        opts.functionDeclarations.length > 0
          ? opts.functionDeclarations.map(fd => ({
              type: 'function',
              function: {
                name: fd.name,
                description: fd.description,
                parameters: fd.parameters,
              },
            }))
          : undefined

      const data = await postOpenAiCompatible(
        localConfig.url,
        localConfig.apiKey,
        {
          model: localConfig.model || opts.model,
          messages: openAiMessages,
          ...(openAiTools ? { tools: openAiTools } : {}),
          temperature: opts.temperature ?? 0.2,
        },
        opts.timeoutMs
      )

      const choice = data?.choices?.[0]
      const msg = choice?.message
      const parts: GeminiPart[] = []
      if (msg?.content) {
        parts.push({ text: msg.content })
      }
      const functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> = []
      if (Array.isArray(msg?.tool_calls)) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {}
          try {
            args =
              typeof tc.function?.arguments === 'string'
                ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
                : ((tc.function?.arguments as unknown as Record<string, unknown>) ?? {})
          } catch {
            args = {}
          }
          const fnName = tc.function?.name ?? ''
          parts.push({
            functionCall: { name: fnName, args, id: tc.id },
          })
          functionCalls.push({ name: fnName, args, id: tc.id })
        }
      }

      const text = msg?.content ?? ''
      if (functionCalls.length > 0 || text.trim()) {
        return {
          modelContent: { role: 'model', parts },
          functionCalls,
          text,
          usage: {
            tokensIn: data?.usage?.prompt_tokens ?? 0,
            tokensOut: data?.usage?.completion_tokens ?? 0,
          },
        }
      }
    } catch (localErr) {
      const msg = localErr instanceof Error ? localErr.message : String(localErr)
      logger.warn(`${localConfig.provider} with tools falló; degradando a Gemini directo`, {
        error: msg,
      })
      if (strategy === 'local_only') {
        throw httpError(
          `Local LLM with tools falló y el fallback está deshabilitado por LLM_ROUTING_STRATEGY=local_only: ${msg}`,
          503
        )
      }
    }
  }

  if (strategy === 'local_only') {
    throw httpError(
      'LLM_ROUTING_STRATEGY=local_only pero no hay ningún proveedor local configurado',
      503
    )
  }

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
