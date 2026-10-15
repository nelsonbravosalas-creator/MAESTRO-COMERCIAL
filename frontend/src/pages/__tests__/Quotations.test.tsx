import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MasterQuotation } from '../../types'

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    data?: unknown
    constructor(status: number, message: string, data?: unknown) {
      super(message)
      this.status = status
      this.data = data
    }
  }
  return { MockApiError }
})

vi.mock('../../api/api', () => ({
  ApiError: MockApiError,
  api: {
    getQuotations: vi.fn().mockResolvedValue([]),
    getQuotation: vi.fn(),
    createQuotation: vi.fn(),
    updateQuotation: vi.fn(),
    duplicateQuotation: vi.fn(),
    deleteQuotation: vi.fn(),
    setQuotationStatus: vi.fn(),
    getClients: vi.fn().mockResolvedValue([]),
    getCatalog: vi.fn().mockResolvedValue({}),
    getElectricalCatalog: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockResolvedValue({ uf_value: '39500', iva_pct: '19' }),
  },
  default: {
    getQuotations: vi.fn().mockResolvedValue([]),
    getQuotation: vi.fn(),
    createQuotation: vi.fn(),
    updateQuotation: vi.fn(),
    duplicateQuotation: vi.fn(),
    deleteQuotation: vi.fn(),
    setQuotationStatus: vi.fn(),
    getClients: vi.fn().mockResolvedValue([]),
    getCatalog: vi.fn().mockResolvedValue({}),
    getElectricalCatalog: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockResolvedValue({ uf_value: '39500', iva_pct: '19' }),
  },
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    canApproveQuotation: true,
    canCreateQuotation: true,
    canEditQuotation: true,
    canDeleteQuotation: true,
  }),
}))

vi.mock('../../hooks/useCityDistances', () => ({
  useCityDistances: () => ({
    distances: {},
    loading: false,
    getDistance: () => null,
  }),
}))

import { useMaestro } from '../../stores/maestro-store'
import Quotations from '../Quotations'

const SAMPLE_QUOTATIONS: MasterQuotation[] = [
  {
    id: 'q-1',
    correlative: 'SYM-001-01-2026',
    client_id: 'c1',
    client_name: 'Mall Plaza Norte',
    contact_id: null,
    contact: 'Juan Pérez',
    enduser: 'Tienda Ripley',
    ref: 'Reparación Chiller 50 TR',
    date: '2026-01-10',
    valid_until: '2026-02-10',
    status: 'Borrador',
    operState: 'Pendiente de ejecución',
    uf: 39500,
    iva: 19,
    notes: null,
    version: 1,
    categories: [
      {
        id: 'mo',
        label: 'Mano de Obra Especializada',
        margin: 35,
        color: '#1e293b',
        showDetails: false,
        showValues: false,
        note: '',
        collapsed: false,
      },
    ],
    items: {
      mo: [
        {
          id: 'i1',
          desc: 'Técnico especialista HVAC',
          unidad: 'Día',
          cant: 2,
          unit: 45000,
          days: 3,
        },
      ],
      log: [],
      mat: [],
      rep: [],
      ins: [],
      mec: [],
      ele: [],
    },
    scope: ['Revisión compresor'],
    exclusions: ['Andamios'],
    commercial: ['Validez 30 días'],
    total: 270000,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    kind: 'project',
    equipment_count: null,
    equipment_description: null,
    frequency: null,
    visits_per_year: null,
    contract_start_date: null,
    usd: 0,
    show_uf_equivalent: false,
    show_usd_equivalent: false,
    invoice_count: 0,
    invoice_count_max: 1,
    total_con_iva: 321300,
    invoiced_total: 0,
    oc_number: null,
    oc_date: null,
    oc_conditions: null,
    oc_document_name: null,
    oc_document_size: null,
    loss_reason: null,
    loss_competitor: null,
    loss_notes: null,
    follow_up_date: null,
    sent_at: null,
    awarded_at: null,
    closed_at: null,
    version_reason: null,
    parent_version_id: null,
    approved_by: null,
    approved_at: null,
    approval_notes: null,
  },
  {
    id: 'q-2',
    correlative: 'SYM-002-02-2026',
    client_id: 'c2',
    client_name: 'Enel Generación',
    contact_id: null,
    contact: 'Carla Morales',
    enduser: 'Subestación Renca',
    ref: 'Instalación 4 Split Muro',
    date: '2026-02-15',
    valid_until: '2026-03-15',
    status: 'Adjudicada',
    operState: 'En ejecución',
    uf: 39500,
    iva: 19,
    notes: null,
    version: 1,
    categories: [],
    items: { mo: [], log: [], mat: [], rep: [], ins: [], mec: [], ele: [] },
    scope: [],
    exclusions: [],
    commercial: [],
    total: 1850000,
    created_at: '2026-02-15T12:00:00Z',
    updated_at: '2026-02-15T12:00:00Z',
    kind: 'project',
    equipment_count: null,
    equipment_description: null,
    frequency: null,
    visits_per_year: null,
    contract_start_date: null,
    usd: 0,
    show_uf_equivalent: false,
    show_usd_equivalent: false,
    invoice_count: 1,
    invoice_count_max: 1,
    total_con_iva: 2201500,
    invoiced_total: 1850000,
    oc_number: 'OC-99881',
    oc_date: '2026-02-16',
    oc_conditions: null,
    oc_document_name: null,
    oc_document_size: null,
    loss_reason: null,
    loss_competitor: null,
    loss_notes: null,
    follow_up_date: null,
    sent_at: '2026-02-15',
    awarded_at: '2026-02-16',
    closed_at: null,
    version_reason: null,
    parent_version_id: null,
    approved_by: 'Nelson Bravo',
    approved_at: '2026-02-15T18:00:00Z',
    approval_notes: 'Aprobada para ejecución',
  },
]

