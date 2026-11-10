import type { CostItem, MasterQuotation } from '../types'
import {
  MTC_FREQUENCY_LABELS,
  consumableLines,
  ensureMtcConfig,
  grandSummary,
  summaryTextOf,
  systemCosteo,
  systemTotals,
} from './mtcSystems'
import { buildValuationRows } from './quotationRows'
import { currencyNote, effectiveCurrency, formatMtcMoney } from './mtcMoney'

export interface MtcMoneyRow {
  label: string
  amount: string
}

export interface MtcSystemBlock {
  index: number
  title: string
  currencyNote: string
  currencyCode: 'CLP' | 'UF' | 'USD'
  visits: number
  isUnique: boolean
  detailRows: {
    catId: string
    n: number
    label: string
    amount: string
    details: { item: CostItem; meta: string }[]
  }[]
  visitTotals: MtcMoneyRow[]
  annualTotals: MtcMoneyRow[]
  summaryRow: {
    item: number
    qty: number
    text: string
    edited: boolean
    unit: string
    total: string
  }
  summaryTotals: MtcMoneyRow[]
  consumables: null | {
    schedule: {
      n: number
      desc: string
      unidad: string
      perModule: number
      modules: number
      changes: number
      qty: number
    }[]
    priced: {
      n: number
      qty: number
      desc: string
      unit: string
      total: string
    }[]
    totals: MtcMoneyRow[]
  }
}

export interface MtcDocumentModel {
  summaryMode: boolean
  blocks: MtcSystemBlock[]
  grand: null | {
    rows: MtcMoneyRow[]
    totals: MtcMoneyRow[]
  }
}

export function buildMtcDocument(
  q: MasterQuotation,
  expandedCategoryIds?: Iterable<string>
): MtcDocumentModel {
  const config = ensureMtcConfig(q)
  const rates = { uf: q.uf, usd: q.usd }
  const iva = Number.isFinite(q.iva) ? q.iva : 0

  const blocks = config.systems.map((system, index) => {
    const totals = systemTotals(q, index)
    const costeo = systemCosteo(q, index)
    const currencyCode = effectiveCurrency(rates, system.currency)
    const visitNet = Number.isFinite(totals.visitNet) ? totals.visitNet : 0
    const yearNet = Number.isFinite(totals.yearNet) ? totals.yearNet : 0
    const consumablesNet = Number.isFinite(totals.consumablesNet) ? totals.consumablesNet : 0
    const visitIva = (visitNet * iva) / 100
    const yearIva = (yearNet * iva) / 100

    return {
      index,
      title: `IV.${index + 1} ${system.name} · ${MTC_FREQUENCY_LABELS[system.frequency]}`,
      currencyNote: currencyNote(rates, system.currency),
      currencyCode,
      visits: totals.visits,
      isUnique: totals.isUnique,
      detailRows: buildValuationRows(costeo.categories, costeo.items, expandedCategoryIds).map(
        row => ({
          catId: row.cat.id,
          n: row.rowNumber,
          label: row.cat.label,
          amount: formatMtcMoney(row.venta, rates, system.currency),
          details: row.details,
        })
      ),
      visitTotals: [
        {
          label: 'Subtotal neto por visita',
          amount: formatMtcMoney(visitNet, rates, system.currency),
        },
        { label: `IVA (${iva}%)`, amount: formatMtcMoney(visitIva, rates, system.currency) },
        {
          label: 'Total por visita con IVA',
          amount: formatMtcMoney(visitNet + visitIva, rates, system.currency),
        },
      ],
      annualTotals: totals.isUnique
        ? []
        : [
            {
              label: 'Subtotal neto anual',
              amount: formatMtcMoney(yearNet, rates, system.currency),
            },
            { label: `IVA (${iva}%)`, amount: formatMtcMoney(yearIva, rates, system.currency) },
            {
              label: 'Total anual con IVA',
              amount: formatMtcMoney(yearNet + yearIva, rates, system.currency),
            },
          ],
      summaryRow: {
        item: index + 1,
        qty: totals.visits,
        text: summaryTextOf(system).text,
        edited: summaryTextOf(system).edited,
        unit: formatMtcMoney(visitNet, rates, system.currency),
        total: formatMtcMoney(yearNet, rates, system.currency),
      },
      summaryTotals: [
        { label: 'Precio neto total', amount: formatMtcMoney(yearNet, rates, system.currency) },
        { label: `IVA (${iva}%)`, amount: formatMtcMoney(yearIva, rates, system.currency) },
        {
          label: 'Precio total con IVA',
          amount: formatMtcMoney(yearNet + yearIva, rates, system.currency),
        },
      ],
      consumables: system.consumables.enabled
        ? {
            schedule: consumableLines(system.consumables).map((line, lineIndex) => ({
              n: lineIndex + 1,
              desc: line.row.desc,
              unidad: line.row.unidad,
              perModule: line.row.per_module,
              modules: line.row.modules,
              changes: line.row.changes_per_year,
              qty: line.qty,
            })),
            priced: consumableLines(system.consumables).map((line, lineIndex) => ({
              n: lineIndex + 1,
              qty: line.qty,
              desc: line.row.desc,
              unit: formatMtcMoney(line.unitPrice, rates, system.currency),
              total: formatMtcMoney(line.total, rates, system.currency),
            })),
            totals: [
              {
                label: 'Subtotal neto consumibles',
                amount: formatMtcMoney(consumablesNet, rates, system.currency),
              },
              {
                label: `IVA (${iva}%)`,
                amount: formatMtcMoney((consumablesNet * iva) / 100, rates, system.currency),
              },
              {
                label: 'Total consumibles con IVA',
                amount: formatMtcMoney(
                  consumablesNet + (consumablesNet * iva) / 100,
                  rates,
                  system.currency
                ),
              },
            ],
          }
        : null,
    }
  })

  const grand = config.show_summary_table
    ? (() => {
        const summary = grandSummary(q)
        const net = Number.isFinite(summary.net) ? summary.net : 0
        const grandIva = Number.isFinite(summary.iva) ? summary.iva : 0
        const total = Number.isFinite(summary.total) ? summary.total : 0
        return {
          rows: summary.rows.map(row => ({
            label: row.label,
            amount: formatMtcMoney(row.net, { uf: 0, usd: 0 }, 'CLP'),
          })),
          totals: [
            { label: 'Precio neto total', amount: formatMtcMoney(net, { uf: 0, usd: 0 }, 'CLP') },
            { label: `IVA (${iva}%)`, amount: formatMtcMoney(grandIva, { uf: 0, usd: 0 }, 'CLP') },
            {
              label: 'Precio total con IVA',
              amount: formatMtcMoney(total, { uf: 0, usd: 0 }, 'CLP'),
            },
          ],
        }
      })()
    : null

  return {
    summaryMode: config.summary_mode,
    blocks,
    grand,
  }
}
