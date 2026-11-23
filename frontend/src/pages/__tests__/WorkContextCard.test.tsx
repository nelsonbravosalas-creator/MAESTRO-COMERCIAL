import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { api, ApiError } from '../../api/api'
import { WorkContextCard } from '../../components/WorkContextCard'
import { useMaestro } from '../../stores/maestro-store'
import Quotations from '../Quotations'
import Maintenance from '../Maintenance'
import type { MasterQuotation, WorkContext, WorkProyeccion } from '../../types'

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    role: 'admin',
    canApproveQuotation: true,
    canCreateQuotation: true,
    canEditQuotation: true,
    canDeleteQuotation: true,
  }),
}))
vi.mock('../../hooks/useCityDistances', () => ({
  useCityDistances: () => ({ distances: {}, loading: false, getDistance: () => null }),
}))

let root: Root
let container: HTMLDivElement

const QID = 'a1b2c3d4-0000-4000-8000-000000000001'

const PROY: WorkProyeccion = {
  generada_en: '2026-11-23T10:00:00Z',
  justificacion: 'Se estima por el tamaño del equipo.',
  recursos: {
    dotacion: [{ rol: 'Técnico HVAC', cantidad: 2 }],
    horas: 16,
    materiales: [{ desc: 'Gas R410A', cantidad: 3, unidad: 'kg' }],
    subcontratos: [{ desc: 'Grúa', monto_estimado: 150000 }],
  },
}

function quote(kind: 'project' | 'maintenance', wc?: WorkContext | null): MasterQuotation {
  return {
    id: QID,
    correlative: 'SYM-001',
    client_id: 'c1',
    client_name: 'Cliente',
    contact_id: null,
    contact: '',
    status: 'Borrador',
    operState: 'Pendiente de ejecución',
    uf: 39500,
    usd: 0,
    iva: 19,
    version: 1,
    kind,
    type: kind === 'maintenance' ? 'mantencion' : undefined,
    frequency: kind === 'maintenance' ? 'mensual' : null,
    categories: [{ id: 'mo', label: 'Mano de obra', margin: 0 }],
    items: { mo: [] },
    scope: [],
    exclusions: [],
    commercial: [],
    mtc_active_system: 0,
    show_uf_equivalent: false,
    show_usd_equivalent: false,
    display_currency: 'CLP',
    mtc_config:
      kind === 'maintenance'
        ? {
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
          }
        : null,
    work_context: wc,
  } as unknown as MasterQuotation
}

const WC: WorkContext = {
  v: 1,
  tipo: 'correctivo',
  alcance: 'Reemplazo de compresor',
  magnitudes: [{ clave: 'equipos', valor: 2, unidad: 'un' }],
  dias: { plazo: 5, tipo_plazo: 'habiles', terreno: 2 },
}

function setActive(q: MasterQuotation) {
  useMaestro.setState({
    quotations: [q],
    clients: [],
    activeId: q.id,
    activeTab: 'base',
    unsaved: false,
    apiReady: true,
  })
}

async function mount(node: React.ReactNode) {
  await act(async () => {
    root.render(node)
  })
}

const byText = (text: string) =>
  Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as
    HTMLButtonElement | undefined

async function click(el: Element | undefined | null) {
  expect(el).toBeTruthy()
  await act(async () => {
    ;(el as HTMLElement).click()
  })
}

