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
import { resolverTienda, TIENDAS_RETAIL } from '../services/tiendasRetail'
import { httpError } from '../utils/httpError'
import { logger } from '../utils/logger'
import { actualizarBorrador, obtenerBorrador } from './borradores'
import { estadoCubicador, type EstadoCubicador } from './ejecutar'
import type { Borrador, ItemListado, ResultadoCubicacion } from './types'

export { TIENDAS_RETAIL }
export const LOTE_MAX = 3
export const TIMEOUT_TIENDA_MS = 15_000
// Tope duro de la etapa de tiendas: igual al presupuesto de reloj del agente (WALL_CLOCK_BUDGET_MS
// en agent/loop.ts), por debajo del límite de 60 s de la función.
export const PLAZO_TIENDAS_MS = 40_000

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

type FilaCatalogo = CatalogRow & { id?: string }

async function cargarCatalogo(pool: Pool): Promise<FilaCatalogo[]> {
  const consulta = (tabla: string) =>
    pool.query<{ id?: string; description: string; unit_name: string; unit_price: string }>(
      `SELECT id, description, unit_name, unit_price FROM ${tabla} WHERE is_active = true`
    )
  const [mec, ele] = await Promise.all([
    consulta('catalog_items'),
    consulta('electrical_catalog_items'),
  ])
  return [...mec.rows, ...ele.rows].map(r => ({ ...r, category_id: null }))
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\br-?(\d{2,3})([a-z])?\b/g, 'r$1$2')
    .replace(/(\d)\s+(mm|cm|kg|lt|l|w|kw|v|a|hp|btu|awg)\b/g, '$1$2')
    .replace(/(\d),(\d)/g, '$1.$2')
}

// Medidas y códigos: 3/8, 40x40x2, 2mm, r404a.
const MEDIDA_RE =
  /\br\d{2,3}[a-z]?\b|(?<![a-z0-9.])\d+(?:\.\d+)?(?:\/\d+)?(?:x\d+(?:\.\d+)?)*[a-z]{0,3}\b/g
const PALABRAS_VACIAS = new Set(['del', 'para', 'con', 'las', 'los', 'por', 'una', 'uno'])

function medidasDe(norm: string): Set<string> {
  return new Set(norm.match(MEDIDA_RE) ?? [])
}

function palabrasDe(norm: string): Set<string> {
  return new Set(
    norm
      .replace(MEDIDA_RE, ' ')
      .split(/[^a-z]+/)
      .filter(p => p.length >= 3 && !PALABRAS_VACIAS.has(p))
  )
}

const ALIAS_UNIDAD: Record<string, string> = {
  hora: 'hora',
  horas: 'hora',
  hr: 'hora',
  hrs: 'hora',
  h: 'hora',
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  m3: 'm3',
  'm\u00b3': 'm3',
  un: 'un',
  und: 'un',
  uni: 'un',
  unidad: 'un',
  unidades: 'un',
  u: 'un',
  tir: 'tira',
  tira: 'tira',
  tiras: 'tira',
  m: 'm',
  mt: 'm',
  mts: 'm',
  metro: 'm',
  metros: 'm',
  rec: 'rec',
  recarga: 'rec',
  balon: 'rec',
  balones: 'rec',
}

export function normalizarUnidad(unidad: string): string {
  const u = unidad
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\s]/g, '')
  return ALIAS_UNIDAD[u] ?? u
}

function mismasMedidas(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every(m => b.has(m))
}

/**
 * Fila del catálogo para un ítem, o null. Más estricta que matchCatalogRow (que no se toca: la
 * usan otras herramientas): elige la MEJOR fila (igualdad exacta, luego más palabras en común),
 * exige las mismas medidas (3/8, r-404a, 40x40x2) y la misma unidad una vez normalizada.
 */
