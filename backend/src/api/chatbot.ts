import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { env } from '../config/env'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { createAuthThrottle } from '../middleware/authThrottle'
import {
  chatbotMessageSchema,
  chatbotTeachRuleSchema,
  chatbotPriceResponseSchema,
  chatbotPriceSampleSchema,
} from '../schemas/chatbot'
import { callLlm, parseLlmJson } from '../services/llm'
import { listCurrentRules, teachRule } from '../services/chatbotRules'
import { buildAutoLineItems, buildManualLineItems } from '../services/chatbotCalc'
import { applyQuotationImport, applyQuotationUpdate, fullQuotation } from './quotations'

type ReglaKey =
  | 'tarifa_colacion_diaria'
  | 'tarifa_bonificacion_desplazamiento_diaria'
  | 'comunas_region_metropolitana'

interface ParsedIntent {
  intent:
    'crear_cotizacion' | 'modificar_cotizacion' | 'ensenar_regla' | 'consultar_precio' | 'conversar'
  cliente_nombre?: string | null
  dias?: number | null
  dotacion?: number | null
  comuna?: string | null
  descripcion_trabajo?: string | null
  items_mencionados?: string[] | null
  regla_key?: ReglaKey | null
  regla_valor?: number | string[] | null
  material_consultado?: string | null
  respuesta_conversacional?: string | null
}

// RUT chileno (con o sin puntos, con guion), email, y telefono (movil +56 9
// u otro formato de 8-9 digitos contiguos con separadores opcionales). Los
// dias/dotacion legitimos que el parser SI debe leer son numeros cortos (1-3
// cifras) sueltos en el texto ("5 dias", "8 tecnicos"), por lo que no caen en
// ninguno de estos tres patrones.
const RUT_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g
const PHONE_RE = /(?:\+?56[\s.-]?)?(?:9[\s.-]?)\d{4}[\s.-]?\d{4}\b/g

/**
 * Enmascara RUT/email/telefono en texto libre antes de que ese texto llegue
 * al prompt de un LLM externo. No es infalible (regex, no un NER) — por eso
 * docs/RIESGOS_ACEPTADOS.md (A-21) lo documenta como "minimizado, no
 * garantizado", no como una promesa absoluta.
 */
function scrubPii(text: string): string {
  return text.replace(RUT_RE, '[RUT]').replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[TELEFONO]')
}

/**
 * Prompt de extraccion de intencion. El backend nunca inyecta un registro de
 * cliente (el nombre que aparece es el texto libre que el propio usuario
 * tecleo, no una fila de `clients` — ese se resuelve DESPUES, buscandolo por
 * nombre sin que el LLM lo vea). Pero el texto que el usuario SI escribe a
 * mano se manda tal cual salvo por `scrubPii`: si el usuario tipea su propio
 * RUT/email/telefono (p.ej. al responder "sea mas especifico" en un cliente
 * ambiguo), esta funcion lo enmascara antes de interpolarlo. Ver A-21 en
 * docs/RIESGOS_ACEPTADOS.md.
 */
