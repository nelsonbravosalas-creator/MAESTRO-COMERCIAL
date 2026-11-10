import type { CategoryId, CostCategory, CostItem, MasterQuotation } from '../types'

export function calcCat(
  catId: CategoryId,
  categories: CostCategory[],
  items: Record<CategoryId, CostItem[]>
) {
  const cat = categories.find(c => c.id === catId)!
  const costo = (items[catId] || []).reduce((a, i) => a + i.cant * (i.days ?? 1) * i.unit, 0)
  const margin = Math.max(0, Math.min(99.9, cat.margin))
  const venta = margin === 100 ? costo : costo / (1 - margin / 100)
  return { costo, venta, beneficio: venta - costo, margin }
}

export function calcTotals(q: MasterQuotation) {
  return q.categories.reduce(
    (acc, cat) => {
      const r = calcCat(cat.id, q.categories, q.items)
      return {
        costo: acc.costo + r.costo,
        venta: acc.venta + r.venta,
        beneficio: acc.beneficio + r.beneficio,
      }
    },
    { costo: 0, venta: 0, beneficio: 0 }
  )
}

// Venta neta de un costeo suelto (categorías + ítems), sin necesitar una cotización.
export function costeoVenta(
  categories: CostCategory[],
  items: Record<CategoryId, CostItem[]>
): number {
  return categories.reduce((a, cat) => a + calcCat(cat.id, categories, items).venta, 0)
}
