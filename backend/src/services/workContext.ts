import type { Pool } from 'pg'
import { env } from '../config/env'
import { logger } from '../utils/logger'
import { httpError, asHttpError } from '../utils/httpError'
import { callLlm, parseLlmJson } from './llm'
import { scrubPii } from './pii'
import {
  buildWorkContextPrompt,
  type FewShotExample,
  type SanitizedWorkContext,
} from './workContextPrompt'
import {
  llmProyeccionResponseSchema,
  workContextSchema,
  type Proyeccion,
  type Recursos,
  type WorkContext,
} from '../schemas/quotations'

// ── Limites ────────────────────────────────────────────────────────────
export const MAX_FEW_SHOT = 5
/** Filas candidatas que se leen de work_context_examples antes de ordenar. */
const MAX_CANDIDATES = 200
/** Tope del prompt completo (system + user), en caracteres. */
export const MAX_PROMPT_CHARS = 24_000
/** Tope de la respuesta cruda del LLM, en caracteres. */
export const MAX_LLM_OUTPUT_CHARS = 20_000
const LLM_TIMEOUT_MS = 20_000

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// ── Saneamiento (A-21) ────────────────────────────────────────────────

/**
 * Deja solo los campos tecnicos del contexto (tipo, tipo_otro, alcance,
 * magnitudes, dias, supuestos) con el texto libre pasado por scrubPii.
 * Nunca incluye datos del cliente: la cotizacion no se lee aca.
 */
export function sanitizeWorkContext(wc: WorkContext): SanitizedWorkContext {
  const out: SanitizedWorkContext = {
    tipo: wc.tipo,
    alcance: scrubPii(wc.alcance ?? '').slice(0, 4000),
    magnitudes: (wc.magnitudes ?? []).slice(0, 20).map(m => ({
      clave: scrubPii(m.clave).slice(0, 80),
      valor: m.valor,
      unidad: scrubPii(m.unidad).slice(0, 30),
    })),
    dias: {
      plazo: wc.dias?.plazo ?? null,
      tipo_plazo: wc.dias?.tipo_plazo === 'habiles' ? 'habiles' : 'corridos',
      terreno: wc.dias?.terreno ?? null,
    },
  }
  if (wc.tipo === 'otro' && wc.tipo_otro) out.tipo_otro = scrubPii(wc.tipo_otro).slice(0, 120)
  if (wc.supuestos) out.supuestos = scrubPii(wc.supuestos).slice(0, 2000)
  return out
}

/** scrubPii aplicado a cada texto de un objeto de recursos. */
export function sanitizeRecursos(r: Recursos): Recursos {
  return {
    dotacion: r.dotacion.map(d => ({ rol: scrubPii(d.rol), cantidad: d.cantidad })),
    horas: r.horas,
    materiales: r.materiales.map(m => ({
      desc: scrubPii(m.desc),
      cantidad: m.cantidad,
      unidad: scrubPii(m.unidad),
    })),
    subcontratos: r.subcontratos.map(s => ({
      desc: scrubPii(s.desc),
      ...(s.monto_estimado !== undefined ? { monto_estimado: s.monto_estimado } : {}),
    })),
  }
}

/** Clave del tipo de trabajo para el indice de ejemplos ("otro:<texto>" si aplica). */
export const tipoTrabajoKey = (ctx: Pick<SanitizedWorkContext, 'tipo' | 'tipo_otro'>) =>
  ctx.tipo === 'otro' && ctx.tipo_otro ? `otro:${ctx.tipo_otro.trim().toLowerCase()}` : ctx.tipo

// ── Seleccion de ejemplos ──────────────────────────────────────────────

export interface ExampleRow {
  id: string
  kind: string
  tipo_trabajo: string
  context_sanitized: SanitizedWorkContext
  recursos_finales: unknown
  nota: string | null
  created_at: string | Date
}

const normKey = (s: string) => s.trim().toLowerCase()
const magKey = (m: { clave: string; unidad: string }) => `${normKey(m.clave)}|${normKey(m.unidad)}`

