export type MtcCurrency = 'CLP' | 'UF' | 'USD'

export interface MoneyRates {
  uf: number
  usd: number
}

export function effectiveCurrency(rates: MoneyRates, currency: MtcCurrency): MtcCurrency {
  if (currency === 'UF' && rates.uf > 0) {
    return 'UF'
  }

  if (currency === 'USD' && rates.usd > 0) {
    return 'USD'
  }

  return 'CLP'
}

function formatClp(value: number): string {
  return Math.round(value).toLocaleString('es-CL')
}

export function formatMtcMoney(clp: number, rates: MoneyRates, currency: MtcCurrency): string {
  const safeClp = Number.isFinite(clp) ? clp : 0
  const effective = effectiveCurrency(rates, currency)

  if (effective === 'UF') {
    return `UF ${(safeClp / rates.uf).toLocaleString('es-CL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  if (effective === 'USD') {
    return `US$ ${(safeClp / rates.usd).toLocaleString('es-CL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return `$${formatClp(safeClp)}`
}

export function currencyNote(rates: MoneyRates, currency: MtcCurrency): string {
  const effective = effectiveCurrency(rates, currency)

  if (effective === 'UF') {
    return `Valores expresados en UF (ref. $${formatClp(rates.uf)} por UF).`
  }

  if (effective === 'USD') {
    return `Valores expresados en dólares (ref. $${formatClp(rates.usd)} por USD).`
  }

  return 'Valores expresados en pesos chilenos (CLP).'
}
