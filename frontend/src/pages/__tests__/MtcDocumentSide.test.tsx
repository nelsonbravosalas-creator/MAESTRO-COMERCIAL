import type { MasterQuotation } from '../../types'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MtcDocumentSide } from '../maintenance/MtcDocumentSide'
import { useMaestro } from '../../stores/maestro-store'

let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => {
    root?.unmount()
  })

  container?.remove()
  container = null
  root = null
  useMaestro.setState({ quotations: [], activeId: null })
})

describe('MtcDocumentSide', () => {
  it('renderiza los datos institucionales de la cotización activa', () => {
    const q = {
      id: 'quotation-test-1',
      correlative: 'MTC-001-2026',
      date: '2026-11-09',
      client_name: 'CLIENTE DE PRUEBA',
      ref: 'Referencia de prueba',
      uf: 39500,
      usd: 950,
      iva: 19,
      categories: [],
      items: {},
      mtc_active_system: 0,
      mtc_config: {
        v: 1,
        summary_mode: false,
        show_summary_table: false,
        systems: [
          {
            id: 's1',
            name: 'Sistema',
            frequency: 'mensual',
            special_months: null,
            schedule: 'habil',
            currency: 'CLP',
            summary_text: null,
            consumables: {
              enabled: false,
              margin: 0,
              rows: [],
            },
            categories: null,
            items: null,
          },
        ],
      },
    } as unknown as MasterQuotation

    useMaestro.setState({ quotations: [q], activeId: q.id })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(<MtcDocumentSide />)
    })

    const side = container.querySelector('aside.mtcd-side')

    expect(side).not.toBeNull()
    expect(side?.textContent).toContain('MTC-001-2026')
    expect(side?.textContent).toContain('CLIENTE DE PRUEBA')
    expect(side?.textContent).toContain('Total anual con IVA')
    expect(side?.textContent).not.toContain('undefined')
    expect(side?.textContent).not.toContain('NaN')
  })
})
