import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Pool } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cubicar } from '../motor'
import { PARAMETROS_BASE } from '../params'
import { borradorBase, fakeBd, FICHA_VRF } from './fakeBd'
import { conservarPrecios, ejecutarCubicacion } from '../ejecutar'
import { coincidenciaCatalogo, PLAZO_TIENDAS_MS, resolverPrecios, TIENDAS_RETAIL } from '../precios'
import type { ItemListado, ResultadoCubicacion } from '../types'
import type { PriceLookupResult } from '../../services/chatbotOps'

vi.mock('../../services/chatbotOps', async () => {
  const actual = await vi.importActual<typeof import('../../services/chatbotOps')>(
    '../../services/chatbotOps'
  )
  return { ...actual, lookupMaterialPrice: vi.fn() }
})
import { lookupMaterialPrice } from '../../services/chatbotOps'
const lookup = vi.mocked(lookupMaterialPrice)

const CTX = { instruction: 'cubicador: precios', userId: 'u1', llmProvider: 'gemini' }

interface FilaCatalogo {
  description: string
  unit_name: string
  unit_price: string
}
interface NodoGrafo {
  last_price: number
  last_price_at: string
}

function item(id: string, over: Partial<ItemListado> = {}): ItemListado {
  return {
    id,
    categoria: 'mat',
    descripcion: `Material ${id}`,
    unidad: 'un',
    cantidad: 2,
    dias: 1,
    formula: '',
    precio_unitario: null,
    fuente: null,
    estado_precio: 'pendiente',
    ...over,
  }
}

function resultado(items: ItemListado[]): ResultadoCubicacion {
  return { items, supuestos: [], advertencias: [], dotacion: null }
}

// Pool falso: borradores en memoria + catálogos + memoria de precios del grafo.
function armar(
  items: ItemListado[],
  extra: {
    catalogo?: FilaCatalogo[]
    electrico?: FilaCatalogo[]
    nodos?: Record<string, NodoGrafo>
  } = {}
) {
  const bd = fakeBd([borradorBase({ estado: 'cubicado', resultado: resultado(items) })])
  const base = bd.pool.query
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM electrical_catalog_items'))
      return { rows: extra.electrico ?? [], rowCount: 0 }
    if (sql.includes('FROM catalog_items')) return { rows: extra.catalogo ?? [], rowCount: 0 }
    if (sql.includes('FROM chatbot_graph_nodes')) {
      const nodo = extra.nodos?.[params[0] as string]
      return { rows: nodo ? [{ id: params[0], properties: nodo }] : [], rowCount: 0 }
    }
    return base(sql, params)
  })
  const pool = { query } as unknown as Pool
  return { pool, filas: bd.filas, query }
}

const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

function respuesta(
  muestras: PriceLookupResult['muestras'],
  precio_medio = muestras[0]?.precio ?? 0
): PriceLookupResult {
  return { material: 'x', precio_medio, muestras, notas: [], reply: '' }
}

const muestra = (precio: number, tienda = 'Sodimac', url = 'https://sodimac.cl/p') => ({
  precio,
  tienda,
  fuente_url: url,
})

async function falla(p: Promise<unknown>): Promise<{ status?: number; message: string }> {
  try {
    await p
  } catch (e) {
    return e as { status?: number; message: string }
  }
  throw new Error('no lanzó')
}

