import { describe, it, expect } from 'vitest'
import { cubicar } from '../motor'
import { PARAMETROS_BASE } from '../params'
import type { Ficha, ItemListado, ResultadoCubicacion } from '../types'

// Correcciones de la revisión final (F6) sobre el texto libre del cierre metálico.
const p = PARAMETROS_BASE

function ficha(datos: Record<string, unknown>): Ficha {
  return { descripcion: 'prueba', datos, no_sabe: [], supuestos: [] }
}

const base = (extra: Record<string, unknown> = {}) =>
  ficha({
    medidas: { largo_m: 8, alto_m: 3, puerta: { ancho_m: 0.9, alto_m: 2.2 } },
    tipo_cierre: 'reja con barrotes',
    anclaje: 'empotrado en hormigón',
    comuna: 'Santiago',
    ...extra,
  })

const calc = (f: Ficha): ResultadoCubicacion => cubicar('cierre_metalico', f, p)
const porId = (r: ResultadoCubicacion, id: string): ItemListado | undefined =>
  r.items.find(i => i.id === id)

describe('F6: tipo de cierre', () => {
  it('un portón corredero con barrotes no se cubica como reja sin aviso', () => {
    const r = calc(base({ tipo_cierre: 'portón corredero con barrotes' }))
    const aviso = r.supuestos.find(s => s.critico && /port[oó]n/i.test(s.texto))
    expect(aviso).toBeDefined()
  })

  it('una reja con barrotes sigue sin aviso de tipo no soportado', () => {
    const r = calc(base())
    expect(r.supuestos.some(s => /port[oó]n/i.test(s.texto))).toBe(false)
  })
})

describe('F6: medidas en texto libre', () => {
  it('"56 912345678" no se lee como medidas (falta separador)', () => {
    const r = calc(base({ medidas: '56 912345678' }))
    expect(porId(r, 'cierre-perfil')).toBeUndefined()
  })

  it('"0 x 3 m" no se acepta: el largo debe ser mayor que cero', () => {
    const r = calc(base({ medidas: '0 x 3 m' }))
    expect(porId(r, 'cierre-perfil')).toBeUndefined()
  })

  it('"8 x 3 m" sigue leyéndose como medidas válidas', () => {
    const r = calc(base({ medidas: '8 x 3 m' }))
    expect(porId(r, 'cierre-perfil')).toBeDefined()
  })
})

describe('F6: límites de medidas estructuradas', () => {
  it('un largo mayor a 500 m se rechaza con 422 que nombra el campo', () => {
    let error: { status?: number; message: string } | undefined
    try {
      calc(base({ medidas: { largo_m: 600, alto_m: 3 } }))
    } catch (e) {
      error = e as { status?: number; message: string }
    }
    expect(error?.status).toBe(422)
    expect(error?.message).toContain('largo_m')
  })

  it('un alto mayor a 20 m se rechaza con 422 que nombra el campo', () => {
    let error: { status?: number; message: string } | undefined
    try {
      calc(base({ medidas: { largo_m: 8, alto_m: 25 } }))
    } catch (e) {
      error = e as { status?: number; message: string }
    }
    expect(error?.status).toBe(422)
    expect(error?.message).toContain('alto_m')
  })
})
