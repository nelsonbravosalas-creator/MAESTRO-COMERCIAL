import { calcCat } from './costeoMath'
import type { CategoryId, CostCategory, CostItem, MasterQuotation } from '../types'

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

export const formatDetailMeta = (item: CostItem): string => {
  const route = item.puntoA && item.puntoB ? `${item.puntoA} → ${item.puntoB} · ` : ''
  const days = item.days && item.days > 1 ? ` × ${item.days} dias` : ''
  return `${route}${item.cant} ${item.unidad}${days}`
}

export function buildValuationRows(
  categories: CostCategory[],
  items: Record<CategoryId, CostItem[]>,
  expandedCategoryIds?: Iterable<string>
): QuotationValuationRow[] {
  const expanded = toExpandedSet(expandedCategoryIds)

  return categories.flatMap((cat, index) => {
    const r = calcCat(cat.id, categories, items)
    if (r.venta === 0) return []

    const details = expanded.has(cat.id)
      ? (items[cat.id] || [])
          .filter(item => item.cant > 0 && item.desc)
          .map(item => ({ item, meta: formatDetailMeta(item) }))
      : []

    return [
      {
        cat,
        rowNumber: index + 1,
        venta: r.venta,
        details,
      },
    ]
  })
}

export function buildQuotationValuationRows(
  q: MasterQuotation,
  expandedCategoryIds?: Iterable<string>
): QuotationValuationRow[] {
  return buildValuationRows(q.categories, q.items, expandedCategoryIds)
}
