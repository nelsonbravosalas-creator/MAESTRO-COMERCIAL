import { describe, it, expect } from 'vitest'
import { PERFILES } from '../perfiles'
import { evaluarCompuerta } from '../compuerta'
import type { Ficha } from '../types'

function ficha(datos: Record<string, unknown>, no_sabe: string[] = []): Ficha {
  return { descripcion: 'caso de prueba', datos, no_sabe, supuestos: [] }
}

const HVAC_COMPLETO = {
  tipo_trabajo: 'reparacion',
  sistema: 'camara',
  refrigerante: 'R-404A',
  carga_placa_kg: 12,
  linea_liquido: { diametro: '3/8', largo_m: 20 },
  linea_gas: { diametro: '7/8', largo_m: 20 },
  estado_texto: 'Fuga en la union de la succion, compresor funcionando',
}

describe('compuerta del servidor', () => {
  it('caso R-404A sin placa ni succion ni estado: 1 de 3, deshabilitado', () => {
    const e = evaluarCompuerta(
      PERFILES.hvac,
      ficha({
        tipo_trabajo: 'reparacion',
        sistema: 'camara',
        refrigerante: 'R-404A',
        linea_liquido: { diametro: '3/8', largo_m: 20 },
      })
    )
    expect(e.respondidas).toBe(1)
    expect(e.requeridas).toBe(3)
    expect(e.habilitado).toBe(false)
    expect(e.faltantes).toEqual(['refrigerante_lineas', 'estado_sistema'])
  })

  it('no_sabe cuenta como respondida', () => {
    const e = evaluarCompuerta(
      PERFILES.hvac,
      ficha({ tipo_trabajo: 'reparacion', sistema: 'camara' }, [
        'refrigerante_lineas',
        'estado_sistema',
      ])
    )
    expect(e.respondidas).toBe(3)
    expect(e.habilitado).toBe(true)
    expect(e.faltantes).toEqual([])
  })

  it('todo en el primer mensaje habilita sin preguntar', () => {
    const e = evaluarCompuerta(PERFILES.hvac, ficha(HVAC_COMPLETO))
    expect(e.respondidas).toBe(3)
    expect(e.habilitado).toBe(true)
    expect(e.siguientes).toEqual([])
  })

  it('Gemini no puede afirmar sin datos: solo tipo_trabajo no completa trabajo_equipo', () => {
    const e = evaluarCompuerta(PERFILES.hvac, ficha({ tipo_trabajo: 'reparacion' }))
    expect(e.respondidas).toBe(0)
    expect(e.habilitado).toBe(false)
    expect(e.faltantes).toContain('trabajo_equipo')
  })

  it('cierre_metalico: con 2 respuestas no habilita; con 3 de 5 si', () => {
    const dos = evaluarCompuerta(
      PERFILES.cierre_metalico,
      ficha({ medidas: '3x2,4 m', tipo_cierre: 'portón corredero' })
    )
    expect(dos.respondidas).toBe(2)
    expect(dos.requeridas).toBe(3)
    expect(dos.habilitado).toBe(false)

    const tres = evaluarCompuerta(
      PERFILES.cierre_metalico,
      ficha({ medidas: '3x2,4 m', tipo_cierre: 'portón corredero', comuna: 'Maipú' })
    )
    expect(tres.respondidas).toBe(3)
    expect(tres.habilitado).toBe(true)
    expect(tres.faltantes).toEqual(['anclaje', 'cerradura'])
  })

  it('siguientes nunca trae mas de 3 y va por impacto descendente', () => {
    const e = evaluarCompuerta(PERFILES.cierre_metalico, ficha({}))
    expect(e.siguientes.length).toBeLessThanOrEqual(3)
    expect(e.siguientes.length).toBe(3)
    const impactos = [...PERFILES.cierre_metalico.preguntas]
      .sort((a, b) => b.impacto - a.impacto)
      .slice(0, 3)
      .map(p => p.texto)
    expect(e.siguientes).toEqual(impactos)
  })

  it('segundoNivel dispara preguntas segun los datos', () => {
    expect(PERFILES.hvac.segundoNivel({ refrigerante: 'R-32' }).length).toBeGreaterThan(0)
    expect(PERFILES.hvac.segundoNivel({ refrigerante: 'R-22' }).length).toBeGreaterThan(0)
    expect(PERFILES.hvac.segundoNivel({ sistema: 'camara' }).length).toBeGreaterThan(0)
    expect(PERFILES.hvac.segundoNivel({ refrigerante: 'R-410A', sistema: 'split' })).toEqual([])
    expect(PERFILES.cierre_metalico.segundoNivel({ chapa_electrica: true }).length).toBe(4)
    expect(PERFILES.cierre_metalico.segundoNivel({ chapa_electrica: false })).toEqual([])
  })
})