describe('resolverPrecios', () => {
  beforeEach(() => {
    lookup.mockReset()
  })

  it('catálogo primero, sin LLM', async () => {
    const { pool, filas } = armar([item('a', { descripcion: 'Tubo de cobre 3/8', unidad: 'm' })], {
      catalogo: [{ description: 'Tubo de cobre 3/8', unit_name: 'm', unit_price: '4500' }],
    })
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(lookup).not.toHaveBeenCalled()
    const it0 = estado.resultado?.items[0]
    expect(it0).toMatchObject({
      precio_unitario: 4500,
      fuente: 'catalogo',
      estado_precio: 'con_precio',
    })
    expect(estado.precios_pendientes).toBe(0)
    expect(filas.get('b1')?.version).toBe(2)
  })

  it('las horas hombre salen del catálogo (Técnico y Ayudante HVAC)', async () => {
    const { pool } = armar(
      [
        item('t', { categoria: 'mo', descripcion: 'Técnico Especializado HVAC', unidad: 'Hora' }),
        item('y', { categoria: 'mo', descripcion: 'Ayudante Técnico HVAC', unidad: 'Hora' }),
      ],
      {
        catalogo: [
          { description: 'Técnico Especializado HVAC', unit_name: 'Hora', unit_price: '12000' },
          { description: 'Ayudante Técnico HVAC', unit_name: 'Hora', unit_price: '7000' },
        ],
      }
    )
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(estado.resultado?.items.map(i => i.precio_unitario)).toEqual([12000, 7000])
    expect(lookup).not.toHaveBeenCalled()
  })

  it('también usa el catálogo eléctrico', async () => {
    const { pool } = armar([item('e', { descripcion: 'Cable THHN 12 AWG', unidad: 'm' })], {
      electrico: [{ description: 'Cable THHN 12 AWG', unit_name: 'm', unit_price: '900' }],
    })
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(estado.resultado?.items[0]).toMatchObject({ precio_unitario: 900, fuente: 'catalogo' })
  })

  it('caché de 10 días sirve, de 30 no', async () => {
    const reciente = armar([item('a', { descripcion: 'Soldadura plata' })], {
      nodos: { 'material:soldadura-plata': { last_price: 8000, last_price_at: dias(10) } },
    })
    lookup.mockResolvedValue(respuesta([]))
    const ok = await resolverPrecios(reciente.pool, 'b1', 'u1', CTX)
    expect(ok.resultado?.items[0]).toMatchObject({ precio_unitario: 8000, fuente: 'cache' })
    expect(lookup).not.toHaveBeenCalled()

    const vieja = armar([item('a', { descripcion: 'Soldadura plata' })], {
      nodos: { 'material:soldadura-plata': { last_price: 8000, last_price_at: dias(30) } },
    })
    const viejo = await resolverPrecios(vieja.pool, 'b1', 'u1', CTX)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(viejo.resultado?.items[0].fuente).not.toBe('cache')
  })

  it('lote de máximo 3 y precios_pendientes baja hasta 0 en varias llamadas', async () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => item(id))
    const { pool } = armar(items)
    lookup.mockResolvedValue(respuesta([muestra(1000)]))

    const e1 = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(e1.precios_pendientes).toBe(4)
    const e2 = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(lookup).toHaveBeenCalledTimes(6)
    expect(e2.precios_pendientes).toBe(1)
    const e3 = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(lookup).toHaveBeenCalledTimes(7)
    expect(e3.precios_pendientes).toBe(0)
    // Sin pendientes ya no hay trabajo ni llamadas.
    await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(lookup).toHaveBeenCalledTimes(7)
  })

  it('la búsqueda pide solo las 4 tiendas retail con timeout de 15 s', async () => {
    const { pool } = armar([item('a')])
    lookup.mockResolvedValue(respuesta([muestra(1000)]))
    await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(lookup.mock.calls[0][1]).toBe('Material a')
    expect(lookup.mock.calls[0][3]).toEqual({ timeoutMs: 15_000, tiendas: TIENDAS_RETAIL })
    expect(TIENDAS_RETAIL).toEqual(['Sodimac', 'Easy', 'Imperial', 'Punto Maestro'])
  })

  it('una tienda que falla deja sin_precio y no tumba el lote', async () => {
    const { pool } = armar([item('a'), item('b'), item('c')])
    lookup.mockImplementation(async (_p, material) => {
      if (material === 'Material b') throw new Error('timeout')
      return respuesta([muestra(500, 'Easy', 'https://easy.cl/x')])
    })
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    const [a, b, c] = estado.resultado?.items ?? []
    expect(a).toMatchObject({ estado_precio: 'con_precio', fuente: 'tienda', tienda: 'Easy' })
    expect(b).toMatchObject({ estado_precio: 'sin_precio', precio_unitario: null, fuente: null })
    expect(c.estado_precio).toBe('con_precio')
    expect(estado.precios_pendientes).toBe(0)
  })

  it('un precio 0 o sin muestras deja sin_precio (nunca inventa)', async () => {
    const { pool } = armar([item('a'), item('b')])
    lookup.mockResolvedValueOnce(respuesta([muestra(0)], 0)).mockResolvedValueOnce(respuesta([], 0))
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(estado.resultado?.items.map(i => i.estado_precio)).toEqual(['sin_precio', 'sin_precio'])
    expect(estado.resultado?.items.every(i => i.precio_unitario === null)).toBe(true)
  })

  it('R-404A sin catálogo ni caché queda sin_precio, sin llamar tiendas', async () => {
    const { pool } = armar([
      item('hvac-refrigerante', {
        categoria: 'ins',
        descripcion: 'Gas Refrigerante R-404A',
        unidad: 'kg',
      }),
      item('hvac-nitrogeno', {
        categoria: 'ins',
        descripcion: 'Nitrógeno N2 Industrial',
        unidad: 'm3',
      }),
      item('hvac-hh-tecnico', { categoria: 'mo', descripcion: 'Técnico Especializado HVAC' }),
    ])
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(lookup).not.toHaveBeenCalled()
    expect(estado.resultado?.items.map(i => i.estado_precio)).toEqual([
      'sin_precio',
      'sin_precio',
      'sin_precio',
    ])
    expect(estado.precios_pendientes).toBe(0)
  })

  it('el gas con caché vigente sí usa la caché', async () => {
    const { pool } = armar(
      [item('hvac-refrigerante', { categoria: 'ins', descripcion: 'Gas Refrigerante R-410A' })],
      {
        nodos: {
          'material:gas-refrigerante-r-410a': { last_price: 95000, last_price_at: dias(3) },
        },
      }
    )
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(estado.resultado?.items[0]).toMatchObject({ precio_unitario: 95000, fuente: 'cache' })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('elige la muestra más barata válida', async () => {
    const { pool } = armar([item('a')])
    lookup.mockResolvedValue(
      respuesta([
        muestra(900, 'Sodimac', 'https://sodimac.cl/a'),
        muestra(700, 'Imperial', 'https://imperial.cl/b'),
        muestra(800, 'Easy', 'https://easy.cl/c'),
      ])
    )
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(estado.resultado?.items[0]).toMatchObject({
      precio_unitario: 700,
      tienda: 'Imperial',
      fuente_url: 'https://imperial.cl/b',
      fuente: 'tienda',
    })
  })

  it('una URL javascript: se descarta', async () => {
    const { pool } = armar([item('a')])
    lookup.mockResolvedValue(
      respuesta([
        muestra(100, 'Sodimac', 'javascript:alert(1)'),
        muestra(900, 'Easy', 'https://easy.cl/ok'),
      ])
    )
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(estado.resultado?.items[0]).toMatchObject({ precio_unitario: 900, tienda: 'Easy' })
  })

  it('una muestra de otra tienda se descarta', async () => {
    const { pool } = armar([item('a'), item('b')])
    lookup
      .mockResolvedValueOnce(respuesta([muestra(100, 'MercadoLibre', 'https://ml.cl/x')]))
      .mockResolvedValueOnce(
        respuesta([
          muestra(100, 'Construmart', 'https://c.cl/x'),
          muestra(600, 'Punto Maestro', 'https://www.puntomaestro.cl/x'),
        ])
      )
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    const [a, b] = estado.resultado?.items ?? []
    expect(a.estado_precio).toBe('sin_precio')
    expect(b).toMatchObject({ precio_unitario: 600, tienda: 'Punto Maestro' })
  })

  it('borrador ajeno da 404 y uno no cubicado da 409', async () => {
    const ajeno = armar([item('a')])
    expect((await falla(resolverPrecios(ajeno.pool, 'b1', 'otro', CTX))).status).toBe(404)

    const bd = fakeBd([borradorBase({ ficha: FICHA_VRF, estado: 'entrevista' })])
    expect((await falla(resolverPrecios(bd.pool, 'b1', 'u1', CTX))).status).toBe(409)
  })

  it('si el borrador cambió durante la búsqueda, reintenta una vez sobre la versión nueva', async () => {
    const { pool, filas } = armar([item('a'), item('b')])
    lookup.mockImplementation(async () => {
      // Otro cambio sube la versión mientras se consulta a las tiendas.
      const b = filas.get('b1')
      if (b && b.version === 1) filas.set('b1', { ...b, version: 2 })
      return respuesta([muestra(1000)])
    })
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    expect(estado.precios_pendientes).toBe(0)
    expect(filas.get('b1')?.version).toBe(3)
  })
})

