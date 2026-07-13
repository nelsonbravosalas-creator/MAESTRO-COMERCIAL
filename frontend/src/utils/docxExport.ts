import {
  AlignmentType, BorderStyle, convertMillimetersToTwip as mm,
  Document, Packer, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} from 'docx'
import { calcTotals, fmtCLP } from '../stores/maestro-store'
import type { MasterClient, MasterQuotation } from '../types'
import { buildQuotationValuationRows } from './quotationRows'

const C = {
  DARK:  '0F172A', NAVY:  '1E3A8A', BLUE:  '2563EB',
  GRAY:  '64748B', LGRAY: 'F1F5F9', MGRAY: 'E2E8F0',
  WHITE: 'FFFFFF', BLACK: '111111',
}

const fmtDateLong = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

const tr = (text: string, opts: { bold?: boolean; sz?: number; color?: string; italic?: boolean } = {}) =>
  new TextRun({ text, bold: opts.bold, size: (opts.sz ?? 10.5) * 2, color: opts.color ?? C.BLACK, italics: opts.italic })

type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

const para = (runs: TextRun[], align?: Align, after = 60): Paragraph =>
  new Paragraph({ children: runs, alignment: align, spacing: { after } })

const rule = () =>
  new Paragraph({
    border: { bottom: { color: C.NAVY, style: BorderStyle.SINGLE, size: 8, space: 1 } },
    spacing: { after: 120 },
    text: '',
  })

const sectionTitle = (num: string, title: string): Paragraph =>
  new Paragraph({
    children: [new TextRun({ text: `${num}  ${title}`, bold: true, size: 22, color: C.NAVY, allCaps: true })],
    border:   { left: { color: C.NAVY, style: BorderStyle.SINGLE, size: 24, space: 10 } },
    indent:   { left: mm(4) },
    spacing:  { before: 280, after: 160 },
  })

const listItem = (i: number, text: string): Paragraph =>
  new Paragraph({
    children: [
      new TextRun({ text: `${i}.`, bold: true, size: 20, color: C.NAVY }),
      new TextRun({ text: `  ${text}`, size: 20, color: C.BLACK }),
    ],
    indent:  { left: mm(6), hanging: mm(6) },
    spacing: { after: 80 },
    keepLines: true,
  })

const noBorder = { style: BorderStyle.NONE, size: 0 } as const
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: C.MGRAY } as const

const mkCell = (
  children: Paragraph[],
  opts: { w?: number; shade?: string; span?: number; align?: Align } = {}
): TableCell =>
  new TableCell({
    children,
    columnSpan: opts.span,
    width:   opts.w !== undefined ? { size: opts.w, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    margins: { top: mm(2), bottom: mm(2), left: mm(3), right: mm(3) },
    borders: { top: thinBorder, bottom: thinBorder, left: noBorder, right: noBorder },
  })

const clientRow = (label: string, value: string, label2?: string, value2?: string): TableRow =>
  new TableRow({
    cantSplit: true,
    children: [
      mkCell([para([tr(label, { sz: 8.5, color: C.GRAY })])], { w: 15, shade: C.LGRAY }),
      mkCell([para([tr(value, { sz: 10 })])],                  { w: label2 !== undefined ? 35 : 85 }),
      ...(label2 !== undefined
        ? [
            mkCell([para([tr(label2, { sz: 8.5, color: C.GRAY })])], { w: 15, shade: C.LGRAY }),
            mkCell([para([tr(value2 ?? '', { sz: 10 })])],            { w: 35 }),
          ]
        : []),
    ],
  })

const darkCell = (children: Paragraph[], span?: number, w?: number): TableCell =>
  new TableCell({
    children,
    columnSpan: span,
    width:   w !== undefined ? { size: w, type: WidthType.PERCENTAGE } : undefined,
    shading: { fill: C.DARK, type: ShadingType.CLEAR },
    margins: { top: mm(2), bottom: mm(2), left: mm(3), right: mm(3) },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
  })

const sumRow = (label: string, value: string, shade: string, bold: boolean, color: string): TableRow =>
  new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        columnSpan: 2,
        children: [para([tr(label, { bold, sz: 10, color })], AlignmentType.RIGHT)],
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: mm(3), bottom: mm(3), left: mm(3), right: mm(3) },
        borders: { top: { style: BorderStyle.SINGLE, size: 8, color: C.MGRAY }, bottom: noBorder, left: noBorder, right: noBorder },
      }),
      new TableCell({
        children: [para([tr(value, { bold, sz: 10, color })], AlignmentType.RIGHT)],
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: mm(3), bottom: mm(3), left: mm(3), right: mm(3) },
        borders: { top: { style: BorderStyle.SINGLE, size: 8, color: C.MGRAY }, bottom: noBorder, left: noBorder, right: noBorder },
      }),
    ],
  })

