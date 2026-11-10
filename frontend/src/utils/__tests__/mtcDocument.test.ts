import { describe, expect, it } from 'vitest'
import type { MasterQuotation } from '../../types'
import { buildMtcDocument } from '../mtcDocument'

describe('buildMtcDocument', () => {
  it('crea un bloque por defecto sin mtc_config y sin consumibles', () => {
    const quotation = {
      id: 'q-1',
      correlative: '001',
      iva: 19,
      uf: 39500,
      usd: 900,
      categories: [],
      items: {},
      mtc_config: null,
    } as unknown as MasterQuotation

    const document = buildMtcDocument(quotation)

    expect(document.blocks).toHaveLength(1)
    expect(document.grand).toBeNull()
    expect(document.blocks[0].consumables).toBeNull()
  })

  it('formatea los montos de un sistema UF como UF', () => {
    const quotation = {
      id: 'q-2',
      correlative: '002',
      iva: 19,
      uf: 39500,
      usd: 900,
      categories: [],
      items: {},
      mtc_config: {
        v: 1,
        summary_mode: false,
        show_summary_table: false,
        systems: [
          {
            id: 'sys-1',
            name: 'Sistema UF',
            frequency: 'anual',
            special_months: null,
            schedule: 'weekday',
            currency: 'UF',
            summary_text: null,
            consumables: { enabled: false, margin: 30, rows: [] },
            categories: null,
            items: null,
          },
        ],
      },
    } as unknown as MasterQuotation

    expect(buildMtcDocument(quotation).blocks[0].visitTotals[0].amount.startsWith('UF ')).toBe(true)
  })

  it('no muestra totales anuales para un régimen único', () => {
    const quotation = {
      id: 'q-3',
      correlative: '003',
      iva: 19,
      uf: 39500,
      usd: 900,
      categories: [],
      items: {},
      mtc_config: {
        v: 1,
        summary_mode: false,
        show_summary_table: false,
        systems: [
          {
            id: 'sys-1',
            name: 'Único',
            frequency: 'unico',
            special_months: null,
            schedule: 'weekday',
            currency: 'CLP',
            summary_text: null,
            consumables: { enabled: false, margin: 30, rows: [] },
            categories: null,
            items: null,
          },
        ],
      },
    } as unknown as MasterQuotation

    const block = buildMtcDocument(quotation).blocks[0]
    expect(block.annualTotals).toEqual([])
    expect(block.summaryRow.qty).toBe(1)
  })

  it('usa seis visitas para un régimen bimestral', () => {
    const quotation = {
      id: 'q-4',
      correlative: '004',
      iva: 19,
      uf: 39500,
      usd: 900,
      categories: [],
      items: {},
      mtc_config: {
        v: 1,
        summary_mode: false,
        show_summary_table: false,
        systems: [
          {
            id: 'sys-1',
            name: 'Bimestral',
            frequency: 'bimestral',
            special_months: null,
            schedule: 'weekday',
            currency: 'CLP',
            summary_text: null,
            consumables: { enabled: false, margin: 30, rows: [] },
            categories: null,
            items: null,
          },
        ],
      },
    } as unknown as MasterQuotation

    expect(buildMtcDocument(quotation).blocks[0].summaryRow.qty).toBe(6)
  })

  it('incluye precios de consumibles con el margen configurado', () => {
    const quotation = {
      id: 'q-5',
      correlative: '005',
      iva: 19,
      uf: 39500,
      usd: 900,
      categories: [],
      items: {},
      mtc_config: {
        v: 1,
        summary_mode: false,
        show_summary_table: false,
        systems: [
          {
            id: 'sys-1',
            name: 'Filtros',
            frequency: 'bimestral',
            special_months: null,
            schedule: 'weekday',
            currency: 'CLP',
            summary_text: null,
            consumables: {
              enabled: true,
              margin: 30,
              rows: [
                {
                  id: 'c-1',
                  desc: 'Filtro 1',
                  unidad: 'un',
                  per_module: 1,
                  modules: 1,
                  changes_per_year: 6,
                  cost: 11822,
                },
                {
                  id: 'c-2',
                  desc: 'Filtro 2',
                  unidad: 'un',
                  per_module: 1,
                  modules: 1,
                  changes_per_year: 2,
                  cost: 102525,
                },
              ],
            },
            categories: null,
            items: null,
          },
        ],
      },
    } as unknown as MasterQuotation

    const consumables = buildMtcDocument(quotation).blocks[0].consumables
    expect(consumables).not.toBeNull()
    expect(consumables!.priced[0].total).toBe('$101.334')
    expect(consumables!.priced[1].total).toBe('$292.928')
  })
})