describe('conservar precios al recalcular', () => {
  afterEach(() => vi.restoreAllMocks())

  it('un ajuste no borra los precios resueltos de ítems sin cambios', () => {
    const resuelto = item('a', {
      cantidad: 2,
      precio_unitario: 700,
      fuente: 'tienda',
      tienda: 'Easy',
      fuente_url: 'https://easy.cl/x',
      estado_precio: 'con_precio',
    })
    const cambiado = item('b', {
      cantidad: 5,
      precio_unitario: 300,
      estado_precio: 'con_precio',
      fuente: 'catalogo',
    })
    const nuevos = [item('a', { cantidad: 2 }), item('b', { cantidad: 9 }), item('c')]
    const salida = conservarPrecios(nuevos, [resuelto, cambiado])
    expect(salida[0]).toMatchObject({
      precio_unitario: 700,
      fuente: 'tienda',
      tienda: 'Easy',
      fuente_url: 'https://easy.cl/x',
      estado_precio: 'con_precio',
    })
    // Cantidad distinta: se recalcula y vuelve a pendiente.
    expect(salida[1]).toMatchObject({ precio_unitario: null, estado_precio: 'pendiente' })
    expect(salida[2].estado_precio).toBe('pendiente')
  })

  it('cubicar de nuevo un borrador ya cubicado no descarta los precios resueltos', async () => {
    const { pool, filas } = fakeBd([borradorBase({ ficha: FICHA_VRF })])
    const primero = await ejecutarCubicacion(pool, 'b1', 'u1')
    const items = primero.resultado?.items ?? []
    expect(items.length).toBeGreaterThan(1)
    const primerId = items[0].id
    const resueltos = items.map((i, n) =>
      n === 0
        ? {
            ...i,
            precio_unitario: 1234,
            fuente: 'tienda' as const,
            tienda: 'Sodimac',
            fuente_url: 'https://sodimac.cl/p',
            estado_precio: 'con_precio' as const,
          }
        : i
    )
    const b = filas.get('b1')
    if (b?.resultado) filas.set('b1', { ...b, resultado: { ...b.resultado, items: resueltos } })

    const segundo = await ejecutarCubicacion(pool, 'b1', 'u1')
    const igual = segundo.resultado?.items.find(i => i.id === primerId)
    expect(igual).toMatchObject({
      precio_unitario: 1234,
      fuente: 'tienda',
      tienda: 'Sodimac',
      fuente_url: 'https://sodimac.cl/p',
      estado_precio: 'con_precio',
    })
    expect(segundo.precios_pendientes).toBe(items.length - 1)
  })
})

