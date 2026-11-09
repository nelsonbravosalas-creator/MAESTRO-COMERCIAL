// Ingreso del listado cubicado a una cotización: conversión a líneas y texto de aprobación.
import type { ImportLinea } from '../services/chatbotCalc'
import { scrubPii } from '../services/chatbotOps'
import type { CategoriaLinea, ItemListado, ResultadoCubicacion } from './types'

export const NOMBRE_CATEGORIA: Record<CategoriaLinea, string> = {
  mat: 'Provisión de Materiales',
  ins: 'Insumos Industriales y Gases',
  mec: 'Materiales Mecánico',
  ele: 'Materiales Eléctricos',
  mo: 'Mano de obra',
  rep: 'Repuestos',
  log: 'Logística',
}

const ORDEN: CategoriaLinea[] = ['mat', 'ins', 'mec', 'ele', 'mo', 'rep', 'log']

// Los ítems «sin precio» van con precio 0 para que manualItemsWarning avise.
export function aLineas(resultado: ResultadoCubicacion): ImportLinea[] {
  return resultado.items.map(i => ({
    category_id: i.categoria,
    descripcion: i.descripcion,
    unidad: i.unidad,
    cantidad: i.cantidad,
    dias: i.dias,
    precio_unitario: i.precio_unitario ?? 0,
  }))
}

const clp = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')

function lineaItem(i: ItemListado): string {
  const base = `- ${i.descripcion}: ${i.cantidad} ${i.unidad}`
  const dias = i.dias > 1 ? ` x ${i.dias} días` : ''
  if (i.precio_unitario == null || !(i.precio_unitario > 0)) return `${base}${dias}, sin precio`
  return `${base}${dias} x $${clp(i.precio_unitario)} = $${clp(i.cantidad * i.dias * i.precio_unitario)} neto`
}

// Texto que ve la persona antes de confirmar. Lista todo lo que se va a ingresar.
export function describirListado(resultado: ResultadoCubicacion, destino: string): string {
  const partes: string[] = [
    `Ingresar el listado cubicado (${resultado.items.length} ítems) ${destino}`,
  ]
  const conteo: string[] = []
  for (const cat of ORDEN) {
    const items = resultado.items.filter(i => i.categoria === cat)
    if (!items.length) continue
    conteo.push(`${NOMBRE_CATEGORIA[cat]}: ${items.length}`)
    partes.push('', `${NOMBRE_CATEGORIA[cat]}:`, ...items.map(lineaItem))
  }
  const conPrecio = resultado.items.filter(i => (i.precio_unitario ?? 0) > 0)
  const total = conPrecio.reduce((s, i) => s + i.cantidad * i.dias * (i.precio_unitario ?? 0), 0)
  const sinPrecio = resultado.items.length - conPrecio.length
  partes.push(
    '',
    `Total neto con precio: $${clp(total)}${sinPrecio ? ` (${sinPrecio} ítem(s) sin precio, a completar en el formulario)` : ''}`,
    `Ítems por categoría: ${conteo.join('; ')}`
  )
  const criticos = resultado.supuestos.filter(s => s.critico)
  if (criticos.length) partes.push('', 'Supuestos críticos:', ...criticos.map(s => `- ${s.texto}`))
  if (resultado.advertencias.length) {
    partes.push('', 'Advertencias:', ...resultado.advertencias.map(a => `- ${a}`))
  }
  if (resultado.dotacion) partes.push('', 'Más colación y bono según reglas vigentes')
  return scrubPii(partes.join('\n'))
}
