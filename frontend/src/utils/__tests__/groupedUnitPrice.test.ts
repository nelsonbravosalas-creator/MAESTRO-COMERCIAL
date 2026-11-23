import { describe, expect, it } from 'vitest'
import { buildGroupedRows, roundIva, sumQty, unitPriceOf } from '../groupedUnitPrice'
import type { MasterQuotation } from '../../types'

type Line = { id: string; desc: string; cant: number; unidad: string; unit: number }

function line(id: string, cant: number, unit: number, unidad = 'un', desc = `Equipo ${id}`): Line {
  return { id, desc, cant, unidad, unit }
}

function quote(mo: Line[], extra: Record<string, unknown> = {}): MasterQuotation {
  return {
    id: 'q1',
    kind: 'project',
    ref: 'Obra X',
    iva: 19,
    categories: [{ id: 'mo', label: 'Mano de obra', margin: 0 }],
    items: { mo },
    mtc_config: null,
    ...extra,
  } as unknown as MasterQuotation
}

function mtc(systems: { name: string; lines: Line[] }[]): MasterQuotation {
  return {
    id: 'm1',
    kind: 'maintenance',
    iva: 19,
    uf: 0,
    usd: 0,
    mtc_active_system: 0,
    categories: [{ id: 'mo', label: 'Mano de obra', margin: 0 }],
    items: { mo: systems[0]?.lines ?? [] },
    mtc_config: {
      v: 1,
      summary_mode: false,
      show_summary_table: false,
      systems: systems.map((s, i) => ({
        id: `s${i}`,
        name: s.name,
        frequency: 'mensual',
        special_months: null,
        schedule: 'habil',
        currency: 'CLP',
        summary_text: null,
        consumables: { enabled: false, margin: 0, rows: [] },
        categories: i === 0 ? null : [{ id: 'mo', label: 'Mano de obra', margin: 0 }],
        items: i === 0 ? null : { mo: s.lines },
      })),
    },
  } as unknown as MasterQuotation
}

describe('helpers', () => {
  it('sumQty avoids float noise and ignores invalid', () => {
    expect(sumQty([0.1, 0.2])).toBe(0.3)
    expect(sumQty([2, NaN, -1, 0])).toBe(2)
  })
  it('unitPriceOf rounds to the peso and guards zero qty', () => {
    expect(unitPriceOf(100, 3)).toBe(33)
    expect(unitPriceOf(100, 0)).toBe(0)
  })
  it('roundIva rounds the 19%', () => {
    expect(roundIva(1005, 19)).toBe(191)
    expect(roundIva(100, NaN)).toBe(0)
  })
})

describe('buildGroupedRows - cotización normal', () => {
  it('is empty without lines', () => {
    const m = buildGroupedRows(quote([]))
    expect(m.items).toHaveLength(0)
    expect(m.neto).toBe(0)
    expect(m.total).toBe(0)
  })

  it('makes one item with all lines as subitems and sums quantities', () => {
    const m = buildGroupedRows(quote([line('a', 2, 1000), line('b', 3, 2000)]))
    expect(m.items).toHaveLength(1)
    const it = m.items[0]
    expect(it.subitems.map(s => s.id)).toEqual(['a', 'b'])
    expect(it.qty).toBe(5)
    expect(it.venta).toBe(8000)
    expect(it.unitPrice).toBe(1600)
    expect(it.total).toBe(8000)
    expect(m.neto).toBe(8000)
    expect(m.iva).toBe(1520)
    expect(m.total).toBe(9520)
    expect(m.diff).toBe(0)
  })

  it('omits lines with quantity 0 or without description', () => {
    const m = buildGroupedRows(
      quote([line('a', 0, 500), line('b', 2, 1000), line('c', 1, 0, 'un', '')])
    )
    expect(m.items[0].subitems.map(s => s.id)).toEqual(['b'])
    expect(m.items[0].qty).toBe(2)
  })

  it('handles decimal quantities and reports rounding difference', () => {
    const m = buildGroupedRows(quote([line('a', 0.5, 1000), line('b', 0.25, 1000)]))
    const it = m.items[0]
    expect(it.qty).toBe(0.75)
    expect(it.unitPrice).toBe(1000)
    expect(it.total).toBe(750)

    const r = buildGroupedRows(quote([line('a', 3, 100)]))
    expect(r.items[0].unitPrice).toBe(100)

    const d = buildGroupedRows(quote([line('a', 1, 100), line('b', 2, 0.5)]))
    // venta 101, cant 3 -> unit 34, total 102
    expect(d.items[0].unitPrice).toBe(34)
    expect(d.neto).toBe(102)
    expect(d.diff).toBe(d.total - Math.round(101 * 1.19))
    expect(d.diff).not.toBe(0)
  })

  it('lists mixed units with their own unit and sums only the number', () => {
    const m = buildGroupedRows(quote([line('a', 2, 1000, 'm2'), line('b', 3, 1000, 'hr')]))
    expect(m.items[0].qty).toBe(5)
    expect(m.items[0].subitems.map(s => s.unit)).toEqual(['m2', 'hr'])
  })

  it('Neto/IVA/Total cuadran', () => {
    const m = buildGroupedRows(quote([line('a', 7, 1234), line('b', 3, 999)]))
    expect(m.total).toBe(m.neto + m.iva)
    expect(m.iva).toBe(Math.round((m.neto * 19) / 100))
    expect(m.neto).toBe(m.items.reduce((a, i) => a + i.total, 0))
  })
})

describe('buildGroupedRows - mantención', () => {
  it('makes one item per system, annual venta (12 visits)', () => {
    const m = buildGroupedRows(
      mtc([
        { name: 'Sistema A', lines: [line('a', 2, 1000), line('b', 3, 1000)] },
        { name: 'Sistema B', lines: [line('c', 1, 5000)] },
      ])
    )
    expect(m.items).toHaveLength(2)
    expect(m.items.map(i => i.n)).toEqual([1, 2])
    expect(m.items[0].qty).toBe(5)
    expect(m.items[0].venta).toBe(5000 * 12)
    expect(m.items[0].unitPrice).toBe(12000)
    expect(m.items[1].venta).toBe(5000 * 12)
    expect(m.neto).toBe(120000)
    expect(m.total).toBe(120000 + Math.round(120000 * 0.19))
    expect(m.diff).toBe(0)
  })

  it('skips systems with no priced lines', () => {
    const m = buildGroupedRows(
      mtc([
        { name: 'Vacío', lines: [line('a', 0, 1000)] },
        { name: 'Con datos', lines: [line('b', 1, 1000)] },
      ])
    )
    expect(m.items).toHaveLength(1)
    expect(m.items[0].title).toContain('Con datos')
    expect(m.items[0].n).toBe(1)
    // el sistema vacío no aporta venta (qty 0), así que no hay diferencia
    expect(m.diff).toBe(0)
  })
})
