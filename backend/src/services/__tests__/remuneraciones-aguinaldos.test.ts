import { describe, it, expect } from 'vitest'
import { DEFAULT_PARAMETROS, calcularPerfil, type PerfilInputs } from '../remuneraciones'

// Con aguinaldos y bono de vacaciones, el líquido resultante debe coincidir
// con el líquido objetivo (antes salía ~$6.700 más alto con $500.000).
const BASE: PerfilInputs = {
  sueldoLiquido: 500000,
  tipoContrato: 'Indefinido',
  jornadaSemanal: 44,
  seguroElectrico: false,
  colacionMensual: 0,
  movilizacionMensual: 0,
  bonoVacacionesAnual: 0,
  aguinaldoFiestasPatriasAnual: 0,
  aguinaldoNavidadAnual: 0,
}

describe('calcularPerfil · aguinaldos y bono dentro del despeje', () => {
  it('el líquido sale igual al objetivo con aguinaldos de $50.000 cada uno', () => {
    const r = calcularPerfil(
      {
        ...BASE,
        colacionMensual: 231000,
        movilizacionMensual: 60000,
        aguinaldoFiestasPatriasAnual: 50000,
        aguinaldoNavidadAnual: 50000,
      },
      DEFAULT_PARAMETROS
    )
    expect(Math.abs(r.liquido - 500000)).toBeLessThanOrEqual(2)
  })

  it('el líquido sale igual al objetivo con bono de vacaciones', () => {
    const r = calcularPerfil(
      { ...BASE, colacionMensual: 45000, movilizacionMensual: 35000, bonoVacacionesAnual: 300000 },
      DEFAULT_PARAMETROS
    )
    expect(Math.abs(r.liquido - 500000)).toBeLessThanOrEqual(2)
  })

  it('el líquido sale igual al objetivo con impuesto único (sueldo alto con aguinaldos)', () => {
    const r = calcularPerfil(
      {
        ...BASE,
        sueldoLiquido: 2500000,
        colacionMensual: 231000,
        movilizacionMensual: 60000,
        aguinaldoFiestasPatriasAnual: 50000,
        aguinaldoNavidadAnual: 50000,
      },
      DEFAULT_PARAMETROS
    )
    expect(r.iusc).toBeGreaterThan(0)
    expect(Math.abs(r.liquido - 2500000)).toBeLessThanOrEqual(2)
  })

  it('sin aguinaldos ni bono el resultado no cambia (golden P-01 sigue válido)', () => {
    const r = calcularPerfil(
      { ...BASE, sueldoLiquido: 800000, colacionMensual: 45000, movilizacionMensual: 35000 },
      DEFAULT_PARAMETROS
    )
    expect(r.imponible).toBe(889328)
    expect(r.base).toBe(711462)
  })
})
