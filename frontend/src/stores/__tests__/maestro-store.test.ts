import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CategoryId, CostCategory, CostItem, MasterQuotation } from '../../types'

// vi.mock() se hoistea al tope del archivo, así que cualquier variable que
// use la factory debe declararse con vi.hoisted() para no romper por orden.
const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  return { MockApiError }
})

vi.mock('../../api/api', () => ({
  ApiError: MockApiError,
  default: {
    createQuotation: vi.fn(),
    updateQuotation: vi.fn(),
    duplicateQuotation: vi.fn(),
    getQuotations: vi.fn().mockResolvedValue([]),
  },
}))

import api, { ApiError } from '../../api/api'
import {
  calcCat, calcTotals, generateCorrelative, generateVersionCorrelative, useMaestro,
} from '../maestro-store'

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

describe('generateVersionCorrelative — botón "Nueva versión"', () => {
  it('agrega -V1 la primera vez, manteniendo el mismo N° base', () => {
    const existing = [makeQuotation({ correlative: 'SYM-003-07-2026' })]
    expect(generateVersionCorrelative(existing, 'SYM-003-07-2026')).toBe('SYM-003-07-2026-V1')
  })

  it('sigue la secuencia V2, V3... a partir de la versión más alta ya creada', () => {
    const existing = [
      makeQuotation({ correlative: 'SYM-003-07-2026' }),
      makeQuotation({ correlative: 'SYM-003-07-2026-V1' }),
    ]
    expect(generateVersionCorrelative(existing, 'SYM-003-07-2026-V1')).toBe('SYM-003-07-2026-V2')
  })

  it('no se confunde con correlativos de otro N° base', () => {
    const existing = [
      makeQuotation({ correlative: 'SYM-003-07-2026-V1' }),
      makeQuotation({ correlative: 'SYM-009-07-2026-V5' }),
    ]
    expect(generateVersionCorrelative(existing, 'SYM-003-07-2026-V1')).toBe('SYM-003-07-2026-V2')
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

  it('rechaza sin llamar al backend si la cotización no tiene client_id', async () => {
    const q = makeQuotation({ id: 'q-999', client_id: '' })
    useMaestro.setState({ quotations: [q], activeId: 'q-999', unsaved: true })

    await expect(useMaestro.getState().saveActive()).rejects.toThrow(/cliente/i)
    expect(api.createQuotation).not.toHaveBeenCalled()
    expect(useMaestro.getState().unsaved).toBe(true)
  })

  it('borrador local: reintenta con un correlativo fresco si el backend devuelve 409 por correlativo duplicado', async () => {
    const q = makeQuotation({ id: 'q-321', correlative: 'SYM-001-01-2026' })
    ;(api.createQuotation as any)
      .mockRejectedValueOnce(new ApiError(409, 'Quotation correlative already exists'))
      .mockResolvedValueOnce({ ...q, id: 'srv-321', correlative: 'SYM-002-01-2026', version: 1 })
    ;(api.getQuotations as any).mockResolvedValueOnce([
      makeQuotation({ id: 'srv-1', correlative: 'SYM-001-01-2026' }),
    ])
    useMaestro.setState({ quotations: [q], activeId: 'q-321', unsaved: true })

    await useMaestro.getState().saveActive()

    expect(api.createQuotation).toHaveBeenCalledTimes(2)
    expect(useMaestro.getState().unsaved).toBe(false)
    expect(useMaestro.getState().activeId).toBe('srv-321')
  })

  it('no pisa activeId/unsaved si el usuario ya pasó a otra cotización antes de que termine el guardado', async () => {
    const x = makeQuotation({ id: 'q-1', correlative: 'SYM-001-01-2026' })
    const y = makeQuotation({ id: 'srv-2', correlative: 'SYM-002-01-2026' })
    let resolveSave!: (v: MasterQuotation) => void
    ;(api.createQuotation as any).mockReturnValue(new Promise(res => { resolveSave = res }))
    useMaestro.setState({ quotations: [x, y], activeId: 'q-1', unsaved: true })

    const savePromise = useMaestro.getState().saveActive()
    // El usuario navega a "y" antes de que el guardado de "x" responda
    useMaestro.setState({ activeId: 'srv-2', unsaved: true })

    resolveSave({ ...x, id: 'srv-1', version: 1 })
    await savePromise

    expect(useMaestro.getState().activeId).toBe('srv-2')
    expect(useMaestro.getState().unsaved).toBe(true)
  })
})
