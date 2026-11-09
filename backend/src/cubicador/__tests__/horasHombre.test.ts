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

describe('parámetros de BD mal formados', () => {
  const con = (tareas: unknown, extra: Record<string, unknown> = {}) =>
    mezclarParametros(p, [{ clave: 'hh', valor: { tareas, ...extra } }])
  const tarea = (t: Record<string, unknown>) => con({ reparacion_fuga: [t] })
  const falla = (
    params: typeof p,
    datos: Parameters<typeof listaTareas>[0] = { actividad: 'reparacion_fuga' }
  ) => mensaje(() => calcularHH(listaTareas(datos, params)))

  it('actividad que no es lista (422)', () => {
    const e = falla(con({ reparacion_fuga: 'x' }))
    expect(e.status).toBe(422)
    expect(e.message).toContain('reparacion_fuga')
  })

  it('unidad por desconocida no se descarta en silencio (422)', () => {
    const e = falla(tarea({ descripcion: 'A', hh: 1, por: 'interiores' }), {
      actividad: 'reparacion_fuga',
      unidades_interiores: 0,
    })
    expect(e.status).toBe(422)
    expect(e.message).toContain('interiores')
  })

  it('hh negativo, NaN, texto o nulo (422)', () => {
    for (const hh of [-1, NaN, '3', null]) {
      const e = falla(tarea({ descripcion: 'A', hh }))
      expect(e.status).toBe(422)
      expect(e.message).toContain('horas-hombre inválidas')
    }
  })

  it('descripción vacía (422)', () => {
    expect(falla(tarea({ descripcion: '  ', hh: 1 })).status).toBe(422)
  })

  it('hh_barrido nulo con barridos (422)', () => {
    const params = mezclarParametros(p, [{ clave: 'hh', valor: { hh_barrido: null } }])
    const e = falla(params, { actividad: 'reparacion_fuga', barridos: 2 })
    expect(e.status).toBe(422)
    expect(e.message).toContain('barrido')
  })

  it('una tarea por unidad con 0 unidades se omite sin error', () => {
    const filas = listaTareas({ actividad: 'instalacion' }, p)
    expect(filas.map(f => f.descripcion)).not.toContain('Unidades interiores')
  })

  it('calcularHH no devuelve total NaN (422)', () => {
    expect(mensaje(() => calcularHH([{ descripcion: 'x', hh: NaN }])).status).toBe(422)
  })

  it('las filas no arrastran ruido de punto flotante', () => {
    const filas = listaTareas({ actividad: 'instalacion', largo_linea_m: 12 }, p)
    expect(filas.find(f => f.descripcion === 'Línea frigorífica')?.hh).toBe(4.8)
  })
})

describe('dotación: entradas mal formadas y redacción', () => {
  it('jornadas fijadas texto o NaN (422); null equivale a no fijadas', () => {
    const texto = { hh: 10, jornadas_fijadas: '2' as unknown as number }
    expect(mensaje(() => sugerirDotacion(texto, p)).status).toBe(422)
    expect(mensaje(() => sugerirDotacion({ hh: 10, jornadas_fijadas: NaN }, p)).status).toBe(422)
    const nulo = { hh: 10, jornadas_fijadas: null as unknown as undefined }
    const d = sugerirDotacion(nulo, p)
    expect(d.dias).toBe(1)
    expect(d.hh_cotizadas).toBe(10)
  })

  it('técnicos como texto (422)', () => {
    const e = mensaje(() => sugerirDotacion({ hh: 10, tecnicos: '1' as unknown as number }, p))
    expect(e.status).toBe(422)
  })

  it('la advertencia usa singular y plural', () => {
    const uno = sugerirDotacion({ hh: 21.5, jornadas_fijadas: 1 }, p).advertencias[0]
    expect(uno).toContain('La jornada fijada no alcanza')
    const dos = sugerirDotacion({ hh: 40, jornadas_fijadas: 2 }, p).advertencias[0]
    expect(dos).toContain('Las 2 jornadas fijadas no alcanzan')
  })
})