/**
 * Distancia entre dos listas de magnitudes, en [0, 1]. Para cada clave
 * (clave+unidad) de la union: diferencia relativa |a-b| / max(|a|,|b|,1) si
 * ambos la tienen, 1 si falta en uno. 0 si ninguno tiene magnitudes.
 */
export function magnitudeDistance(
  a: SanitizedWorkContext['magnitudes'],
  b: SanitizedWorkContext['magnitudes']
): number {
  const ma = new Map(a.map(m => [magKey(m), m.valor]))
  const mb = new Map(b.map(m => [magKey(m), m.valor]))
  const keys = new Set([...ma.keys(), ...mb.keys()])
  if (keys.size === 0) return 0
  let total = 0
  for (const k of keys) {
    const va = ma.get(k)
    const vb = mb.get(k)
    if (va === undefined || vb === undefined) {
      total += 1
      continue
    }
    total += Math.min(1, Math.abs(va - vb) / Math.max(Math.abs(va), Math.abs(vb), 1))
  }
  return total / keys.size
}

/**
 * Ordena los candidatos: primero mismo kind + mismo tipo de trabajo, luego
 * mismo tipo (otro kind), luego mismo kind (otro tipo); dentro de cada grupo,
 * por cercania de magnitudes y, a igualdad, el mas reciente primero.
 */
export function rankExamples(
  target: { kind: string; tipoTrabajo: string; magnitudes: SanitizedWorkContext['magnitudes'] },
  candidates: ExampleRow[],
  limit = MAX_FEW_SHOT
): ExampleRow[] {
  const tier = (r: ExampleRow) => {
    const sameKind = r.kind === target.kind
    const sameTipo = r.tipo_trabajo === target.tipoTrabajo
    if (sameKind && sameTipo) return 0
    if (sameTipo) return 1
    if (sameKind) return 2
    return 3
  }
  return candidates
    .filter(r => tier(r) < 3)
    .map(r => ({
      r,
      t: tier(r),
      d: magnitudeDistance(target.magnitudes, r.context_sanitized?.magnitudes ?? []),
      ts: new Date(r.created_at).getTime() || 0,
    }))
    .sort((x, y) => x.t - y.t || x.d - y.d || y.ts - x.ts)
    .slice(0, limit)
    .map(x => x.r)
}

