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
}

// Wrapper deliberadamente delgado sobre la API de Gemini via fetch nativo de
// Node -- sin SDK nuevo, mismo espiritu que tenia el wrapper de Groq que
// reemplaza (OmniRoute, el gateway local del usuario en 127.0.0.1, no es
// alcanzable desde las funciones serverless de Vercel -- solo serviria para
// dev local, nunca para produccion).
export async function callLlm(messages: LlmMessage[], opts: CallLlmOptions): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw httpError('GEMINI_API_KEY no configurada', 503)
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

  // Mismo patron que fetchUfValue() en api/quotations.ts: sin timeout propio,
  // una llamada colgada al proveedor externo se queda esperando hasta que
  // Vercel mate la función, arrastrando con ella el throttle/rate-limit del
  // usuario sin que este reciba nunca una respuesta. 25s porque la consulta
  // de precios (busqueda web real) tarda mas que una extraccion de intencion
  // simple.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
          contents,
          generationConfig: {
            temperature: opts.temperature ?? 0.2,
            ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          },
          ...(opts.tools ? { tools: opts.tools } : {}),
        }),
        signal: controller.signal,
      }
    )
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    const message = error instanceof Error ? error.message : String(error)
    logger.error('LLM call failed', { model: opts.model, timedOut, error: message })
    throw httpError(timedOut ? 'LLM call timed out' : 'LLM call failed', 502)
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    logger.error('LLM call failed', {
      status: res.status,
      model: opts.model,
      body: text.slice(0, 500),
    })
    throw httpError(`LLM call failed (${res.status})`, 502)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const content = data?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('')
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Respuesta de LLM sin contenido')
  }
  return content
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
