import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// El módulo de api se reemplaza antes de importar la página: la pantalla solo
// debe pintar lo que el backend calcula (saldo, estado), nunca recalcularlo.
const getInvoices = vi.fn()
const getInvoiceSummary = vi.fn()

vi.mock('../../api/api', () => ({
  api: {
    getInvoices: (...a: unknown[]) => getInvoices(...a),
    getInvoiceSummary: () => getInvoiceSummary(),
    getInvoice: vi.fn(),
    addPayment: vi.fn(),
    deletePayment: vi.fn(),
    updateInvoiceFollowUp: vi.fn(),
  },
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ canChangeInvoiceStatus: true, canDeleteInvoice: true }),
}))

import Invoices from '../Invoices'

const FACTURAS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    number: 'F-001',
    client_id: 'c1',
    client_name: 'ETICSA',
    date: '2026-06-20',
    due_date: '2026-07-20',
    payment_term: 'dias_30',
    doc_type: 'factura_afecta',
    total_amount: '5950000',
    paid_amount: '0',
    balance: '5950000',
    days_overdue: 20,
    payment_state: 'vencida',
    observations: null,
    follow_up_date: null,
    is_factored: true,
    factoring_company: 'Factoring Security',
    factoring_type: 'factoring',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    number: 'F-002',
    client_id: 'c2',
    client_name: 'ENGIE',
    date: '2026-07-01',
    due_date: '2026-08-30',
    payment_term: 'dias_60',
    doc_type: 'factura_afecta',
    total_amount: '7782098',
    paid_amount: '2000000',
    balance: '5782098',
    days_overdue: -20,
    payment_state: 'parcial',
    observations: 'Comprometió pago a fin de mes',
    follow_up_date: '2026-08-25',
    is_factored: false,
    factoring_company: null,
    factoring_type: null,
  },
]

const RESUMEN = {
  by_state: {
    vencida: { count: 1, balance: 5950000 },
    parcial: { count: 1, balance: 5782098 },
    por_vencer: { count: 0, balance: 0 },
    pagada: { count: 3, balance: 0 },
  },
  total_outstanding: 11732098,
}

let container: HTMLDivElement
let root: Root

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Invoices))
  })
  // Deja resolver el efecto de carga inicial.
  await act(async () => {
    await Promise.resolve()
  })
}

describe('Pantalla de Facturas', () => {
  beforeEach(() => {
    getInvoices.mockResolvedValue(FACTURAS)
    getInvoiceSummary.mockResolvedValue(RESUMEN)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('monta sin errores y pide las facturas al backend', async () => {
    await render()
    expect(getInvoices).toHaveBeenCalled()
    expect(getInvoiceSummary).toHaveBeenCalled()
    expect(container.querySelector('.inv-root')).not.toBeNull()
  })

  it('muestra una fila por factura con su número y cliente', async () => {
    await render()
    const filas = container.querySelectorAll('.inv-table tbody tr')
    expect(filas).toHaveLength(2)
    expect(container.textContent).toContain('F-001')
    expect(container.textContent).toContain('ETICSA')
    expect(container.textContent).toContain('ENGIE')
  })

  it('pinta el estado de cobranza que envía el backend, sin recalcularlo', async () => {
    await render()
    const badges = Array.from(container.querySelectorAll('.inv-badge')).map(b => b.className)
    expect(badges.some(c => c.includes('vencida'))).toBe(true)
    expect(badges.some(c => c.includes('parcial'))).toBe(true)
    expect(container.textContent).toContain('Vencida')
    expect(container.textContent).toContain('Pago parcial')
  })

  it('formatea los montos como pesos chilenos', async () => {
    await render()
    // 5950000 -> $5.950.000 (separador de miles con punto)
    expect(container.textContent).toContain('5.950.000')
    expect(container.textContent).toContain('11.732.098') // total por cobrar
  })

  it('marca los días de mora en las facturas vencidas', async () => {
    await render()
    const mora = container.querySelector('.inv-mora')
    expect(mora).not.toBeNull()
    expect(mora?.textContent).toContain('20')
  })

  it('señala las facturas cedidas a factoring', async () => {
    await render()
    const tags = container.querySelectorAll('.inv-tag-factoring')
    expect(tags).toHaveLength(1)
    expect(tags[0].textContent).toBe('FACT')
  })

  it('muestra el estado vacío cuando no hay facturas', async () => {
    getInvoices.mockResolvedValue([])
    getInvoiceSummary.mockResolvedValue({ by_state: {}, total_outstanding: 0 })
    await render()
    expect(container.textContent).toContain('Todavía no hay facturas registradas')
    expect(container.querySelector('.inv-table')).toBeNull()
  })

  it('muestra el error del backend en vez de una pantalla en blanco', async () => {
    getInvoices.mockRejectedValue(new Error('Failed to fetch invoices'))
    getInvoiceSummary.mockRejectedValue(new Error('Failed to fetch invoices'))
    await render()
    expect(container.querySelector('.inv-alert')).not.toBeNull()
    expect(container.textContent).toContain('Failed to fetch invoices')
  })
})