export async function findSimilarExamples(
  pool: Pool,
  kind: string,
  ctx: SanitizedWorkContext,
  limit = MAX_FEW_SHOT
): Promise<ExampleRow[]> {
  const tipoTrabajo = tipoTrabajoKey(ctx)
  const { rows } = await pool.query(
    `SELECT id, kind, tipo_trabajo, context_sanitized, recursos_finales, nota, created_at
       FROM work_context_examples
      WHERE kind = $1 OR tipo_trabajo = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [kind, tipoTrabajo, MAX_CANDIDATES]
  )
  return rankExamples({ kind, tipoTrabajo, magnitudes: ctx.magnitudes }, rows, limit)
}

/**
 * scrubPii sobre cada texto de un valor JSON. Se recorre el arbol y se limpian
 * solo los strings: pasar el JSON serializado enmascaraba tambien numeros de 9
 * digitos (p. ej. un monto) y rompia el JSON.parse.
 */
const scrubDeep = (v: unknown): unknown => {
  if (typeof v === 'string') return scrubPii(v)
  if (Array.isArray(v)) return v.map(scrubDeep)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x)]))
  }
  return v
}
const scrubJson = <T>(value: T): T => scrubDeep(value) as T

const toFewShot = (row: ExampleRow): FewShotExample => ({
  // Los ejemplos ya se guardaron saneados; se vuelve a pasar scrubPii por si
  // una fila vieja o cargada a mano trae algo que no deberia.
  contexto: scrubJson(row.context_sanitized),
  recursos_finales: scrubJson(row.recursos_finales ?? null),
  ...(row.nota ? { nota: scrubPii(row.nota).slice(0, 500) } : {}),
})

// ── Analisis (llamada al LLM) ──────────────────────────────────────────

const llmUnavailable = (message: string, status: 502 | 503) =>
  httpError(message, status, { error: message, message })

const MSG_502 =
  'No se pudo obtener la proyección del asistente (falló o tardó demasiado). La cotización no se ve afectada; intente de nuevo.'
const MSG_503 =
  'El asistente de proyección no está disponible ahora (sin configuración o sin cupo). La cotización no se ve afectada; intente más tarde.'
const MSG_INVALID =
  'El asistente devolvió una proyección con formato inválido. La cotización no se ve afectada; intente de nuevo.'

export async function analyzeWorkContext(
  pool: Pool,
  kind: string,
  wc: WorkContext,
  now: () => Date = () => new Date()
): Promise<{ proyeccion: Proyeccion }> {
  const contexto = sanitizeWorkContext(wc)
  if (!contexto.alcance.trim() && contexto.magnitudes.length === 0) {
    throw httpError('Contexto vacío', 422, {
      error: 'Contexto vacío',
      message: 'Describa el alcance o agregue al menos una magnitud antes de analizar.',
    })
  }

  const rows = await findSimilarExamples(pool, kind, contexto)
  let ejemplos = rows.map(toFewShot)

  // Tope de entrada: se descartan ejemplos (los menos parecidos primero)
  // hasta que el prompt quepa. El contexto propio ya viene acotado por zod.
  let messages = buildWorkContextPrompt(contexto, ejemplos)
  const size = (m: typeof messages) => m.reduce((n, x) => n + x.content.length, 0)
  while (size(messages) > MAX_PROMPT_CHARS && ejemplos.length > 0) {
    ejemplos = ejemplos.slice(0, -1)
    messages = buildWorkContextPrompt(contexto, ejemplos)
  }
  if (size(messages) > MAX_PROMPT_CHARS) {
    throw httpError('Contexto demasiado largo', 422, {
      error: 'Contexto demasiado largo',
      message: 'El contexto del trabajo es demasiado largo para analizarlo. Acórtelo.',
    })
  }

  let raw: string
  try {
    raw = await callLlm(messages, {
      model: env.CHATBOT_PARSE_MODEL,
      json: true,
      temperature: 0.2,
      timeoutMs: LLM_TIMEOUT_MS,
    })
  } catch (error) {
    const status = asHttpError(error).status
    logger.warn('Work context: fallo del LLM', { error: errorMessage(error), status })
    if (status === 503) throw llmUnavailable(MSG_503, 503)
    throw llmUnavailable(MSG_502, 502)
  }

  if (typeof raw !== 'string' || raw.length > MAX_LLM_OUTPUT_CHARS) {
    logger.warn('Work context: respuesta del LLM fuera de tope', {
      length: typeof raw === 'string' ? raw.length : null,
    })
    throw llmUnavailable(MSG_INVALID, 502)
  }

  let parsed: unknown
  try {
    parsed = parseLlmJson<unknown>(raw)
  } catch (error) {
    logger.warn('Work context: respuesta del LLM no es JSON', { error: errorMessage(error) })
    throw llmUnavailable(MSG_INVALID, 502)
  }

  const result = llmProyeccionResponseSchema.safeParse(parsed)
  if (!result.success) {
    logger.warn('Work context: respuesta del LLM no cumple el esquema', {
      issues: result.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`),
    })
    throw llmUnavailable(MSG_INVALID, 502)
  }

  return {
    proyeccion: {
      generada_en: now().toISOString(),
      recursos: sanitizeRecursos(result.data.recursos),
      justificacion: scrubPii(result.data.justificacion),
    },
  }
}

// ── Aprendizaje (diferencia proyectado vs final) ───────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10

interface DiffNum {
  proyectado: number | null
  final: number | null
  delta: number | null
  pct: number | null
}

