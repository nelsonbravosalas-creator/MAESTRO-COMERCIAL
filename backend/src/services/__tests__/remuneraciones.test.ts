import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PARAMETROS,
  calcularPerfil,
  topesDerivados,
  xround,
  type PerfilInputs,
} from '../remuneraciones'
import { remuneracionParametrosSchema } from '../../schemas/remuneraciones'

// Caso de referencia P-01 (Técnico Climatización UMAS) de caso_base_sym010.json,
// validado contra el motor Python (tests/validar_caso_base.py). Sin aguinaldos
// ni bonos, como en esa planilla.
const P01: PerfilInputs = {
  sueldoLiquido: 800000,
  tipoContrato: 'Indefinido',
  jornadaSemanal: 44,
  seguroElectrico: false,
  colacionMensual: 45000,
  movilizacionMensual: 35000,
  bonoVacacionesAnual: 0,
  aguinaldoFiestasPatriasAnual: 0,
  aguinaldoNavidadAnual: 0,
}

describe('xround (ROUND de Excel)', () => {
  it('redondea la mitad hacia afuera de cero', () => {
    expect(xround(2.5)).toBe(3)
    expect(xround(-2.5)).toBe(-3)
    expect(xround(2.4999)).toBe(2)
    expect(xround(1.005, 2)).toBe(1.01)
  })
})

describe('topesDerivados', () => {
  it('calcula gratificación y topes en CLP con los valores por defecto', () => {
    expect(topesDerivados(DEFAULT_PARAMETROS)).toEqual({
      topeGratificacion: 197917,
      topeAfpSaludClp: 3350419,
      topeAfcClp: 5031590,
    })
  })
})

describe('parámetros por defecto', () => {
  it('cumplen el esquema de validación', () => {
    expect(() => remuneracionParametrosSchema.parse(DEFAULT_PARAMETROS)).not.toThrow()
  })
})

describe('calcularPerfil · caso P-01 (líquido 800.000)', () => {
  const r = calcularPerfil(P01, DEFAULT_PARAMETROS)

  it('despeja el imponible requerido', () => {
    expect(r.imponible).toBe(889328)
  })

  it('separa base y gratificación (25 % de la base, con tope)', () => {
    expect(r.base).toBe(711462)
    expect(r.gratificacion).toBe(177866)
  })

  it('reproduce el costo caja y el costo licitación de la planilla', () => {
    expect(r.costoCajaMensual).toBe(1019753)
    expect(r.costoLicitacionMensual).toBe(1130919)
  })

  it('devuelve el líquido objetivo', () => {
    expect(Math.abs(r.liquido - 800000)).toBeLessThanOrEqual(1)
  })

  it('el valor de jornada por defecto es el costo licitación mensual ÷ 20 días, sin IUSC', () => {
    expect(DEFAULT_PARAMETROS.incluirIuscCosto).toBe(false)
    expect(r.valorJornada).toBe(xround(r.costoLicitacionMensual / 20))
  })

  it('golden P-01: valor de jornada 56.546 (1.130.919 ÷ 20 = 56.545,95)', () => {
    expect(r.costoLicitacionMensual).toBe(1130919)
    expect(r.valorJornada).toBe(56546)
  })

  it('la referencia de planilla es el costo licitación ÷ 30', () => {
    expect(r.costoLicitacionDiarioPlanilla).toBe(xround(r.costoLicitacionMensual / 30))
  })

  it('no alerta si base y líquido superan el ingreso mínimo', () => {
    expect(r.alertas).toEqual([])
  })
})

describe('calcularPerfil · casos de borde', () => {
  it('no cobra IUSC bajo el tramo exento (13,5 UTM)', () => {
    const r = calcularPerfil({ ...P01, sueldoLiquido: 600000 }, DEFAULT_PARAMETROS)
    expect(r.iusc).toBe(0)
  })

  it('cobra IUSC en un sueldo alto', () => {
    const r = calcularPerfil({ ...P01, sueldoLiquido: 2500000 }, DEFAULT_PARAMETROS)
    expect(r.iusc).toBeGreaterThan(0)
  })

  it('plazo fijo no descuenta AFC del trabajador y paga AFC patronal de 3 %', () => {
    const indef = calcularPerfil(P01, DEFAULT_PARAMETROS)
    const plazo = calcularPerfil({ ...P01, tipoContrato: 'Plazo Fijo' }, DEFAULT_PARAMETROS)
    expect(indef.afcTrabajador).toBeGreaterThan(0)
    expect(plazo.afcTrabajador).toBe(0)
    expect(plazo.afcPatronal).toBeGreaterThan(indef.afcPatronal)
  })

  it('el seguro eléctrico se suma solo cuando corresponde', () => {
    const sin = calcularPerfil(P01, DEFAULT_PARAMETROS)
    const con = calcularPerfil({ ...P01, seguroElectrico: true }, DEFAULT_PARAMETROS)
    expect(sin.seguroElectrico).toBe(0)
    expect(con.seguroElectrico).toBe(xround(con.imponible * 0.0348))
    expect(con.costoHoraExtra50).toBeGreaterThan(sin.costoHoraExtra50)
  })

  it('con sueldo 2.500.000 (IUSC > 0) el valor por defecto excluye el IUSC; incluirlo sube el valor en iusc ÷ 20', () => {
    const alto: PerfilInputs = { ...P01, sueldoLiquido: 2500000 }
    const porDefecto = calcularPerfil(alto, DEFAULT_PARAMETROS)
    const conIusc = calcularPerfil(alto, { ...DEFAULT_PARAMETROS, incluirIuscCosto: true })
    expect(porDefecto.iusc).toBeGreaterThan(0)
    expect(porDefecto.valorJornada).toBe(xround(porDefecto.costoLicitacionMensual / 20))
    expect(conIusc.valorJornada).toBe(xround((conIusc.costoLicitacionMensual + conIusc.iusc) / 20))
    // Redondeo de cada valor diario: la diferencia puede desviarse hasta 1 peso de iusc ÷ 20.
    const subida = conIusc.valorJornada - porDefecto.valorJornada
    expect(Math.abs(subida - porDefecto.iusc / 20)).toBeLessThanOrEqual(1)
  })

  it('alerta cuando el total de haberes queda bajo el ingreso mínimo', () => {
    const r = calcularPerfil({ ...P01, sueldoLiquido: 400000 }, DEFAULT_PARAMETROS)
    expect(r.haberes).toBeLessThan(DEFAULT_PARAMETROS.imm)
    expect(r.alertas.some(a => a.includes('Total haberes'))).toBe(true)
  })

  it('no alerta si el total de haberes supera el ingreso mínimo aunque la base quede bajo él', () => {
    const r = calcularPerfil(
      { ...P01, sueldoLiquido: 650000, colacionMensual: 231000, movilizacionMensual: 60000 },
      DEFAULT_PARAMETROS
    )
    expect(r.base).toBeLessThan(DEFAULT_PARAMETROS.imm)
    expect(r.haberes).toBeGreaterThanOrEqual(DEFAULT_PARAMETROS.imm)
    expect(r.alertas).toEqual([])
  })

  it('la gratificación queda topada cuando el sueldo es alto', () => {
    const { topeGratificacion } = topesDerivados(DEFAULT_PARAMETROS)
    const r = calcularPerfil({ ...P01, sueldoLiquido: 3000000 }, DEFAULT_PARAMETROS)
    expect(r.gratificacion).toBe(topeGratificacion)
  })
})
