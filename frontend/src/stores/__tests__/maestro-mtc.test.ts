import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMaestro } from '../maestro-store'
import { systemCosteo } from '../../utils/mtcSystems'
import type { CostCategory, MasterQuotation } from '../../types'

const api = vi.hoisted(() => ({
  getQuotations: vi.fn(),
  updateQuotation: vi.fn(),
}))

vi.mock('../../api/api', () => ({
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
  default: {
    createQuotation: vi.fn(),
    updateQuotation: api.updateQuotation,
    duplicateQuotation: vi.fn(),
    getQuotations: api.getQuotations,
    getQuotation: vi.fn(),
    getCatalog: vi.fn().mockResolvedValue({}),
    getElectricalCatalog: vi.fn().mockResolvedValue([]),
    getClients: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockResolvedValue({ uf_value: '39500', iva_pct: '19', dolar_value: '950' }),
    createCatalogItem: vi.fn(),
    updateCatalogItem: vi.fn(),
    createElectricalItem: vi.fn(),
    updateElectricalItem: vi.fn(),
  },
}))

function activeQuotation(): MasterQuotation {
  const state = useMaestro.getState()
  const quotation = state.quotations.find(q => q.id === state.activeId)

  if (!quotation) throw new Error('No hay cotización activa')
  return quotation
}

function serverDraft() {
  useMaestro.getState().newDraft('maintenance')
  const id = '123e4567-e89b-12d3-a456-426614174999'
  useMaestro.setState(s => ({
    quotations: s.quotations.map(q => (q.id === s.activeId ? { ...q, id } : q)),
    activeId: id,
  }))
}

describe('useMaestro - mantenciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMaestro.setState({ quotations: [], activeId: null })
  })

  it('newDraft crea configuración de mantención y no la agrega a proyectos', () => {
    useMaestro.getState().newDraft('maintenance')

    const maintenance = activeQuotation()
    expect(maintenance.mtc_config?.systems).toHaveLength(1)
    expect(maintenance.mtc_active_system).toBe(0)

    useMaestro.getState().newDraft('project')

    const project = activeQuotation()
    expect(project.mtc_config).toBeNull()
  })

  it('addMtcSystem agrega Subsistema 2 y limita la configuración a 12 sistemas', () => {
    useMaestro.getState().newDraft('maintenance')
    useMaestro.getState().addMtcSystem()

    expect(activeQuotation().mtc_config?.systems).toHaveLength(2)
    expect(activeQuotation().mtc_config?.systems[1].name).toBe('Subsistema 2')

    for (let index = 0; index < 20; index += 1) {
      useMaestro.getState().addMtcSystem()
    }

    expect(activeQuotation().mtc_config?.systems).toHaveLength(12)
  })

  it('addItem agrega el ítem al costeo del sistema activo', () => {
    useMaestro.getState().newDraft('maintenance')
    useMaestro.getState().addMtcSystem()

    const firstSystemItems = systemCosteo(activeQuotation(), 0).items.mo.length

    useMaestro.getState().selectMtcSystem(1)
    useMaestro.getState().addItem('mo')

    expect(systemCosteo(activeQuotation(), 1).items.mo.length).toBeGreaterThan(0)

    useMaestro.getState().selectMtcSystem(0)

    expect(activeQuotation().items.mo).toHaveLength(firstSystemItems)
    expect(systemCosteo(activeQuotation(), 0).items.mo).toHaveLength(firstSystemItems)
  })

  it('patchMtcSystem sincroniza frecuencia y visitas sólo para el sistema principal', () => {
    useMaestro.getState().newDraft('maintenance')
    useMaestro.getState().addMtcSystem()

    useMaestro.getState().patchMtcSystem(0, { frequency: 'bimestral' })

    expect(activeQuotation().frequency).toBe('bimestral')
    expect(activeQuotation().visits_per_year).toBe(6)

    useMaestro.getState().patchMtcSystem(1, { frequency: 'anual' })

    expect(activeQuotation().frequency).toBe('bimestral')
  })

  it('saveActive persiste el sistema 1 y conserva en pantalla el sistema 2 activo', async () => {
    serverDraft()

    const quotationWithClient = {
      ...activeQuotation(),
      client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    }
    useMaestro.setState({
      quotations: [quotationWithClient],
      activeId: quotationWithClient.id,
    })

    useMaestro.getState().addMtcSystem()

    const categoriesFromSystemOne = activeQuotation().categories

    useMaestro.getState().selectMtcSystem(1)
    useMaestro.getState().addItem('mo')

    const beforeSave = activeQuotation()
    api.updateQuotation.mockResolvedValue(beforeSave)

    await useMaestro.getState().saveActive()

    const request = api.updateQuotation.mock.calls[0].find(
      (argument: unknown) =>
        typeof argument === 'object' &&
        argument !== null &&
        'categories' in argument &&
        'mtc_config' in argument
    ) as {
      categories: CostCategory[]
      mtc_config: { systems: Array<{ categories: CostCategory[] | null }> }
    }

    expect(api.updateQuotation).toHaveBeenCalledTimes(1)
    expect(request.categories).toEqual(categoriesFromSystemOne)
    expect(request.mtc_config.systems[0].categories).toBeNull()
    expect(activeQuotation().mtc_active_system).toBe(1)
  })

  it('loadData normaliza la fila local al sistema 1 y conserva el costeo local del sistema 2', async () => {
    serverDraft()
    useMaestro.getState().addMtcSystem()
    useMaestro.getState().selectMtcSystem(1)
    useMaestro.getState().addItem('mo')

    const local = { ...activeQuotation(), version: 7 }
    const secondSystemItems = systemCosteo(local, 1).items.mo

    useMaestro.setState({ quotations: [local], activeId: local.id })
    api.getQuotations.mockResolvedValue([{ ...local, version: 7, mtc_active_system: 0 }])

    await useMaestro.getState().loadData()

    const loaded = useMaestro.getState().quotations.find(q => q.id === local.id)
    expect(loaded?.mtc_active_system).toBe(0)
    expect(loaded?.mtc_config?.systems[1].items?.mo).toEqual(secondSystemItems)
  })

  it('patchMtc materializa la configuración cuando una mantención cargada no tiene mtc_config', () => {
    useMaestro.getState().newDraft('maintenance')

    const quotationWithoutConfig = {
      ...activeQuotation(),
      mtc_config: null,
      mtc_active_system: 0,
    }

    useMaestro.setState({
      quotations: [quotationWithoutConfig],
      activeId: quotationWithoutConfig.id,
    })

    useMaestro.getState().patchMtc({ summary_mode: true })

    expect(activeQuotation().mtc_config?.summary_mode).toBe(true)
    expect(activeQuotation().mtc_config?.systems).toHaveLength(1)
  })
})
