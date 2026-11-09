// Resolución de precios del listado cubicado, por etapas y en lotes.
//
// Etapa 1 (sin LLM): catálogo propio y luego la memoria de precios del grafo.
// Etapa 2 (LLM con búsqueda web): hasta LOTE_MAX ítems por llamada, solo en las tiendas
// retail. El gas, el nitrógeno y la mano de obra nunca van a tiendas: catálogo o caché.
// Nunca se inventa un precio: sin dato válido el ítem queda `sin_precio`.
// PII A-21: a la búsqueda solo viaja el nombre del material (lo garantiza lookupMaterialPrice).
import type { Pool } from 'pg'
import { matchCatalogRow, type CatalogRow } from '../agent/tools/specCubicatorTool'
import { lookupMaterialPrice, PRECIO_STALE_DAYS, type OpContext } from '../services/chatbotOps'
import { getGraphNode, materialNodeId } from '../services/chatbotGraph'
import { httpError } from '../utils/httpError'
import { logger } from '../utils/logger'
import { actualizarBorrador, obtenerBorrador } from './borradores'
import { estadoCubicador, type EstadoCubicador } from './ejecutar'
import type { Borrador, ItemListado, ResultadoCubicacion } from './types'

export const TIENDAS_RETAIL = ['Sodimac', 'Easy', 'Imperial', 'Punto Maestro']
export const LOTE_MAX = 3
export const TIMEOUT_TIENDA_MS = 15_000

type PrecioResuelto = Pick<
  ItemListado,
  'precio_unitario' | 'fuente' | 'estado_precio' | 'tienda' | 'fuente_url'
>

// El gas refrigerante, el nitrógeno y la mano de obra no se cotizan en tiendas retail.
const SOLO_CATALOGO_RE = /refrigerante|nitr[oó]geno|\bgas\b|\bR-?\d{2,3}[a-z]?\b/i
const IDS_SOLO_CATALOGO = new Set(['hvac-refrigerante', 'hvac-nitrogeno'])

export function esSoloCatalogo(item: ItemListado): boolean {
  return (
    item.categoria === 'mo' ||
    IDS_SOLO_CATALOGO.has(item.id) ||
    SOLO_CATALOGO_RE.test(item.descripcion)
  )
}

async function cargarCatalogo(pool: Pool): Promise<CatalogRow[]> {
  const [mec, ele] = await Promise.all([
    pool.query<{ description: string; unit_name: string; unit_price: string }>(
      `SELECT description, unit_name, unit_price FROM catalog_items WHERE is_active = true`
    ),
    pool.query<{ description: string; unit_name: string; unit_price: string }>(
      `SELECT description, unit_name, unit_price FROM electrical_catalog_items WHERE is_active = true`
    ),
  ])
  return [...mec.rows, ...ele.rows].map(r => ({ ...r, category_id: null }))
}

function precioCatalogo(item: ItemListado, catalogo: CatalogRow[]): PrecioResuelto | null {
  const fila = matchCatalogRow(item.descripcion, catalogo)
  const precio = fila ? Number(fila.unit_price) : 0
  if (!fila || !Number.isFinite(precio) || precio <= 0) return null
  return {
    precio_unitario: precio,
    fuente: 'catalogo',
    estado_precio: 'con_precio',
  }
}

async function precioCache(pool: Pool, item: ItemListado): Promise<PrecioResuelto | null> {
  const nodo = await getGraphNode(pool, materialNodeId(item.descripcion)).catch(() => null)
  const precio = Number(nodo?.properties.last_price)
  const fecha = nodo?.properties.last_price_at
  if (!Number.isFinite(precio) || precio <= 0 || typeof fecha !== 'string') return null
  const dias = (Date.now() - new Date(fecha).getTime()) / 86_400_000
  if (!Number.isFinite(dias) || dias > PRECIO_STALE_DAYS) return null
  return { precio_unitario: precio, fuente: 'cache', estado_precio: 'con_precio' }
}

const SIN_PRECIO: PrecioResuelto = {
  precio_unitario: null,
  fuente: null,
  estado_precio: 'sin_precio',
}