describe('coincidenciaCatalogo', () => {
  const fila = (description: string, unit_name: string, id = description) => ({
    id,
    description,
    unit_name,
    unit_price: '100',
    category_id: null,
  })
  const buscar = (descripcion: string, unidad: string, filas: ReturnType<typeof fila>[]) =>
    coincidenciaCatalogo({ descripcion, unidad }, filas)

  it('acepta la igualdad exacta', () => {
    const f = fila('Tubo de cobre 3/8', 'm')
    expect(buscar('Tubo de cobre 3/8', 'm', [f])).toBe(f)
  })

  it('rechaza un diámetro distinto', () => {
    expect(buscar('Tubo de cobre 3/8', 'm', [fila('Tubo de cobre 1/2', 'm')])).toBeNull()
  })

  it('una fila genérica corta («Gas») no calza con un objetivo más largo y distinto', () => {
    expect(buscar('Gasfitería soldadura de plata', 'un', [fila('Gas', 'un')])).toBeNull()
    expect(buscar('Gas Refrigerante R-410A', 'kg', [fila('Gas', 'kg')])).toBeNull()
  })

  it('rechaza una unidad incompatible (kg vs Rec, Hora vs Día)', () => {
    expect(
      buscar('Gas Refrigerante R-410A', 'kg', [fila('Gas Refrigerante R-410A', 'Rec')])
    ).toBeNull()
    expect(
      buscar('Técnico Especializado HVAC', 'Hora', [fila('Técnico Especializado HVAC', 'Día')])
    ).toBeNull()
  })

  it('acepta alias de unidad (hr, kilos, m³, balón, mts)', () => {
    expect(buscar('Técnico HVAC', 'Hora', [fila('Técnico HVAC', 'hr')])).not.toBeNull()
    expect(buscar('Gas R-410A', 'kg', [fila('Gas R-410A', 'Kilos')])).not.toBeNull()
    expect(
      buscar('Nitrógeno N2 Industrial', 'm3', [fila('Nitrógeno N2 Industrial', 'm³')])
    ).not.toBeNull()
    expect(buscar('Gas R-410A', 'Rec', [fila('Gas R-410A', 'Balón')])).not.toBeNull()
    expect(buscar('Cable THHN', 'm', [fila('Cable THHN', 'mts')])).not.toBeNull()
  })

  it('R-404A no calza con R-410A y r404a equivale a R-404A', () => {
    expect(
      buscar('Gas Refrigerante R-404A', 'kg', [fila('Gas Refrigerante R-410A', 'kg')])
    ).toBeNull()
    expect(
      buscar('Gas Refrigerante R-404A', 'kg', [fila('Gas Refrigerante r404a', 'kg')])
    ).not.toBeNull()
  })

  it('elige la mejor fila, no la primera', () => {
    const generica = fila('Tubo de cobre rígido', 'm', 'generica')
    const mejor = fila('Tubo de cobre rígido tipo L', 'm', 'mejor')
    const larga = fila('Tubo de cobre rígido tipo L tira', 'm', 'larga')
    expect(buscar('Tubo de cobre rígido tipo L', 'm', [generica, larga, mejor])).toBe(mejor)
  })

  it('si la mejor fila tiene otra unidad usa la siguiente compatible', () => {
    const mala = fila('Tubo de cobre 3/8', 'Tir', 'mala')
    const buena = fila('Tubo cobre 3/8 pulgada', 'm', 'buena')
    expect(buscar('Tubo de cobre 3/8', 'm', [mala, buena])).toBe(buena)
  })
})

