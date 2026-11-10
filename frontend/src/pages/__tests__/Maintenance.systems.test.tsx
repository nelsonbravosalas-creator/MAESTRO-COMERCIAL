import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MtcSystemsPanel } from '../maintenance/MtcSystemsPanel'
import { MtcSystemTabs } from '../maintenance/MtcSystemTabs'
import { useMaestro } from '../../stores/maestro-store'
import type { MasterQuotation } from '../../types'
import { MTC_FREQUENCIES } from '../../utils/mtcSystems'

let root: Root | undefined
let container: HTMLDivElement | undefined

function quotation(): MasterQuotation {
  return {
    id: 'mtc-systems-test',
    type: 'mantencion',
    frequency: 'mensual',
    mtc_active_system: 0,
    categories: [],
    items: {},
    mtc_config: {
      systems: [
        {
          name: 'Sistema principal',
          frequency: 'mensual',
          special_months: 1,
          schedule: 'habil',
          currency: 'CLP',
          consumables: { enabled: false, margin: 0, rows: [] },
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

function fieldByLabel(host: Element, text: string): HTMLInputElement | HTMLSelectElement {
  const label = [...host.querySelectorAll('label')].find(
    candidate => candidate.textContent === text
  )
  if (!label?.htmlFor) throw new Error(`No label for ${text}`)
  const field = host.querySelector(`#${label.htmlFor}`)
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
    throw new Error(`No field for ${text}`)
  }
  return field
}

function setActive(q: MasterQuotation) {
  useMaestro.setState({ quotations: [q], activeId: q.id })
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('MtcSystemsPanel', () => {
  it('renders the first system and the configured frequency options', () => {
    setActive(quotation())
    const host = render(<MtcSystemsPanel disabled={false} />)

    expect(host.textContent).toContain('Valorización 1')
    expect(fieldByLabel(host, 'Sistema o subsistema')).toBeTruthy()
    const frequency = fieldByLabel(host, 'Régimen') as HTMLSelectElement
    expect([...frequency.options].map(option => option.value)).toEqual(MTC_FREQUENCIES)
    expect(frequency.options).toHaveLength(8)
    expect(fieldByLabel(host, 'Horario')).toBeTruthy()
    expect(fieldByLabel(host, 'Moneda de los precios')).toBeTruthy()
  })

  it('shows the special-month field for the special frequency', () => {
    const q = quotation()
    q.mtc_config!.systems[0].frequency = 'especial'
    setActive(q)
    const host = render(<MtcSystemsPanel disabled={false} />)
    expect(fieldByLabel(host, 'Cada cuántos meses')).toBeTruthy()
  })

  it('adds a valuation and hides remove while there is only one', () => {
    setActive(quotation())
    const host = render(<MtcSystemsPanel disabled={false} />)
    expect(
      [...host.querySelectorAll('button')].some(button => button.textContent === 'Quitar')
    ).toBe(false)

    const add = [...host.querySelectorAll('button')].find(
      button => button.textContent === 'Agregar valorización'
    )!
    act(() => add.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.textContent).toContain('Valorización 2')
    expect(
      [...host.querySelectorAll('button')].some(button => button.textContent === 'Quitar')
    ).toBe(true)
  })

  it('shows the consumables margin when consumables are enabled', () => {
    setActive(quotation())
    const host = render(<MtcSystemsPanel disabled={false} />)
    const check = fieldByLabel(host, 'Incluye repuestos consumibles') as HTMLInputElement

    act(() => {
      check.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const marginLabel = [...host.querySelectorAll('label')].find(
      label => label.textContent === 'Margen de consumibles (%)'
    )
    expect(marginLabel?.htmlFor).toBeTruthy()

    const margin = host.querySelector(`#${marginLabel!.htmlFor}`)
    expect(margin).toBeInstanceOf(HTMLInputElement)
  })
})

describe('MtcSystemTabs', () => {
  it('selects the system associated with the pressed tab', () => {
    const q = quotation()
    q.mtc_config!.systems.push({
      ...q.mtc_config!.systems[0],
      name: 'Sistema secundario',
      categories: q.categories,
      items: q.items,
      consumables: { enabled: false, margin: 0, rows: [] },
    })
    expect(q.mtc_config!.systems[1]).toBeTruthy()

    setActive(q)
    const host = render(<MtcSystemTabs />)
    const second = [...host.querySelectorAll('button')].find(
      button => button.textContent === 'Sistema secundario'
    )!

    act(() => second.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    const activeQuotation = useMaestro
      .getState()
      .quotations.find(quotation => quotation.id === q.id)
    expect(activeQuotation?.mtc_active_system).toBe(1)
  })
})