function buildIntentPrompt(instruction: string): string {
  return [
    'Eres el parser de intencion de un asistente de cotizaciones HVAC/construccion en Chile.',
    'Devuelve SOLO un JSON (sin texto adicional, sin markdown) con esta forma exacta:',
    '{"intent":"crear_cotizacion|modificar_cotizacion|ensenar_regla|consultar_precio|conversar",',
    '"cliente_nombre":string|null,"dias":number|null,"dotacion":number|null,"comuna":string|null,',
    '"descripcion_trabajo":string|null,"items_mencionados":string[]|null,',
    '"regla_key":"tarifa_colacion_diaria"|"tarifa_bonificacion_desplazamiento_diaria"|"comunas_region_metropolitana"|null,',
    '"regla_valor":number|string[]|null,"material_consultado":string|null,"respuesta_conversacional":string|null}',
    '',
    'Reglas:',
    '- "ensenar_regla": el usuario define o corrige una tarifa o lista (ej. "la colacion es $7000 por dia por persona" -> regla_key=tarifa_colacion_diaria, regla_valor=7000).',
    '- "consultar_precio": el usuario pregunta cuanto cuesta un material -> material_consultado = nombre del material.',
    '- "crear_cotizacion": el usuario quiere una cotizacion nueva. Extrae dias, dotacion (cantidad de personas/tecnicos) y comuna si se mencionan.',
    '- "modificar_cotizacion": el usuario quiere cambiar una cotizacion que ya tiene abierta (todavia no soportado, igual extrae lo que puedas).',
    '- "conversar": saludo, pregunta general, o instruccion ambigua -> respuesta_conversacional con una respuesta breve en espanol.',
    '- Nunca inventes un RUT ni datos de contacto. cliente_nombre es solo el nombre tal como lo escribio el usuario, o null si no lo menciono.',
    '',
    `Instruccion del usuario: "${scrubPii(instruction).replace(/"/g, "'")}"`,
  ].join('\n')
}

/**
 * Normaliza una columna DATE leida directo de pg (puede llegar como objeto
 * Date de JS, no como string) a 'YYYY-MM-DD' para que pase isoDateStr. El
 * camino HTTP normal nunca pisa este problema porque el body siempre viene
 * de JSON (donde una fecha ya es texto); applyQuotationUpdate llamada
 * en-proceso desde aca si puede recibir el valor crudo de la consulta.
 */
function toDateStr(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.slice(0, 10)
  return null
}

/**
 * Los items que vienen de `items_mencionados` (texto libre del usuario, no
 * del motor de alimentación/bonificación) siempre quedan con cantidad=1,
 * precio_unitario=0 — nadie los calcula, es un placeholder a completar en el
 * formulario. Sin este aviso, una cotización puede salir con materiales a $0
 * sin que el vendedor lo note hasta revisarla línea por línea.
 */
function manualItemsWarning(manualLineas: { descripcion: string }[]): string {
  if (manualLineas.length === 0) return ''
  return ` ⚠ ${manualLineas.length} item(s) sin precio (${manualLineas
    .map(l => l.descripcion)
    .join(', ')}) — complete el precio en el formulario.`
}

/** Consulta de precio: solo el nombre del material, nunca contexto de cliente/cotización. */
function buildPricePrompt(material: string): string {
  return [
    'Busca en la web el precio de venta al publico en Chile (CLP) para el siguiente material de',
    'construccion/HVAC. Da 2 a 4 muestras de distintas tiendas si puedes (ej. Sodimac, Construmart,',
    'MercadoLibre, Easy). Devuelve SOLO un JSON con esta forma exacta, sin texto adicional:',
    '{"precio_medio":number,"muestras":[{"precio":number,"fuente_url":string,"tienda":string}],"advertencia":string|null}',
    'Si no encuentras nada confiable, precio_medio=0 y advertencia explicando por que.',
    '',
    `Material: "${material.replace(/"/g, "'")}"`,
  ].join('\n')
}