describe('muestras: dominio de la tienda', () => {
  beforeEach(() => lookup.mockReset())

  const resolverCon = async (m: { precio: number; tienda: string; fuente_url: string }[]) => {
    const { pool } = armar([item('a')])
    lookup.mockResolvedValue(respuesta(m))
    return (await resolverPrecios(pool, 'b1', 'u1', CTX)).resultado?.items[0]
  }

  it('etiqueta Sodimac con un dominio ajeno se rechaza', async () => {
    const it0 = await resolverCon([muestra(100, 'Sodimac', 'https://sodimac.cl.estafa.com/p')])
    expect(it0?.estado_precio).toBe('sin_precio')
  })

  it('acepta un subdominio (www.sodimac.cl) y guarda el nombre canónico', async () => {
    const it0 = await resolverCon([muestra(100, 'Sodimac Homecenter', 'https://www.sodimac.cl/p')])
    expect(it0).toMatchObject({ tienda: 'Sodimac', precio_unitario: 100 })
  })

  it('etiqueta equivocada con el host correcto usa la tienda del host', async () => {
    const it0 = await resolverCon([muestra(100, 'Sodimac', 'https://www.easy.cl/p')])
    expect(it0).toMatchObject({ tienda: 'Easy', precio_unitario: 100 })
  })

  it('una URL inválida se rechaza', async () => {
    const it0 = await resolverCon([muestra(100, 'Easy', 'https://')])
    expect(it0?.estado_precio).toBe('sin_precio')
  })

  it('el host no distingue mayúsculas', async () => {
    const it0 = await resolverCon([muestra(100, 'imperial', 'HTTPS://WWW.IMPERIAL.CL/P')])
    expect(it0).toMatchObject({ tienda: 'Imperial' })
  })
})

