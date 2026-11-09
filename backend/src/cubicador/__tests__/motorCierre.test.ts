import { describe, it, expect } from 'vitest'
import { cubicar } from '../motor'
import { PARAMETROS_BASE, mezclarParametros } from '../params'
import type { Ficha, ItemListado, ResultadoCubicacion } from '../types'

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

const reja = (extra: Record<string, unknown> = {}) =>
  ficha({
    medidas: { largo_m: 8, alto_m: 3, puerta: { ancho_m: 0.9, alto_m: 2.2 } },
    tipo_cierre: 'reja con barrotes',
    anclaje: 'empotrado en hormigón',
    cerradura: 'mecánica',
    comuna: 'Santiago',
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
const porId = (r: ResultadoCubicacion, id: string): ItemListado | undefined =>
  r.items.find(i => i.id === id)
const cat = (r: ResultadoCubicacion, c: string) => r.items.filter(i => i.categoria === c)

describe('cierre metálico: reja 8 × 3 con puerta 0,9 × 2,2', () => {
  const r = calc(reja())

  it('calcula postes y perfil con merma y tiras (mec)', () => {
    const perfil = porId(r, 'cierre-perfil')
    expect(perfil?.categoria).toBe('mec')
    expect(perfil?.cantidad).toBe(9)
    expect(perfil?.descripcion).toContain('40x40x2')
    expect(perfil?.formula).toContain('5 postes de 3,6 m')
    expect(perfil?.formula).toContain('46,4 m')
    expect(perfil?.formula).toContain('con merma 10 % = 51,04 m')
    expect(perfil?.formula).toContain('9 tiras de 6 m')
  })

  it('calcula los barrotes 20x20 cada 0,12 m', () => {
    const b = porId(r, 'cierre-barrotes')
    expect(b?.categoria).toBe('mec')
    expect(b?.cantidad).toBe(158.4)
    expect(b?.descripcion).toContain('20x20')
    expect(b?.formula).toContain('60 barrotes de 2,4 m')
    expect(b?.formula).toContain('158,4 m')
  })

  it('pone 3 bisagras, chapa mecánica y hormigón de 0,27 m³ en mat', () => {
    expect(porId(r, 'cierre-bisagras')?.cantidad).toBe(3)
    expect(porId(r, 'cierre-chapa-mecanica')?.cantidad).toBe(1)
    const h = porId(r, 'cierre-hormigon')
    expect(h?.categoria).toBe('mat')
    expect(h?.cantidad).toBe(0.27)
  })

  it('calcula insumos en ins', () => {
    expect(porId(r, 'cierre-electrodos')).toMatchObject({ categoria: 'ins', cantidad: 2 })
    expect(porId(r, 'cierre-discos')).toMatchObject({ categoria: 'ins', cantidad: 6 })
    expect(porId(r, 'cierre-anticorrosivo')).toMatchObject({ categoria: 'ins', cantidad: 2 })
    expect(porId(r, 'cierre-esmalte')).toMatchObject({ categoria: 'ins', cantidad: 2 })
  })

  it('sin chapa eléctrica no agrega ítems ele', () => {
    expect(cat(r, 'ele')).toHaveLength(0)
    expect(r.advertencias.join(' ')).not.toMatch(/instalador/)
  })

  it('todos los ítems están pendientes de precio, con id único y cantidades finitas', () => {
    const ids = new Set(r.items.map(i => i.id))
    expect(ids.size).toBe(r.items.length)
    for (const i of r.items) {
      expect(i.estado_precio).toBe('pendiente')
      expect(i.precio_unitario).toBeNull()
      expect(i.fuente).toBeNull()
      expect(Number.isFinite(i.cantidad)).toBe(true)
      expect(i.cantidad).toBeGreaterThan(0)
    }
  })

  it('registra los valores por defecto como supuestos no críticos', () => {
    const claves = r.supuestos.map(s => s.clave)
    for (const k of [
      'separacion_postes',
      'travesanos',
      'empotrado',
      'merma',
      'barrotes',
      'bisagras',
    ]) {
      expect(claves).toContain(k)
      expect(r.supuestos.find(s => s.clave === k)?.critico).toBe(false)
    }
  })

  it('calcula la dotación del soldador sin electricista', () => {
    expect(porId(r, 'cierre-hh-soldador-tecnico')?.categoria).toBe('mo')
    expect(porId(r, 'cierre-hh-soldador-ayudante')?.categoria).toBe('mo')
    expect(cat(r, 'mo')).toHaveLength(2)
    expect(r.dotacion).not.toBeNull()
    expect(r.dotacion!.personas).toBe(2)
    expect(r.dotacion!.dias).toBeGreaterThanOrEqual(1)
  })
})

describe('cierre metálico: variantes', () => {
  it('cierre sólido reemplaza barrotes por plancha y agrega rigidizadores', () => {
    const r = calc(reja({ tipo_cierre: 'Sólido de plancha' }))
    expect(porId(r, 'cierre-barrotes')).toBeUndefined()
    const plancha = porId(r, 'cierre-plancha')
    expect(plancha?.categoria).toBe('mec')
    // (8 - 0,9) × 3 = 21,3 m² + 10 %
    expect(plancha?.cantidad).toBe(23.43)
    const rig = porId(r, 'cierre-rigidizadores')
    expect(rig?.categoria).toBe('mec')
    // 3 filas × 7,1 m = 21,3 m + 10 %
    expect(rig?.cantidad).toBe(23.43)
    expect(r.advertencias.join(' ')).toMatch(/viento/)
  })

  it('anclaje con placa: sin hormigón, con placas y pernos, y postes de 3 m', () => {
    const r = calc(reja({ anclaje: 'placa con pernos sobre sardinel' }))
    expect(porId(r, 'cierre-hormigon')).toBeUndefined()
    expect(porId(r, 'cierre-placas')).toMatchObject({ categoria: 'mec', cantidad: 5 })
    expect(porId(r, 'cierre-pernos')).toMatchObject({ categoria: 'mec', cantidad: 20 })
    expect(porId(r, 'cierre-perfil')?.formula).toContain('5 postes de 3 m')
    expect(r.supuestos.map(s => s.clave)).not.toContain('empotrado')
  })

  it('largo que no divide exacto: 7 m -> ceil(7/2)+1 postes', () => {
    const r = calc(reja({ medidas: { largo_m: 7, alto_m: 3 } }))
    expect(porId(r, 'cierre-perfil')?.formula).toContain('5 postes de 3,6 m')
    const r2 = calc(reja({ medidas: { largo_m: 7.5, alto_m: 3 } }))
    expect(porId(r2, 'cierre-perfil')?.formula).toContain('5 postes')
    const r3 = calc(reja({ medidas: { largo_m: 9, alto_m: 3 } }))
    expect(porId(r3, 'cierre-perfil')?.formula).toContain('6 postes')
  })

  it('sin puerta: sin marco, bisagras ni chapa, y todo el largo en travesaños', () => {
    const r = calc(reja({ medidas: { largo_m: 8, alto_m: 3 } }))
    expect(porId(r, 'cierre-bisagras')).toBeUndefined()
    expect(porId(r, 'cierre-chapa-mecanica')).toBeUndefined()
    const f = porId(r, 'cierre-perfil')?.formula ?? ''
    expect(f).not.toContain('marco')
    expect(f).toContain('3 travesaños de 8 m')
    // 5 × 3,6 + 3 × 8 = 42 m; con merma 46,2 m -> 8 tiras
    expect(porId(r, 'cierre-perfil')?.cantidad).toBe(8)
  })

  it('acepta las medidas como texto "8 x 3 m"', () => {
    const r = calc(reja({ medidas: '8 x 3 m' }))
    expect(porId(r, 'cierre-perfil')?.formula).toContain('5 postes de 3,6 m')
  })

  it('dos hojas duplican bisagras y chapas', () => {
    const r = calc(
      reja({ medidas: { largo_m: 8, alto_m: 3, puerta: { ancho_m: 1.8, alto_m: 2.2, hojas: 2 } } })
    )
    expect(porId(r, 'cierre-bisagras')?.cantidad).toBe(6)
    expect(porId(r, 'cierre-chapa-mecanica')?.cantidad).toBe(2)
  })

  it('respeta la separación de postes indicada y no la registra como supuesto', () => {
    const r = calc(reja({ separacion_postes_m: 1.5 }))
    expect(porId(r, 'cierre-perfil')?.formula).toContain('7 postes')
    expect(r.supuestos.map(s => s.clave)).not.toContain('separacion_postes')
  })

  it('usa los parámetros mezclados desde la base', () => {
    const pp = mezclarParametros(p, [{ clave: 'cierre', valor: { merma_pct: 20 } }])
    const r = cubicar('cierre_metalico', reja(), pp)
    expect(porId(r, 'cierre-perfil')?.formula).toContain('con merma 20 % = 55,68 m')
  })
})

describe('cierre metálico: acceso eléctrico', () => {
  const r = calc(rejaElectrica())

  it('cable 36 m, cañería 25 m y 2 cámaras en ele', () => {
    expect(porId(r, 'acceso-cable')).toMatchObject({ categoria: 'ele', cantidad: 36 })
    expect(porId(r, 'acceso-caneria')).toMatchObject({ categoria: 'ele', cantidad: 25 })
    expect(porId(r, 'acceso-camaras')).toMatchObject({ categoria: 'ele', cantidad: 2 })
  })

  it('automático y diferencial 1 + 1, chapa eléctrica y fuente de poder en ele', () => {
    expect(porId(r, 'acceso-automatico')).toMatchObject({ categoria: 'ele', cantidad: 1 })
    expect(porId(r, 'acceso-diferencial')).toMatchObject({ categoria: 'ele', cantidad: 1 })
    expect(porId(r, 'acceso-chapa-electrica')).toMatchObject({ categoria: 'ele', cantidad: 1 })
    expect(porId(r, 'acceso-fuente-poder')).toMatchObject({ categoria: 'ele', cantidad: 1 })
    expect(porId(r, 'acceso-citofono')).toMatchObject({ categoria: 'ele', cantidad: 1 })
    expect(porId(r, 'acceso-boton')).toMatchObject({ categoria: 'ele', cantidad: 1 })
    expect(porId(r, 'cierre-chapa-mecanica')).toBeUndefined()
  })

  it('toda la parte eléctrica queda en ele y la mecánica no', () => {
    for (const i of r.items.filter(x => x.id.startsWith('acceso-') && !x.id.includes('-hh-'))) {
      expect(i.categoria).toBe('ele')
    }
    for (const i of r.items.filter(x => x.id.startsWith('cierre-') && !x.id.includes('-hh-'))) {
      expect(i.categoria).not.toBe('ele')
    }
  })

  it('la dotación incluye soldador y electricista', () => {
    const mo = cat(r, 'mo').map(i => i.descripcion)
    expect(mo).toEqual(
      expect.arrayContaining([
        'Soldador / armador',
        'Ayudante de soldador',
        'Electricista',
        'Ayudante de electricista',
      ])
    )
    const solo = calc(reja())
    expect(r.dotacion!.dias).toBeGreaterThan(solo.dotacion!.dias)
    expect(r.dotacion!.hh_calculadas).toBeGreaterThan(solo.dotacion!.hh_calculadas)
  })

  it('la tramitación no aparece en ningún ítem; solo se advierte', () => {
    for (const i of r.items) {
      expect(`${i.descripcion} ${i.formula}`).not.toMatch(/tramit|SEC\b|declaraci/i)
    }
    expect(r.advertencias.join(' ')).toMatch(/instalador eléctrico autorizado/)
  })

  it('chapa_electrica=true sin cerradura equivale a chapa eléctrica', () => {
    const f = reja({ cerradura: undefined, chapa_electrica: true, distancia_tablero_m: 12 })
    const x = calc(f)
    expect(porId(x, 'acceso-chapa-electrica')).toBeDefined()
    expect(porId(x, 'cierre-chapa-mecanica')).toBeUndefined()
    // 12 m -> una cámara
    expect(porId(x, 'acceso-camaras')?.cantidad).toBe(1)
    expect(x.supuestos.map(s => s.clave)).not.toContain('cerradura')
  })

  it('canalización sobrepuesta: cañería sin cámaras; aérea: solo cable', () => {
    const a = calc(rejaElectrica({ canalizacion: 'sobrepuesta' }))
    expect(porId(a, 'acceso-caneria')).toBeDefined()
    expect(porId(a, 'acceso-camaras')).toBeUndefined()
    const b = calc(rejaElectrica({ canalizacion: 'aérea' }))
    expect(porId(b, 'acceso-cable')).toBeDefined()
    expect(porId(b, 'acceso-caneria')).toBeUndefined()
  })

  it('distancia desconocida: omite cable y canalización con supuesto crítico', () => {
    const x = calc(rejaElectrica({ distancia_tablero_m: undefined }))
    expect(porId(x, 'acceso-cable')).toBeUndefined()
    expect(porId(x, 'acceso-caneria')).toBeUndefined()
    expect(porId(x, 'acceso-automatico')).toBeDefined()
    const s = x.supuestos.find(y => y.clave === 'distancia_tablero')
    expect(s?.critico).toBe(true)
    expect(x.advertencias.join(' ')).toMatch(/distancia al tablero/)
  })

  it('canalización omitida con distancia: se asume enterrada con supuesto crítico', () => {
    const x = calc(rejaElectrica({ canalizacion: undefined }))
    expect(porId(x, 'acceso-camaras')?.cantidad).toBe(2)
    expect(x.supuestos.find(y => y.clave === 'canalizacion')?.critico).toBe(true)
  })

  it('la alimentación de la chapa eléctrica es un supuesto crítico', () => {
    expect(r.supuestos.find(s => s.clave === 'alimentacion')?.critico).toBe(true)
  })

  it('chapa eléctrica sin puerta: no hay ítems ele y se advierte', () => {
    const x = calc(rejaElectrica({ medidas: { largo_m: 8, alto_m: 3 } }))
    expect(cat(x, 'ele')).toHaveLength(0)
    expect(x.advertencias.join(' ')).toMatch(/no tiene puerta/)
  })
})

describe('cierre metálico: lo que el usuario no sabe', () => {
  it('anclaje no_sabe: asume empotrado con supuesto crítico', () => {
    const r = calc(ficha({ ...reja().datos, anclaje: undefined }, ['anclaje']))
    expect(porId(r, 'cierre-hormigon')).toBeDefined()
    expect(r.supuestos.find(s => s.clave === 'anclaje')?.critico).toBe(true)
  })

  it('anclaje con texto "no sé" dentro de no_sabe no provoca 422', () => {
    const r = calc(ficha({ ...reja().datos, anclaje: 'no sé' }, ['anclaje']))
    expect(r.supuestos.find(s => s.clave === 'anclaje')?.critico).toBe(true)
  })

  it('tipo_cierre y cerradura desconocidos: reja y chapa mecánica con supuestos críticos', () => {
    const r = calc(
      ficha({ ...reja().datos, tipo_cierre: undefined, cerradura: undefined }, [
        'tipo_cierre',
        'cerradura',
      ])
    )
    expect(porId(r, 'cierre-barrotes')).toBeDefined()
    expect(porId(r, 'cierre-chapa-mecanica')).toBeDefined()
    for (const k of ['tipo_cierre', 'cerradura']) {
      expect(r.supuestos.find(s => s.clave === k)?.critico).toBe(true)
    }
  })

  it('medidas no_sabe: sin ítems mec, con supuesto crítico y advertencia, sin inventar', () => {
    const r = calc(ficha({ ...reja().datos, medidas: undefined }, ['medidas']))
    expect(r.items).toHaveLength(0)
    expect(r.dotacion).toBeNull()
    expect(r.supuestos.find(s => s.clave === 'medidas')?.critico).toBe(true)
    expect(r.advertencias.join(' ')).toMatch(/medidas/)
  })

  it('medidas no_sabe con chapa eléctrica: solo ele (1 hoja supuesta) y su dotación', () => {
    const r = calc(ficha({ ...rejaElectrica().datos, medidas: undefined }, ['medidas']))
    expect(cat(r, 'mec')).toHaveLength(0)
    expect(cat(r, 'mat')).toHaveLength(0)
    expect(porId(r, 'acceso-chapa-electrica')?.cantidad).toBe(1)
    expect(r.supuestos.find(s => s.clave === 'hojas_acceso')?.critico).toBe(true)
    expect(r.dotacion).not.toBeNull()
  })

  it('medidas ausente (sin no_sabe) tampoco da 422', () => {
    const r = calc(ficha({ tipo_cierre: 'reja' }))
    expect(r.items).toHaveLength(0)
  })
})

describe('cierre metálico: datos inválidos -> 422', () => {
  const malos: [string, unknown, string][] = [
    ['largo cero', { largo_m: 0, alto_m: 3 }, 'medidas.largo_m'],
    ['largo negativo', { largo_m: -8, alto_m: 3 }, 'medidas.largo_m'],
    ['alto NaN', { largo_m: 8, alto_m: Number.NaN }, 'medidas.alto_m'],
    ['alto texto', { largo_m: 8, alto_m: 'tres' }, 'medidas.alto_m'],
    ['alto cero', { largo_m: 8, alto_m: 0 }, 'medidas.alto_m'],
    ['largo infinito', { largo_m: Infinity, alto_m: 3 }, 'medidas.largo_m'],
    ['falta el alto', { largo_m: 8 }, 'medidas.alto_m'],
    [
      'puerta con ancho negativo',
      { largo_m: 8, alto_m: 3, puerta: { ancho_m: -1, alto_m: 2 } },
      'medidas.puerta.ancho_m',
    ],
    [
      'puerta más ancha que el cierre',
      { largo_m: 1, alto_m: 3, puerta: { ancho_m: 1, alto_m: 2 } },
      'medidas.puerta.ancho_m',
    ],
    [
      'puerta más alta que el cierre',
      { largo_m: 8, alto_m: 2, puerta: { ancho_m: 1, alto_m: 2.5 } },
      'medidas.puerta.alto_m',
    ],
    ['alto menor al recorte del barrote', { largo_m: 8, alto_m: 0.5 }, 'medidas.alto_m'],
  ]
  for (const [nombre, medidas, campo] of malos) {
    it(`${nombre} lanza 422 nombrando ${campo}`, () => {
      const e = fallo(() => calc(reja({ medidas })))
      expect(e.status).toBe(422)
      expect(e.message).toContain(`"${campo}"`)
    })
  }

  // F6: en texto libre un valor no válido es medida desconocida (no 422): el motor no inventa.
  it('medidas como texto con cero se tratan como desconocidas, sin 422', () => {
    const r = calc(reja({ medidas: '0 x 3' }))
    expect(r.items.find(i => i.id === 'cierre-perfil')).toBeUndefined()
  })

  it('tipo_cierre que no es texto lanza 422 con los valores válidos', () => {
    const t = fallo(() => calc(reja({ tipo_cierre: 42 })))
    expect(t.status).toBe(422)
    expect(t.message).toContain('tipo_cierre')
    expect(t.message).toContain('reja, solido')
  })

  it('anclaje y cerradura desconocidos lanzan 422 con los valores válidos', () => {
    const a = fallo(() => calc(reja({ anclaje: 'pegamento' })))
    expect(a.message).toContain('empotrado, placa')
    const c = fallo(() => calc(reja({ cerradura: 'huella' })))
    expect(c.message).toContain('mecanica, electrica, candado')
  })

  it('distancia al tablero inválida lanza 422', () => {
    for (const v of [0, -5, 'lejos', Number.NaN]) {
      const e = fallo(() => calc(rejaElectrica({ distancia_tablero_m: v })))
      expect(e.status).toBe(422)
      expect(e.message).toContain('"distancia_tablero_m"')
    }
  })

  it('parámetros de cierre inválidos lanzan 422', () => {
    const malo = { ...p, cierre: { ...p.cierre, separacion_postes_m: Number.NaN } }
    const e = fallo(() => cubicar('cierre_metalico', reja(), malo))
    expect(e.status).toBe(422)
    expect(e.message).toContain('separacion_postes_m')
  })
})
