import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import type { MasterQuotation, WorkContext } from '../../types'

afterEach(() => vi.restoreAllMocks())

describe('payload de work_context', () => {
  it('omite magnitudes con clave vacía o valor no finito sin mutar el estado', async () => {
    const wc: WorkContext = {
      v: 1,
      tipo: 'correctivo',
      alcance: 'x',
      magnitudes: [
        { clave: 'equipos', valor: 2, unidad: 'un' },
        { clave: '   ', valor: 1, unidad: '' },
        { clave: '', valor: 0, unidad: '' },
        { clave: 'nan', valor: NaN, unidad: '' },
      ],
      dias: { plazo: null, tipo_plazo: 'corridos', terreno: null },
    }
    const q = {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      client_id: 'c1',
      categories: [],
      items: {},
      scope: [],
      exclusions: [],
      commercial: [],
      work_context: wc,
    } as unknown as MasterQuotation
    let body: any
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        body = JSON.parse(init.body as string)
        return new Response(JSON.stringify({ id: q.id, line_items: [], terms: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })
    )
    await api.updateQuotation(q).catch(() => {})
    expect(body.work_context.magnitudes).toEqual([{ clave: 'equipos', valor: 2, unidad: 'un' }])
    expect(wc.magnitudes).toHaveLength(4)
  })
})
