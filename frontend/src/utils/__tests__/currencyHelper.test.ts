import { describe, it, expect } from 'vitest'
import type { MasterQuotation } from '../../types'
import {
  getCurrencyInfo,
  convertAmount,
  isCurrencyAvailable,
  formatCurrency,
} from '../currencyHelper'

const quotation = (over: Partial<MasterQuotation>): MasterQuotation => ({
  id: '',
  client_id: '',
  correlative: '001',
  status: 'Borrador',
  operState: 'Pendiente de ejecución',
  uf: 0,
  iva: 19,
  notes: '',
  contact_id: null,
  contact: '',
  enduser: '',
  ref: '',
  date: '',
  valid_until: '',
  categories: [],
  items: { mo: [], log: [], mat: [], rep: [], ins: [], mec: [], ele: [] },
  client_name: '',
  scope: [],
  exclusions: [],
  commercial: [],
  total: 0,
  created_at: '',
  updated_at: '',
  version: 1,
  kind: 'project',
  equipment_count: 0,
  equipment_description: '',
  frequency: 'mensual',
  visits_per_year: 0,
  contract_start_date: '',
  show_uf_equivalent: false,
  show_usd_equivalent: false,
  usd: 0,
  display_currency: 'CLP',
  invoice_count: 0,
  invoice_count_max: 1,
  total_con_iva: 0,
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
  ...over,
})

describe('getCurrencyInfo', () => {
  it('CLP siempre retorna rate 1 y símbolo $', () => {
    const q = quotation({ uf: 27500, usd: 950 })
    const info = getCurrencyInfo(q, 'CLP')
    expect(info.currency).toBe('CLP')
    expect(info.rate).toBe(1)
    expect(info.displaySymbol).toBe('$')
    expect(info.displayName).toBe('Pesos')
  })

  it('UF usa uf como rate', () => {
    const q = quotation({ uf: 27500.5 })
    const info = getCurrencyInfo(q, 'UF')
    expect(info.currency).toBe('UF')
    expect(info.rate).toBe(27500.5)
    expect(info.displaySymbol).toBe('UF')
    expect(info.displayName).toBe('Unidad de Fomento')
  })

  it('USD usa usd como rate', () => {
    const q = quotation({ usd: 950.75 })
    const info = getCurrencyInfo(q, 'USD')
    expect(info.currency).toBe('USD')
    expect(info.rate).toBe(950.75)
    expect(info.displaySymbol).toBe('USD$')
    expect(info.displayName).toBe('Dólar estadounidense')
  })

  it('retorna rate 0 si no existe la cotización', () => {
    const info = getCurrencyInfo(null, 'UF')
    expect(info.rate).toBe(0)
  })

  it('retorna rate 0 si el campo no está definido', () => {
    const q = quotation({ uf: undefined, usd: undefined })
    const infoUF = getCurrencyInfo(q, 'UF')
    const infoUSD = getCurrencyInfo(q, 'USD')
    expect(infoUF.rate).toBe(0)
    expect(infoUSD.rate).toBe(0)
  })
})

describe('convertAmount', () => {
  it('convierte CLP a UF correctamente', () => {
    const clpAmount = 27500
    const ufRate = 27500
    const result = convertAmount(clpAmount, ufRate)
    expect(result).toBe(1)
  })

  it('convierte CLP a USD correctamente', () => {
    const clpAmount = 950000
    const usdRate = 950
    const result = convertAmount(clpAmount, usdRate)
    expect(result).toBe(1000)
  })

  it('retorna 0 si rate es 0', () => {
    expect(convertAmount(100000, 0)).toBe(0)
  })

  it('retorna 0 si rate es negativo (edge case)', () => {
    expect(convertAmount(100000, -100)).toBe(0)
  })

  it('maneja montos negativos (sin validar)', () => {
    const result = convertAmount(-27500, 27500)
    expect(result).toBe(-1)
  })
})

describe('isCurrencyAvailable', () => {
  it('CLP siempre está disponible', () => {
    const q = quotation({ uf: 0, usd: 0 })
    expect(isCurrencyAvailable(q, 'CLP')).toBe(true)
    expect(isCurrencyAvailable(null, 'CLP')).toBe(true)
  })

  it('UF está disponible si uf > 0', () => {
    expect(isCurrencyAvailable(quotation({ uf: 27500 }), 'UF')).toBe(true)
    expect(isCurrencyAvailable(quotation({ uf: 0 }), 'UF')).toBe(false)
    expect(isCurrencyAvailable(quotation({ uf: undefined }), 'UF')).toBe(false)
  })

  it('USD está disponible si usd > 0', () => {
    expect(isCurrencyAvailable(quotation({ usd: 950 }), 'USD')).toBe(true)
    expect(isCurrencyAvailable(quotation({ usd: 0 }), 'USD')).toBe(false)
    expect(isCurrencyAvailable(quotation({ usd: undefined }), 'USD')).toBe(false)
  })

  it('sin cotización, solo CLP está disponible', () => {
    expect(isCurrencyAvailable(null, 'CLP')).toBe(true)
    expect(isCurrencyAvailable(null, 'UF')).toBe(false)
    expect(isCurrencyAvailable(null, 'USD')).toBe(false)
  })
})

describe('formatCurrency', () => {
  it('formatea CLP con símbolo $ y separador de miles', () => {
    const result = formatCurrency(1234567, 'CLP')
    expect(result).toContain('1.234.567')
    expect(result).toContain('$')
  })

  it('formatea UF con símbolo UF', () => {
    const result = formatCurrency(10.5, 'UF', 1)
    expect(result).toContain('UF')
    expect(result).toContain('10,5')
  })

  it('formatea USD con símbolo USD$', () => {
    const result = formatCurrency(1234.5, 'USD', 2)
    expect(result).toContain('USD$')
    expect(result).toContain('1.234,50')
  })

  it('respeta el parámetro fractionDigits', () => {
    const result0 = formatCurrency(100, 'CLP', 0)
    const result2 = formatCurrency(100.5, 'CLP', 2)
    expect(result0).not.toContain(',')
    expect(result2).toContain(',')
  })

  it('maneja números negativos', () => {
    const result = formatCurrency(-1000, 'CLP')
    expect(result).toContain('-')
  })
})
