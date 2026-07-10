import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CategoryId, CostCategory, CostItem, MasterQuotation } from '../../types'

vi.mock('../../api/api', () => ({
  default: {
    createQuotation: vi.fn(),
    updateQuotation: vi.fn(),
  },
}))

import api from '../../api/api'
import { calcCat, calcTotals, generateCorrelative, useMaestro } from '../maestro-store'

function makeCategory(overrides: Partial<CostCategory> = {}): CostCategory {
  return {
    id: 'mo', label: 'Mano de Obra', margin: 20, color: '#000',
    showDetails: false, showValues: false, note: '', collapsed: false,
    ...overrides,
  }
}

function makeItem(overrides: Partial<CostItem> = {}): CostItem {
  return { id: 'i1', desc: 'Item', unidad: 'Und', cant: 2, unit: 100, days: 1, ...overrides }
}

function emptyItems(): Record<CategoryId, CostItem[]> {
  return { mo: [], log: [], mat: [], rep: [], ins: [] }
}

function makeQuotation(overrides: Partial<MasterQuotation> = {}): MasterQuotation {
  const base: MasterQuotation = {
    id: 'srv-1', correlative: 'SYM-001-01-2026', client_id: 'c1', client_name: 'Cliente',
    contact_id: null, contact: '', enduser: '', ref: '', date: '2026-01-01', valid_until: null,
    status: 'Borrador', operState: null, uf: 39000, iva: 19, notes: null, version: 1,
    categories: [makeCategory()],
    items: { ...emptyItems(), mo: [makeItem()] },
    scope: [], exclusions: [], commercial: [], total: 0,
    created_at: '2026-01-01', updated_at: '2026-01-01',
  }
  return { ...base, ...overrides }
}

describe('calcCat / calcTotals', () => {
  it('calcula costo, venta y beneficio con margen normal', () => {
    const categories = [makeCategory({ margin: 20 })]
    const items = { ...emptyItems(), mo: [makeItem({ cant: 2, unit: 100, days: 1 })] }
    const r = calcCat('mo', categories, items)
    expect(r.costo).toBe(200)
    expect(r.venta).toBeCloseTo(250)
    expect(r.beneficio).toBeCloseTo(50)
  })

  it('clampea el margen a un máximo de 99.9% para evitar división por cero', () => {
    const categories = [makeCategory({ margin: 150 })]
    const items = { ...emptyItems(), mo: [makeItem({ cant: 1, unit: 100, days: 1 })] }
    const r = calcCat('mo', categories, items)
    expect(r.margin).toBe(99.9)
    expect(r.venta).toBeCloseTo(100 / (1 - 0.999))
  })

  it('calcTotals suma costo/venta/beneficio de todas las categorías', () => {
    const q = makeQuotation({
      categories: [makeCategory({ id: 'mo', margin: 20 }), makeCategory({ id: 'log', margin: 0 })],
      items: {
        ...emptyItems(),
        mo:  [makeItem({ cant: 2, unit: 100, days: 1 })],
        log: [makeItem({ id: 'i2', cant: 1, unit: 50, days: 1 })],
      },
    })
    const totals = calcTotals(q)
    expect(totals.costo).toBeCloseTo(250)
  })
})

describe('generateCorrelative', () => {
  it('empieza en 001 cuando no hay cotizaciones previas', () => {
    expect(generateCorrelative([])).toMatch(/^SYM-001-\d{2}-\d{4}$/)
  })

  it('continúa desde el correlativo más alto existente', () => {
    const existing = [
      makeQuotation({ correlative: 'SYM-005-01-2026' }),
      makeQuotation({ correlative: 'SYM-002-01-2026' }),
    ]
    expect(generateCorrelative(existing)).toMatch(/^SYM-006-\d{2}-\d{4}$/)
  })
})

// Regression test: saveActive() solía marcar `unsaved: false` de inmediato y
// tragarse cualquier error de red, haciendo que los botones de sync mintieran
// sobre si el guardado realmente llegó al backend. Ver maestro-store.ts.
describe('saveActive — no debe marcar "unsaved:false" si el backend rechaza el guardado', () => {
  beforeEach(() => {
    ;(api.createQuotation as any).mockReset()
    ;(api.updateQuotation as any).mockReset()
  })

  it('cotización existente: si updateQuotation falla, unsaved sigue en true y el error se propaga', async () => {
    ;(api.updateQuotation as any).mockRejectedValue(new Error('Network down'))
    const q = makeQuotation({ id: 'srv-1' })
    useMaestro.setState({ quotations: [q], activeId: 'srv-1', unsaved: true })

    await expect(useMaestro.getState().saveActive()).rejects.toThrow('Network down')
    expect(useMaestro.getState().unsaved).toBe(true)
  })

  it('cotización existente: si updateQuotation resuelve, unsaved pasa a false', async () => {
    const q = makeQuotation({ id: 'srv-1' })
    ;(api.updateQuotation as any).mockResolvedValue({ ...q, version: 2 })
    useMaestro.setState({ quotations: [q], activeId: 'srv-1', unsaved: true })

    await useMaestro.getState().saveActive()
    expect(useMaestro.getState().unsaved).toBe(false)
  })

  it('borrador local: si createQuotation falla con un error genérico, unsaved sigue en true', async () => {
    ;(api.createQuotation as any).mockRejectedValue(new Error('Network down'))
    const q = makeQuotation({ id: 'q-123' })
    useMaestro.setState({ quotations: [q], activeId: 'q-123', unsaved: true })

    await expect(useMaestro.getState().saveActive()).rejects.toThrow('Network down')
    expect(useMaestro.getState().unsaved).toBe(true)
  })
})
