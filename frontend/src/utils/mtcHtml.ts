import type { MasterQuotation } from '../types'
import {
  buildMtcDocument,
  type MtcDocumentModel,
  type MtcMoneyRow,
  type MtcSystemBlock,
} from './mtcDocument'

const TOTAL_CLASSES = ['sub', 'riv', 'tot'] as const

function totalRows(rows: MtcMoneyRow[], colspan: number, esc: (s: string) => string): string {
  return rows
    .map((row, index) => {
      const className = TOTAL_CLASSES[index] ?? ''
      return `<tr class="${className}"><td colspan="${colspan}" style="text-align:right">${esc(row.label)}</td><td class="cm">${esc(row.amount)}</td></tr>`
    })
    .join('')
}

function detailedTable(block: MtcSystemBlock, esc: (s: string) => string): string {
  const details = block.detailRows
    .map(
      row =>
        `<tr><td class="cn">${esc(String(row.n))}</td><td>${esc(row.label)}</td><td class="cm">${esc(row.amount)}</td></tr>`
    )
    .join('')

  return `<table class="vt"><thead><tr><th class="cn">N°</th><th>Descripción</th><th class="cm">Valor neto</th></tr></thead><tbody>${details}${totalRows(block.visitTotals, 2, esc)}</tbody></table>`
}

function summaryTable(block: MtcSystemBlock, esc: (s: string) => string): string {
  const row = block.summaryRow
  const text = esc(row.text).replace(/\r?\n/g, '<br>')

  return `<table class="vt"><thead><tr><th class="cn">Ítem</th><th class="cn">Cant.</th><th>Descripción</th><th class="cm">Precio unit.</th><th class="cm">Precio total</th></tr></thead><tbody><tr><td class="cn">${esc(String(row.item))}</td><td class="cn">${esc(String(row.qty))}</td><td>${text}</td><td class="cm">${esc(row.unit)}</td><td class="cm">${esc(row.total)}</td></tr>${totalRows(block.summaryTotals, 4, esc)}</tbody></table>`
}

function consumablesHtml(block: MtcSystemBlock, esc: (s: string) => string): string {
  if (block.consumables === null) return ''

  const scheduleRows = block.consumables.schedule
    .map(
      row =>
        `<tr><td class="cn">${esc(String(row.n))}</td><td>${esc(row.desc)}</td><td>${esc(row.unidad)}</td><td class="cn">${esc(String(row.perModule))}</td><td class="cn">${esc(String(row.modules))}</td><td class="cn">${esc(String(row.changes))}</td><td class="cn">${esc(String(row.qty))}</td></tr>`
    )
    .join('')
  const pricedRows = block.consumables.priced
    .map(
      row =>
        `<tr><td class="cn">${esc(String(row.n))}</td><td class="cn">${esc(String(row.qty))}</td><td>${esc(row.desc)}</td><td class="cm">${esc(row.unit)}</td><td class="cm">${esc(row.total)}</td></tr>`
    )
    .join('')

  return `<div class="gt2">Repuestos consumibles</div><table class="vt"><thead><tr><th class="cn">Ítem</th><th>Descripción</th><th>Un.</th><th class="cn">Por módulo</th><th class="cn">Módulos</th><th class="cn">Cambios/año</th><th class="cn">Cantidad</th></tr></thead><tbody>${scheduleRows}</tbody></table><table class="vt"><thead><tr><th class="cn">Ítem</th><th class="cn">Cant.</th><th>Descripción</th><th class="cm">Precio unit.</th><th class="cm">Precio total</th></tr></thead><tbody>${pricedRows}${totalRows(block.consumables.totals, 4, esc)}</tbody></table>`
}

function blockHtml(
  block: MtcSystemBlock,
  summaryMode: boolean,
  esc: (s: string) => string
): string {
  const valuation = summaryMode ? summaryTable(block, esc) : detailedTable(block, esc)
  const annual =
    !summaryMode && !block.isUnique
      ? `<table class="vt"><tbody>${totalRows(block.annualTotals, 2, esc)}</tbody></table>`
      : ''

  return `<div class="gt2">${esc(block.title)}</div>${block.currencyNote ? `<div class="cn-note">${esc(block.currencyNote)}</div>` : ''}${valuation}${annual}${consumablesHtml(block, esc)}`
}

function grandHtml(model: MtcDocumentModel, esc: (s: string) => string): string {
  if (model.grand === null) return ''

  const rows = model.grand.rows
    .map(row => `<tr><td>${esc(row.label)}</td><td class="cm">${esc(row.amount)}</td></tr>`)
    .join('')

  return `<div class="gt2">Resumen de valores anuales</div><table class="vt"><tbody>${rows}${totalRows(model.grand.totals, 1, esc)}</tbody></table>`
}

export function mtcValuationHtml(
  q: MasterQuotation,
  expandedCategoryIds: Iterable<string> | undefined,
  esc: (s: string) => string
): string {
  const model = buildMtcDocument(q, expandedCategoryIds)
  return `${model.blocks.map(block => blockHtml(block, model.summaryMode, esc)).join('')}${grandHtml(model, esc)}`
}
