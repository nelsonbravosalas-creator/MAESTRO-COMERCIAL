import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { TabDocumentoMtc } from '../Maintenance'
import { MtcDocumentToolbar } from '../maintenance/MtcDocumentToolbar'
import { GroupedValuation } from '../../components/GroupedValuation'
import { useMaestro } from '../../stores/maestro-store'
import type { MasterQuotation } from '../../types'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ role: 'admin' }),
}))

let root: Root | undefined
let container: HTMLDivElement | undefined

function mtcQuotation(docStyle: 'grouped_unit_price' | null = null): MasterQuotation {
  return {
    id: 'g1',
    kind: 'maintenance',
    type: 'mantencion',
    status: 'Borrador',
    iva: 19,
    uf: 39500,
    usd: 0,
    frequency: 'mensual',
    mtc_active_system: 0,
    show_uf_equivalent: false,
    show_usd_equivalent: false,
    scope: [],
    exclusions: [],
    commercial: [],
    doc_style: docStyle,
    categories: [{ id: 'mo', label: 'Mano de obra', margin: 0 }],
    items: {
      mo: [
        { id: 'l1', desc: 'Chiller', cant: 2, unidad: 'un', unit: 1000 },
        { id: 'l2', desc: 'Bomba', cant: 3, unidad: 'un', unit: 1000 },
      ],
    },
    mtc_config: {
      v: 1,
      summary_mode: false,
      show_summary_table: false,
      systems: [
        {
          id: 's1',
          name: 'Sistema 1',
          frequency: 'mensual',
          special_months: null,
          schedule: 'habil',
          currency: 'CLP',
          summary_text: null,
          consumables: { enabled: false, margin: 0, rows: [] },
          categories: null,
          items: null,
        },
      ],
    },
  } as unknown as MasterQuotation
}

function render(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
  return container
}

function setActive(q: MasterQuotation) {
  useMaestro.setState({ quotations: [q], clients: [], activeId: q.id, unsaved: false })
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('GroupedValuation', () => {
  it('renders columns, subitems and Neto/IVA/Total footer', () => {
    const host = render(<GroupedValuation q={mtcQuotation()} mode="maintenance" />)
    const heads = [...host.querySelectorAll('th')].map(t => t.textContent)
    expect(heads).toEqual(['Ítem', 'Cant.', 'Descripción', 'Precio Unit.', 'Precio Total'])
    expect(host.textContent).toContain('Chiller')
    expect(host.textContent).toContain('Bomba')
    expect(host.textContent).toContain('Precio Neto Total')
    expect(host.textContent).toContain('IVA (19%)')
    expect(host.textContent).toContain('Precio Total (con IVA)')
    expect(host.querySelector('.grouped-diff-notice')).toBeNull()
  })

  it('shows an on-screen-only notice when totals differ from the engine', () => {
    const q = mtcQuotation()
    q.items.mo = [
      { id: 'a', desc: 'A', cant: 1, unidad: 'un', unit: 100 },
      { id: 'b', desc: 'B', cant: 2, unidad: 'un', unit: 0.5 },
    ] as never
    const host = render(<GroupedValuation q={q} mode="quotation" />)
    const note = host.querySelector('.grouped-diff-notice')
    expect(note).not.toBeNull()
    expect(note?.classList.contains('no-print')).toBe(true)
  })
})

describe('doc style selector', () => {
  it('switches doc_style in the store and marks unsaved', () => {
    setActive(mtcQuotation())
    const host = render(<MtcDocumentToolbar disabled={false} />)
    const select = host.querySelector(
      'select[aria-label="Estilo del documento"]'
    ) as HTMLSelectElement
    expect(select.value).toBe('default')

    act(() => {
      select.value = 'grouped_unit_price'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const q = useMaestro.getState().quotations[0]
    expect(q.doc_style).toBe('grouped_unit_price')
    expect(useMaestro.getState().unsaved).toBe(true)

    act(() => {
      select.value = 'default'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useMaestro.getState().quotations[0].doc_style).toBeNull()
  })
})

describe('TabDocumentoMtc', () => {
  it('keeps the default valuation when doc_style is null', () => {
    setActive(mtcQuotation(null))
    const host = render(<TabDocumentoMtc />)
    expect(host.querySelector('[data-testid="grouped-valuation"]')).toBeNull()
    expect(host.textContent?.toUpperCase()).toContain('TOTAL POR VISITA CON IVA')
  })

  it('renders the grouped valuation when doc_style is grouped_unit_price', () => {
    setActive(mtcQuotation('grouped_unit_price'))
    const host = render(<TabDocumentoMtc />)
    expect(host.querySelector('[data-testid="grouped-valuation"]')).not.toBeNull()
    expect(host.textContent?.toUpperCase()).not.toContain('TOTAL POR VISITA CON IVA')
  })
})
