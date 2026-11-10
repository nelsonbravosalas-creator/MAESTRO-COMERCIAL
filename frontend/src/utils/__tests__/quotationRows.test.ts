import { describe, expect, it, vi } from 'vitest'
import type { CostCategory, CostItem } from '../../types'

vi.mock('../costeoMath', () => ({
  calcCat: (catId: string) =>
    catId === 'mo'
      ? { costo: 100, venta: 130, beneficio: 30, margin: 0.3 }
      : { costo: 0, venta: 0, beneficio: 0, margin: 0 },
}))

import { buildValuationRows } from '../quotationRows'

describe('buildValuationRows', () => {
  const categories = [
    { id: 'mo', desc: 'Mano de obra' },
    { id: 'log', desc: 'Logística' },
  ] as unknown as CostCategory[]

  const moItem = {
    desc: 'Operario',
    cant: 2,
    unidad: 'h',
    days: 3,
    puntoA: 'Origen',
    puntoB: 'Destino',
  } as unknown as CostItem

  const items = {
    mo: [moItem],
    log: [],
  } as unknown as Record<string, CostItem[]>

  it('incluye solo categorías con venta y no muestra detalles si no está expandida', () => {
    const rows = buildValuationRows(categories, items)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cat: categories[0],
      rowNumber: 1,
      venta: 130,
      details: [],
    })
  })

  it('muestra el meta de los ítems cuando la categoría está expandida', () => {
    const rows = buildValuationRows(categories, items, ['mo'])

    expect(rows[0].details).toEqual([
      {
        item: moItem,
        meta: 'Origen → Destino · 2 h × 3 dias',
      },
    ])
  })
})
