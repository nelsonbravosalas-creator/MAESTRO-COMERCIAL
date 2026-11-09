import { describe, it, expect } from 'vitest'
import { calcularHH, listaTareas } from '../calc/horasHombre'
import { sugerirDotacion } from '../calc/dotacion'
import { PARAMETROS_BASE, mezclarParametros } from '../params'

const p = PARAMETROS_BASE

function mensaje(fn: () => unknown): { status?: number; message: string } {
  try {
    fn()
  } catch (e) {
    const err = e as { status?: number; statusCode?: number; message: string }
    return { status: err.status ?? err.statusCode, message: err.message }
  }
  throw new Error('no lanzó')
}

const hhDe = (datos: Parameters<typeof listaTareas>[0], factor?: number) =>
  calcularHH(listaTareas(datos, p), factor).total

describe('horas-hombre', () => {
  it('reparación de fuga suma 37 HH y sugiere 2 personas, 3 días, sin holgura', () => {
    const total = hhDe({ actividad: 'reparacion_fuga' })
    expect(total).toBe(37)
    const d = sugerirDotacion({ hh: total }, p)
    expect(d.personas).toBe(2)
    expect(d.dias).toBe(3)
    expect(d.hh_cotizadas).toBe(37)
    expect(d.holgura_hh).toBe(0)
    expect(d.advertencias).toEqual([])
  })

  it('puesta a punto suma 21,5 HH y toma 2 días', () => {
    const total = hhDe({ actividad: 'puesta_a_punto' })
    expect(total).toBe(21.5)
    expect(sugerirDotacion({ hh: total }, p).dias).toBe(2)
  })

  it('2 jornadas fijadas: 32 HH cotizadas y 10,5 de holgura', () => {
    const d = sugerirDotacion({ hh: 21.5, jornadas_fijadas: 2 }, p)
    expect(d.dias).toBe(2)
    expect(d.hh_cotizadas).toBe(32)
    expect(d.holgura_hh).toBe(10.5)
    expect(d.advertencias).toEqual([])
  })

  it('jornadas fijadas menores a lo calculado: 16 HH, holgura −5,5 y advierte', () => {
    const d = sugerirDotacion({ hh: 21.5, jornadas_fijadas: 1 }, p)
    expect(d.dias).toBe(1)
    expect(d.hh_cotizadas).toBe(16)
    expect(d.holgura_hh).toBe(-5.5)
    expect(d.advertencias).toHaveLength(1)
    expect(d.advertencias[0]).toContain('5,5 HH')
  })

  it('instalación con 1+1 unidades y 12 m suma 15,8', () => {
    const filas = listaTareas(
      {
        actividad: 'instalacion',
        unidades_interiores: 1,
        unidades_exteriores: 1,
        largo_linea_m: 12,
      },
      p
    )
    expect(calcularHH(filas).total).toBe(15.8)
  })

  it('factor de dificultad 1,2 multiplica el total', () => {
    expect(hhDe({ actividad: 'reparacion_fuga' }, 1.2)).toBe(44.4)
  })

  it('3 barridos de flushing suman 6 HH: 43 en total', () => {
    const filas = listaTareas({ actividad: 'reparacion_fuga', barridos: 3 }, p)
    expect(filas[filas.length - 1].descripcion).toBe('Barridos de flushing')
    expect(calcularHH(filas).total).toBe(43)
  })

  it('un día no se suma por error de punto flotante', () => {
    expect(sugerirDotacion({ hh: 13.6 }, p).dias).toBe(1)
  })
})

describe('validaciones', () => {
  it('actividad desconocida lista las válidas (422)', () => {
    const e = mensaje(() => listaTareas({ actividad: 'otra' }, p))
    expect(e.status).toBe(422)
    expect(e.message).toContain('reparacion_fuga')
    expect(e.message).toContain('instalacion')
  })

  it('cantidades negativas o no finitas (422)', () => {
    expect(
      mensaje(() => listaTareas({ actividad: 'instalacion', largo_linea_m: -1 }, p)).status
    ).toBe(422)
    expect(
      mensaje(() => listaTareas({ actividad: 'instalacion', unidades_interiores: NaN }, p)).message
    ).toContain('deben ser números')
    expect(mensaje(() => listaTareas({ actividad: 'instalacion', barridos: -2 }, p)).status).toBe(
      422
    )
  })

  it('factor inválido (422)', () => {
    expect(mensaje(() => calcularHH([], 0)).status).toBe(422)
    expect(mensaje(() => calcularHH([], NaN)).message).toContain('debe ser un número')
  })

  it('dotación: personas y jornadas inválidas (422)', () => {
    expect(mensaje(() => sugerirDotacion({ hh: 10, tecnicos: 0, ayudantes: 0 }, p)).status).toBe(
      422
    )
    expect(mensaje(() => sugerirDotacion({ hh: 10, tecnicos: 1.5 }, p)).status).toBe(422)
    expect(mensaje(() => sugerirDotacion({ hh: 10, ayudantes: -1 }, p)).status).toBe(422)
    expect(mensaje(() => sugerirDotacion({ hh: 10, jornadas_fijadas: 0 }, p)).status).toBe(422)
    expect(mensaje(() => sugerirDotacion({ hh: 10, jornadas_fijadas: 1.5 }, p)).status).toBe(422)
    expect(mensaje(() => sugerirDotacion({ hh: NaN }, p)).status).toBe(422)
  })

  it('mezclarParametros ignora una fila hh que no es objeto', () => {
    const m = mezclarParametros(p, [{ clave: 'hh', valor: 'x' }])
    expect(m.hh).toEqual(p.hh)
  })
})
