import { create } from 'zustand'
import { api, ApiError, type ChatMessageResponse, type ChatRecentTurn } from '../api/api'

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
    useChatStore.setState(s => ({
      isSending: false,
      messages: [...s.messages, { id: ++nextMessageId, role: 'bot', text: data.reply, data }],
    }))
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