const diffNum = (p: number | null | undefined, f: number | null | undefined): DiffNum => {
  const proyectado = typeof p === 'number' ? p : null
  const final = typeof f === 'number' ? f : null
  const delta = proyectado !== null && final !== null ? round1(final - proyectado) : null
  const pct =
    delta !== null && proyectado !== null && proyectado !== 0
      ? round1((delta / proyectado) * 100)
      : null
  return { proyectado, final, delta, pct }
}

/** Empareja dos listas por clave normalizada y suma cantidades repetidas. */
function diffList<T>(
  proj: T[],
  fin: T[],
  key: (x: T) => string,
  label: (x: T) => Record<string, string>,
  value: (x: T) => number | undefined
) {
  const acc = new Map<string, { label: Record<string, string>; p?: number; f?: number }>()
  const add = (x: T, side: 'p' | 'f') => {
    const k = key(x)
    const cur = acc.get(k) ?? { label: label(x) }
    const v = value(x)
    if (typeof v === 'number') cur[side] = (cur[side] ?? 0) + v
    acc.set(k, cur)
  }
  const seenP = new Set<string>()
  const seenF = new Set<string>()
  proj.forEach(x => {
    add(x, 'p')
    seenP.add(key(x))
  })
  fin.forEach(x => {
    add(x, 'f')
    seenF.add(key(x))
  })
  return [...acc.entries()].map(([k, v]) => ({
    ...v.label,
    en_proyeccion: seenP.has(k),
    en_final: seenF.has(k),
    ...diffNum(v.p ?? null, v.f ?? null),
  }))
}

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0)

/**
 * Diferencia por campo entre lo proyectado y lo que finalmente se uso. Se
 * calcula en el servidor (nunca se confia en una diferencia enviada por el
 * cliente). `proyectado` null => solo se registran los finales.
 */
export function computeDiferencia(proyectado: Recursos | null, final: Recursos) {
  if (!proyectado) return null
  return {
    horas: diffNum(proyectado.horas, final.horas),
    dotacion_total: diffNum(
      sumBy(proyectado.dotacion, d => d.cantidad),
      sumBy(final.dotacion, d => d.cantidad)
    ),
    dotacion: diffList(
      proyectado.dotacion,
      final.dotacion,
      d => normKey(d.rol),
      d => ({ rol: d.rol }),
      d => d.cantidad
    ),
    materiales: diffList(
      proyectado.materiales,
      final.materiales,
      m => `${normKey(m.desc)}|${normKey(m.unidad)}`,
      m => ({ desc: m.desc, unidad: m.unidad }),
      m => m.cantidad
    ),
    subcontratos: diffList(
      proyectado.subcontratos,
      final.subcontratos,
      s => normKey(s.desc),
      s => ({ desc: s.desc }),
      s => s.monto_estimado
    ),
  }
}

/** Lee y valida el work_context guardado (JSONB). null si no hay o es invalido. */
export function parseStoredWorkContext(value: unknown): WorkContext | null {
  if (value === null || value === undefined) return null
  const raw = typeof value === 'string' ? safeJson(value) : value
  const parsed = workContextSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export async function learnWorkContext(
  pool: Pool,
  quotationId: string,
  kind: string,
  stored: WorkContext,
  recursosFinales: Recursos,
  nota: string | undefined
): Promise<{ id: string }> {
  const contexto = sanitizeWorkContext(stored)
  const finales = sanitizeRecursos(recursosFinales)
  const proyectado = stored.proyeccion ? sanitizeRecursos(stored.proyeccion.recursos) : null
  const diferencia = computeDiferencia(proyectado, finales)

  const { rows } = await pool.query(
    `INSERT INTO work_context_examples
       (quotation_id, kind, tipo_trabajo, context_sanitized, proyeccion,
        recursos_finales, diferencia, nota)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
     RETURNING id`,
    [
      quotationId,
      kind,
      tipoTrabajoKey(contexto),
      JSON.stringify(contexto),
      proyectado ? JSON.stringify(proyectado) : null,
      JSON.stringify(finales),
      diferencia ? JSON.stringify(diferencia) : null,
      nota ? scrubPii(nota).slice(0, 500) : null,
    ]
  )
  return { id: rows[0].id }
}
