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

export interface ChatMessage {
  id: number
  role: 'user' | 'bot' | 'error'
  text: string
  data?: ChatMessageResponse
}

interface ChatState {
  isOpen: boolean
  isSending: boolean
  messages: ChatMessage[]
}

export const useChatStore = create<ChatState>()(() => ({
  isOpen: false,
  isSending: false,
  messages: [],
}))

let nextMessageId = 0

export function toggleChat(force?: boolean) {
  useChatStore.setState(s => ({ isOpen: force ?? !s.isOpen }))
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
  const recentTurns: ChatRecentTurn[] = useChatStore
    .getState()
    .messages.filter((m): m is ChatMessage & { role: 'user' | 'bot' } => m.role !== 'error')
    .slice(-RECENT_TURNS_LIMIT)
    .map(m => ({ role: m.role, text: m.text }))

  useChatStore.setState(s => ({
    isSending: true,
    messages: [...s.messages, { id: ++nextMessageId, role: 'user', text }],
  }))

  try {
    const data = await api.sendChatMessage(text, quotationId, recentTurns)
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