describe('plazo duro de la etapa de tiendas', () => {
  beforeEach(() => {
    lookup.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('coincide con el presupuesto de reloj del agente', async () => {
    const { WALL_CLOCK_BUDGET_MS } = await import('../../agent/loop')
    expect(PLAZO_TIENDAS_MS).toBe(WALL_CLOCK_BUDGET_MS)
  })

  it('al vencer deja pendientes los ítems sin respuesta y guarda lo resuelto', async () => {
    const { pool } = armar([item('a'), item('b')])
    lookup.mockImplementation(async (_p, material) => {
      if (material === 'Material b') return new Promise<PriceLookupResult>(() => {})
      return respuesta([muestra(300)])
    })
    const promesa = resolverPrecios(pool, 'b1', 'u1', CTX)
    await vi.advanceTimersByTimeAsync(PLAZO_TIENDAS_MS + 1)
    const estado = await promesa
    const [a, b] = estado.resultado?.items ?? []
    expect(a).toMatchObject({ estado_precio: 'con_precio', precio_unitario: 300 })
    expect(b.estado_precio).toBe('pendiente')
    expect(estado.precios_pendientes).toBe(1)
  })
})

describe('re-cubicar conserva los ajustes manuales', () => {
  it('lo quitado sigue quitado, lo manual sigue manual y el precio resuelto se mantiene', async () => {
    const { pool, filas } = fakeBd([borradorBase({ ficha: FICHA_VRF })])
    const primero = await ejecutarCubicacion(pool, 'b1', 'u1')
    const items = primero.resultado?.items ?? []
    expect(items.length).toBeGreaterThan(3)
    const [quitado, manualCantidad, manualPrecio, resuelto] = items

    const b = filas.get('b1')
    if (!b?.resultado) throw new Error('sin borrador')
    filas.set('b1', {
      ...b,
      ficha: {
        ...b.ficha,
        datos: {
          ...b.ficha.datos,
          ajustes_listado: {
            quitar: [quitado.id],
            cantidades: { [manualCantidad.id]: 77 },
            precios: { [manualPrecio.id]: { precio_unitario: 555, tienda: 'Taller' } },
          },
        },
      },
      resultado: {
        ...b.resultado,
        items: b.resultado.items.map(i =>
          i.id === resuelto.id
            ? {
                ...i,
                precio_unitario: 999,
                fuente: 'catalogo' as const,
                estado_precio: 'con_precio' as const,
              }
            : i
        ),
      },
    })

    const segundo = await ejecutarCubicacion(pool, 'b1', 'u1')
    const nuevos = segundo.resultado?.items ?? []
    expect(nuevos.find(i => i.id === quitado.id)).toBeUndefined()
    expect(nuevos.find(i => i.id === manualCantidad.id)?.cantidad).toBe(77)
    expect(nuevos.find(i => i.id === manualPrecio.id)).toMatchObject({
      precio_unitario: 555,
      tienda: 'Taller',
      estado_precio: 'con_precio',
    })
    expect(nuevos.find(i => i.id === resuelto.id)).toMatchObject({
      precio_unitario: 999,
      fuente: 'catalogo',
    })
  })
})

describe('coincidenciaCatalogo: contención', () => {
  const fila = (description: string, unit_name: string) => ({
    id: description,
    description,
    unit_name,
    unit_price: '100',
    category_id: null,
  })

  it('acepta «Refrigerante R-410A» contra la fila «Refrigerante R-410a»', () => {
    const f = fila('Refrigerante R-410a', 'Kg')
    expect(coincidenciaCatalogo({ descripcion: 'Refrigerante R-410A', unidad: 'kg' }, [f])).toBe(f)
  })

  it('la fila corta contenida en una descripción más larga calza (Nitrógeno N2)', () => {
    const f = fila('Nitrógeno N2', 'Rec')
    expect(
      coincidenciaCatalogo({ descripcion: 'Nitrógeno N2 Industrial', unidad: 'Rec' }, [f])
    ).toBe(f)
  })

  it('rechaza R-404A contra una fila R-410a aunque el resto esté contenido', () => {
    const f = fila('Refrigerante R-410a', 'Kg')
    expect(
      coincidenciaCatalogo({ descripcion: 'Refrigerante R-404A', unidad: 'kg' }, [f])
    ).toBeNull()
  })

  it('«Gas» solo no calza con nada más largo', () => {
    const f = fila('Gas', 'kg')
    expect(
      coincidenciaCatalogo({ descripcion: 'Gas Refrigerante R-410A', unidad: 'kg' }, [f])
    ).toBeNull()
    expect(
      coincidenciaCatalogo({ descripcion: 'Gas licuado industrial', unidad: 'kg' }, [f])
    ).toBeNull()
  })

  it('con la contención sigue exigiendo la misma unidad', () => {
    const f = fila('Nitrógeno N2', 'm3')
    expect(
      coincidenciaCatalogo({ descripcion: 'Nitrógeno N2 Industrial', unidad: 'Rec' }, [f])
    ).toBeNull()
  })
})

describe('el motor HVAC contra el catálogo sembrado', () => {
  // Filas reales de seed.sql: ('cat', 'descripción', 'unidad', precio, ...)
  function filasSembradas(): FilaCatalogo[] {
    const sql = readFileSync(join(__dirname, '../../db/seed.sql'), 'utf-8')
    const re = /\('(?:mo|ins|mat|rep|log)',\s*'([^']+)',\s*'([^']+)',\s*(\d+)/g
    return [...sql.matchAll(re)].map(m => ({
      description: m[1],
      unit_name: m[2],
      unit_price: m[3],
    }))
  }

  const itemsDe = (refrigerante: string) =>
    cubicar('hvac', { ...FICHA_VRF, datos: { ...FICHA_VRF.datos, refrigerante } }, PARAMETROS_BASE)
      .items

  beforeEach(() => lookup.mockReset())

  it('la sembrada trae las filas esperadas', () => {
    const d = filasSembradas().map(f => `${f.description}|${f.unit_name}`)
    expect(d).toEqual(
      expect.arrayContaining([
        'Refrigerante R-410a|Kg',
        'Nitrógeno N2|Rec',
        'Técnico Especializado HVAC|Hora',
        'Ayudante Técnico HVAC|Hora',
      ])
    )
  })

  it('VRF R-410A: HH, nitrógeno y refrigerante resuelven desde el catálogo', async () => {
    const { pool } = armar(itemsDe('R-410A'), { catalogo: filasSembradas() })
    lookup.mockResolvedValue(respuesta([]))
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    const por = (id: string) => estado.resultado?.items.find(i => i.id === id)
    expect(por('hvac-refrigerante')).toMatchObject({ precio_unitario: 120000, fuente: 'catalogo' })
    expect(por('hvac-nitrogeno')).toMatchObject({
      precio_unitario: 35000,
      fuente: 'catalogo',
      unidad: 'Rec',
    })
    expect(por('hvac-hh-tecnico')).toMatchObject({ precio_unitario: 150000, fuente: 'catalogo' })
    expect(por('hvac-hh-ayudante')).toMatchObject({ precio_unitario: 80000, fuente: 'catalogo' })
  })

  it('R-404A no tiene fila sembrada: queda sin_precio y nunca se cobra con la de R-410a', async () => {
    const { pool } = armar(itemsDe('R-404A'), { catalogo: filasSembradas() })
    lookup.mockResolvedValue(respuesta([]))
    const estado = await resolverPrecios(pool, 'b1', 'u1', CTX)
    const ref = estado.resultado?.items.find(i => i.id === 'hvac-refrigerante')
    expect(ref).toMatchObject({ estado_precio: 'sin_precio', precio_unitario: null })
    expect(ref?.descripcion).toBe('Refrigerante R-404A')
    expect(estado.resultado?.items.find(i => i.id === 'hvac-nitrogeno')?.precio_unitario).toBe(
      35000
    )
  })
})

describe('re-cubicar poda ajustes de ítems que ya no existen', () => {
  it('guarda en la ficha solo los ajustes de ids vigentes', async () => {
    const { pool, filas } = fakeBd([borradorBase({ ficha: FICHA_VRF })])
    const primero = await ejecutarCubicacion(pool, 'b1', 'u1')
    const vigente = primero.resultado?.items[0].id ?? ''
    const b = filas.get('b1')
    if (!b) throw new Error('sin borrador')
    filas.set('b1', {
      ...b,
      ficha: {
        ...b.ficha,
        datos: {
          ...b.ficha.datos,
          ajustes_listado: {
            quitar: ['id-fantasma', vigente],
            cantidades: { 'otro-fantasma': 5 },
            precios: { 'fantasma-3': { precio_unitario: 10 } },
          },
        },
      },
    })
    await ejecutarCubicacion(pool, 'b1', 'u1')
    expect(filas.get('b1')?.ficha.datos.ajustes_listado).toEqual({
      quitar: [vigente],
      cantidades: {},
      precios: {},
    })
  })
})
