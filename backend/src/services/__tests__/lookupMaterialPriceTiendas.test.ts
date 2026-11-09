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
    expect(res.muestras.map(m => m.tienda)).toEqual(['Sodimac'])
  })

  it('sin tiendas el comportamiento no cambia', async () => {
    const res = await lookupMaterialPrice(pool, 'Tubo de cobre', ctx)
    expect(llm.mock.calls[0][0][0].content).not.toContain('SOLO en estas tiendas')
    expect(res.muestras).toHaveLength(2)
  })
})

describe('lookupMaterialPrice con tiendas: precio_medio', () => {
  it('se recalcula solo con las muestras que quedan y eso es lo que se guarda en el grafo', async () => {
    const consultas: unknown[][] = []
    const poolEspia = {
      query: vi.fn(async (_sql: string, params: unknown[] = []) => {
        consultas.push(params)
        return { rows: [], rowCount: 0 }
      }),
    } as unknown as Pool
    llm.mockReset()
    llm.mockResolvedValueOnce('texto').mockResolvedValueOnce(
      JSON.stringify({
        precio_medio: 600, // promedio del modelo incluyendo a MercadoLibre (500)
        muestras: [
          { precio: 500, fuente_url: 'https://ml.cl/a', tienda: 'MercadoLibre' },
          { precio: 700, fuente_url: 'https://www.sodimac.cl/b', tienda: 'Sodimac' },
        ],
        advertencia: null,
      })
    )
    const res = await lookupMaterialPrice(poolEspia, 'Tubo de cobre', ctx, { tiendas: ['Sodimac'] })
    expect(res.precio_medio).toBe(700)
    const escrito = JSON.stringify(consultas)
    expect(escrito).toContain('700')
    expect(escrito).not.toContain('600')
  })

  it('sin muestras de las tiendas pedidas el precio medio es 0', async () => {
    llm.mockReset()
    llm.mockResolvedValueOnce('texto').mockResolvedValueOnce(
      JSON.stringify({
        precio_medio: 500,
        muestras: [{ precio: 500, fuente_url: 'https://ml.cl/a', tienda: 'MercadoLibre' }],
        advertencia: null,
      })
    )
    const res = await lookupMaterialPrice(pool, 'Tubo', ctx, { tiendas: ['Sodimac'] })
    expect(res.precio_medio).toBe(0)
    expect(res.muestras).toEqual([])
  })
})

describe('lookupMaterialPrice con tiendas: etiqueta sin dominio', () => {
  it('una muestra con etiqueta Sodimac pero dominio ajeno se descarta y no contamina el precio', async () => {
    llm.mockReset()
    llm.mockResolvedValueOnce('texto').mockResolvedValueOnce(
      JSON.stringify({
        precio_medio: 400,
        muestras: [
          { precio: 100, fuente_url: 'https://tienda-falsa.com/a', tienda: 'Sodimac' },
          { precio: 700, fuente_url: 'https://www.sodimac.cl/b', tienda: 'Sodimac' },
        ],
        advertencia: null,
      })
    )
    const res = await lookupMaterialPrice(pool, 'Tubo', ctx, { tiendas: ['Sodimac'] })
    expect(res.muestras).toHaveLength(1)
    expect(res.muestras[0].fuente_url).toContain('sodimac.cl')
    expect(res.precio_medio).toBe(700)
  })
})
