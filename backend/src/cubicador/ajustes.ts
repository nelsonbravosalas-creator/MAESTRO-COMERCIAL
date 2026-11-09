// Ajustes manuales del listado (quitar ítems, cantidad y precio indicados por la persona).
// Viven en ficha.datos.ajustes_listado y se reaplican encima de cada recálculo del motor:
// los usan ajustar_listado y la re-cubicación, para que ninguna los pierda.
import type { ItemListado, ResultadoCubicacion } from './types'

export interface Ajustes {
  quitar: string[]
  cantidades: Record<string, number>
  precios: Record<string, { precio_unitario: number; tienda?: string }>
}

type Objeto = Record<string, unknown>

function esObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function leerAjustes(valor: unknown): Ajustes {
  const base: Ajustes = { quitar: [], cantidades: {}, precios: {} }
  if (!esObjeto(valor)) return base
  if (Array.isArray(valor.quitar)) {
    base.quitar = valor.quitar.filter((x): x is string => typeof x === 'string')
  }
  if (esObjeto(valor.cantidades)) {
    for (const [k, v] of Object.entries(valor.cantidades)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) base.cantidades[k] = v
    }
  }
  if (esObjeto(valor.precios)) {
    for (const [k, v] of Object.entries(valor.precios)) {
      if (esObjeto(v) && typeof v.precio_unitario === 'number' && v.precio_unitario >= 0) {
        base.precios[k] = {
          precio_unitario: v.precio_unitario,
          ...(typeof v.tienda === 'string' ? { tienda: v.tienda } : {}),
        }
      }
    }
  }
  return base
}

// Función pura: quita los ítems indicados, fija las cantidades manuales y los precios manuales.
export function aplicarAjustes(
  resultado: ResultadoCubicacion,
  ajustes: Ajustes
): ResultadoCubicacion {
  const items: ItemListado[] = []
  for (const nuevo of resultado.items) {
    if (ajustes.quitar.includes(nuevo.id)) continue
    const item: ItemListado = { ...nuevo }
    const cantidad = ajustes.cantidades[nuevo.id]
    if (cantidad !== undefined) item.cantidad = cantidad
    const manual = ajustes.precios[nuevo.id]
    if (manual) {
      item.precio_unitario = manual.precio_unitario
      item.fuente = null
      item.estado_precio = 'con_precio'
      if (manual.tienda) item.tienda = manual.tienda
      delete item.fuente_url
    }
    items.push(item)
  }
  return { ...resultado, items }
}

// Ajustes sin los ids que ya no existen; null si no había nada que podar.
export function podarAjustes(ajustes: Ajustes, idsValidos: ReadonlySet<string>): Ajustes | null {
  const vale = (id: string) => idsValidos.has(id)
  const quitar = ajustes.quitar.filter(vale)
  const cantidades = Object.fromEntries(Object.entries(ajustes.cantidades).filter(([k]) => vale(k)))
  const precios = Object.fromEntries(Object.entries(ajustes.precios).filter(([k]) => vale(k)))
  const cambio =
    quitar.length !== ajustes.quitar.length ||
    Object.keys(cantidades).length !== Object.keys(ajustes.cantidades).length ||
    Object.keys(precios).length !== Object.keys(ajustes.precios).length
  return cambio ? { quitar, cantidades, precios } : null
}
