import { describe, it, expect } from 'vitest'
import { cubicar } from '../motor'
import { PARAMETROS_BASE, mezclarParametros } from '../params'
import type { Ficha, ResultadoCubicacion } from '../types'

const p = PARAMETROS_BASE

function ficha(datos: Record<string, unknown>): Ficha {
  return { descripcion: 'prueba', datos, no_sabe: [], supuestos: [] }
}

function fallo(fn: () => unknown): { status?: number; message: string } {
  try {
    fn()
  } catch (e) {
    const err = e as { status?: number; message: string }
    return { status: err.status, message: err.message }
  }
  throw new Error('no lanzó')
}

const reja = (extra: Record<string, unknown> = {}) =>
  ficha({
    medidas: { largo_m: 8, alto_m: 3, puerta: { ancho_m: 0.9, alto_m: 2.2 } },
    tipo_cierre: 'reja con barrotes',
    anclaje: 'empotrado en hormigón',
    cerradura: 'mecánica',
    ...extra,
  })

const rejaElectrica = (extra: Record<string, unknown> = {}) =>
  reja({
    cerradura: 'eléctrica',
    chapa_electrica: true,
    distancia_tablero_m: 25,
    canalizacion: 'enterrada',
    control_acceso: 'botón adentro y citófono afuera',
    ...extra,
  })

const calc = (f: Ficha): ResultadoCubicacion => cubicar('cierre_metalico', f, p)
const porId = (r: ResultadoCubicacion, id: string) => r.items.find(i => i.id === id)
const cat = (r: ResultadoCubicacion, c: string) => r.items.filter(i => i.categoria === c)
const formulaPerfil = (r: ResultadoCubicacion) => porId(r, 'cierre-perfil')?.formula ?? ''

describe('cierre metálico: texto libre de medidas', () => {
  it.each([
    ['8 m de largo por 3 m de alto'],
    ['8 metros de ancho y 3 de alto'],
    ['alto 3 m, largo 8 m'],
    ['3 m de alto por 8 m de ancho'],
    ['largo: 8 alto: 3'],
  ])('"%s" se interpreta por palabras clave sin supuesto de orden', texto => {
    const r = calc(reja({ medidas: texto }))
    expect(formulaPerfil(r)).toContain('5 postes de 3,6 m')
    expect(r.supuestos.map(x => x.clave)).not.toContain('medidas_orden')
  })

  it.each([['8 por 3'], ['8 x 3'], ['8x3 m'], ['8 × 3'], ['8,0 * 3,0 m']])(
    '"%s" se toma como ancho x alto con supuesto no crítico',
    texto => {
      const r = calc(reja({ medidas: texto }))
      expect(formulaPerfil(r)).toContain('5 postes de 3,6 m')
      expect(r.supuestos.find(x => x.clave === 'medidas_orden')?.critico).toBe(false)
    }
  )

  it('un texto con puerta usa el cierre y advierte que la puerta no se interpreta', () => {
    const r = calc(reja({ medidas: '8 x 3 con puerta de 0,9 x 2,2' }))
    expect(formulaPerfil(r)).toContain('5 postes de 3,6 m')
    expect(r.advertencias.join(' ')).toMatch(/puerta/)
  })

  it.each([['grande'], ['8 x 3 x 2'], ['mucho largo'], ['largo 8 y ancho 3']])(
    '"%s" ilegible se trata como desconocido, sin 422',
    texto => {
      const r = calc(reja({ medidas: texto }))
      expect(cat(r, 'mec')).toHaveLength(0)
      expect(r.supuestos.find(x => x.clave === 'medidas')?.critico).toBe(true)
      expect(r.advertencias.join(' ')).toMatch(/No se entendieron las medidas/)
    }
  )

  it('un texto legible pero con cero sigue siendo 422 nombrando el campo', () => {
    const e = fallo(() => calc(reja({ medidas: '0 x 3' })))
    expect(e.status).toBe(422)
    expect(e.message).toContain('medidas.largo_m')
  })
})

describe('cierre metálico: tipo de cierre no soportado', () => {
  it.each([['portón corredero'], ['abatible'], ['cortina enrollable'], ['portón']])(
    '"%s" degrada a reja con supuesto crítico y advertencia',
    texto => {
      const r = calc(reja({ tipo_cierre: texto }))
      expect(porId(r, 'cierre-barrotes')).toBeDefined()
      expect(r.supuestos.find(x => x.clave === 'tipo_cierre')?.critico).toBe(true)
      expect(r.advertencias.join(' ')).toMatch(/corredizos, abatibles/)
    }
  )
})

