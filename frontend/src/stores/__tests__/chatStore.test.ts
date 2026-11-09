import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock() se hoistea al tope del archivo, asi que cualquier variable que
// use la factory debe declararse con vi.hoisted() para no romper por orden
// (mismo patron que maestro-store.test.ts).
const {
  MockApiError,
  sendChatMessageMock,
  confirmActionMock,
  cancelActionMock,
  cubicarBorradorMock,
} = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    data?: unknown
    constructor(status: number, message: string, data?: unknown) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return {
    MockApiError,
    sendChatMessageMock: vi.fn(),
    confirmActionMock: vi.fn(),
    cancelActionMock: vi.fn(),
    cubicarBorradorMock: vi.fn(),
  }
})

vi.mock('../../api/api', () => ({
  ApiError: MockApiError,
  api: {
    sendChatMessage: sendChatMessageMock,
    confirmChatbotAction: confirmActionMock,
    cancelChatbotAction: cancelActionMock,
    cubicarBorrador: cubicarBorradorMock,
  },
  default: { sendChatMessage: sendChatMessageMock },
}))

import {
  useChatStore,
  sendChatMessage,
  clearChat,
  resolveChatAction,
  cubicarDesdeBoton,
} from '../chatStore'
import type { EstadoCubicador } from '../../api/api'

beforeEach(() => {
  clearChat()
  sendChatMessageMock.mockReset()
  confirmActionMock.mockReset()
  cancelActionMock.mockReset()
  cubicarBorradorMock.mockReset()
  useChatStore.setState({ actionStates: {} })
})

describe('resolveChatAction — control de escrituras', () => {
  it('confirma una propuesta y agrega la respuesta del bot', async () => {
    confirmActionMock.mockResolvedValue({ reply: 'Creó Q-9', quotation: undefined })

    await resolveChatAction('acc-1', 'confirm')

    expect(confirmActionMock).toHaveBeenCalledWith('acc-1')
    expect(useChatStore.getState().actionStates['acc-1']).toBe('confirmed')
    const last = useChatStore.getState().messages.slice(-1)[0]
    expect(last).toMatchObject({ role: 'bot', text: 'Creó Q-9' })
  })

  it('no manda dos veces la misma propuesta (doble clic)', async () => {
    let release: (v: unknown) => void = () => {}
    confirmActionMock.mockImplementation(() => new Promise(r => (release = r)))

    const first = resolveChatAction('acc-1', 'confirm')
    await resolveChatAction('acc-1', 'confirm')
    release({ reply: 'ok' })
    await first

    expect(confirmActionMock).toHaveBeenCalledTimes(1)
  })

  it('cancela sin llamar a confirmar', async () => {
    cancelActionMock.mockResolvedValue({ reply: 'Acción cancelada.' })

    await resolveChatAction('acc-2', 'cancel')

    expect(cancelActionMock).toHaveBeenCalledWith('acc-2')
    expect(confirmActionMock).not.toHaveBeenCalled()
    expect(useChatStore.getState().actionStates['acc-2']).toBe('cancelled')
  })

  it('cierra la propuesta si ya venció o fue resuelta (410/409)', async () => {
    confirmActionMock.mockRejectedValue(new MockApiError(410, 'La acción expiró.'))

    await resolveChatAction('acc-3', 'confirm')

    expect(useChatStore.getState().actionStates['acc-3']).toBe('closed')
    const last = useChatStore.getState().messages.slice(-1)[0]
    expect(last).toMatchObject({ role: 'error', text: 'La acción expiró.' })
  })
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

  it('recorta un reply largo (p.ej. manualItemsWarning con varios items) a 500 chars antes de reenviarlo como historial', async () => {
    const replyLargo = 'Cotizacion SYM-001 creada con 3 item(s).' + ' x'.repeat(300)
    expect(replyLargo.length).toBeGreaterThan(500)

    sendChatMessageMock.mockResolvedValueOnce({ reply: replyLargo })
    await sendChatMessage('crea la cotizacion')
    sendChatMessageMock.mockResolvedValueOnce({ reply: 'listo' })
    await sendChatMessage('gracias')

    const lastCall = sendChatMessageMock.mock.calls[sendChatMessageMock.mock.calls.length - 1]
    const recentTurns = lastCall[2] as { role: string; text: string }[]
    const turnoLargo = recentTurns.find(t => t.text.startsWith('Cotizacion'))

    expect(turnoLargo?.text.length).toBeLessThanOrEqual(500)
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

describe('cubicarDesdeBoton', () => {
  const estado: EstadoCubicador = {
    borrador_id: 'b-1',
    perfil: 'hvac',
    estado: 'cubicado',
    compuerta: { respondidas: 3, requeridas: 3, habilitado: true, faltantes: [], siguientes: [] },
    datos_completos: 3,
    datos_totales: 5,
    resultado: { items: [], supuestos: [], advertencias: [], dotacion: null },
    precios_pendientes: 0,
  }

  it('cubicarDesdeBoton agrega el listado', async () => {
    cubicarBorradorMock.mockResolvedValue(estado)

    await cubicarDesdeBoton('b-1', null)

    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('bot')
    expect(msgs[0].data?.cubicador).toEqual(estado)
    expect(useChatStore.getState().isSending).toBe(false)
  })

  it('no manda dos veces con doble clic', async () => {
    let resolver: (e: EstadoCubicador) => void = () => {}
    cubicarBorradorMock.mockReturnValue(new Promise<EstadoCubicador>(r => (resolver = r)))

    const primera = cubicarDesdeBoton('b-1')
    const segunda = cubicarDesdeBoton('b-1')
    resolver(estado)
    await Promise.all([primera, segunda])

    expect(cubicarBorradorMock).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().messages).toHaveLength(1)
  })

  it('error 422 se muestra como mensaje con lo que falta', async () => {
    cubicarBorradorMock.mockRejectedValue(
      new MockApiError(422, 'Faltan datos para cubicar.', {
        faltantes: ['potencia'],
        siguientes: ['¿Qué potencia tiene el equipo?'],
        motivo: 'Faltan datos para cubicar.',
      })
    )

    await cubicarDesdeBoton('b-1')

    const msgs = useChatStore.getState().messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('error')
    expect(msgs[0].text).toContain('Faltan datos para cubicar.')
    expect(msgs[0].text).toContain('¿Qué potencia tiene el equipo?')
    // tras el error se puede reintentar
    cubicarBorradorMock.mockResolvedValue(estado)
    await cubicarDesdeBoton('b-1')
    expect(cubicarBorradorMock).toHaveBeenCalledTimes(2)
  })

  it('otros errores muestran un mensaje genérico en español', async () => {
    cubicarBorradorMock.mockRejectedValue(new Error('boom interno'))
    await cubicarDesdeBoton('b-1')
    const m = useChatStore.getState().messages[0]
    expect(m.role).toBe('error')
    expect(m.text).toBe('No se pudo cubicar. Intente de nuevo.')
  })
})
