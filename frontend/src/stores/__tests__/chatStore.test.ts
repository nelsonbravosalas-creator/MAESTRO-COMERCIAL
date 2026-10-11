import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock() se hoistea al tope del archivo, asi que cualquier variable que
// use la factory debe declararse con vi.hoisted() para no romper por orden
// (mismo patron que maestro-store.test.ts).
const { MockApiError, sendChatMessageMock } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    data?: unknown
    constructor(status: number, message: string, data?: unknown) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return { MockApiError, sendChatMessageMock: vi.fn() }
})

vi.mock('../../api/api', () => ({
  ApiError: MockApiError,
  api: { sendChatMessage: sendChatMessageMock },
  default: { sendChatMessage: sendChatMessageMock },
}))

import { useChatStore, sendChatMessage, clearChat } from '../chatStore'

beforeEach(() => {
  clearChat()
  sendChatMessageMock.mockReset()
})

describe('sendChatMessage — memoria corta de la conversacion', () => {
  it('manda solo .text de los ultimos 4 mensajes, nunca .data (el payload estructurado completo)', async () => {
    sendChatMessageMock.mockResolvedValue({ reply: 'ok 1' })
    await sendChatMessage('primero')

    sendChatMessageMock.mockResolvedValue({
      reply: 'ok 2',
      quotation: { id: 'q-1', correlative: 'SYM-001' },
    })
    await sendChatMessage('segundo')

    sendChatMessageMock.mockResolvedValue({ reply: 'ok 3' })
    await sendChatMessage('tercero')

    const lastCall = sendChatMessageMock.mock.calls[sendChatMessageMock.mock.calls.length - 1]
    const recentTurns = lastCall[2]

    expect(recentTurns).toEqual([
      { role: 'user', text: 'primero' },
      { role: 'bot', text: 'ok 1' },
      { role: 'user', text: 'segundo' },
      { role: 'bot', text: 'ok 2' },
    ])
    // Nunca el payload estructurado completo (quotation, etc.) -- solo el
    // texto corto del reply que ya armo el backend.
    for (const turn of recentTurns) {
      expect(turn).not.toHaveProperty('data')
      expect(turn).not.toHaveProperty('quotation')
    }
  })

  it('recorta al limite de 4 turnos, sin incluir mensajes de error', async () => {
    sendChatMessageMock.mockResolvedValueOnce({ reply: 'r1' })
    await sendChatMessage('m1')
    sendChatMessageMock.mockRejectedValueOnce(new MockApiError(500, 'fallo'))
    await sendChatMessage('m2')
    sendChatMessageMock.mockResolvedValueOnce({ reply: 'r3' })
    await sendChatMessage('m3')
    sendChatMessageMock.mockResolvedValueOnce({ reply: 'r4' })
    await sendChatMessage('m4')
    sendChatMessageMock.mockResolvedValueOnce({ reply: 'r5' })
    await sendChatMessage('m5')

    const lastCall = sendChatMessageMock.mock.calls[sendChatMessageMock.mock.calls.length - 1]
    const recentTurns = lastCall[2] as { role: string; text: string }[]

    expect(recentTurns).toHaveLength(4)
    expect(recentTurns.some(t => t.role === 'error')).toBe(false)
    // Tomado ANTES de agregar 'm5' (que se manda aparte como instruction) --
    // son los ultimos 4 turnos previos, sin el mensaje de error de m2.
    expect(recentTurns.map(t => t.text)).toEqual(['m3', 'r3', 'm4', 'r4'])
  })

  it('agrega el mensaje del usuario y la respuesta del bot al historial visible', async () => {
    sendChatMessageMock.mockResolvedValueOnce({ reply: 'hola, como ayudo' })
    await sendChatMessage('hola')

    const messages = useChatStore.getState().messages
    expect(messages.map(m => ({ role: m.role, text: m.text }))).toEqual([
      { role: 'user', text: 'hola' },
      { role: 'bot', text: 'hola, como ayudo' },
    ])
  })
})
