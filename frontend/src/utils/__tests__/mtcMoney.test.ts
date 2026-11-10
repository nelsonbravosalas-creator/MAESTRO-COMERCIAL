import { describe, expect, it } from 'vitest'

import { currencyNote, effectiveCurrency, formatMtcMoney } from '../mtcMoney'

describe('mtcMoney', () => {
  const rates = { uf: 39500, usd: 950 }

  it('formatea valores CLP con separador de miles chileno', () => {
    expect(formatMtcMoney(2662746, rates, 'CLP')).toBe('$2.662.746')
  })

  it('formatea valores UF con dos decimales', () => {
    expect(formatMtcMoney(443791, rates, 'UF')).toBe('UF 11,24')
  })

  it('formatea valores USD con dos decimales', () => {
    expect(formatMtcMoney(950, rates, 'USD')).toBe('US$ 1,00')
  })

  it('usa CLP cuando UF no tiene una tasa válida, sin NaN ni Infinity', () => {
    const result = formatMtcMoney(950, { uf: 0, usd: 950 }, 'UF')

    expect(effectiveCurrency({ uf: 0, usd: 950 }, 'UF')).toBe('CLP')
    expect(result).toBe('$950')
    expect(result).not.toContain('NaN')
    expect(result).not.toContain('Infinity')
  })

  it('trata CLP NaN como cero', () => {
    expect(formatMtcMoney(Number.NaN, rates, 'CLP')).toBe('$0')
  })

  it('genera la nota para UF efectiva', () => {
    expect(currencyNote(rates, 'UF')).toBe('Valores expresados en UF (ref. $39.500 por UF).')
  })

  it('genera la nota para USD efectiva', () => {
    expect(currencyNote(rates, 'USD')).toBe('Valores expresados en dólares (ref. $950 por USD).')
  })

  it('genera la nota para CLP o moneda no efectiva', () => {
    expect(currencyNote(rates, 'CLP')).toBe('Valores expresados en pesos chilenos (CLP).')
    expect(currencyNote({ uf: 0, usd: 950 }, 'UF')).toBe(
      'Valores expresados en pesos chilenos (CLP).'
    )
  })
})
