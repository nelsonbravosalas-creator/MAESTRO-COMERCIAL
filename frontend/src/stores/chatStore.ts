import { create } from 'zustand'
import {
  api,
  ApiError,
  type ChatMessageResponse,
  type ChatRecentTurn,
  type EstadoCubicador,
} from '../api/api'

// Historial de la conversación con el asistente: estado de sesión (como
// uiStore.ts), no de negocio — no se persiste. Lo que el bot efectivamente
// hace (cotizaciones creadas, reglas enseñadas) sí queda en la base, vía
// chatbot_actions/chatbot_rules en el backend, y la memoria de largo plazo
// (patrones, precios, reglas) vive en el grafo de conocimiento del backend
// (chatbotGraph.ts) — este store solo manda los ultimos turnos para que el
// LLM resuelva referencias ambiguas de ESTE turno ("mejor 3 dias"), nunca
// como fuente de hechos de negocio.

// Ultimos N mensajes (usuario+bot mezclados, no N intercambios) que se
// mandan junto con cada instruccion nueva.
const RECENT_TURNS_LIMIT = 4

// El backend acepta hasta 500 chars por turno (los recorta si se pasa), pero
// un reply de bot con manualItemsWarning() (varios items sin precio listados)
// puede superarlo. Se recorta aqui tambien para no mandar bytes de mas.
const RECENT_TURN_TEXT_LIMIT = 500

export interface ChatMessage {
  id: number
  role: 'user' | 'bot' | 'error'
  text: string
  data?: ChatMessageResponse
}

// Estado de cada propuesta de escritura del agente, por id de acción. Vive
// solo en la sesión: al recargar, la base manda (una acción ya resuelta
// responde 409 y se marca como cerrada).
export type PendingActionState = 'busy' | 'confirmed' | 'cancelled' | 'closed'

interface ChatState {
  isOpen: boolean
  isSending: boolean
  messages: ChatMessage[]
  agentMode: boolean
  actionStates: Record<string, PendingActionState>
}

export const useChatStore = create<ChatState>()(() => {
  let initialAgentMode = false
  try {
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem('chat_agent_mode') : null
    if (saved !== null) {
      initialAgentMode = saved === 'true'
    }
  } catch {
    // ignorar entornos sin localStorage
  }
  return {
    isOpen: false,
    isSending: false,
    messages: [],
    agentMode: initialAgentMode,
    actionStates: {},
  }
})

let nextMessageId = 0

export function toggleChat(force?: boolean) {
  useChatStore.setState(s => ({ isOpen: force ?? !s.isOpen }))
}

export function toggleAgentMode(force?: boolean) {
  useChatStore.setState(s => {
    const next = force ?? !s.agentMode
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('chat_agent_mode', String(next))
      }
    } catch {
      // ignorar
    }
    return { agentMode: next }
  })
}

/** Manda la instrucción al asistente y agrega la respuesta (o el error) al historial. */
export async function sendChatMessage(instruction: string, quotationId?: string | null) {
  const text = instruction.trim()
  if (!text) return

  // Tomado ANTES de agregar el mensaje nuevo (que se manda aparte como
  // `instruction`), y solo `.text` de cada uno -- para un mensaje de bot eso
  // YA es el `reply` corto armado por el backend, nunca `.data` (el payload
  // estructurado completo con la cotizacion/regla/muestras) -- asi no se
  // paga tokens dos veces por un dato que ya vive en la base/el grafo.
  const state = useChatStore.getState()
  const recentTurns: ChatRecentTurn[] = state.messages
    .filter((m): m is ChatMessage & { role: 'user' | 'bot' } => m.role !== 'error')
    .slice(-RECENT_TURNS_LIMIT)
    .map(m => ({ role: m.role, text: m.text.slice(0, RECENT_TURN_TEXT_LIMIT) }))

  const currentAgentMode = state.agentMode

  useChatStore.setState(s => ({
    isSending: true,
    messages: [...s.messages, { id: ++nextMessageId, role: 'user', text }],
  }))

  try {
    const data = await api.sendChatMessage(text, quotationId, recentTurns, currentAgentMode)
    const cubicador = data.cubicador
    if (cubicador && hayTarjeta(cubicador.borrador_id)) {
      // F8: la tarjeta de ese borrador ya existe; se actualiza, no se duplica.
      actualizarTarjeta(cubicador)
      useChatStore.setState(s => ({
        isSending: false,
        messages: [
          ...s.messages,
          // Se conserva todo el payload (acciones pendientes, pasos, cotización); solo se quita
          // la tarjeta, que ya quedó actualizada en su mensaje original.
          {
            id: ++nextMessageId,
            role: 'bot',
            text: data.reply,
            data: { ...data, cubicador: undefined },
          },
        ],
      }))
    } else {
      useChatStore.setState(s => ({
        isSending: false,
        messages: [...s.messages, { id: ++nextMessageId, role: 'bot', text: data.reply, data }],
      }))
    }
    // F3: una tarjeta que trae el agente con precios pendientes también consulta sus precios.
    if (cubicador && cubicador.precios_pendientes > 0) {
      void resolverPreciosDesdeTarjeta(cubicador.borrador_id)
    }
  } catch (error) {
    let message = error instanceof ApiError ? error.message : 'No se pudo contactar al asistente.'
    // El 409 "cliente ambiguo" trae opciones en error.data — sin esto el
    // usuario solo ve "sea mas especifico" sin saber entre qué clientes.
    const opciones = (error instanceof ApiError && (error.data as any)?.opciones) as
      Array<{ id: string; name: string }> | undefined
    if (opciones?.length) {
      message += '\n' + opciones.map(o => `• ${o.name}`).join('\n')
    }
    useChatStore.setState(s => ({
      isSending: false,
      messages: [...s.messages, { id: ++nextMessageId, role: 'error', text: message }],
    }))
  }
}

