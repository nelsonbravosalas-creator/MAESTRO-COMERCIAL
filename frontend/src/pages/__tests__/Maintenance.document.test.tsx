import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MtcDocumentToolbar } from '../maintenance/MtcDocumentToolbar'
import { useMaestro } from '../../stores/maestro-store'
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
