import {
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip as mm,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import type { MtcDocumentModel, MtcMoneyRow, MtcSystemBlock } from './mtcDocument'

const DARK = '0F172A'
const NAVY = '1E3A8A'
const GRAY = '64748B'
const LGRAY = 'F1F5F9'
const MGRAY = 'E2E8F0'
const WHITE = 'FFFFFF'
const BLACK = '111111'

type TextOptions = {
  bold?: boolean
  color?: string
  sz?: number
}

type CellOptions = {
  w?: number
  shade?: string
  span?: number
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
}

const borders = {
  top: { style: BorderStyle.SINGLE, size: 2, color: MGRAY },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: MGRAY },
  left: { style: BorderStyle.SINGLE, size: 2, color: MGRAY },
  right: { style: BorderStyle.SINGLE, size: 2, color: MGRAY },
}

function text(value: string, options: TextOptions = {}): TextRun {
  return new TextRun({
    text: value,
    ...(options.bold === undefined ? {} : { bold: options.bold }),
    ...(options.color === undefined ? {} : { color: options.color }),
    ...(options.sz === undefined ? {} : { size: options.sz }),
  })
}

function para(
  runs: TextRun[],
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
): Paragraph {
  return new Paragraph({
    children: runs,
    ...(align === undefined ? {} : { alignment: align }),
  })
}

function cell(runs: TextRun[], options: CellOptions = {}): TableCell {
  return new TableCell({
    children: [para(runs, options.align)],
    borders,
    width: { size: options.w ?? mm(20), type: WidthType.DXA },
    ...(options.shade === undefined
      ? {}
      : { shading: { type: ShadingType.CLEAR, fill: options.shade } }),
    ...(options.span === undefined ? {} : { columnSpan: options.span }),
  })
}

function row(cells: TableCell[]): TableRow {
  return new TableRow({ children: cells })
}

function table(rows: TableRow[]): Table {
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

function headingCells(labels: string[]): TableCell[] {
  return labels.map(label =>
    cell([text(label, { bold: true, color: WHITE, sz: 16 })], {
      shade: DARK,
      align: AlignmentType.CENTER,
    })
  )
}

function moneyTotalRows(totals: MtcMoneyRow[], columns: number): TableRow[] {
  return totals.map((total, index) => {
    const isFinal = index === totals.length - 1
    const shade = isFinal ? DARK : LGRAY
    const color = isFinal ? WHITE : BLACK
    const labelSpan = columns - 1

    return row([
      cell([text(total.label, { bold: true, color, sz: 16 })], {
        shade,
        ...(labelSpan > 1 ? { span: labelSpan } : {}),
        align: AlignmentType.RIGHT,
      }),
      cell([text(total.amount, { bold: true, color, sz: 16 })], {
        shade,
        align: AlignmentType.RIGHT,
      }),
    ])
  })
}

function groupTitle(value: string): Paragraph {
  return para([text(value, { bold: true, color: NAVY, sz: 18 })])
}

function summaryDescriptionRuns(value: string): TextRun[] {
  return value
    .split('\n')
    .map(
      (part, index) =>
        new TextRun({ text: part, ...(index === 0 ? {} : { break: 1 }), color: BLACK, size: 16 })
    )
}

function detailedTables(block: MtcSystemBlock): Table[] {
  const visitRows = [
    row(headingCells(['N°', 'Descripción', 'Valor neto'])),
    ...block.detailRows.map(detail =>
      row([
        cell([text(String(detail.n), { sz: 16 })], { align: AlignmentType.CENTER }),
        cell([text(detail.label, { sz: 16 })]),
        cell([text(detail.amount, { sz: 16 })], { align: AlignmentType.RIGHT }),
      ])
    ),
    ...moneyTotalRows(block.visitTotals, 3),
  ]

  const tables = [table(visitRows)]
  if (!block.isUnique) {
    tables.push(table(moneyTotalRows(block.annualTotals, 3)))
  }
  return tables
}

function summaryTable(block: MtcSystemBlock): Table {
  return table([
    row(headingCells(['Ítem', 'Cant.', 'Descripción', 'Precio unit.', 'Precio total'])),
    row([
      cell([text(String(block.summaryRow.item), { sz: 16 })], { align: AlignmentType.CENTER }),
      cell([text(String(block.summaryRow.qty), { sz: 16 })], { align: AlignmentType.CENTER }),
      cell(summaryDescriptionRuns(block.summaryRow.text)),
      cell([text(block.summaryRow.unit, { sz: 16 })], { align: AlignmentType.RIGHT }),
      cell([text(block.summaryRow.total, { sz: 16 })], { align: AlignmentType.RIGHT }),
    ]),
    ...moneyTotalRows(block.summaryTotals, 5),
  ])
}

function consumableTables(block: MtcSystemBlock): (Paragraph | Table)[] {
  if (block.consumables === null) return []

  const { consumables } = block
  return [
    groupTitle('Repuestos consumibles'),
    table([
      row(
        headingCells([
          'Ítem',
          'Descripción',
          'Un.',
          'Por módulo',
          'Módulos',
          'Cambios/año',
          'Cantidad',
        ])
      ),
      ...consumables.schedule.map(line =>
        row([
          cell([text(String(line.n), { sz: 16 })], { align: AlignmentType.CENTER }),
          cell([text(line.desc, { sz: 16 })]),
          cell([text(line.unidad, { sz: 16 })], { align: AlignmentType.CENTER }),
          cell([text(String(line.perModule), { sz: 16 })], { align: AlignmentType.CENTER }),
          cell([text(String(line.modules), { sz: 16 })], { align: AlignmentType.CENTER }),
          cell([text(String(line.changes), { sz: 16 })], { align: AlignmentType.CENTER }),
          cell([text(String(line.qty), { sz: 16 })], { align: AlignmentType.CENTER }),
        ])
      ),
    ]),
    table([
      row(headingCells(['Ítem', 'Cant.', 'Descripción', 'Precio unit.', 'Precio total'])),
      ...consumables.priced.map(line =>
        row([
          cell([text(String(line.n), { sz: 16 })], { align: AlignmentType.CENTER }),
          cell([text(String(line.qty), { sz: 16 })], { align: AlignmentType.CENTER }),
          cell([text(line.desc, { sz: 16 })]),
          cell([text(line.unit, { sz: 16 })], { align: AlignmentType.RIGHT }),
          cell([text(line.total, { sz: 16 })], { align: AlignmentType.RIGHT }),
        ])
      ),
      ...moneyTotalRows(consumables.totals, 5),
    ]),
  ]
}

export function buildMtcValuationChildren(model: MtcDocumentModel): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = []

  for (const block of model.blocks) {
    children.push(para([text(block.title.toUpperCase(), { bold: true, color: NAVY, sz: 15 })]))
    children.push(para([text(block.currencyNote, { color: GRAY, sz: 16 })]))
    children.push(...(model.summaryMode ? [summaryTable(block)] : detailedTables(block)))
    children.push(...consumableTables(block))
    children.push(para([]))
  }

  if (model.grand !== null) {
    children.push(groupTitle('Resumen de valores anuales'))
    children.push(
      table([
        row(headingCells(['Concepto', 'Valor neto'])),
        ...model.grand.rows.map(value =>
          row([
            cell([text(value.label, { sz: 16 })]),
            cell([text(value.amount, { sz: 16 })], { align: AlignmentType.RIGHT }),
          ])
        ),
        ...moneyTotalRows(model.grand.totals, 2),
      ])
    )
  }

  return children
}