describe('Pantalla de Cotizaciones (Quotations.tsx)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Inicializar el store de Zustand con cotizaciones de prueba
    useMaestro.setState({
      quotations: SAMPLE_QUOTATIONS,
      activeId: null,
      apiReady: true,
      clients: [
        {
          id: 'c1',
          name: 'Mall Plaza Norte',
          rut: '76.111.222-3',
          activity: 'Retail',
          address: 'Av. Américo Vespucio 1737',
          city: 'Huechuraba',
          contact: 'Juan Pérez',
          cargo: 'Jefe Mantenimiento',
          email: 'jperez@mallplaza.cl',
          phone: '+56911223344',
          contacts: [],
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
        {
          id: 'c2',
          name: 'Enel Generación',
          rut: '96.555.000-1',
          activity: 'Energía',
          address: 'Santa Rosa 76',
          city: 'Santiago',
          contact: 'Carla Morales',
          cargo: 'Supervisora',
          email: 'cmorales@enel.com',
          phone: '+56999887766',
          contacts: [],
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        },
      ],
      uf: 39500,
      iva: 19,
      usd: 950,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('1. Renderiza la lista inicial de cotizaciones con correlativo y cliente', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    expect(container.textContent).toContain('SYM-001-01-2026')
    expect(container.textContent).toContain('Mall Plaza Norte')
    expect(container.textContent).toContain('SYM-002-02-2026')
    expect(container.textContent).toContain('Enel Generación')
  })

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeInputValueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  it('2. Muestra los montos netos formateados en pesos chilenos ($)', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    // q-1: venta calculada con margen (415.385); q-2: fallback a total neto (1.850.000)
    expect(container.textContent).toMatch(/415\.385/)
    expect(container.textContent).toMatch(/1\.850\.000/)
  })

  it('3. Muestra las insignias de estado (Borrador y Adjudicada)', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    expect(container.textContent).toContain('Borrador')
    expect(container.textContent).toContain('Adjudicada')
  })

  it('4. Filtra cotizaciones por búsqueda de texto (correlativo o cliente)', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    const searchInput = container.querySelector('input[placeholder*="Buscar"]') as HTMLInputElement
    expect(searchInput).toBeTruthy()

    await act(async () => {
      setInputValue(searchInput, 'SYM-002')
    })

    expect(container.textContent).toContain('SYM-002-02-2026')
    expect(container.textContent).not.toContain('SYM-001-01-2026')
  })

  it('5. Muestra mensaje amigable de estado vacío si la búsqueda no coincide', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    const searchInput = container.querySelector('input[placeholder*="Buscar"]') as HTMLInputElement
    await act(async () => {
      setInputValue(searchInput, 'Inexistente XYZ 999')
    })

    expect(container.textContent).toContain('No hay cotizaciones')
  })

  it('6. Presenta el botón de creación de nueva cotización', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    const newBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Nueva')
    )
    expect(newBtn).toBeTruthy()
  })

  it('7. Presenta el botón de Importar cotización', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    const importBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Importar')
    )
    expect(importBtn).toBeTruthy()
  })

  it('8. Permite seleccionar una cotización para abrir la vista de edición', async () => {
    await act(async () => {
      root.render(<Quotations />)
    })

    const editBtn = container.querySelector('button[title="Editar"]') as HTMLButtonElement
    expect(editBtn).toBeTruthy()

    await act(async () => {
      editBtn.click()
    })

    expect(useMaestro.getState().activeId).toBe('q-1')
  })
})
