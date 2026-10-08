import { create } from 'zustand'
import { api, ApiError, type ChatMessageResponse } from '../api/api'

// Historial de la conversación con el asistente: estado de sesión (como
// uiStore.ts), no de negocio — no se persiste. Lo que el bot efectivamente
// hace (cotizaciones creadas, reglas enseñadas) sí queda en la base, vía
// chatbot_actions/chatbot_rules en el backend.

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

  useChatStore.setState(s => ({
    isSending: true,
    messages: [...s.messages, { id: ++nextMessageId, role: 'user', text }],
  }))

  try {
    const data = await api.sendChatMessage(text, quotationId)
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
