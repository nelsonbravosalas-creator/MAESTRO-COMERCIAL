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

  it('cierre_metalico se despacha a su propio motor, no al HVAC', () => {
    const r = cubicar('cierre_metalico', ficha({}), p)
    expect(r.items).toHaveLength(0)
    expect(r.supuestos.some(x => x.clave === 'medidas' && x.critico)).toBe(true)
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

describe('cubicar hvac: lo que falta se omite y se marca', () => {
  it('fuga con refrigerante_lineas en no_sabe y sin refrigerante ni líneas: sin 422', () => {
    const r = cubicar(
      'hvac',
      ficha(
        { tipo_trabajo: 'reparacion', sistema: 'vrf', actividad: 'fuga', estado_texto: 'fuga' },
        ['refrigerante_lineas']
      ),
      p
    )
    expect(r.items.some(i => i.descripcion.includes('Refrigerante'))).toBe(false)
    expect(r.items.some(i => i.descripcion.includes('Nitrógeno'))).toBe(false)
    expect(r.supuestos.find(s => s.clave === 'refrigerante')).toMatchObject({ critico: true })
    expect(r.advertencias.some(a => a.includes('refrigerante'))).toBe(true)
    expect(r.items.filter(i => i.categoria === 'mo')).toHaveLength(2)
    expect(r.dotacion?.hh_cotizadas).toBe(37)
    sinNaN(r)
  })

  it('refrigerante conocido sin líneas: carga solo por placa y supuesto crítico de líneas', () => {
    const datos = { ...vrf().datos }
    delete datos.linea_liquido
    delete datos.linea_gas
    const r = cubicar('hvac', ficha({ ...datos, volumen_equipos_l: 13.5 }), p)
    expect(porDesc(r, 'R-410A')!.cantidad).toBe(8.9) // 8,5 × 1,05
    expect(r.supuestos.find(s => s.clave === 'lineas')).toMatchObject({ critico: true })
    expect(porDesc(r, 'Nitrógeno')).toBeDefined()
    sinNaN(r)
  })

  it('una sola línea conocida marca el supuesto crítico y no falla en cámara', () => {
    const datos = { ...camara().datos }
    delete datos.linea_gas
    const r = cubicar('hvac', ficha(datos, ['refrigerante_lineas']), p)
    expect(r.supuestos.find(s => s.clave === 'lineas')).toMatchObject({ critico: true })
    expect(porDesc(r, 'R-404A')).toBeDefined()
  })

  it('sin líneas ni volumen en circuito: nitrógeno solo de purga y supuesto crítico', () => {
    const datos = { ...vrf().datos }
    delete datos.linea_liquido
    delete datos.linea_gas
    delete datos.volumen_equipos_l
    const r = cubicar('hvac', ficha(datos), p)
    expect(r.supuestos.find(s => s.clave === 'nitrogeno_volumen')).toMatchObject({ critico: true })
    expect(porDesc(r, 'Nitrógeno')).toBeDefined()
  })

  it('no_sabe con placa positiva: gana el valor dado y no hay supuesto de placa', () => {
    const r = cubicar('hvac', ficha(vrf().datos, ['refrigerante_lineas']), p)
    expect(r.supuestos.some(s => s.clave === 'carga_placa_kg')).toBe(false)
  })

  it('basura sigue dando 422 y nombra el campo', () => {
    const malo = (cambio: Record<string, unknown>) =>
      fallo(() => cubicar('hvac', ficha({ ...vrf().datos, ...cambio }), p))
    expect(malo({ carga_placa_kg: -3 }).message).toContain('carga_placa_kg')
    expect(malo({ uniones: 'dos' }).status).toBe(422)
    expect(malo({ tipo_trabajo: 'volar' }).message).toContain('instalacion')
    expect(malo({ refrigerante: 'R-999' }).status).toBe(422)
  })

  it('un campo obligatorio ausente se nombra en el 422', () => {
    const datos = { ...vrf().datos }
    delete datos.sistema
    const e = fallo(() => cubicar('hvac', ficha(datos), p))
    expect(e.status).toBe(422)
    expect(e.message).toContain('falta el campo "sistema"')
  })
})

describe('cubicar hvac: texto libre y parámetros', () => {
  const con = (cambio: Record<string, unknown>) =>
    cubicar('hvac', ficha({ ...vrf().datos, ...cambio }), p)

  it.each([
    ['Cámara frigorífica', 'camara'],
    ['camara', 'camara'],
    ['Rack central', 'central'],
    ['VRV', 'vrf'],
    ['Multi split', 'multisplit'],
    ['Split', 'split'],
    ['Precisión', 'precision'],
  ])('sistema "%s" se acepta', (texto, canon) => {
    const datos = { ...camara().datos, sistema: texto }
    expect(() => cubicar('hvac', ficha(datos, ['refrigerante_lineas']), p)).not.toThrow()
    // El sistema "camara" suma succión: es la única diferencia observable de masa.
    const conVapor = canon === 'camara' || canon === 'central'
    const r = cubicar('hvac', ficha(datos, ['refrigerante_lineas']), p)
    expect(porDesc(r, 'R-404A')!.cantidad).toBe(conVapor ? 5.4 : 5.3)
  })

  it('sistema desconocido da 422 con los valores válidos', () => {
    const e = fallo(() => con({ sistema: 'chiller' }))
    expect(e.status).toBe(422)
    expect(e.message).toContain('multisplit')
  })

  it.each([
    ['Reparación', false],
    ['reparar', false],
    ['arreglo', false],
    ['Instalación', true],
    ['instalar', true],
    ['montaje', true],
  ])('tipo_trabajo "%s"', (texto, esInstalacion) => {
    const datos = { ...vrf().datos, tipo_trabajo: texto, actividad: undefined }
    const r = cubicar('hvac', ficha(datos), p)
    expect(r.items.some(i => i.categoria === 'rep')).toBe(!esInstalacion)
  })

  it.each(['Mantención', 'mantener', 'Mantenimiento'])('tipo_trabajo "%s" deriva', texto => {
    const e = fallo(() => con({ tipo_trabajo: texto }))
    expect(e.message).toContain('cubicar_especificacion_hvac')
  })

  it('actividad y refrigerante en texto libre', () => {
    const base = cubicar(
      'hvac',
      ficha({ ...camara().datos, actividad: 'Puesta a punto' }, ['refrigerante_lineas']),
      p
    )
    for (const ref of ['r-404a', 'R404A', 'r 404 a', '404A']) {
      const r = cubicar(
        'hvac',
        ficha({ ...camara().datos, refrigerante: ref }, ['refrigerante_lineas']),
        p
      )
      expect(porDesc(r, 'Gas Refrigerante R-404A')!.cantidad).toBe(5.4)
    }
    expect(base.dotacion?.hh_calculadas).toBe(21.5)
    expect(con({ actividad: 'Fugas' }).dotacion?.hh_calculadas).toBe(37)
    expect(porDesc(con({ actividad: 'flushing' }), 'Aceite')).toBeDefined()
  })

  it('volumen del tramo viene de params y deja un supuesto no crítico', () => {
    const r = cubicar('hvac', camara(), p)
    expect(r.supuestos.find(s => s.clave === 'volumen_tramo')).toMatchObject({ critico: false })
    const grande = { ...p, nitrogeno: { ...p.nitrogeno, volumen_tramo_l: 10 } }
    expect(porDesc(cubicar('hvac', camara(), grande), 'Nitrógeno')!.cantidad).toBeGreaterThan(0.13)
    const malo = { ...p, nitrogeno: { ...p.nitrogeno, volumen_tramo_l: 0 } }
    expect(fallo(() => cubicar('hvac', camara(), malo)).status).toBe(422)
  })

  it('uniones supuestas vienen de params; críticas en instalación', () => {
    const datos = { ...vrf().datos }
    delete datos.uniones
    const rep = cubicar('hvac', ficha(datos), p)
    expect(rep.supuestos.find(s => s.clave === 'uniones')).toMatchObject({ critico: false })
    expect(porDesc(rep, 'Soldadura')!.cantidad).toBe(2)
    const inst = cubicar('hvac', ficha({ ...datos, tipo_trabajo: 'instalacion' }), p)
    expect(inst.supuestos.find(s => s.clave === 'uniones')).toMatchObject({ critico: true })
  })

  it('reparto de HH con 2 técnicos y 1 ayudante (24 HH -> 16 y 8)', () => {
    const r = con({ tecnicos: 2, ayudantes: 1, jornadas_fijadas: 1 })
    expect(r.items.find(i => i.descripcion.startsWith('Técnico'))!.cantidad).toBe(16)
    expect(r.items.find(i => i.descripcion.startsWith('Ayudante'))!.cantidad).toBe(8)
  })

  it('sin ayudantes no hay línea de ayudante', () => {
    const r = con({ ayudantes: 0 })
    expect(r.items.some(i => i.descripcion.startsWith('Ayudante'))).toBe(false)
    expect(r.items.find(i => i.descripcion.startsWith('Técnico'))!.cantidad).toBe(37)
  })

  it('método bombeo: 1,0 kg de refrigerante', () => {
    const r = con({ metodo: 'bombeo', carga_placa_kg: undefined })
    expect(porDesc(r, 'R-410A')!.cantidad).toBe(1)
    expect(r.supuestos.some(s => s.clave === 'carga_placa_kg')).toBe(false)
  })

  it('instalación: cobra solo el exceso de línea y no lleva filtro secador', () => {
    const r = cubicar(
      'hvac',
      ficha({
        tipo_trabajo: 'instalacion',
        sistema: 'split',
        refrigerante: 'R-410A',
        linea_liquido: { diametro: '3/8', largo_m: 10 },
        linea_gas: { diametro: '5/8', largo_m: 10 },
        largo_incluido_m: 5,
        unidades_interiores: 1,
        unidades_exteriores: 1,
        estado_texto: 'obra nueva',
      }),
      p
    )
    expect(porDesc(r, 'R-410A')!.cantidad).toBe(0.3)
    expect(r.items.some(i => i.categoria === 'rep')).toBe(false)
    expect(r.supuestos.some(s => s.clave === 'carga_placa_kg')).toBe(false)
    sinNaN(r)
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
