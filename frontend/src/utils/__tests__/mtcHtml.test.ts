import { describe, expect, it } from 'vitest'
import type { MasterQuotation } from '../../types'
import { mtcValuationHtml } from '../mtcHtml'

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function quotation(
  options: {
    summaryMode?: boolean
    systems?: unknown[]
    showSummaryTable?: boolean
  } = {}
): MasterQuotation {
  const systems = options.systems ?? [
    {
      name: 'Sistema principal',
      frequency: 'monthly',
      currency: 'CLP',
      summary_text: 'Texto de resumen',
      consumables: { enabled: false, rows: [] },
    },
  ]

  return {
    uf: 36000,
    usd: 900,
    iva: 19,
    categories: [],
    items: [],
    mtc_config: {
      summary_mode: options.summaryMode ?? false,
      show_summary_table: options.showSummaryTable ?? false,
      systems,
    },
  } as unknown as MasterQuotation
}

describe('mtcValuationHtml', () => {
  it('genera la valorización detallada sin incluir el texto de resumen', () => {
    const html = mtcValuationHtml(quotation(), undefined, esc)

    expect(html).toContain('class="vt"')
    expect(html).not.toContain('Texto de resumen')
  })

  it('genera el texto resumido escapado', () => {
    const html = mtcValuationHtml(
      quotation({
        summaryMode: true,
        systems: [
          {
            name: 'Sistema principal',
            frequency: 'monthly',
            currency: 'CLP',
            summary_text: 'Mantención\n<script>alert(1)</script>',
            consumables: { enabled: false, rows: [] },
          },
        ],
      }),
      undefined,
      esc
    )

    expect(html).toContain('Mantención<br>&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('incluye los títulos de dos sistemas', () => {
    const html = mtcValuationHtml(
      quotation({
        systems: [
          {
            name: 'Uno',
            frequency: 'monthly',
            currency: 'CLP',
            consumables: { enabled: false, rows: [] },
          },
          {
            name: 'Dos',
            frequency: 'monthly',
            currency: 'CLP',
            consumables: { enabled: false, rows: [] },
          },
        ],
      }),
      undefined,
      esc
    )

    expect(html).toContain('IV.1')
    expect(html).toContain('IV.2')
  })

  it('incluye el resumen anual cuando está habilitado', () => {
    const html = mtcValuationHtml(quotation({ showSummaryTable: true }), undefined, esc)

    expect(html).toContain('Resumen de valores anuales')
  })
})
