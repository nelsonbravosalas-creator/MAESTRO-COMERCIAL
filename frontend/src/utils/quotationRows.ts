import { calcCat } from '../stores/maestro-store'
import type { CostCategory, CostItem, MasterQuotation } from '../types'

export interface QuotationDetailRow {
  item: CostItem
  meta: string
}

export interface QuotationValuationRow {
  cat: CostCategory
  rowNumber: number
  venta: number
  details: QuotationDetailRow[]
}

const toExpandedSet = (expandedCategoryIds?: Iterable<string>): Set<string> =>
  new Set(expandedCategoryIds ?? [])

export const formatDetailMeta = (item: CostItem): string =>
  `${item.cant} ${item.unidad}${item.days && item.days > 1 ? ` \u00d7 ${item.days} dias` : ''}`

export function buildQuotationValuationRows(
  q: MasterQuotation,
  expandedCategoryIds?: Iterable<string>
): QuotationValuationRow[] {
  const expanded = toExpandedSet(expandedCategoryIds)

  return q.categories.flatMap((cat, index) => {
    const r = calcCat(cat.id, q.categories, q.items)
    if (r.venta === 0) return []

    const details = expanded.has(cat.id)
      ? (q.items[cat.id] || [])
          .filter(item => item.cant > 0 && item.desc)
          .map(item => ({ item, meta: formatDetailMeta(item) }))
      : []

    return [{
      cat,
      rowNumber: index + 1,
      venta: r.venta,
      details,
    }]
  })
}