export async function downloadDocx(params: {
  q:               MasterQuotation
  client:          MasterClient | undefined
  sessionUserName: string
  expandedCategoryIds?: Iterable<string>
}): Promise<void> {
  const { q, client, sessionUserName, expandedCategoryIds } = params
  const totals = calcTotals(q)
  const iva    = totals.venta * (q.iva / 100)
  const conIva = totals.venta + iva
  const enUF   = q.uf > 0 ? totals.venta / q.uf : 0

  // ── Letterhead ──────────────────────────────────────────────────────
  const letterhead: Paragraph[] = [
    para([tr('INGENIERÍA Y SERVICIOS BRAVO SPA', { bold: true, sz: 14, color: C.DARK })], undefined, 40),
    para([tr('RUT: 77.175.319-1  ·  Tel. +56 (9) 90943080', { sz: 9, color: C.GRAY })], undefined, 200),
    rule(),
    para([
      tr('COTIZACIÓN DE SERVICIOS', { bold: true, sz: 13, color: C.NAVY }),
      tr('    ', { sz: 13 }),
      tr(q.correlative, { bold: true, sz: 13, color: C.BLUE }),
    ], undefined, 60),
    para([tr(`Fecha de emisión: ${fmtDateLong(q.date)}`, { sz: 10, color: C.GRAY })], undefined, 300),
  ]

  // ── Client block ────────────────────────────────────────────────────
  const clientTable = new Table({
    width:  { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal:thinBorder, insideVertical: noBorder,
    },
    rows: [
      clientRow('EMPRESA',      q.client_name || '—', 'RUT',   client?.rut   || '—'),
      clientRow('CONTACTO',     q.contact     || '—', 'CARGO', client?.cargo || '—'),
      clientRow('REFERENCIA',   q.ref         || '—'),
      ...(q.enduser ? [clientRow('USUARIO FINAL', q.enduser)] : []),
      clientRow('ELABORADO POR', sessionUserName),
    ],
  })

  // ── Valuation table ─────────────────────────────────────────────────
  const valRows: TableRow[] = []
  buildQuotationValuationRows(q, expandedCategoryIds).forEach(row => {
    valRows.push(new TableRow({
      cantSplit: true,
      children: [
        mkCell([para([tr(String(row.rowNumber), { sz: 10, color: C.GRAY })], AlignmentType.CENTER)], { w: 8 }),
        mkCell([para([tr(row.cat.label, { sz: 10 })])],                                             { w: 72 }),
        mkCell([para([tr(fmtCLP.format(row.venta), { sz: 10, bold: true })], AlignmentType.RIGHT)], { w: 20 }),
      ],
    }))

    row.details.forEach(({ item, meta }) => {
      valRows.push(new TableRow({
        cantSplit: true,
        children: [
          mkCell([para([tr('', { sz: 9, color: C.GRAY })], AlignmentType.CENTER)], { w: 8, shade: 'F8FAFC' }),
          mkCell([
            para([
              tr('·  ', { sz: 9, color: C.GRAY }),
              tr(item.desc, { sz: 9, color: '334155' }),
              tr(`    ${meta}`, { sz: 8, color: C.GRAY }),
            ]),
          ], { w: 72, shade: 'F8FAFC' }),
          mkCell([para([tr('', { sz: 9, color: C.GRAY })], AlignmentType.RIGHT)], { w: 20, shade: 'F8FAFC' }),
        ],
      }))
    })
  })

  const valuationTable = new Table({
    width:  { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal:{ style: BorderStyle.SINGLE, size: 2, color: C.MGRAY }, insideVertical: noBorder,
    },
    rows: [
      new TableRow({
        children: [
          darkCell([para([tr('N°', { bold: true, sz: 8.5, color: C.GRAY })], AlignmentType.CENTER)], undefined, 8),
          darkCell([para([tr('DESCRIPCIÓN', { bold: true, sz: 8.5, color: C.GRAY })])],              undefined, 72),
          darkCell([para([tr('VALOR NETO CLP', { bold: true, sz: 8.5, color: C.GRAY })], AlignmentType.RIGHT)], undefined, 20),
        ],
      }),
      ...valRows,
      sumRow('Subtotal Neto',      fmtCLP.format(totals.venta), C.LGRAY,  true,  C.NAVY),
      sumRow(`IVA (${q.iva}%)`,    fmtCLP.format(iva),          C.LGRAY,  false, C.GRAY),
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            columnSpan: 2,
            children:  [para([tr('TOTAL CON IVA', { bold: true, sz: 13, color: C.WHITE })], AlignmentType.RIGHT)],
            shading:   { fill: C.DARK, type: ShadingType.CLEAR },
            margins:   { top: mm(4), bottom: mm(4), left: mm(3), right: mm(3) },
            borders:   { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
          }),
          new TableCell({
            children:  [para([tr(fmtCLP.format(conIva), { bold: true, sz: 13, color: C.WHITE })], AlignmentType.RIGHT)],
            shading:   { fill: C.DARK, type: ShadingType.CLEAR },
            margins:   { top: mm(4), bottom: mm(4), left: mm(3), right: mm(3) },
            borders:   { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
          }),
        ],
      }),
      ...(q.uf > 0
        ? [new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                columnSpan: 2,
                children:  [para([tr(`Equivalente en UF (ref. ${fmtCLP.format(q.uf)}/UF)`, { sz: 9, color: C.GRAY })], AlignmentType.RIGHT)],
                shading:   { fill: '1E293B', type: ShadingType.CLEAR },
                margins:   { top: mm(2), bottom: mm(2), left: mm(3), right: mm(3) },
                borders:   { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
              }),
              new TableCell({
                children:  [para([tr(`${enUF.toFixed(2)} UF`, { sz: 9, color: C.GRAY })], AlignmentType.RIGHT)],
                shading:   { fill: '1E293B', type: ShadingType.CLEAR },
                margins:   { top: mm(2), bottom: mm(2), left: mm(3), right: mm(3) },
                borders:   { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
              }),
            ],
          })]
        : []),
    ],
  })

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size:   { width: mm(215.9), height: mm(279.4) },
          margin: { top: mm(22), bottom: mm(22), left: mm(20), right: mm(20) },
        },
      },
      children: [
        ...letterhead,
        sectionTitle('', 'DATOS DEL CLIENTE'),
        clientTable,
        new Paragraph({ text: '', spacing: { after: 160 } }),
        // Scope
        sectionTitle('I.', 'ALCANCE DE LOS TRABAJOS'),
        ...q.scope.map((item, i) => listItem(i + 1, item)),
        new Paragraph({ text: '', spacing: { after: 120 } }),
        // Valuation
        sectionTitle('II.', 'VALORIZACIÓN DE TRABAJOS'),
        valuationTable,
        new Paragraph({ text: '', spacing: { after: 160 } }),
        // Exclusions
        sectionTitle('III.', 'EXCLUSIONES'),
        ...q.exclusions.map((item, i) => listItem(i + 1, item)),
        new Paragraph({ text: '', spacing: { after: 120 } }),
        // Commercial
        sectionTitle('IV.', 'CONDICIONES COMERCIALES'),
        ...q.commercial.map((item, i) => listItem(i + 1, item)),
        new Paragraph({ text: '', spacing: { after: 280 } }),
        // Footer
        rule(),
        para([tr('Esta cotización es válida según las condiciones indicadas en el punto IV.', { sz: 9, color: C.GRAY })]),
        para([tr('Ingeniería y Servicios Bravo SPA  ·  RUT: 77.175.319-1  ·  Tel. +56 (9) 90943080', { sz: 9, color: C.GRAY })]),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `Cotizacion-${q.correlative}-${q.date}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
