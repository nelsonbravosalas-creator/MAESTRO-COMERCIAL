import { describe, expect, it, vi } from 'vitest'
import type { MasterQuotation, MtcConsumableRow } from '../../types'
import { defaultCosteo } from '../../stores/maestro-store'
import { newMtcSystem, selectMtcSystem } from '../mtcSystems'
import {
  addMtcConsumableRowQ,
  addMtcSystemQ,
  patchMtcConfigQ,
  patchMtcConsumableRowQ,
  patchMtcConsumablesQ,
  patchMtcSystemQ,
  removeMtcConsumableRowQ,
  removeMtcSystemQ,
} from '../mtcActions'

function quotation(): MasterQuotation {
  return {
    categories: [],
    items: {},
    frequency: 'mensual',
    visits_per_year: 12,
    display_currency: 'CLP',
    mtc_active_system: 0,
    mtc_config: {
      summary_mode: false,
      show_summary_table: false,
      systems: [newMtcSystem(1, null)],
    },
  } as unknown as MasterQuotation
}

function withTwoSystems(): MasterQuotation {
  return addMtcSystemQ(quotation(), defaultCosteo())
}

describe('mtcActions', () => {
  it('addMtcSystemQ agrega un subsistema con el costeo recibido', () => {
    const result = addMtcSystemQ(quotation(), defaultCosteo())

    expect(result.mtc_config!.systems).toHaveLength(2)
    expect(result.mtc_config!.systems[1].name).toBe('Subsistema 2')
    expect(result.mtc_config!.systems[1].categories).not.toBeNull()
    expect(result.mtc_config!.systems[1].items).not.toBeNull()
  })

  it('addMtcSystemQ no supera los doce sistemas', () => {
    const q = quotation()
    const systems = Array.from({ length: 12 }, (_, index) => newMtcSystem(index + 1, null))
    const full = { ...q, mtc_config: { ...q.mtc_config!, systems } }

    expect(addMtcSystemQ(full, defaultCosteo())).toBe(full)
  })

  it('removeMtcSystemQ selecciona el sistema primario antes de quitar el activo', () => {
    const q = selectMtcSystem(withTwoSystems(), 1)
    const result = removeMtcSystemQ(q, 1)

    expect(result.mtc_active_system).toBe(0)
    expect(result.mtc_config!.systems).toHaveLength(1)
    expect(result.categories).toEqual(quotation().categories)
  })

  it('removeMtcSystemQ no elimina el único sistema', () => {
    const q = quotation()

    expect(removeMtcSystemQ(q, 0)).toBe(q)
  })

  it('patchMtcSystemQ actualiza el espejo primario al modificar el índice cero', () => {
    const result = patchMtcSystemQ(quotation(), 0, {
      frequency: 'bimestral',
      currency: 'USD',
      summary_text: 'Resumen',
    })

    expect(result.mtc_config!.systems[0].summary_text).toBe('Resumen')
    expect(result.frequency).toBe('bimestral')
    expect(result.visits_per_year).toBe(6)
    expect(result.display_currency).toBe('USD')
  })

  it('patchMtcSystemQ no cambia el espejo al modificar un subsistema', () => {
    const q = withTwoSystems()
    const result = patchMtcSystemQ(q, 1, { frequency: 'anual' })

    expect(result.mtc_config!.systems[1].frequency).toBe('anual')
    expect(result.frequency).toBe('mensual')
  })

  it('patchMtcConfigQ materializa y parchea la configuración', () => {
    const q = { ...quotation(), mtc_config: null }
    const result = patchMtcConfigQ(q, { summary_mode: true, show_summary_table: true })

    expect(result.mtc_config!.systems).toHaveLength(1)
    expect(result.mtc_config!.summary_mode).toBe(true)
    expect(result.mtc_config!.show_summary_table).toBe(true)
  })

  it('patchMtcConsumablesQ actualiza consumibles y acota el margen a 90', () => {
    const result = patchMtcConsumablesQ(quotation(), 0, { enabled: true, margin: 100 })

    expect(result.mtc_config!.systems[0].consumables.enabled).toBe(true)
    expect(result.mtc_config!.systems[0].consumables.margin).toBe(90)
  })

  it('addMtcConsumableRowQ agrega una fila con el id entregado', () => {
    const result = addMtcConsumableRowQ(quotation(), 0, { id: 'row-1' })

    expect(result.mtc_config!.systems[0].consumables.rows).toEqual([{ id: 'row-1' }])
  })

  it('addMtcConsumableRowQ genera un id cuando el seed no lo trae', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'generated-row' })

    const result = addMtcConsumableRowQ(quotation(), 0)

    expect(result.mtc_config!.systems[0].consumables.rows[0].id).toBe('generated-row')
    vi.unstubAllGlobals()
  })

  it('patchMtcConsumableRowQ parchea solamente la fila indicada', () => {
    const q = addMtcConsumableRowQ(quotation(), 0, { id: 'row-1' })
    const result = patchMtcConsumableRowQ(q, 0, 'row-1', {
      ...({ quantity: 2 } as Partial<MtcConsumableRow>),
    })

    expect(result.mtc_config!.systems[0].consumables.rows[0]).toMatchObject({
      id: 'row-1',
      quantity: 2,
    })
  })

  it('removeMtcConsumableRowQ elimina la fila indicada y conserva las demás', () => {
    const q = addMtcConsumableRowQ(addMtcConsumableRowQ(quotation(), 0, { id: 'row-1' }), 0, {
      id: 'row-2',
    })
    const result = removeMtcConsumableRowQ(q, 0, 'row-1')

    expect(result.mtc_config!.systems[0].consumables.rows).toEqual([{ id: 'row-2' }])
  })
})