export function coincidenciaCatalogo(
  item: Pick<ItemListado, 'descripcion' | 'unidad'>,
  filas: FilaCatalogo[]
): FilaCatalogo | null {
  const objetivo = normalizar(item.descripcion).trim()
  const medidasObjetivo = medidasDe(objetivo)
  const palabrasObjetivo = palabrasDe(objetivo)
  if (palabrasObjetivo.size === 0) return null

  const candidatas: Array<{ fila: FilaCatalogo; puntaje: number }> = []
  const sugerida = matchCatalogRow(item.descripcion, filas)
  const todas = sugerida ? [sugerida, ...filas.filter(f => f !== sugerida)] : filas
  for (const fila of todas) {
    const norm = normalizar(fila.description).trim()
    if (!mismasMedidas(medidasObjetivo, medidasDe(norm))) continue
    const palabras = palabrasDe(norm)
    const comunes = [...palabras].filter(p => palabrasObjetivo.has(p)).length
    const minimo = Math.ceil(0.6 * Math.max(palabras.size, palabrasObjetivo.size))
    const exacta = norm === objetivo
    if (!exacta && (comunes === 0 || comunes < minimo)) continue
    const puntaje = exacta ? 1000 : comunes * 10 - Math.abs(palabras.size - palabrasObjetivo.size)
    candidatas.push({ fila, puntaje })
  }
  candidatas.sort((x, y) => y.puntaje - x.puntaje)

  const unidad = normalizarUnidad(item.unidad)
  const elegida = candidatas.find(c => normalizarUnidad(c.fila.unit_name) === unidad)
  if (!elegida && candidatas.length > 0) {
    logger.warn('Cubicador: fila de catálogo descartada por unidad distinta', {
      item: item.descripcion,
      unidadItem: item.unidad,
      fila: candidatas[0].fila.id ?? candidatas[0].fila.description,
      unidadFila: candidatas[0].fila.unit_name,
    })
  }
  return elegida?.fila ?? null
}

function precioCatalogo(item: ItemListado, catalogo: FilaCatalogo[]): PrecioResuelto | null {
  const fila = coincidenciaCatalogo(item, catalogo)
  const precio = fila ? Number(fila.unit_price) : 0
  if (!fila || !Number.isFinite(precio) || precio <= 0) return null
  return { precio_unitario: precio, fuente: 'catalogo', estado_precio: 'con_precio' }
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

// La muestra más barata entre las válidas: precio > 0 y URL http(s) cuyo dominio pertenece a una
// de las tiendas retail (sodimac.cl o *.sodimac.cl). Se guarda el nombre canónico de la tienda,
// no la etiqueta que escribió el modelo.
function mejorMuestra(
  muestras: Array<{ precio: number; fuente_url: string; tienda: string }>
): PrecioResuelto {
  const validas: Array<{ precio: number; fuente_url: string; tienda: string }> = []
  for (const m of muestras) {
    if (!Number.isFinite(m.precio) || m.precio <= 0) continue
    if (typeof m.fuente_url !== 'string' || !esUrlHttp(m.fuente_url)) continue
    const r = resolverTienda(typeof m.tienda === 'string' ? m.tienda : '', m.fuente_url)
    if (!r.porHost || !TIENDAS_RETAIL.includes(r.tienda)) continue
    validas.push({ precio: m.precio, fuente_url: m.fuente_url.trim(), tienda: r.tienda })
  }
  if (validas.length === 0) return SIN_PRECIO
  const barata = validas.reduce((a, b) => (b.precio < a.precio ? b : a))
  return {
    precio_unitario: barata.precio,
    fuente: 'tienda',
    estado_precio: 'con_precio',
    tienda: barata.tienda,
    fuente_url: barata.fuente_url,
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

  // Etapa 2: tiendas, un lote acotado en paralelo. Un fallo no tumba al resto y, si vence el
  // plazo duro, los ítems sin respuesta siguen pendientes (se reintentan en la próxima llamada).
  const lote = porBuscar.slice(0, LOTE_MAX)
  let cerrado = false
  const consultas = lote.map(item =>
    precioTienda(pool, item, ctx).then(
      precio => {
        if (!cerrado) resolver(item, precio)
      },
      (error: unknown) => {
        logger.warn('Cubicador: falló la consulta de precio en tiendas', {
          item: item.id,
          error: error instanceof Error ? error.message : String(error),
        })
        if (!cerrado) resolver(item, SIN_PRECIO)
      }
    )
  )
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const plazo = new Promise<void>(fin => {
    temporizador = setTimeout(fin, PLAZO_TIENDAS_MS)
  })
  try {
    await Promise.race([Promise.all(consultas), plazo])
  } finally {
    cerrado = true
    clearTimeout(temporizador)
  }

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
