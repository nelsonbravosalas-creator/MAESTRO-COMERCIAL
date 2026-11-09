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

  it('solo no_sabe no abre la compuerta: exige al menos un dato real', () => {
    const e = evaluarCompuerta(
      PERFILES.hvac,
      ficha({}, ['trabajo_equipo', 'refrigerante_lineas', 'estado_sistema'])
    )
    expect(e.habilitado).toBe(false)
    expect(e.faltantes).toEqual(['trabajo_equipo', 'refrigerante_lineas', 'estado_sistema'])
    expect(e.motivo).toMatch(/dato real/)
    expect(e.siguientes.length).toBeGreaterThan(0)
  })

  it('un dato real más dos no_sabe sí abre la compuerta', () => {
    const e = evaluarCompuerta(
      PERFILES.hvac,
      ficha({ tipo_trabajo: 'reparacion', sistema: 'split' }, [
        'refrigerante_lineas',
        'estado_sistema',
      ])
    )
    expect(e.habilitado).toBe(true)
    expect(e.motivo).toBeUndefined()
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

  const sinResponder = (datos: Record<string, unknown>, clave: string) =>
    evaluarCompuerta(PERFILES.hvac, ficha({ ...HVAC_COMPLETO, ...datos })).faltantes.includes(clave)

  it('carga_placa_kg basura no responde la pregunta', () => {
    for (const v of [0, -5, 'abc', '12', true, {}, NaN, Infinity]) {
      expect(sinResponder({ carga_placa_kg: v }, 'refrigerante_lineas')).toBe(true)
    }
  })

  it('refrigerante basura no responde la pregunta', () => {
    for (const v of [true, {}, 0, '  ', []]) {
      expect(sinResponder({ refrigerante: v }, 'refrigerante_lineas')).toBe(true)
    }
  })

  it('diametro basura no responde la pregunta', () => {
    for (const v of [0, -1, {}, [], true, '  ']) {
      expect(
        sinResponder({ linea_liquido: { diametro: v, largo_m: 20 } }, 'refrigerante_lineas')
      ).toBe(true)
    }
  })

  it('largo_m basura no responde la pregunta', () => {
    for (const v of [0, -1, NaN, Infinity, '20']) {
      expect(
        sinResponder({ linea_gas: { diametro: '7/8', largo_m: v } }, 'refrigerante_lineas')
      ).toBe(true)
    }
  })

  it('tipo_trabajo, sistema y estado_texto basura no responden', () => {
    expect(sinResponder({ sistema: 5 }, 'trabajo_equipo')).toBe(true)
    expect(sinResponder({ tipo_trabajo: true }, 'trabajo_equipo')).toBe(true)
    expect(sinResponder({ estado_texto: {} }, 'estado_sistema')).toBe(true)
  })

  it('un no_sabe inventado no responde nada', () => {
    const e = evaluarCompuerta(PERFILES.hvac, ficha({}, ['inventada']))
    expect(e.respondidas).toBe(0)
  })

  it('segundoNivel reconoce camara con tilde y central', () => {
    for (const sistema of ['cámara', 'Cámara frigorífica', 'camara', 'Central de frío']) {
      const q = PERFILES.hvac.segundoNivel({ sistema })
      expect(q).toHaveLength(1)
      expect(q[0]).toContain('ventana horaria')
    }
  })

  it('segundoNivel R-32 y R-22 traen su pregunta', () => {
    expect(PERFILES.hvac.segundoNivel({ refrigerante: 'R-32' })[0]).toContain(
      'tamaño tiene el local'
    )
    expect(PERFILES.hvac.segundoNivel({ refrigerante: 'r 22' })[0]).toContain('retrofit')
  })
})