export function clearChat() {
  useChatStore.setState({ messages: [] })
}

function setActionState(actionId: string, state: PendingActionState) {
  useChatStore.setState(s => ({ actionStates: { ...s.actionStates, [actionId]: state } }))
}

/**
 * Confirma o cancela una escritura propuesta por el agente. Mientras la
 * respuesta llega, la acción queda en 'busy' para que un doble clic no la
 * mande dos veces (el backend además la reclama de forma atómica).
 */
export async function resolveChatAction(actionId: string, decision: 'confirm' | 'cancel') {
  if (useChatStore.getState().actionStates[actionId]) return
  setActionState(actionId, 'busy')

  try {
    const res =
      decision === 'confirm'
        ? await api.confirmChatbotAction(actionId)
        : await api.cancelChatbotAction(actionId)
    setActionState(actionId, decision === 'confirm' ? 'confirmed' : 'cancelled')
    // F8: el estado nuevo del listado (p. ej. 'ingresado') va a la tarjeta existente.
    if (res.cubicador) actualizarTarjeta(res.cubicador)
    const data: ChatMessageResponse = {
      reply: res.reply,
      quotation: res.quotation,
      rule: res.rule,
    }
    useChatStore.setState(s => ({
      messages: [...s.messages, { id: ++nextMessageId, role: 'bot', text: res.reply, data }],
    }))
  } catch (error) {
    // 404, 409 o 410: la acción ya no se puede resolver (vencida, resuelta o ajena).
    setActionState(actionId, 'closed')
    const message = error instanceof ApiError ? error.message : 'No se pudo resolver la acción.'
    useChatStore.setState(s => ({
      messages: [...s.messages, { id: ++nextMessageId, role: 'error', text: message }],
    }))
  }
}

/** Carga de forma proactiva el briefing comercial matutino (OpenJarvis scheduled ops). */
export async function loadCommercialBriefing() {
  const state = useChatStore.getState()
  if (state.isSending) return

  useChatStore.setState(s => ({
    isSending: true,
    messages: [
      ...s.messages,
      { id: ++nextMessageId, role: 'user', text: '☀️ Resumen comercial matutino' },
    ],
  }))

  try {
    const briefing = await api.getCommercialBriefing()
    let reply = briefing.executiveSummary
    if (briefing.alerts.length > 0) {
      reply +=
        '\n\n' +
        briefing.alerts
          .map(a => {
            const icon = a.severity === 'high' ? '🔴' : '🟡'
            return `${icon} **${a.title}**: ${a.detail}`
          })
          .join('\n')
    }

    useChatStore.setState(s => ({
      isSending: false,
      messages: [...s.messages, { id: ++nextMessageId, role: 'bot', text: reply }],
    }))
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'No se pudo contactar al asistente.'
    useChatStore.setState(s => ({
      isSending: false,
      messages: [...s.messages, { id: ++nextMessageId, role: 'error', text: message }],
    }))
  }
}

// Borradores con una cubicación en curso: ignora el segundo clic del botón.
const cubicando = new Set<string>()

/** Mensaje en español con lo que falta, a partir del cuerpo del 422 del servidor. */
function mensajeCompuertaCerrada(error: ApiError): string {
  const data = (error.data ?? {}) as { faltantes?: unknown; siguientes?: unknown; motivo?: unknown }
  const comoTextos = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const siguientes = comoTextos(data.siguientes)
  const detalle = siguientes.length ? siguientes : comoTextos(data.faltantes)
  const motivo = typeof data.motivo === 'string' ? data.motivo : error.message
  return detalle.length
    ? `${motivo}\nFalta responder:\n${detalle.map(d => `• ${d}`).join('\n')}`
    : motivo
}

