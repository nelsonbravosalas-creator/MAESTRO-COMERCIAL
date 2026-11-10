import { Document, Packer, Table } from 'docx'
import { describe, expect, it } from 'vitest'
import type { MtcDocumentModel } from '../mtcDocument'
import { buildMtcValuationChildren } from '../mtcDocx'

const model: MtcDocumentModel = {
  summaryMode: false,
  blocks: [
    {
      index: 0,
      title: 'IV.1 Sistema de bombas',
      currencyNote: 'Valores expresados en CLP.',
      currencyCode: 'CLP',
      visits: 12,
      isUnique: false,
      detailRows: [
        { catId: 'pump', n: 1, label: 'Mantención de bombas', amount: '$ 100.000', details: [] },
      ],
      visitTotals: [
        { label: 'Subtotal neto por visita', amount: '$ 100.000' },
        { label: 'IVA (19%)', amount: '$ 19.000' },
        { label: 'Total por visita con IVA', amount: '$ 119.000' },
      ],
      annualTotals: [
        { label: 'Subtotal neto anual', amount: '$ 1.200.000' },
        { label: 'IVA (19%)', amount: '$ 228.000' },
        { label: 'Total anual con IVA', amount: '$ 1.428.000' },
      ],
      summaryRow: {
        item: 1,
        qty: 12,
        text: 'Mantención de bombas',
        edited: false,
        unit: '$ 100.000',
        total: '$ 1.200.000',
      },
      summaryTotals: [
        { label: 'Precio neto total', amount: '$ 1.200.000' },
        { label: 'IVA (19%)', amount: '$ 228.000' },
        { label: 'Precio total con IVA', amount: '$ 1.428.000' },
      ],
      consumables: {
        schedule: [
          {
            n: 1,
            desc: 'Filtro de repuesto',
            unidad: 'un',
            perModule: 1,
            modules: 2,
            changes: 4,
            qty: 8,
          },
        ],
        priced: [{ n: 1, qty: 8, desc: 'Filtro de repuesto', unit: '$ 5.000', total: '$ 40.000' }],
        totals: [
          { label: 'Subtotal neto consumibles', amount: '$ 40.000' },
          { label: 'IVA (19%)', amount: '$ 7.600' },
          { label: 'Total consumibles con IVA', amount: '$ 47.600' },
        ],
      },
    },
    {
      index: 1,
      title: 'IV.2 Sistema eléctrico',
      currencyNote: 'Valores expresados en USD.',
      currencyCode: 'USD',
      visits: 2,
      isUnique: true,
      detailRows: [],
      visitTotals: [],
      annualTotals: [],
      summaryRow: {
        item: 2,
        qty: 2,
        text: 'Inspección eléctrica\nInforme técnico',
        edited: true,
        unit: 'USD 50',
        total: 'USD 100',
      },
      summaryTotals: [
        { label: 'Precio neto total', amount: 'USD 100' },
        { label: 'IVA (19%)', amount: 'USD 19' },
        { label: 'Precio total con IVA', amount: 'USD 119' },
      ],
      consumables: null,
    },
  ],
  grand: {
    rows: [
      { label: 'Sistema de bombas', amount: '$ 1.200.000' },
      { label: 'Sistema eléctrico', amount: 'USD 100' },
    ],
    totals: [
      { label: 'Subtotal neto anual', amount: '$ 1.300.000' },
      { label: 'IVA (19%)', amount: '$ 247.000' },
      { label: 'Total anual con IVA', amount: '$ 1.547.000' },
    ],
  },
}

describe('buildMtcValuationChildren', () => {
  it('construye tablas DOCX serializables', async () => {
    const children = buildMtcValuationChildren(model)

    expect(children.length).toBeGreaterThan(0)
    expect(children.filter(child => child instanceof Table)).toHaveLength(6)
    await expect(Packer.toBuffer(new Document({ sections: [{ children }] }))).resolves.toBeDefined()
  })

  it('acepta resumen general y consumibles nulos', () => {
    const withoutOptionalSections: MtcDocumentModel = {
      ...model,
      blocks: model.blocks.map(block => ({ ...block, consumables: null })),
      grand: null,
    }

    expect(() => buildMtcValuationChildren(withoutOptionalSections)).not.toThrow()
  })
})
