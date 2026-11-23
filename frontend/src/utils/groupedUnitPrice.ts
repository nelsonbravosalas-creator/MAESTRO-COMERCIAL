// Estilo de documento "Precio unitario agrupado". Funciones puras, sin React.
// Solo cambia la vista previa/PDF: no toca el motor de costeo ni los datos guardados.
import type { CostCategory, DocStyle, MasterQuotation } from '../types'
import { buildValuationRows } from './quotationRows'
import {
  MTC_FREQUENCY_LABELS,
  ensureMtcConfig,
  grandSummary,
  systemCosteo,
  systemTotals,
} from './mtcSystems'
import { calcTotals } from './costeoMath'

export const DOC_STYLE_DEFAULT: DocStyle = 'default'
export const DOC_STYLE_GROUPED: DocStyle = 'grouped_unit_price'

export const DOC_STYLE_LABELS: Record<DocStyle, string> = {
  default: 'Estándar',
  grouped_unit_price: 'Precio unitario agrupado',
}

export function isGroupedStyle(q: { doc_style?: DocStyle | null } | null | undefined): boolean {
  return q?.doc_style === DOC_STYLE_GROUPED
}

export interface GroupedSubitem {
  id: string
  desc: string
  qty: number
  unit: string
  meta: string
}

export interface GroupedItem {
  n: number
  title: string
  subitems: GroupedSubitem[]
  qty: number
  unitPrice: number
  total: number
  /** Venta del ítem según el motor (sin redondear). */
  venta: number
}

export interface GroupedModel {
  items: GroupedItem[]
  neto: number
  iva: number
  total: number
  ivaPct: number
  /** Total con IVA que da el motor, para detectar diferencias de redondeo. */
  engineTotal: number
  /** total del documento − total del motor (en pesos). */
  diff: number
}

export const roundPeso = (n: number): number => (Number.isFinite(n) ? Math.round(n) : 0)

export const roundIva = (neto: number, ivaPct: number): number =>
  roundPeso((neto * (Number.isFinite(ivaPct) ? ivaPct : 0)) / 100)

/** Suma cantidades evitando ruido de coma flotante (0.1 + 0.2). */
export const sumQty = (values: number[]): number =>
  Math.round(values.reduce((a, v) => a + (Number.isFinite(v) && v > 0 ? v : 0), 0) * 10000) / 10000

export function unitPriceOf(venta: number, qty: number): number {
  if (!(qty > 0) || !Number.isFinite(venta)) return 0
  return roundPeso(venta / qty)
}

const allIds = (categories: CostCategory[]) => categories.map(c => c.id)

function itemFrom(
  n: number,
  title: string,
  categories: CostCategory[],
  items: Parameters<typeof buildValuationRows>[1],
  venta: number
): GroupedItem | null {
  const rows = buildValuationRows(categories, items, allIds(categories))
  const subitems: GroupedSubitem[] = rows.flatMap(row =>
    row.details
      .filter(d => Number.isFinite(d.item.cant) && d.item.cant > 0)
      .map(d => ({
        id: d.item.id,
        desc: d.item.desc,
        qty: d.item.cant,
        unit: d.item.unidad,
        meta: d.meta,
      }))
  )
  if (subitems.length === 0) return null
  const qty = sumQty(subitems.map(s => s.qty))
  if (!(qty > 0)) return null
  const unitPrice = unitPriceOf(venta, qty)
  return {
    n,
    title,
    subitems,
    qty,
    unitPrice,
    total: roundPeso(qty * unitPrice),
    venta,
  }
}

function finish(items: GroupedItem[], ivaPct: number, engineNet: number): GroupedModel {
  const numbered = items.map((it, i) => ({ ...it, n: i + 1 }))
  const neto = numbered.reduce((a, it) => a + it.total, 0)
  const iva = roundIva(neto, ivaPct)
  const total = neto + iva
  const engineTotal = roundPeso(engineNet + (engineNet * ivaPct) / 100)
  return { items: numbered, neto, iva, total, ivaPct, engineTotal, diff: total - engineTotal }
}

export function buildGroupedRows(
  q: MasterQuotation,
  mode: 'quotation' | 'maintenance' = q.kind === 'maintenance' || q.mtc_config
    ? 'maintenance'
    : 'quotation'
): GroupedModel {
  const ivaPct = Number.isFinite(q.iva) ? q.iva : 0

  if (mode === 'maintenance') {
    const cfg = ensureMtcConfig(q)
    const items: GroupedItem[] = []
    cfg.systems.forEach((sys, index) => {
      const { categories, items: costeoItems } = systemCosteo(q, index)
      const t = systemTotals(q, index)
      const yearNet = Number.isFinite(t.yearNet) ? t.yearNet : 0
      const title = `${sys.name || `Sistema ${index + 1}`} · ${MTC_FREQUENCY_LABELS[sys.frequency]}`
      const it = itemFrom(0, title, categories, costeoItems, yearNet)
      if (it) items.push(it)
    })
    const engineNet = grandSummary(q).net
    return finish(items, ivaPct, Number.isFinite(engineNet) ? engineNet : 0)
  }

  const engineNet = calcTotals(q).venta
  const it = itemFrom(0, q.ref || 'Servicio', q.categories, q.items, engineNet)
  return finish(it ? [it] : [], ivaPct, engineNet)
}
