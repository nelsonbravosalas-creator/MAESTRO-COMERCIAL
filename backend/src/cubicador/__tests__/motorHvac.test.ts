import { describe, it, expect } from 'vitest'
import { cubicar } from '../motor'
import { CRITERIOS_REPARACION } from '../criterios'
import { PARAMETROS_BASE } from '../params'
import type { Ficha, ResultadoCubicacion } from '../types'

const p = PARAMETROS_BASE

function ficha(datos: Record<string, unknown>, no_sabe: string[] = []): Ficha {
  return { descripcion: 'prueba', datos, no_sabe, supuestos: [] }
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

const camara = () =>
  ficha(
    {
      tipo_trabajo: 'reparacion',
      sistema: 'camara',
      actividad: 'puesta_a_punto',
      refrigerante: 'R-404A',
      metodo: 'total',
      linea_liquido: { diametro: '3/8', largo_m: 20 },
      linea_gas: { diametro: '7/8', largo_m: 20 },
      uniones: 2,
      jornadas_fijadas: 2,
      estado_texto: 'funciona con baja capacidad',
    },
    ['refrigerante_lineas']
  )

const vrf = () =>
  ficha({
    tipo_trabajo: 'reparacion',
    sistema: 'vrf',
    actividad: 'fuga',
    refrigerante: 'R-410A',
    metodo: 'total',
    carga_placa_kg: 8.5,
    linea_liquido: { diametro: '3/8', largo_m: 40 },
    linea_gas: { diametro: '3/4', largo_m: 40 },
    volumen_equipos_l: 13.5,
    uniones: 2,
    estado_texto: 'fuga en una soldadura',
  })

const porDesc = (r: ResultadoCubicacion, texto: string) =>
  r.items.find(i => i.descripcion.includes(texto))

function sinNaN(r: ResultadoCubicacion) {
  for (const i of r.items) {
    expect(Number.isFinite(i.cantidad)).toBe(true)
    expect(Number.isFinite(i.dias)).toBe(true)
  }
}

describe('cubicar hvac', () => {
  it('caso R-404A de cámara: refrigerante, nitrógeno, filtro, soldadura y HH', () => {
    const r = cubicar('hvac', camara(), p)
    expect(porDesc(r, 'R-404A')).toMatchObject({ categoria: 'ins', unidad: 'kg', cantidad: 5.4 })
    expect(porDesc(r, 'Nitrógeno')).toMatchObject({
      categoria: 'ins',
      unidad: 'm3',
      cantidad: 0.13,
    })
    expect(porDesc(r, 'Filtro deshidratador 3/8"')).toMatchObject({ categoria: 'rep' })
    expect(porDesc(r, 'Soldadura')).toMatchObject({ categoria: 'ins' })
    for (const rol of ['Técnico Especializado HVAC', 'Ayudante Técnico HVAC']) {
      expect(r.items.find(i => i.descripcion === rol)).toMatchObject({
        categoria: 'mo',
        unidad: 'Hora',
        dias: 1,
        cantidad: 16,
      })
    }
    expect(r.supuestos.find(s => s.clave === 'carga_placa_kg')).toMatchObject({ critico: true })
    expect(r.advertencias.some(a => a.includes('R-404A'))).toBe(true)
    expect(r.dotacion).toMatchObject({ personas: 2, dias: 2, hh_cotizadas: 32 })
    sinNaN(r)
  })

  it('VRF con fuga y sin jornadas: 37 HH, 3 días y 18,5 h por rol', () => {
    const r = cubicar('hvac', vrf(), p)
    expect(r.dotacion).toMatchObject({ personas: 2, dias: 3, hh_calculadas: 37, hh_cotizadas: 37 })
    const horas = r.items.filter(i => i.categoria === 'mo').map(i => i.cantidad)
    expect(horas).toEqual([18.5, 18.5])
    expect(r.supuestos.some(s => s.clave === 'carga_placa_kg')).toBe(false)
    sinNaN(r)
  })

  it('mantenimiento lanza 422 y deriva a cubicar_especificacion_hvac', () => {
    const e = fallo(() =>
      cubicar('hvac', ficha({ ...vrf().datos, tipo_trabajo: 'mantenimiento' }), p)
    )
    expect(e.status).toBe(422)
    expect(e.message).toContain('cubicar_especificacion_hvac')
  })

  it('cierre_metalico aún no está implementado: 422', () => {
    expect(fallo(() => cubicar('cierre_metalico', ficha({}), p)).status).toBe(422)
  })

  it('compresor quemado: flushing agrega aceite y filtros y reutilizable queda en 0', () => {
    const base = vrf().datos
    const normal = cubicar('hvac', ficha({ ...base, reutilizable_kg: 2 }), p)
    const r = cubicar(
      'hvac',
      ficha({ ...base, reutilizable_kg: 2, estado_texto: 'Compresor QUEMADO, aceite ácido' }),
      p
    )
    expect(porDesc(r, 'Aceite')).toBeDefined()
    expect(porDesc(r, 'Filtro de limpieza')).toBeDefined()
    expect(porDesc(normal, 'Aceite')).toBeUndefined()
    const kg = (x: ResultadoCubicacion) => porDesc(x, 'R-410A')!.cantidad
    expect(kg(r)).toBeGreaterThan(kg(normal))
    expect(r.advertencias.some(a => a.includes('reutilizable'))).toBe(true)
    expect(porDesc(r, 'Nitrógeno')!.cantidad).toBeGreaterThan(
      porDesc(normal, 'Nitrógeno')!.cantidad
    )
    sinNaN(r)
  })

  it('"acido" sin tilde también activa el flushing', () => {
    const r = cubicar('hvac', ficha({ ...vrf().datos, estado_texto: 'olor Acido' }), p)
    expect(porDesc(r, 'Aceite')).toBeDefined()
  })

  it('R-32 advierte carga máxima y R-22 advierte disponibilidad', () => {
    const r32 = cubicar('hvac', ficha({ ...vrf().datos, refrigerante: 'R-32' }), p)
    expect(r32.advertencias.some(a => a.includes('A2L') && a.includes('carga máxima'))).toBe(true)
    const r22 = cubicar('hvac', ficha({ ...vrf().datos, refrigerante: 'R-22' }), p)
    expect(r22.advertencias.some(a => a.includes('disponibilidad'))).toBe(true)
  })

  it('presión de prueba genérica deja un supuesto no crítico', () => {
    const s = cubicar('hvac', camara(), p).supuestos.find(x => x.clave === 'presion_prueba')
    expect(s).toMatchObject({ critico: false })
  })

  it('datos inválidos lanzan 422 en español', () => {
    const malo = (cambio: Record<string, unknown>) =>
      fallo(() => cubicar('hvac', ficha({ ...vrf().datos, ...cambio }), p))
    expect(malo({ sistema: 'volcan' }).status).toBe(422)
    expect(malo({ uniones: -1 }).status).toBe(422)
    expect(malo({ factor_dificultad: 'mucho' }).message).toContain('factor_dificultad')
    expect(malo({ linea_liquido: { diametro: '3/8', largo_m: Number.NaN } }).status).toBe(422)
    expect(fallo(() => cubicar('hvac', ficha({}), p)).status).toBe(422)
  })

  it('todos los ítems quedan pendientes, con id único y sin precio', () => {
    const r = cubicar('hvac', camara(), p)
    expect(r.items.every(i => i.estado_precio === 'pendiente')).toBe(true)
    expect(r.items.every(i => i.precio_unitario === null && i.fuente === null)).toBe(true)
    expect(new Set(r.items.map(i => i.id)).size).toBe(r.items.length)
  })

  it('reenvía las advertencias de los calculadores', () => {
    const r = cubicar('hvac', ficha({ ...vrf().datos, presion_max_placa_barg: 20 }), p)
    expect(r.advertencias.some(a => a.includes('limitó'))).toBe(true)
  })
})

describe('CRITERIOS_REPARACION', () => {
  it('tiene 10 entradas completas', () => {
    expect(CRITERIOS_REPARACION).toHaveLength(10)
    for (const c of CRITERIOS_REPARACION) {
      expect(c.clave && c.situacion && c.criterio && c.efecto).toBeTruthy()
    }
    expect(new Set(CRITERIOS_REPARACION.map(c => c.clave)).size).toBe(10)
  })
})