/** Mensaje en español para los errores comunes de las rutas del cubicador. */
function mensajeErrorCubicador(error: unknown, porDefecto: string): string {
  if (error instanceof ApiError) {
    if (error.status === 404)
      return 'El borrador de cubicación ya no está disponible. Empiece de nuevo.'
    if (error.status === 409) return 'El listado ya fue ingresado o cambió. Vuelva a cargarlo.'
    if (error.status === 429) return 'Demasiadas solicitudes, reintenta en un minuto.'
  }
  return porDefecto
}

/**
 * Botón «Cubicar» de la tarjeta del chat: llama al servidor (sin LLM) y agrega
 * el listado como mensaje de bot; luego resuelve los precios pendientes por lotes.
 * `_quotationId` se acepta por simetría con sendChatMessage; el ingreso a una
 * cotización es un paso posterior.
 */
export async function cubicarDesdeBoton(borradorId: string, _quotationId?: string | null) {
  if (cubicando.has(borradorId)) return
  cubicando.add(borradorId)
  useChatStore.setState({ isSending: true })
  try {
    const cubicador = await api.cubicarBorrador(borradorId)
    const reply = 'Listado de cubicación generado. Revise los supuestos antes de usarlo.'
    // F8: si la tarjeta ya existe, se actualiza en vez de agregar otra.
    if (hayTarjeta(borradorId)) actualizarTarjeta(cubicador)
    useChatStore.setState(s => ({
      isSending: false,
      messages: [
        ...s.messages,
        {
          id: ++nextMessageId,
          role: 'bot',
          text: reply,
          data: hayTarjeta(borradorId) ? { reply } : { reply, cubicador },
        },
      ],
    }))
    if (cubicador.precios_pendientes > 0) await resolverPreciosDesdeTarjeta(borradorId)
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 422
        ? mensajeCompuertaCerrada(error)
        : mensajeErrorCubicador(error, 'No se pudo cubicar. Intente de nuevo.')
    useChatStore.setState(s => ({
      isSending: false,
      messages: [...s.messages, { id: ++nextMessageId, role: 'error', text: message }],
    }))
  } finally {
    cubicando.delete(borradorId)
  }
}

// Borradores cuyos precios se están consultando: ignora una segunda llamada en paralelo.
const resolviendoPrecios = new Set<string>()

/** Vueltas máximas por listado: cada una resuelve un lote en el servidor (límite de 60 s). */
export const MAX_RONDAS_PRECIOS = 10

// ¿Ya hay una tarjeta de cubicación para este borrador en el historial?
function hayTarjeta(borradorId: string): boolean {
  return useChatStore.getState().messages.some(m => m.data?.cubicador?.borrador_id === borradorId)
}

// Reemplaza el estado de la tarjeta en su mensaje, sin agregar mensajes nuevos.
function actualizarTarjeta(estado: EstadoCubicador) {
  useChatStore.setState(s => ({
    messages: s.messages.map(m =>
      m.data?.cubicador?.borrador_id === estado.borrador_id
        ? { ...m, data: { ...m.data, cubicador: estado } as ChatMessageResponse }
        : m
    ),
  }))
}

/**
 * Consulta los precios pendientes de la tarjeta por lotes: repite mientras queden
 * pendientes (tope MAX_RONDAS_PRECIOS) y detiene el bucle ante el primer error.
 */
export async function resolverPreciosDesdeTarjeta(borradorId: string) {
  if (resolviendoPrecios.has(borradorId)) return
  resolviendoPrecios.add(borradorId)
  try {
    let pendientes = Number.POSITIVE_INFINITY
    for (let ronda = 0; ronda < MAX_RONDAS_PRECIOS && pendientes > 0; ronda++) {
      const estado = await api.resolverPreciosBorrador(borradorId)
      actualizarTarjeta(estado)
      pendientes = estado.precios_pendientes
    }
    if (pendientes > 0) {
      useChatStore.setState(s => ({
        messages: [
          ...s.messages,
          {
            id: ++nextMessageId,
            role: 'error',
            text: `Quedaron ${pendientes} precios sin consultar. Vuelva a intentarlo en un momento.`,
          },
        ],
      }))
    }
  } catch (error) {
    const message = mensajeErrorCubicador(error, 'No se pudieron consultar los precios.')
    useChatStore.setState(s => ({
      messages: [...s.messages, { id: ++nextMessageId, role: 'error', text: message }],
    }))
  } finally {
    resolviendoPrecios.delete(borradorId)
  }
}
