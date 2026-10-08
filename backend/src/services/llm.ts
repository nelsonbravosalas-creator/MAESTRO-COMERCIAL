import { env } from '../config/env'
import { logger } from '../utils/logger'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CallLlmOptions {
  model: string
  json?: boolean
  temperature?: number
}

// Wrapper deliberadamente delgado sobre la API de Groq (compatible con
// OpenAI) via fetch nativo de Node — sin SDK nuevo. Groq corre en la nube y
// es alcanzable desde las funciones serverless de Vercel (OmniRoute, el
// gateway local del usuario en 127.0.0.1, no lo es — solo serviría para dev
// local, nunca para producción). Si más adelante se necesita otro proveedor
// por el límite del free tier de Groq (30 req/min, 6.000 tok/min, 14.400
// req/día por cuenta, compartido con la skill /asistente-groq), este es el
// único punto de cambio.
export async function callLlm(messages: LlmMessage[], opts: CallLlmOptions): Promise<string> {
  if (!env.GROQ_API_KEY) {
    const err = new Error('GROQ_API_KEY no configurada') as any
    err.status = 503
    throw err
  }

  // Mismo patrón que fetchUfValue() en api/quotations.ts: sin timeout propio,
  // una llamada colgada al proveedor externo se queda esperando hasta que
  // Vercel mate la función, arrastrando con ella el throttle/rate-limit del
  // usuario sin que este reciba nunca una respuesta. 25s porque groq/compound
  // (búsqueda web real) tarda más que una extracción de intención simple.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  let res: Response
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError'
    logger.error('LLM call failed', { model: opts.model, timedOut, error: error?.message })
    const err = new Error(timedOut ? 'LLM call timed out' : 'LLM call failed') as any
    err.status = 502
    throw err
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
    const err = new Error(`LLM call failed (${res.status})`) as any
    err.status = 502
    throw err
  }

  const data: any = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Respuesta de LLM sin contenido')
  }
  return content
}

/**
 * Parsea la respuesta del LLM como JSON. groq/compound entrelaza tool-use
 * (búsqueda web) con el texto final y a veces lo envuelve en una frase o un
 * bloque ```json pese a pedir JSON puro en el prompt — este fallback busca el
 * primer objeto `{...}` del texto antes de rendirse.
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