describe('cierre metálico: cerradura y chapa eléctrica', () => {
  it('candado: no agrega chapa, solo supuesto no crítico y advertencia', () => {
    const r = calc(reja({ cerradura: 'candado' }))
    expect(porId(r, 'cierre-chapa-mecanica')).toBeUndefined()
    expect(cat(r, 'ele')).toHaveLength(0)
    expect(r.supuestos.find(x => x.clave === 'candado')?.critico).toBe(false)
    expect(r.advertencias.join(' ')).toMatch(/candado/)
  })

  it.each([['sin chapa eléctrica'], ['no eléctrica'], ['mecánica'], ['chapa de embutir']])(
    'cerradura "%s" es mecánica',
    texto => {
      const r = calc(reja({ cerradura: texto }))
      expect(porId(r, 'cierre-chapa-mecanica')).toBeDefined()
      expect(cat(r, 'ele')).toHaveLength(0)
    }
  )

  it.each([[true], ['sí'], ['si'], ['true'], ['Sí'], ['eléctrica']])(
    'chapa_electrica %j equivale a verdadero',
    v => {
      const r = calc(reja({ cerradura: undefined, chapa_electrica: v, distancia_tablero_m: 10 }))
      expect(porId(r, 'acceso-chapa-electrica')).toBeDefined()
    }
  )

  it.each([[false], ['no'], ['false'], ['mecánica'], ['sin chapa eléctrica']])(
    'chapa_electrica %j equivale a falso',
    v => {
      const r = calc(reja({ chapa_electrica: v }))
      expect(cat(r, 'ele')).toHaveLength(0)
    }
  )

  it('chapa_electrica ilegible lanza 422 legible', () => {
    for (const v of ['tal vez', 3, {}]) {
      const e = fallo(() => calc(reja({ chapa_electrica: v })))
      expect(e.status).toBe(422)
      expect(e.message).toContain('"chapa_electrica"')
      expect(e.message).toContain('valores válidos')
    }
  })

  it('control_acceso: una lista de textos se une; otra forma lanza 422 legible', () => {
    const r = calc(rejaElectrica({ control_acceso: ['botón', 'citófono'] }))
    expect(porId(r, 'acceso-boton')).toBeDefined()
    expect(porId(r, 'acceso-citofono')).toBeDefined()
    for (const v of [5, { a: 1 }, true]) {
      const e = fallo(() => calc(rejaElectrica({ control_acceso: v })))
      expect(e.status).toBe(422)
      expect(e.message).toContain('"control_acceso"')
      expect(e.message).toContain('debe ser un texto')
    }
  })
})

describe('cierre metálico: constantes en parámetros', () => {
  it('los puntos base del electricista vienen de los parámetros', () => {
    const base = calc(rejaElectrica())
    const mas = cubicar(
      'cierre_metalico',
      rejaElectrica(),
      mezclarParametros(p, [{ clave: 'cierre', valor: { puntos_base_electricista: 6 } }])
    )
    expect(mas.dotacion!.hh_calculadas).toBeGreaterThan(base.dotacion!.hh_calculadas)
  })

  it('las caras de pintura vienen de los parámetros', () => {
    const solido = reja({ tipo_cierre: 'sólido' })
    const sinCaras = cubicar(
      'cierre_metalico',
      solido,
      mezclarParametros(p, [{ clave: 'cierre', valor: { caras_pintura: 0 } }])
    )
    const dos = calc(solido)
    expect(porId(sinCaras, 'cierre-anticorrosivo')!.cantidad).toBeLessThan(
      porId(dos, 'cierre-anticorrosivo')!.cantidad
    )
  })

  it('parámetros nuevos inválidos lanzan 422', () => {
    for (const k of ['puntos_base_electricista', 'caras_pintura']) {
      const malo = { ...p, cierre: { ...p.cierre, [k]: Number.NaN } }
      const e = fallo(() => cubicar('cierre_metalico', rejaElectrica(), malo))
      expect(e.status).toBe(422)
      expect(e.message).toContain(k)
    }
  })
})
