import { describe, it, expect } from 'vitest'
import { calcularNitrogeno, presionPrueba, type EntradaNitrogeno } from '../calc/nitrogeno'
import { PARAMETROS_BASE, mezclarParametros } from '../params'

const p = PARAMETROS_BASE

const base: EntradaNitrogeno = { volumen_l: 25.02, presion_barg: 37.92, minutos_soldadura: 40 }

function mensaje(fn: () => unknown): { status?: number; message: string } {
  try {
    fn()
  } catch (e) {
    const err = e as { status?: number; statusCode?: number; message: string }
    return { status: err.status ?? err.statusCode, message: err.message }
  }
  throw new Error('no lanzó')
}

describe('calcularNitrogeno', () => {
  it('VRF: 25,02 L a 37,92 barg y 40 min da 1,39 m3 y 1 balón', () => {
    const r = calcularNitrogeno(base, p)
    expect(r.m3).toBe(1.39)
    expect(r.balones).toBe(1)
    expect(r.formula).toContain('1,39 m³')
    expect(r.advertencias).toEqual([])
  })

  it('caso R-404A: 1 L a 9 barg y 30 min da 0,13 m3 y 1 balón', () => {
    const r = calcularNitrogeno({ volumen_l: 1, presion_barg: 9, minutos_soldadura: 30 }, p)
    expect(r.m3).toBe(0.13)
    expect(r.balones).toBe(1)
  })

  it('la placa topa la presión: máximo 20 barg da menos que 37,92', () => {
    const libre = calcularNitrogeno(base, p)
    const topada = calcularNitrogeno({ ...base, presion_max_placa_barg: 20 }, p)
    expect(topada.m3).toBeLessThan(libre.m3)
    expect(topada.m3).toBe(0.81) // (25,02×20 + 120) × 1,3 = 806,5 L
  })

  it('una placa mayor que la presión pedida no sube la presión', () => {
    const r = calcularNitrogeno({ ...base, presion_max_placa_barg: 50 }, p)
    expect(r.m3).toBe(1.39)
  })

  it('flushing suma 3 barridos: 25 L a 5 barg agrega 487,5 L', () => {
    const sin = calcularNitrogeno({ volumen_l: 25, presion_barg: 10, minutos_soldadura: 0 }, p)
    const con = calcularNitrogeno(
      { volumen_l: 25, presion_barg: 10, minutos_soldadura: 0, barridos: 3 },
      p
    )
    // sin: 25×10×1,3 = 325 L; con: 325 + 487,5 = 812,5 L
    expect(sin.m3).toBe(0.33)
    expect(con.m3).toBe(0.81)
    expect(con.formula).toContain('487,5')
  })

  it('10 m3 pide 2 balones', () => {
    // 7692,3 × 1,3 ≈ 10000 L
    const r = calcularNitrogeno({ volumen_l: 1000, presion_barg: 6.6923, minutos_soldadura: 0 }, p)
    expect(r.m3).toBe(8.7)
    const g = calcularNitrogeno({ volumen_l: 1000, presion_barg: 7.6923, minutos_soldadura: 0 }, p)
    expect(g.m3).toBe(10)
    expect(g.balones).toBe(2)
  })

  it('el límite exacto de 6,00 m3 pide 1 balón, no 2', () => {
    const r = calcularNitrogeno(
      { volumen_l: 1000, presion_barg: 4.6153846, minutos_soldadura: 0 },
      p
    )
    expect(r.m3).toBe(6)
    expect(r.balones).toBe(1)
  })

  it('volumen 0 sin soldadura da 0 balones', () => {
    const r = calcularNitrogeno({ volumen_l: 0, presion_barg: 9, minutos_soldadura: 0 }, p)
    expect(r.m3).toBe(0)
    expect(r.balones).toBe(0)
  })

  it('rechaza volumen negativo, NaN, Infinity y texto con 422', () => {
    for (const v of [-1, NaN, Infinity, '25' as unknown as number]) {
      const e = mensaje(() => calcularNitrogeno({ ...base, volumen_l: v }, p))
      expect(e.status).toBe(422)
    }
    expect(mensaje(() => calcularNitrogeno({ ...base, volumen_l: -1 }, p)).message).toBe(
      'El volumen no puede ser negativo.'
    )
    expect(mensaje(() => calcularNitrogeno({ ...base, volumen_l: NaN }, p)).message).toBe(
      'El volumen debe ser un número.'
    )
  })

  it('rechaza presión negativa, NaN, Infinity y texto con 422', () => {
    for (const v of [-1, NaN, Infinity, '9' as unknown as number]) {
      const e = mensaje(() => calcularNitrogeno({ ...base, presion_barg: v }, p))
      expect(e.status).toBe(422)
    }
  })

  it('rechaza minutos de soldadura negativos con 422', () => {
    const e = mensaje(() => calcularNitrogeno({ ...base, minutos_soldadura: -5 }, p))
    expect(e.status).toBe(422)
    expect(e.message).toBe('Los minutos de soldadura no pueden ser negativos.')
  })

  it('rechaza barridos negativos o no numéricos con 422', () => {
    for (const v of [-1, NaN, '3' as unknown as number]) {
      expect(mensaje(() => calcularNitrogeno({ ...base, barridos: v }, p)).status).toBe(422)
    }
  })

  it('rechaza un tope de placa no numérico, infinito o no positivo con 422', () => {
    for (const v of [NaN, Infinity, -3, 0, 'x' as unknown as number]) {
      const e = mensaje(() => calcularNitrogeno({ ...base, presion_max_placa_barg: v }, p))
      expect(e.status).toBe(422)
    }
  })

  it('rechaza parámetros de nitrógeno inválidos con 422', () => {
    const malos = { ...p, nitrogeno: { ...p.nitrogeno, balon_m3: 0 } }
    expect(mensaje(() => calcularNitrogeno(base, malos)).status).toBe(422)
  })
})

describe('presionPrueba', () => {
  it('R-410A y R-32 usan 37,9 barg y no son supuesto', () => {
    expect(presionPrueba('R-410A', p)).toEqual({ barg: 37.9, supuesto: false })
    expect(presionPrueba('r32', p)).toEqual({ barg: 37.9, supuesto: false })
  })

  it('el resto usa 9 barg marcado como supuesto', () => {
    expect(presionPrueba('R-404A', p)).toEqual({ barg: 9, supuesto: true })
    expect(presionPrueba('R-XYZ', p)).toEqual({ barg: 9, supuesto: true })
  })
})

describe('parámetros de nitrógeno', () => {
  it('mezclarParametros ignora una fila de nitrógeno que no es objeto', () => {
    const m = mezclarParametros(p, [{ clave: 'nitrogeno', valor: 5 }])
    expect(m.nitrogeno).toEqual(p.nitrogeno)
  })
})
