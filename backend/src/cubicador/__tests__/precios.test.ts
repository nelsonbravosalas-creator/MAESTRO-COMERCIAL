import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Pool } from 'pg'
import { borradorBase, fakeBd, FICHA_VRF } from './fakeBd'
import { conservarPrecios, ejecutarCubicacion } from '../ejecutar'
import { resolverPrecios, TIENDAS_RETAIL } from '../precios'
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
    const { pool, filas } = armar(
      [item('a', { descripcion: 'Tubo de cobre 3/8', categoria: 'mat' })],
      { catalogo: [{ description: 'Tubo de cobre 3/8', unit_name: 'm', unit_price: '4500' }] }
    )
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
    const { pool } = armar([item('e', { descripcion: 'Cable THHN 12 AWG' })], {
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
          muestra(600, 'Punto Maestro', 'https://pm.cl/x'),
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
