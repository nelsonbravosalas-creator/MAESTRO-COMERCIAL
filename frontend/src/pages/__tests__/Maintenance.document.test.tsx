import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MtcDocumentToolbar } from '../maintenance/MtcDocumentToolbar'
import { MtcValuationSection } from '../maintenance/MtcValuationSection'
import { useMaestro } from '../../stores/maestro-store'
import { defaultSummaryText } from '../../utils/mtcSystems'
import type { MasterQuotation } from '../../types'

let root: Root | undefined
let container: HTMLDivElement | undefined

function system(name: string) {
  return {
    name,
    frequency: 'mensual',
    special_months: 1,
    schedule: 'habil',
    currency: 'CLP',
    consumables: { enabled: false, margin: 0, rows: [] },
  }
}

function quotation(systems = 1, withConfig = true): MasterQuotation {
  return {
    id: 'mtc-document-test',
    type: 'mantencion',
    frequency: 'mensual',
    mtc_active_system: 0,
    show_uf_equivalent: false,
    show_usd_equivalent: false,
    usd: 0,
    categories: [],
    items: {},
    mtc_config: withConfig
      ? {
          v: 1,
          summary_mode: false,
          show_summary_table: false,
          systems: Array.from({ length: systems }, (_, i) => system(`Sistema ${i + 1}`)),
        }
      : null,
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
  useMaestro.setState({ quotations: [q], activeId: q.id, unsaved: false })
}

function checkByText(host: Element, text: string): HTMLInputElement | undefined {
  const label = [...host.querySelectorAll('label')].find(l => l.textContent?.trim() === text)
  return label?.querySelector('input[type="checkbox"]') ?? undefined
}

function click(el: Element) {
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

function active() {
  const s = useMaestro.getState()
  return s.quotations.find(q => q.id === s.activeId)!
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('MtcDocumentToolbar', () => {
  it('shows the presentation checks unchecked plus UF/USD for a single system', () => {
    setActive(quotation())
    const host = render(<MtcDocumentToolbar disabled={false} />)

    expect(checkByText(host, 'Presentación resumida')?.checked).toBe(false)
    expect(checkByText(host, 'Cuadro resumen final')?.checked).toBe(false)
    expect(checkByText(host, 'Mostrar UF')).toBeTruthy()
    expect(checkByText(host, 'Mostrar USD')).toBeTruthy()
  })

  it('toggles summary_mode and marks the store unsaved', () => {
    setActive(quotation())
    const host = render(<MtcDocumentToolbar disabled={false} />)

    click(checkByText(host, 'Presentación resumida')!)
    expect(active().mtc_config?.summary_mode).toBe(true)
    expect(useMaestro.getState().unsaved).toBe(true)

    click(checkByText(host, 'Presentación resumida')!)
    expect(active().mtc_config?.summary_mode).toBe(false)
  })

  it('toggles show_summary_table', () => {
    setActive(quotation())
    const host = render(<MtcDocumentToolbar disabled={false} />)

    click(checkByText(host, 'Cuadro resumen final')!)
    expect(active().mtc_config?.show_summary_table).toBe(true)
  })

  it('materializes the config with one system when mtc_config is null', () => {
    setActive(quotation(1, false))
    const host = render(<MtcDocumentToolbar disabled={false} />)

    click(checkByText(host, 'Presentación resumida')!)
    expect(active().mtc_config?.systems).toHaveLength(1)
    expect(active().mtc_config?.summary_mode).toBe(true)
  })

  it('hides UF and USD checks when there are two systems', () => {
    setActive(quotation(2))
    const host = render(<MtcDocumentToolbar disabled={false} />)

    expect(checkByText(host, 'Mostrar UF')).toBeUndefined()
    expect(checkByText(host, 'Mostrar USD')).toBeUndefined()
    expect(checkByText(host, 'Presentación resumida')).toBeTruthy()
  })

  it('disables every check when disabled', () => {
    setActive(quotation())
    const host = render(<MtcDocumentToolbar disabled />)

    const checks = [...host.querySelectorAll('input[type="checkbox"]')]
    expect(checks.length).toBeGreaterThanOrEqual(4)
    expect(checks.every(c => (c as HTMLInputElement).disabled)).toBe(true)
  })
})

function valuationQuotation(
  overrides: Record<string, unknown> = {},
  cfg: Record<string, unknown> = {},
  systems = 1,
  withConfig = true
): MasterQuotation {
  const base = quotation(systems, withConfig) as unknown as Record<string, unknown>
  const mtc = base.mtc_config as Record<string, unknown> | null
  return {
    ...base,
    iva: 19,
    uf: 39500,
    usd: 0,
    categories: [{ id: 'mo', label: 'Mano de obra', margin: 0 }],
    items: { mo: [{ cant: 1, unit: 100000 }] },
    mtc_config: mtc ? { ...mtc, ...cfg } : null,
    ...overrides,
  } as unknown as MasterQuotation
}

function mountValuation(disabled = false) {
  return render(
    <MtcValuationSection
      expandedCats={new Set()}
      onToggleCat={() => undefined}
      disabled={disabled}
    />
  )
}

const SUMMARY_LABEL = 'textarea[aria-label="Texto de la descripción del servicio"]'

function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function buttonByText(host: Element, text: string) {
  return [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
}

describe('MtcValuationSection', () => {
  it('detailed mode shows category rows and visit total, with no textarea', () => {
    setActive(valuationQuotation())
    const host = mountValuation()

    expect(host.textContent?.toUpperCase()).toContain('TOTAL POR VISITA CON IVA')
    expect(host.textContent).toContain('Mano de obra')
    expect(host.querySelector('textarea')).toBeNull()
  })

  it('summary mode shows the table headers, the textarea and a print-only copy', () => {
    setActive(valuationQuotation({}, { summary_mode: true }))
    const host = mountValuation()

    const heads = [...host.querySelectorAll('th')].map(th => th.textContent)
    expect(heads).toEqual(['Ítem', 'Cant.', 'Descripción', 'Precio unit.', 'Precio total'])

    const area = host.querySelector<HTMLTextAreaElement>(SUMMARY_LABEL)
    const expected = defaultSummaryText({
      frequency: 'mensual',
      special_months: 1,
      schedule: 'habil',
    })
    expect(area?.value).toBe(expected)
    expect(area?.classList.contains('mtc-summary-input')).toBe(true)

    const printOnly = host.querySelector<HTMLElement>('.print-only')
    expect(printOnly?.textContent).toBe(expected)
    expect(printOnly?.style.whiteSpace).toBe('pre-line')
  })

  it('editing stores summary_text, mirrors it in print-only and can be reset', () => {
    setActive(valuationQuotation({}, { summary_mode: true }))
    const host = mountValuation()
    const longText = Array.from({ length: 12 }, (_, i) => `Línea ${i + 1}`).join('\n')

    expect(buttonByText(host, 'Restablecer texto')).toBeUndefined()
    typeInto(host.querySelector<HTMLTextAreaElement>(SUMMARY_LABEL)!, longText)

    expect(active().mtc_config?.systems[0].summary_text).toBe(longText)
    expect(host.querySelector('.print-only')?.textContent).toBe(longText)

    click(buttonByText(host, 'Restablecer texto')!)
    expect(active().mtc_config?.systems[0].summary_text).toBeNull()
  })

  it('disables the textarea and the reset button when disabled', () => {
    setActive(valuationQuotation({}, { summary_mode: true }))
    const host = mountValuation(true)
    expect(host.querySelector<HTMLTextAreaElement>(SUMMARY_LABEL)?.disabled).toBe(true)

    act(() => root?.unmount())
    container?.remove()
    const edited = valuationQuotation({}, { summary_mode: true })
    edited.mtc_config!.systems[0].summary_text = 'Texto propio'
    setActive(edited)
    const host2 = mountValuation(true)
    const reset = buttonByText(host2, 'Restablecer texto') as HTMLButtonElement | undefined
    expect(reset).toBeTruthy()
    expect(reset?.disabled).toBe(true)
  })

  it('numbers the blocks IV.1 and IV.2 with two systems', () => {
    setActive(valuationQuotation({}, {}, 2))
    const host = mountValuation()
    const titles = [...host.querySelectorAll('.doc-group-title')].map(t => t.textContent ?? '')

    expect(titles.some(t => t.startsWith('IV.1'))).toBe(true)
    expect(titles.some(t => t.startsWith('IV.2'))).toBe(true)
  })

  it('shows the final summary table when show_summary_table is on', () => {
    setActive(valuationQuotation({}, { show_summary_table: true }))
    const host = mountValuation()

    expect(host.textContent).toContain('Resumen de valores anuales')
    expect(host.textContent?.toUpperCase()).toContain('PRECIO TOTAL CON IVA')
    expect(host.textContent?.toUpperCase()).toContain('TOTAL ANUAL CON IVA')
  })

  it('shows the UF equivalent for a single system with mtc_config null', () => {
    setActive(valuationQuotation({ show_uf_equivalent: true }, {}, 1, false))
    const host = mountValuation()

    const row = [...host.querySelectorAll('tr')].find(tr =>
      tr.textContent?.includes('Equivalente en UF')
    )
    const totalWithIva = 100000 * 12 * 1.19
    expect(row?.textContent).toContain(`${(totalWithIva / 39500).toFixed(2)} UF`)
    expect(host.textContent).not.toContain('Equivalente en USD')
  })

  it('does not show equivalents with two systems', () => {
    setActive(
      valuationQuotation({ show_uf_equivalent: true, show_usd_equivalent: true, usd: 950 }, {}, 2)
    )
    const host = mountValuation()

    expect(host.textContent).not.toContain('Equivalente en UF')
    expect(host.textContent).not.toContain('Equivalente en USD')
  })
})