async function change(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: string) {
  await act(async () => {
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v)
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })
    )
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.spyOn(api, 'updateQuotation').mockImplementation(async q => ({
    ...q,
    version: q.version + 1,
  }))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe('WorkContextCard en las pestañas Base', () => {
  it('se renderiza en TabBase de Cotizaciones, bajo Guardar encabezado', async () => {
    setActive(quote('project', WC))
    await mount(<Quotations />)
    await click(container.querySelector('button[title="Editar"]'))
    const card = container.querySelector('[data-testid="work-context-card"]')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('Contexto del trabajo')
    const save = byText('Guardar encabezado') as HTMLElement
    expect(
      save.compareDocumentPosition(card as Node) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('se renderiza en TabBaseMtc de Mantenciones', async () => {
    setActive(quote('maintenance', WC))
    await mount(<Maintenance />)
    await click(container.querySelector('button[title="Editar"]'))
    expect(container.querySelector('[data-testid="work-context-card"]')).not.toBeNull()
  })
})

describe('WorkContextCard', () => {
  it('cotizaciones antiguas sin work_context muestran una tarjeta vacía', async () => {
    setActive(quote('project', null))
    await mount(<WorkContextCard />)
    expect((container.querySelector('#wc-alcance') as HTMLTextAreaElement).value).toBe('')
    expect(container.querySelectorAll('.wc-mag-row')).toHaveLength(0)
    expect(container.querySelector('[data-testid="work-context-proyeccion"]')).toBeNull()
    expect(container.textContent).toContain(
      'No escribas RUT, correos, teléfonos ni nombres de contacto'
    )
  })

  it('agrega y quita magnitudes (máximo 20)', async () => {
    setActive(quote('project', null))
    await mount(<WorkContextCard />)
    await click(byText('Agregar magnitud'))
    await click(byText('Agregar magnitud'))
    expect(container.querySelectorAll('.wc-mag-row')).toHaveLength(2)
    await click(container.querySelector('button[aria-label="Quitar magnitud 1"]'))
    expect(container.querySelectorAll('.wc-mag-row')).toHaveLength(1)
    for (let i = 0; i < 25; i++) await click(byText('Agregar magnitud'))
    expect(container.querySelectorAll('.wc-mag-row')).toHaveLength(20)
    expect(byText('Agregar magnitud')?.disabled).toBe(true)
  })

  it('"otro" muestra el campo de texto', async () => {
    setActive(quote('project', null))
    await mount(<WorkContextCard />)
    expect(container.querySelector('#wc-tipo-otro')).toBeNull()
    await change(container.querySelector('#wc-tipo') as HTMLSelectElement, 'otro')
    expect(container.querySelector('#wc-tipo-otro')).not.toBeNull()
  })

  it('analizar con éxito guarda primero, muestra la proyección y la persiste', async () => {
    setActive(quote('project', WC))
    useMaestro.setState({ unsaved: true })
    const analyze = vi.spyOn(api, 'analyzeWorkContext').mockResolvedValue({ proyeccion: PROY })
    await mount(<WorkContextCard />)
    await click(byText('Analizar contexto'))

    const firstSave = vi.mocked(api.updateQuotation).mock.invocationCallOrder[0]
    expect(firstSave).toBeLessThan(analyze.mock.invocationCallOrder[0])
    expect(analyze.mock.calls[0][1].proyeccion).toBeUndefined()
    const proy = container.querySelector('[data-testid="work-context-proyeccion"]')
    expect(proy?.textContent).toContain('Técnico HVAC')
    expect(proy?.textContent).toContain('Gas R410A')
    expect(proy?.textContent).toContain('Grúa')
    expect(proy?.textContent).toContain('Se estima por el tamaño del equipo.')
    const lastSave = vi.mocked(api.updateQuotation).mock.calls.slice(-1)[0]?.[0]
    expect(lastSave?.work_context?.proyeccion).toEqual(PROY)
  })

  it('si el análisis falla muestra el aviso y no pierde el formulario', async () => {
    setActive(quote('project', WC))
    vi.spyOn(api, 'analyzeWorkContext').mockRejectedValue(
      new ApiError(503, 'El servicio de análisis no está disponible.')
    )
    await mount(<WorkContextCard />)
    await click(byText('Analizar contexto'))
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('El servicio de análisis no está disponible.')
    expect(alert?.textContent).toContain('se guardó')
    expect((container.querySelector('#wc-alcance') as HTMLTextAreaElement).value).toBe(
      'Reemplazo de compresor'
    )
    expect(container.querySelectorAll('.wc-mag-row')).toHaveLength(1)
    expect(byText('Analizar contexto')?.disabled).toBe(false)
  })

  it('"Guardar como ejemplo" envía solo recursos_finales y nota', async () => {
    setActive(quote('project', { ...WC, proyeccion: PROY }))
    const learn = vi.spyOn(api, 'learnWorkContext').mockResolvedValue({ id: 'x' })
    await mount(<WorkContextCard />)
    await change(container.querySelector('#wc-horas') as HTMLInputElement, '24')
    await change(container.querySelector('#wc-nota') as HTMLTextAreaElement, 'Faltó una grúa')
    await click(byText('Guardar como ejemplo'))
    expect(learn).toHaveBeenCalledTimes(1)
    const [id, recursos, nota] = learn.mock.calls[0]
    expect(id).toBe(QID)
    expect(recursos.horas).toBe(24)
    expect(nota).toBe('Faltó una grúa')
    expect(learn.mock.calls[0]).toHaveLength(3)
    expect(container.querySelector('.wc-notice-success')).not.toBeNull()
  })

  it('editar otros campos conserva proyeccion y recursos_finales', async () => {
    const fin = { ...PROY.recursos, horas: 30 }
    setActive(quote('project', { ...WC, proyeccion: PROY, recursos_finales: fin }))
    await mount(<WorkContextCard />)
    await change(container.querySelector('#wc-alcance') as HTMLTextAreaElement, 'Otro alcance')
    const wc = useMaestro.getState().quotations[0].work_context
    expect(wc?.alcance).toBe('Otro alcance')
    expect(wc?.proyeccion).toEqual(PROY)
    expect(wc?.recursos_finales).toEqual(fin)
  })
})

describe('WorkContextCard con borrador local (q-*)', () => {
  it('guardar el borrador cambia el id y aun así aparecen Recursos finales', async () => {
    const draft = { ...quote('project', WC), id: 'q-123' } as MasterQuotation
    setActive(draft)
    vi.spyOn(api, 'createQuotation').mockImplementation(async q => ({ ...q, id: QID, version: 1 }))
    vi.spyOn(api, 'analyzeWorkContext').mockResolvedValue({ proyeccion: PROY })
    await mount(<WorkContextCard />)
    await click(byText('Analizar contexto'))
    expect(useMaestro.getState().activeId).toBe(QID)
    expect(container.querySelector('[data-testid="work-context-proyeccion"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="work-context-final"]')).not.toBeNull()
    expect(byText('Guardar como ejemplo')).toBeTruthy()
  })
})