const logAction = async (
  pool: Pool,
  userId: string | null,
  instruction: string,
  actionType: string,
  quotationId: string | null,
  llmProvider: string | null
) => {
  try {
    await pool.query(
      `INSERT INTO chatbot_actions (user_id, instruction, action_type, quotation_id, llm_provider)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, instruction.slice(0, 4000), actionType, quotationId, llmProvider]
    )
  } catch (error: any) {
    logger.error('Chatbot: no se pudo registrar la accion en chatbot_actions', {
      error: error.message,
    })
  }
}

/**
 * Busca un cliente YA EXISTENTE por nombre (coincidencia parcial, sin
 * distinguir mayusculas). El chat nunca crea un cliente nuevo — si no hay
 * match, se le pide al usuario que lo cree desde el formulario, igual que
 * /import nunca inventa un RUT que no fue provisto.
 */
const findClientByName = async (pool: Pool, nombre: string) => {
  if (!nombre?.trim()) return []
  const result = await pool.query(
    `SELECT id, name, rut FROM clients
      WHERE deleted_at IS NULL AND name ILIKE $1
      ORDER BY lower(name) LIMIT 5`,
    [`%${nombre.trim()}%`]
  )
  return result.rows as Array<{ id: string; name: string; rut: string }>
}

export const createChatbotRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // Throttle por usuario autenticado (no por IP como los de login en
  // app.ts), montado SOLO en POST / — a diferencia de los throttles de
  // app.ts, este va atado a la ruta con costo real (la llamada a LLM), no al
  // router entero: GET /rules es una lectura sin costo y no deberia agotar
  // la misma cuota. countWhen siempre true porque una llamada a LLM cuesta
  // igual si el intent termina en error o no.
  const chatThrottle = createAuthThrottle(pool, {
    name: 'chatbot',
    windowMinutes: 1,
    max: 5,
    keyGenerator: req => (req as AuthRequest).user?.id ?? req.ip ?? 'anon',
    countWhen: () => true,
    message: {
      error: 'Too many requests',
      message: 'Demasiadas solicitudes al asistente. Reintente en un minuto.',
    },
  })

  router.get('/rules', async (_req: AuthRequest, res) => {
    try {
      const rules = await listCurrentRules(pool)
      return res.json({ rules })
    } catch (error: any) {
      logger.error('Chatbot: error al listar reglas', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch chatbot rules' })
    }
  })

  router.post(
    '/',
    chatThrottle,
    validate({ body: chatbotMessageSchema }),
    async (req: AuthRequest, res) => {
      const { instruction, quotation_id: quotationId } = req.body as {
        instruction: string
        quotation_id?: string | null
      }
      const userId = req.user?.id ?? null

      let parsed: ParsedIntent
      try {
        const raw = await callLlm([{ role: 'user', content: buildIntentPrompt(instruction) }], {
          model: env.CHATBOT_PARSE_MODEL,
          json: true,
        })
        parsed = parseLlmJson<ParsedIntent>(raw)
      } catch (error: any) {
        logger.error('Chatbot: fallo al parsear intencion', { error: error.message, userId })
        const status = error.status === 503 ? 503 : 502
        return res.status(status).json({
          error: 'Asistente no disponible',
          message:
            status === 503
              ? 'El asistente no esta configurado (falta GROQ_API_KEY).'
              : 'No se pudo interpretar la instruccion. Intente de nuevo.',
        })
      }

      try {
        switch (parsed.intent) {
          case 'ensenar_regla': {
            // El LLM puede "alucinar" el tipo (ej. devolver un string donde
            // comunas_region_metropolitana espera un array) — sin esta
            // validacion, ese valor mal tipado entra tal cual al JSONB y
            // rompe silenciosamente isComunaEnSantiago() mas adelante, en una
            // cotizacion que no tiene nada que ver con la regla mal ensenada.
            const ruleCheck = chatbotTeachRuleSchema.safeParse({
              rule_key: parsed.regla_key,
              value: parsed.regla_valor,
            })
            if (!ruleCheck.success) {
              return res.status(422).json({
                error: 'No se entendio la regla',
                message:
                  'No identifique que regla ensenar, o el valor no tiene el formato esperado. Intente ser mas especifico (ej. "la colacion diaria es $7000 por persona").',
              })
            }
            const { rule_key: reglaKey, value: reglaValor } = ruleCheck.data
            const unit = reglaKey === 'comunas_region_metropolitana' ? null : 'CLP/persona/dia'
            const rule = await teachRule(pool, reglaKey, reglaValor, {
              unit,
              notes: instruction,
              userId,
            })
            await logAction(
              pool,
              userId,
              instruction,
              'ensenar_regla',
              null,
              env.CHATBOT_PARSE_MODEL
            )
            return res.json({
              reply: `Listo, actualice "${rule.rule_key}" a ${JSON.stringify(rule.value)}${unit ? ` ${unit}` : ''}.`,
              rule,
            })
          }

          case 'consultar_precio': {
            if (!parsed.material_consultado) {
              return res.status(422).json({
                error: 'No se entendio el material',
                message: 'No identifique que material consultar.',
              })
            }
            const raw = await callLlm(
              [{ role: 'user', content: buildPricePrompt(parsed.material_consultado) }],
              { model: env.CHATBOT_PRICE_MODEL }
            )
            // El LLM 2 (groq/compound, busqueda web real) es el salto de
            // confianza mas largo de todo el endpoint: texto libre del
            // usuario -> material_consultado extraido por el LLM 1 -> JSON de
            // una busqueda web hecha por el LLM 2. parseLlmJson es un
            // JSON.parse sin forma — sin esta validacion, una fuente_url
            // alucinada/inyectada (ej. "javascript:...") llegaria intacta
            // hasta el <a href> de ChatPanel.tsx. Cada muestra se valida (y se
            // descarta si no calza) individualmente para que una sola URL rara
            // no tire un precio_medio por lo demas bueno.
            const precioRaw = parseLlmJson<unknown>(raw)
            const precioParsed = chatbotPriceResponseSchema.safeParse(precioRaw)
            const precio = precioParsed.success
              ? {
                  ...precioParsed.data,
                  muestras: precioParsed.data.muestras
                    .map(m => chatbotPriceSampleSchema.safeParse(m))
                    .filter(r => r.success)
                    .map(r => r.data),
                }
              : {
                  precio_medio: 0,
                  muestras: [],
                  advertencia: 'Respuesta del asistente con formato inesperado.',
                }
            await logAction(
              pool,
              userId,
              instruction,
              'consultar_precio',
              null,
              env.CHATBOT_PRICE_MODEL
            )
            return res.json({
              reply: precio.precio_medio
                ? `Precio promedio encontrado para "${parsed.material_consultado}": $${Math.round(
                    precio.precio_medio
                  ).toLocaleString('es-CL')} CLP.`
                : `No encontre un precio confiable para "${parsed.material_consultado}".${
                    precio.advertencia ? ` ${precio.advertencia}` : ''
                  }`,
              material: parsed.material_consultado,
              ...precio,
            })
          }

          case 'modificar_cotizacion': {
            if (!quotationId) {
              // Sin quotation_id no hay como saber CUAL cotizacion — pedir
              // crear una nueva es mas util que un error.
              return res.json({
                reply:
                  'No tengo una cotizacion abierta para modificar. Pideme crear una nueva, o abre una desde el formulario primero.',
              })
            }

            const existing = await fullQuotation(pool, quotationId)
            if (!existing) {
              return res.status(404).json({ error: 'Quotation not found' })
            }

            // Mismas fuentes de lineas nuevas que usa 'crear_cotizacion' —
            // misma coercion Number(...)||0 para que un parsed.dias/dotacion
            // null/undefined del LLM no haga que buildAutoLineItems reciba
            // NaN y tire todo a cero silenciosamente distinto a 0 real.
            const autoLineas = await buildAutoLineItems(pool, {
              dias: Number(parsed.dias) || 0,
              dotacion: Number(parsed.dotacion) || 0,
              comuna: parsed.comuna ?? null,
            })
            const manualLineas = buildManualLineItems(parsed.items_mencionados)
            const nuevasLineas = [...manualLineas, ...autoLineas]
            if (nuevasLineas.length === 0) {
              return res.status(422).json({
                error: 'Sin items para agregar',
                message:
                  'No identifique que items agregar a la cotizacion. Indique dotacion/dias/comuna, o describa los items puntuales.',
              })
            }

            // line_items existentes -> mismo shape que espera quotationUpdateSchema
            // (sin id/quotation_id/created_at, que no son parte del input).
            const existingLineItems = (existing.line_items ?? []).map((li: any) => ({
              category_id: li.category_id,
              catalog_item_id: li.catalog_item_id,
              description: li.description,
              unit_name: li.unit_name,
              quantity: li.quantity,
              days: li.days,
              unit_price: li.unit_price,
              sort_order: li.sort_order,
            }))
            const newLineItems = nuevasLineas.map((linea, idx) => ({
              category_id: linea.category_id,
              catalog_item_id: null,
              description: linea.descripcion,
              unit_name: linea.unidad,
              quantity: linea.cantidad,
              days: linea.dias,
              unit_price: linea.precio_unitario,
              sort_order: existingLineItems.length + idx,
            }))

            const updateBody = {
              correlative: existing.correlative,
              client_id: existing.client_id,
              contact_id: existing.contact_id,
              enduser: existing.enduser,
              ref: existing.ref,
              // existing.date/valid_until/contract_start_date vienen de una
              // consulta directa a pg (no de JSON sobre HTTP como en el
              // camino normal del formulario) — el driver `pg` devuelve
              // columnas DATE como objetos Date de JS, no strings, y
              // quotationUpdateSchema exige string (isoDateStr). Sin esta
              // normalizacion, modificar_cotizacion fallaria con 400 en
              // produccion real cada vez que la cotizacion tuviera fecha,
              // pese a pasar los tests (la DB falsa usa strings planos).
              date: toDateStr(existing.date),
              valid_until: toDateStr(existing.valid_until),
              status: existing.status,
              oper_state: existing.oper_state,
              uf_value: existing.uf_value,
              iva_pct: existing.iva_pct,
              notes: existing.notes,
              kind: existing.kind,
              equipment_count: existing.equipment_count,
              equipment_description: existing.equipment_description,
              frequency: existing.frequency,
              visits_per_year: existing.visits_per_year,
              contract_start_date: toDateStr(existing.contract_start_date),
              show_uf_equivalent: existing.show_uf_equivalent,
              show_usd_equivalent: existing.show_usd_equivalent,
              usd_value: existing.usd_value,
              version: existing.version,
              // categories y terms quedan intactas: solo se agregan line_items.
              categories: existing.categories,
              terms: existing.terms,
              line_items: [...existingLineItems, ...newLineItems],
            }

            try {
              const updated = await applyQuotationUpdate(
                pool,
                quotationId,
                updateBody,
                req.user?.role
              )
              await logAction(
                pool,
                userId,
                instruction,
                'modificar_cotizacion',
                quotationId,
                env.CHATBOT_PARSE_MODEL
              )
              return res.json({
                reply: `Agregue ${newLineItems.length} item(s) a la cotizacion ${existing.correlative}.${manualItemsWarning(manualLineas)}`,
                quotation: updated,
              })
            } catch (error: any) {
              if (error.status === 409) {
                return res.status(409).json({
                  error: 'Version conflict',
                  message:
                    'La cotizacion fue modificada por otro usuario mientras procesaba la instruccion. Recargue el formulario e intente de nuevo.',
                })
              }
              throw error
            }
          }

          case 'crear_cotizacion': {
            const candidates = parsed.cliente_nombre
              ? await findClientByName(pool, parsed.cliente_nombre)
              : []
            if (parsed.cliente_nombre && candidates.length === 0) {
              return res.status(404).json({
                error: 'Cliente no encontrado',
                message: `No encontre un cliente llamado "${parsed.cliente_nombre}". Creelo primero desde el formulario, o intente con el nombre completo.`,
              })
            }
            if (candidates.length > 1) {
              return res.status(409).json({
                error: 'Cliente ambiguo',
                message: `Encontre ${candidates.length} clientes que calzan con "${parsed.cliente_nombre}". Sea mas especifico.`,
                opciones: candidates.map(c => ({ id: c.id, name: c.name })),
              })
            }
            if (candidates.length === 0) {
              return res.status(422).json({
                error: 'Falta el cliente',
                message: 'No identifique para que cliente es esta cotizacion.',
              })
            }
            if (!candidates[0].rut) {
              // clients.rut es opcional (prospectos sin RUT todavia) pero
              // /import lo exige siempre — sin este chequeo, el 422 generico
              // de validateImportPayload ("cliente.nombre y cliente.rut son
              // requeridos") confunde al usuario, que SI identifico bien al
              // cliente, solo le falta ese dato en la ficha.
              return res.status(422).json({
                error: 'Cliente sin RUT',
                message: `${candidates[0].name} no tiene RUT registrado. Completelo desde el formulario de Clientes antes de cotizar por chat.`,
              })
            }

            const autoLineas = await buildAutoLineItems(pool, {
              dias: Number(parsed.dias) || 0,
              dotacion: Number(parsed.dotacion) || 0,
              comuna: parsed.comuna ?? null,
            })
            const manualLineas = buildManualLineItems(parsed.items_mencionados)
            const lineas = [...manualLineas, ...autoLineas]
            if (lineas.length === 0) {
              return res.status(422).json({
                error: 'Sin items para cotizar',
                message:
                  'No identifique items, dias ni dotacion en la instruccion. Intente dar mas detalle (ej. "5 dias, 8 tecnicos, en Rancagua").',
              })
            }

            // Siempre uf_manual (tomado del valor configurado en app_config) en
            // vez de dejar que /import dependa de la llamada en vivo a
            // mindicador.cl: una cotizacion creada por chat no deberia fallar
            // con 502 por un tercero externo caido.
            const ufRow = await pool.query(
              `SELECT value FROM app_config WHERE key = 'uf_value' LIMIT 1`
            )
            const ufManual = Number(ufRow.rows[0]?.value) || 39500

            const client = candidates[0]
            const now = new Date()
            const buildPayload = (correlative: string) => ({
              esquema_version: '1.0',
              origen: { skill: 'chatbot-cotizaciones', generado_en: now.toISOString() },
              correlative,
              cliente: { nombre: client.name, rut: client.rut },
              ref: parsed.descripcion_trabajo || instruction.slice(0, 200),
              uf_manual: ufManual,
              lineas,
            })

            const randomCorrelative = `SYM-${String(Math.floor(Math.random() * 900) + 1).padStart(3, '0')}-${String(
              now.getMonth() + 1
            ).padStart(2, '0')}-${now.getFullYear()}`

            let result
            try {
              result = await applyQuotationImport(pool, buildPayload(randomCorrelative), userId)
            } catch (error: any) {
              // Colision de correlativo al azar: un solo reintento con el
              // sugerido por el propio /import, igual que haria un humano.
              if (error.status === 409 && error.payload?.sugerido) {
                result = await applyQuotationImport(
                  pool,
                  buildPayload(error.payload.sugerido),
                  userId
                )
              } else {
                throw error
              }
            }

            await logAction(
              pool,
              userId,
              instruction,
              'crear_cotizacion',
              result.quotation.id,
              env.CHATBOT_PARSE_MODEL
            )
            return res.status(201).json({
              reply: `Cotizacion ${result.quotation.correlative} creada para ${client.name} con ${lineas.length} item(s).${manualItemsWarning(manualLineas)}`,
              ...result,
            })
          }

          case 'conversar':
          default:
            return res.json({
              reply:
                parsed.respuesta_conversacional ||
                'No estoy seguro de que cotizacion crear. Dame el cliente, los dias y la dotacion.',
            })
        }
      } catch (error: any) {
        if (error.payload) return res.status(error.status ?? 500).json(error.payload)
        if (error.status)
          return res.status(error.status).json({ error: 'Error', message: error.message })
        logger.error('Chatbot: error procesando instruccion', { error: error.message, userId })
        // Los early-return 4xx (cliente ambiguo, sin items, etc.) no son un
        // fallo del sistema — son el usuario corrigiendo su instruccion, y no
        // vale la pena auditarlos uno por uno. Un throw que llega hasta aca si
        // es inesperado, y es justo lo que chatbot_actions deberia poder
        // explicar despues ("por que fallo esta instruccion").
        await logAction(
          pool,
          userId,
          instruction,
          `error:${parsed.intent}`,
          null,
          env.CHATBOT_PARSE_MODEL
        )
        return res.status(500).json({ error: 'Error procesando la instruccion' })
      }
    }
  )

  return router
}
