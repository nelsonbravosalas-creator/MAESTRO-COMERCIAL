import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Pool } from 'pg'

vi.mock('../llm', async () => {
  const actual = await vi.importActual<typeof import('../llm')>('../llm')
  return { ...actual, callLlm: vi.fn() }
})
import { callLlm } from '../llm'
import { lookupMaterialPrice } from '../chatbotOps'

const llm = vi.mocked(callLlm)
const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as unknown as Pool
const ctx = { instruction: 'x', userId: 'u1', llmProvider: 'gemini' }

const JSON_PRECIOS = JSON.stringify({
  precio_medio: 700,
  muestras: [
    { precio: 500, fuente_url: 'https://ml.cl/a', tienda: 'MercadoLibre' },
    { precio: 700, fuente_url: 'https://www.sodimac.cl/b', tienda: 'Sodimac Homecenter' },
  ],
  advertencia: null,
})

describe('lookupMaterialPrice con tiendas', () => {
  beforeEach(() => {
    llm.mockReset()
    llm.mockResolvedValueOnce('texto de búsqueda').mockResolvedValueOnce(JSON_PRECIOS)
  })

  it('pide solo esas tiendas y filtra las muestras de otras', async () => {
    const res = await lookupMaterialPrice(pool, 'Tubo de cobre', ctx, {
      tiendas: ['Sodimac', 'Easy'],
    })
    const prompt = llm.mock.calls[0][0][0].content
    expect(prompt).toContain('SOLO en estas tiendas: Sodimac, Easy')
    expect(llm.mock.calls[0][1].tools).toEqual([{ google_search: {} }])
    expect(res.muestras.map(m => m.tienda)).toEqual(['Sodimac Homecenter'])
  })

  it('sin tiendas el comportamiento no cambia', async () => {
    const res = await lookupMaterialPrice(pool, 'Tubo de cobre', ctx)
    expect(llm.mock.calls[0][0][0].content).not.toContain('SOLO en estas tiendas')
    expect(res.muestras).toHaveLength(2)
  })
})
