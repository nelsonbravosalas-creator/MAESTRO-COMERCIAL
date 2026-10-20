import type { MasterQuotation } from '../types'

export type DisplayCurrency = 'CLP' | 'UF' | 'USD'

export interface CurrencyInfo {
  currency: DisplayCurrency
  rate: number // Divisor: monto en CLP / rate = monto en la moneda
  displaySymbol: string // '$', 'UF', 'USD$'
  displayName: string // 'Pesos', 'Unidad de Fomento', 'Dólar estadounidense'
}

/**
 * Obtiene información de la moneda seleccionada.
 * Usa las tasas de referencia guardadas en la cotización (uf_value, usd_value).
 * Si la tasa es 0 o no existe, la moneda no se puede seleccionar.
 */
export function getCurrencyInfo(
  q: MasterQuotation | null | undefined,
  displayCurrency: DisplayCurrency
): CurrencyInfo {
  switch (displayCurrency) {
    case 'CLP':
      return {
        currency: 'CLP',
        rate: 1,
        displaySymbol: '$',
        displayName: 'Pesos',
      }
    case 'UF':
      return {
        currency: 'UF',
        rate: q?.uf ?? 0,
        displaySymbol: 'UF',
        displayName: 'Unidad de Fomento',
      }
    case 'USD':
      return {
        currency: 'USD',
        rate: q?.usd ?? 0,
        displaySymbol: 'USD$',
        displayName: 'Dólar estadounidense',
      }
  }
}

/**
 * Convierte un monto en CLP a otra moneda.
 * Si rate es 0, retorna 0 (indicando que la conversión no es posible).
 */
export function convertAmount(clpAmount: number, rate: number): number {
  if (rate <= 0) return 0
  return clpAmount / rate
}

/**
 * Determina si una moneda puede ser seleccionada.
 * CLP siempre está disponible; UF y USD requieren tasa > 0.
 */
export function isCurrencyAvailable(
  q: MasterQuotation | null | undefined,
  currency: DisplayCurrency
): boolean {
  if (currency === 'CLP') return true
  if (currency === 'UF') return (q?.uf ?? 0) > 0
  if (currency === 'USD') return (q?.usd ?? 0) > 0
  return false
}

/**
 * Formatea un monto en la moneda especificada.
 * Reutiliza la lógica de fmtCLP del store.
 */
export function formatCurrency(
  amount: number,
  currency: DisplayCurrency,
  fractionDigits: number = 0
): string {
  const currencyInfo = getCurrencyInfo(null, currency)

  if (currency === 'CLP') {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount)
  }

  // UF y USD: formato numérico con símbolo
  const formatted = new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)

  return `${currencyInfo.displaySymbol} ${formatted}`
}