function esUrlHttp(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

function deTiendaRetail(tienda: string): boolean {
  const t = tienda.toLowerCase()
  return TIENDAS_RETAIL.some(r => t.includes(r.toLowerCase()))
}

// La muestra más barata entre las válidas: precio > 0, URL http(s) y una de las tiendas permitidas.
function mejorMuestra(
  muestras: Array<{ precio: number; fuente_url: string; tienda: string }>
): PrecioResuelto {
  const validas = muestras.filter(
    m =>
      Number.isFinite(m.precio) &&
      m.precio > 0 &&
      typeof m.fuente_url === 'string' &&
      esUrlHttp(m.fuente_url) &&
      typeof m.tienda === 'string' &&
      deTiendaRetail(m.tienda)
  )
  if (validas.length === 0) return SIN_PRECIO
  const barata = validas.reduce((a, b) => (b.precio < a.precio ? b : a))
  return {
    precio_unitario: barata.precio,
    fuente: 'tienda',
    estado_precio: 'con_precio',
    tienda: barata.tienda,
    fuente_url: barata.fuente_url.trim(),
  }
}

async function precioTienda(
  pool: Pool,
  item: ItemListado,
  ctx: OpContext
): Promise<PrecioResuelto> {
  const res = await lookupMaterialPrice(pool, item.descripcion, ctx, {
    timeoutMs: TIMEOUT_TIENDA_MS,
    tiendas: TIENDAS_RETAIL,
  })
  return mejorMuestra(res.muestras ?? [])
}

interface Resolucion {
  cantidad: number
  precio: PrecioResuelto
}

// Aplica las resoluciones solo a ítems que siguen pendientes y con la misma cantidad.
function aplicar(resultado: ResultadoCubicacion, resoluciones: Map<string, Resolucion>) {
  const items = resultado.items.map(item => {
    const r = resoluciones.get(item.id)
    if (!r || item.estado_precio !== 'pendiente' || item.cantidad !== r.cantidad) return item
    return { ...item, ...r.precio }
  })
  return { ...resultado, items }
}

function exigirCubicado(borrador: Borrador | null): Borrador & { resultado: ResultadoCubicacion } {
  if (!borrador) throw httpError('Borrador no encontrado', 404)
  if (borrador.estado !== 'cubicado' || !borrador.resultado) {
    throw httpError('El listado aún no está cubicado o ya fue ingresado.', 409)
  }
  return borrador as Borrador & { resultado: ResultadoCubicacion }
}

/**
 * Resuelve los precios pendientes del listado: primero lo que no requiere LLM y luego
 * como máximo LOTE_MAX búsquedas en tiendas por llamada. Devuelve el estado actualizado
 * (`precios_pendientes` indica si hay que volver a llamar).
 */
export async function resolverPrecios(
  pool: Pool,
  borradorId: string,
  userId: string,
  ctx: OpContext
): Promise<EstadoCubicador> {
  const borrador = exigirCubicado(await obtenerBorrador(pool, borradorId, userId))
  const pendientes = borrador.resultado.items.filter(i => i.estado_precio === 'pendiente')
  if (pendientes.length === 0) return estadoCubicador(borrador)

  const resoluciones = new Map<string, Resolucion>()
  const resolver = (item: ItemListado, precio: PrecioResuelto) =>
    resoluciones.set(item.id, { cantidad: item.cantidad, precio })

  // Etapa 1: catálogo y caché, sin LLM.
  const catalogo = await cargarCatalogo(pool)
  const sinCatalogo: ItemListado[] = []
  for (const item of pendientes) {
    const p = precioCatalogo(item, catalogo)
    if (p) resolver(item, p)
    else sinCatalogo.push(item)
  }
  const cacheados = await Promise.all(sinCatalogo.map(item => precioCache(pool, item)))
  const porBuscar: ItemListado[] = []
  sinCatalogo.forEach((item, i) => {
    const p = cacheados[i]
    if (p) resolver(item, p)
    // Gas, nitrógeno y mano de obra no van a tiendas: sin catálogo ni caché quedan sin precio.
    else if (esSoloCatalogo(item)) resolver(item, SIN_PRECIO)
    else porBuscar.push(item)
  })

  // Etapa 2: tiendas, un lote acotado en paralelo. Un fallo no tumba al resto.
  const lote = porBuscar.slice(0, LOTE_MAX)
  const respuestas = await Promise.allSettled(lote.map(item => precioTienda(pool, item, ctx)))
  respuestas.forEach((r, i) => {
    if (r.status === 'fulfilled') resolver(lote[i], r.value)
    else {
      logger.warn('Cubicador: falló la consulta de precio en tiendas', {
        item: lote[i].id,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      })
      resolver(lote[i], SIN_PRECIO)
    }
  })

  // Guardado con control de versión; si el borrador cambió, un reintento sobre la versión nueva.
  try {
    const guardado = await actualizarBorrador(
      pool,
      borrador.id,
      userId,
      { resultado: aplicar(borrador.resultado, resoluciones) },
      borrador.version
    )
    return estadoCubicador(guardado)
  } catch (error) {
    if ((error as { status?: number }).status !== 409) throw error
    const fresco = exigirCubicado(await obtenerBorrador(pool, borradorId, userId))
    const guardado = await actualizarBorrador(
      pool,
      fresco.id,
      userId,
      { resultado: aplicar(fresco.resultado, resoluciones) },
      fresco.version
    )
    return estadoCubicador(guardado)
  }
}
