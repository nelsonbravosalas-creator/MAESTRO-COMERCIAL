import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CategoryId, CatalogItemUI, CatalogsUI, CostCategory, CostItem,
  MasterClient, MasterQuotation, QuoteStatus, OperState,
} from '../types'
import api, { ApiError } from '../api/api'
import type { ImportQuotationResult } from '../api/api'

// ── Defaults ──────────────────────────────────────────────────

export const DEFAULT_CATALOGS: CatalogsUI = {
  mo: [
    { desc: 'Supervisor',                     unidad: 'Hora', price: 120000 },
    { desc: 'Técnico Especializado HVAC',     unidad: 'Hora', price: 150000 },
    { desc: 'Técnico Electricista',           unidad: 'Hora', price: 130000 },
    { desc: 'Ayudante Técnico HVAC',          unidad: 'Hora', price: 80000  },
    { desc: 'Prevencionista',                 unidad: 'Hora', price: 90000  },
  ],
  log: [
    { desc: 'Cálculo de Distancias',          unidad: 'km',  price: 990    },
    { desc: 'Flete Herramientas STGO-Faena',  unidad: 'Gl',  price: 250000 },
    { desc: 'Viáticos Faena Local',           unidad: 'Un',  price: 45000  },
    { desc: 'Alimentación',                   unidad: 'Un',  price: 15000  },
    { desc: 'Arriendo Vehículo',              unidad: 'Día', price: 45000  },
    { desc: 'Pasaje Aéreo',                   unidad: 'Un',  price: 120000 },
  ],
  mat: [
    { desc: 'Cañería Cobre Tira K 1"',        unidad: 'Tir', price: 49100  },
    { desc: 'Cañería Cobre Tira K 3/4"',      unidad: 'Tir', price: 33800  },
    { desc: 'Cañería Cobre Tira K 1/2"',      unidad: 'Tir', price: 28500  },
    { desc: 'Cañería Cobre Tira L 3/8"',      unidad: 'Tir', price: 7500   },
    { desc: 'Copla Cobre 1"',                 unidad: 'Uni', price: 700    },
    { desc: 'Copla Cobre 3/4"',               unidad: 'Uni', price: 330    },
  ],
  rep: [
    { desc: 'Compressor ZR 16 M3 E TWD 561',  unidad: 'Uni', price: 1977397 },
    { desc: 'Bomba de Condensado Orange',      unidad: 'Uni', price: 159500  },
    { desc: 'Filtro Deshidratador Vertiv',     unidad: 'Uni', price: 85400   },
    { desc: 'Contactor Trifásico 180A 220VAC', unidad: 'Un',  price: 440000  },
  ],
  ins: [
    { desc: 'Soldadura de Plata al 15%',       unidad: 'Kg',  price: 7500   },
    { desc: 'Nitrógeno N2',                    unidad: 'Rec', price: 35000  },
    { desc: 'Refrigerante R-410a',             unidad: 'Kg',  price: 120000 },
    { desc: 'Refrigerante R-134a',             unidad: 'Kg',  price: 115000 },
    { desc: 'Pintura de Seguridad',            unidad: 'Gl',  price: 25000  },
    { desc: 'Canalización EMT Galvanizada',    unidad: 'Tir', price: 12500  },
    { desc: 'Aislación Térmica Armaflex',      unidad: 'Tir', price: 8500   },
  ],
}

const DEFAULT_CATEGORIES: CostCategory[] = [
  { id: 'mo',  label: 'Mano de Obra Especializada',     margin: 35, color: '#1e293b', showDetails: false, showValues: false, note: '', collapsed: false },
  { id: 'log', label: 'Logística y Operación',          margin: 30, color: '#475569', showDetails: false, showValues: false, note: '', collapsed: true  },
  { id: 'mat', label: 'Provisión de Materiales',        margin: 30, color: '#1e3a8a', showDetails: false, showValues: false, note: '', collapsed: true  },
  { id: 'rep', label: 'Suministro Equipos o Repuestos', margin: 30, color: '#312e81', showDetails: false, showValues: false, note: '', collapsed: true  },
  { id: 'ins', label: 'Insumos Industriales y Gases',   margin: 30, color: '#164e63', showDetails: false, showValues: false, note: '', collapsed: true  },
]

const DEFAULT_ITEMS: Record<CategoryId, CostItem[]> = {
  mo:  [{ id: 'i1', desc: '', unidad: 'Persona', cant: 0, unit: 0, days: 1 }],
  log: [{ id: 'i2', desc: '', unidad: 'Gl',      cant: 0, unit: 0 }],
  mat: [{ id: 'i3', desc: '', unidad: 'Und',     cant: 0, unit: 0 }],
  rep: [{ id: 'i4', desc: '', unidad: 'Uni',     cant: 0, unit: 0 }],
  ins: [{ id: 'i5', desc: '', unidad: 'Kg',      cant: 0, unit: 0 }],
}

const DEFAULT_SCOPE = [
  'Suministro e instalación de equipos.',
  'Montaje piping de cobre.',
  'Pruebas de estanqueidad a 450 psi.',
  'Puesta en marcha y ajuste de parámetros.',
]

const DEFAULT_EXCLUSIONS = [
  'Obras civiles.', 'Demoliciones.', 'Aumento de potencia eléctrica.',
  'Suministro de repuestos no indicados expresamente.',
  'Puesta en marcha de otros equipos no indicados.',
  'Instalación de faena (contenedores, bodega, oficinas, SSHH).',
  'Acreditaciones y exámenes especiales.',
  'Prevencionista de riesgos permanente en obra.',
  'Trabajos en días no hábiles (sábados, domingos, festivos).',
  'Retiro de escombros y disposición de residuos.',
  'Certificados de disposición de materiales peligrosos.',
  'Gastos bancarios (boletas de garantía).',
  'Todo lo no indicado expresamente como incluido.',
]

const DEFAULT_COMMERCIAL = [
  'Validez de la oferta: 15 días corridos.',
  'Forma de pago: 50% anticipo con la OC, saldo en estados de avance.',
  'Facturación en pesos chilenos (CLP).',
]

// ── Calculation helpers ────────────────────────────────────────

export function calcCat(catId: CategoryId, categories: CostCategory[], items: Record<CategoryId, CostItem[]>) {
  const cat    = categories.find(c => c.id === catId)!
  const costo  = (items[catId] || []).reduce((a, i) => a + i.cant * (i.days ?? 1) * i.unit, 0)
  const margin = Math.max(0, Math.min(99.9, cat.margin))
  const venta  = margin === 100 ? costo : costo / (1 - margin / 100)
  return { costo, venta, beneficio: venta - costo, margin }
}

export function calcTotals(q: MasterQuotation) {
  return q.categories.reduce(
    (acc, cat) => {
      const r = calcCat(cat.id, q.categories, q.items)
      return { costo: acc.costo + r.costo, venta: acc.venta + r.venta, beneficio: acc.beneficio + r.beneficio }
    },
    { costo: 0, venta: 0, beneficio: 0 }
  )
}

export const fmtCLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

// Para UF/porcentajes: sin ceros de relleno (22 -> "22", no "22,00") y con
// coma decimal chilena — a diferencia de toFixed(2), que siempre fuerza 2
// decimales y usa "." como separador.
export const fmtDecimal = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })

export function generateCorrelative(quotations: MasterQuotation[]): string {
  const now  = new Date()
  const mm   = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = String(now.getFullYear())
  const yearNums = quotations
    .map(q => { const m = q.correlative.match(/SYM-(\d+)-/); return m ? parseInt(m[1]) : 0 })
    .filter(n => !isNaN(n))
  const next = (yearNums.length > 0 ? Math.max(...yearNums) : 0) + 1
  return `SYM-${String(next).padStart(3, '0')}-${mm}-${yyyy}`
}

// Correlativos de "nueva versión" reusan el mismo N° y agregan un sufijo
// -V1, -V2... para poder reestudiar (p.ej. el margen) sin perder el N° original.
const VERSION_SUFFIX_RE = /-V(\d+)$/i

export function baseCorrelative(correlative: string): string {
  return correlative.replace(VERSION_SUFFIX_RE, '')
}

export function generateVersionCorrelative(quotations: MasterQuotation[], sourceCorrelative: string): string {
  const base = baseCorrelative(sourceCorrelative)
  const maxVersion = quotations.reduce((max, q) => {
    if (baseCorrelative(q.correlative) !== base) return max
    const m = q.correlative.match(VERSION_SUFFIX_RE)
    return Math.max(max, m ? parseInt(m[1], 10) : 0)
  }, 0)
  return `${base}-V${maxVersion + 1}`
}

// ── State interface ────────────────────────────────────────────

interface MaestroState {
  // config
  uf:         number
  iva:        number
  catalogs:   CatalogsUI
  apiReady:   boolean

  // data
  clients:    MasterClient[]
  quotations: MasterQuotation[]

  // active session
  activeId:  string | null
  activeTab: 'base' | 'costeo' | 'coti'
  unsaved:   boolean

  // ── API sync
  loadData:     () => Promise<void>
  forceSyncAll: () => Promise<{ pushed: number; pulled: number; errors: number }>
  reloadActive: () => Promise<void>

  // ── Config
  setUF:  (uf: number)  => void
  setIVA: (iva: number) => void

  // ── Clients
  upsertClient: (c: MasterClient) => Promise<void>
  deleteClient: (id: string)      => Promise<void>

  // ── Quotation list
  newDraft:          ()                              => void
  loadQuote:         (id: string)                    => void
  duplicateQuote:    (id: string)                    => Promise<void>
  createVersion:     (id: string)                    => Promise<void>
  deleteQuote:       (id: string)                    => Promise<void>
  setStatus:         (id: string, s: QuoteStatus)    => Promise<void>
  setOperState:      (id: string, s: OperState)      => Promise<void>
  importQuotations:  (qs: MasterQuotation[])         => void
  importQuotation:   (payload: unknown)              => Promise<ImportQuotationResult>

  // ── Active quotation
  patchActive: (fields: Partial<MasterQuotation>) => void
  saveActive:  ()                                 => Promise<void>

  // Items
  addItem:     (catId: CategoryId)                                    => void
  removeItem:  (catId: CategoryId, idx: number)                       => void
  patchItem:   (catId: CategoryId, idx: number, field: string, value: any) => void
  adjustCant:  (catId: CategoryId, idx: number, delta: number)        => void
  adjustDays:  (catId: CategoryId, idx: number, delta: number)        => void

  // Category
  setCatMargin: (catId: CategoryId, margin: number)                             => void
  toggleCat:    (catId: CategoryId, field: 'collapsed' | 'showDetails' | 'showValues') => void
  setCatLabel:  (catId: CategoryId, label: string)                              => void

  // Lists
  addListItem:    (key: 'scope' | 'exclusions' | 'commercial')                    => void
  removeListItem: (key: 'scope' | 'exclusions' | 'commercial', idx: number)       => void
  patchListItem:  (key: 'scope' | 'exclusions' | 'commercial', idx: number, value: string) => void

  // Catalogs
  catalogDirty:      boolean
  upsertCatalogItem: (catId: CategoryId, idx: number, field: string, value: any) => void
  addCatalogItem:    (catId: CategoryId, item: CatalogItemUI)                     => void
  deleteCatalogItem: (catId: CategoryId, idx: number)                             => void
  saveCatalogs:      () => Promise<void>

  // UI
  setTab:     (t: 'base' | 'costeo' | 'coti') => void
  markSaved:  ()                               => void
}

// Lógica compartida entre "Duplicar" (correlativo nuevo) y "Nueva versión"
// (mismo correlativo base + sufijo -V{n}) — solo cambia cómo se calcula el
// correlativo. Sin fallback local silencioso: si falla, se propaga el error
// para que la UI lo muestre (evita copias "zombie" con id falso).
// Si el correlativo choca (409, p.ej. otro usuario creó uno igual mientras
// tanto), reintenta un par de veces recalculándolo con datos frescos del
// servidor en vez de con el estado local, que puede estar desactualizado.
async function cloneQuoteWithCorrelative(
  set: (partial: Partial<MaestroState> | ((s: MaestroState) => Partial<MaestroState>)) => void,
  src: MasterQuotation,
  initialCorrelative: string,
  regenerateCorrelative: (freshQuotations: MasterQuotation[]) => string
) {
  let correlative = initialCorrelative
  for (let attempt = 0; ; attempt++) {
    try {
      const copy = await api.duplicateQuotation(src.id, correlative)
      set(s => ({ quotations: [...s.quotations, copy], activeId: copy.id, unsaved: false }))
      return
    } catch (err) {
      const isCorrelativeConflict = err instanceof ApiError && err.status === 409
      if (!isCorrelativeConflict || attempt >= 2) throw err
      const fresh = await api.getQuotations().catch(() => [] as MasterQuotation[])
      correlative = regenerateCorrelative(fresh)
    }
  }
}

// Mismo patrón de reintento para POST /quotations (creación de un borrador
// local nuevo, no un clon) — el correlativo se recalcula con generateCorrelative().
async function createQuotationWithRetry(
  set: (partial: Partial<MaestroState> | ((s: MaestroState) => Partial<MaestroState>)) => void,
  activeId: string,
  initialPayload: MasterQuotation
): Promise<MasterQuotation> {
  let payload = initialPayload
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.createQuotation(payload)
    } catch (err) {
      const isCorrelativeConflict = err instanceof ApiError && err.status === 409
      if (!isCorrelativeConflict || attempt >= 2) throw err
      const fresh = await api.getQuotations().catch(() => [] as MasterQuotation[])
      const freshCorr = generateCorrelative(fresh.filter(x => !x.id.startsWith('q-')))
      payload = { ...payload, correlative: freshCorr }
      set(s => ({
        quotations: s.quotations.map(x => x.id === activeId ? { ...x, correlative: freshCorr } : x),
      }))
    }
  }
}

// ── Store ──────────────────────────────────────────────────────

export const useMaestro = create<MaestroState>()(
  persist(
    (set, get) => ({
      uf:           39500,
      iva:          19,
      catalogs:     DEFAULT_CATALOGS,
      apiReady:     false,
      clients:      [],
      quotations:   [],
      activeId:     null,
      activeTab:    'base',
      unsaved:      false,
      catalogDirty: false,

      // ── API: hidrata el store desde el backend ────────────────
      loadData: async () => {
        try {
          const [catalogsFromAPI, clients, serverQuotations, config] = await Promise.all([
            api.getCatalog(),
            api.getClients(),
            api.getQuotations(),
            api.getConfig(),
          ])
          set(s => {
            // El endpoint GET /api/quotations es liviano (sin line_items ni terms).
            // Mergeamos preservando los datos locales ya cargados en el store.
            const mergedQuotations = serverQuotations.map(serverQ => {
              const localQ = s.quotations.find(lq => lq.id === serverQ.id)
              if (localQ) {
                const hasLocalItems = Object.values(localQ.items).some(arr => arr.length > 0)
                const hasLocalTerms = localQ.scope.length > 0 || localQ.exclusions.length > 0 || localQ.commercial.length > 0
                if (hasLocalItems || hasLocalTerms) {
                  return {
                    ...serverQ,
                    items:      localQ.items,
                    scope:      localQ.scope,
                    exclusions: localQ.exclusions,
                    commercial: localQ.commercial,
                  }
                }
              }
              return serverQ
            })
            // Preservar borradores locales (q-*) aún no persistidos en el servidor
            const localDrafts = s.quotations.filter(lq => lq.id.startsWith('q-'))
            return {
              catalogs:   catalogsFromAPI,
              clients,
              quotations: [...mergedQuotations, ...localDrafts],
              uf:         Number(config.uf_value) || s.uf,
              iva:        Number(config.iva_pct)  || s.iva,
              apiReady:   true,
            }
          })
        } catch (err) {
          console.warn('[maestro] Backend no disponible, usando datos locales:', err)
          set({ apiReady: false })
        }
      },

      forceSyncAll: async () => {
        let pushed = 0, errors = 0
        try {
          if (get().catalogDirty) { await get().saveCatalogs(); pushed++ }
        } catch { errors++ }
        try {
          if (get().unsaved) { await get().saveActive(); pushed++ }
        } catch { errors++ }
        let pulled = 0
        try { await get().loadData(); pulled = 1 } catch { errors++ }
        return { pushed, pulled, errors }
      },

      // Descarta los cambios locales de la cotización activa y trae la
      // versión actual del servidor. Se usa tras un conflicto de versión (409).
      reloadActive: async () => {
        const { activeId } = get()
        if (!activeId || activeId.startsWith('q-')) return
        const fresh = await api.getQuotation(activeId)
        set(s => s.activeId === activeId
          ? { quotations: s.quotations.map(x => x.id === activeId ? fresh : x), unsaved: false }
          : { quotations: s.quotations.map(x => x.id === activeId ? fresh : x) }
        )
      },

      setUF:  (uf)  => set({ uf }),
      setIVA: (iva) => set({ iva }),

      // ── Clients ───────────────────────────────────────────────
      // No hay fallback "solo local": un cliente que no llegó al backend
      // tendría un id falso (cl-...) que no es un UUID válido, y cualquier
      // cotización que lo use después fallaría al guardar con un error
      // críptico. Mejor propagar el error para que la UI lo muestre y el
      // usuario pueda corregirlo (p.ej. RUT duplicado) antes de seguir.
      upsertClient: async (c) => {
        const saved = c.id && !c.id.startsWith('cl-')
          ? await api.updateClient(c)
          : await api.createClient(c)
        set(s => ({
          clients: s.clients.some(x => x.id === saved.id)
            ? s.clients.map(x => x.id === saved.id ? saved : x)
            : [...s.clients, saved],
        }))
      },

      deleteClient: async (id) => {
        await api.deleteClient(id)
        set(s => ({ clients: s.clients.filter(c => c.id !== id) }))
      },

      // ── Quotation list ────────────────────────────────────────
      newDraft: () => {
        const { quotations, uf, iva } = get()
        const today = new Date().toISOString().slice(0, 10)
        const draft: MasterQuotation = {
          id:          `q-${Date.now()}`,
          correlative: generateCorrelative(quotations),
          client_id:   '', client_name: '', contact_id: null, contact: '',
          enduser:     '', ref:          '', date: today,
          valid_until: null,
          status:      'Borrador', operState: 'Pendiente de ejecución',
          uf, iva,
          notes:   null,
          version: 1,
          categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
          items: {
            mo:  DEFAULT_ITEMS.mo.map(i  => ({ ...i, id: `mo-${Date.now()}`  })),
            log: DEFAULT_ITEMS.log.map(i => ({ ...i, id: `log-${Date.now()}` })),
            mat: DEFAULT_ITEMS.mat.map(i => ({ ...i, id: `mat-${Date.now()}` })),
            rep: DEFAULT_ITEMS.rep.map(i => ({ ...i, id: `rep-${Date.now()}` })),
            ins: DEFAULT_ITEMS.ins.map(i => ({ ...i, id: `ins-${Date.now()}` })),
          },
          scope:       [...DEFAULT_SCOPE],
          exclusions:  [...DEFAULT_EXCLUSIONS],
          commercial:  [...DEFAULT_COMMERCIAL],
          total:       0, created_at: today, updated_at: today,
        }
        set(s => ({ quotations: [...s.quotations, draft], activeId: draft.id, activeTab: 'base', unsaved: true }))
      },

      loadQuote: (id) => {
        set({ activeId: id, activeTab: 'base', unsaved: false })
        // Si la cotización tiene items vacíos (vino del listado liviano), hidratar desde API
        const current = get().quotations.find(q => q.id === id)
        const hasItems = current && Object.values(current.items).some(arr => arr.length > 0)
        if (!hasItems && !id.startsWith('q-')) {
          api.getQuotation(id).then(full => {
            set(s => ({
              quotations: s.quotations.map(q => q.id === id ? full : q),
            }))
          }).catch(() => {})
        }
      },

      duplicateQuote: async (id) => {
        const { quotations } = get()
        const src = quotations.find(q => q.id === id)
        if (!src) return
        const newCorr = generateCorrelative(quotations)
        await cloneQuoteWithCorrelative(set, src, newCorr, fresh => generateCorrelative(fresh))
      },

      // Copia la cotización manteniendo el mismo N° pero con sufijo -V{n},
      // para reestudiar (p.ej. el margen) sin generar un correlativo nuevo.
      createVersion: async (id) => {
        const { quotations } = get()
        const src = quotations.find(q => q.id === id)
        if (!src) return
        const newCorr = generateVersionCorrelative(quotations, src.correlative)
        await cloneQuoteWithCorrelative(set, src, newCorr, fresh => generateVersionCorrelative(fresh, src.correlative))
      },

      deleteQuote: async (id) => {
        set(s => ({
          quotations: s.quotations.filter(q => q.id !== id),
          activeId:   s.activeId === id ? null : s.activeId,
        }))
        try { await api.deleteQuotation(id) } catch { /* offline */ }
      },

      setStatus: async (id, status) => {
        set(s => ({ quotations: s.quotations.map(q => q.id === id ? { ...q, status } : q) }))
        try { await api.setQuotationStatus(id, status) } catch { /* offline */ }
      },

      setOperState: async (id, operState) => {
        set(s => ({ quotations: s.quotations.map(q => q.id === id ? { ...q, operState } : q) }))
        try { await api.setQuotationStatus(id, get().quotations.find(q => q.id === id)?.status ?? 'Borrador', operState) } catch { /* offline */ }
      },

      importQuotations: (qs) => set(s => ({
        quotations: [...s.quotations, ...qs.filter(q => !s.quotations.some(e => e.id === q.id))],
      })),

      // ── Active quotation mutations ────────────────────────────
      importQuotation: async (payload) => {
        const result = await api.importQuotation(payload)
        set(s => ({
          quotations: s.quotations.some(q => q.id === result.quotation.id)
            ? s.quotations.map(q => q.id === result.quotation.id ? result.quotation : q)
            : [result.quotation, ...s.quotations],
          activeId: result.quotation.id,
          activeTab: 'base',
          unsaved: false,
        }))
        await get().loadData()
        return result
      },

      patchActive: (fields) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q =>
            q.id === s.activeId ? { ...q, ...fields, updated_at: new Date().toISOString().slice(0, 10) } : q
          ),
          unsaved: true,
        }
      }),

      saveActive: async () => {
        const { activeId, quotations } = get()
        if (!activeId) return
        const q = quotations.find(x => x.id === activeId)
        if (!q) return
        if (!q.client_id) {
          throw new Error('Selecciona un cliente antes de guardar la cotización')
        }
        const totals  = calcTotals(q)
        const updated = { ...q, total: totals.venta, updated_at: new Date().toISOString().slice(0, 10) }
        // Guarda el cálculo local de inmediato, pero "unsaved"/"activeId" solo
        // se tocan tras confirmar éxito, y solo si el usuario sigue en esta
        // misma cotización — si mientras tanto abrió otra, un guardado tardío
        // de esta no debe pisar el estado de la que está viendo ahora.
        set(s => ({
          quotations: s.quotations.map(x => x.id === activeId ? updated : x),
        }))
        const isLocal = activeId.startsWith('q-')
        if (isLocal) {
          const saved = await createQuotationWithRetry(set, activeId, updated)
          set(s => s.activeId === activeId
            ? { quotations: s.quotations.map(x => x.id === activeId ? saved : x), activeId: saved.id, unsaved: false }
            : { quotations: s.quotations.map(x => x.id === activeId ? saved : x) }
          )
        } else {
          const saved = await api.updateQuotation(updated)
          set(s => s.activeId === activeId
            ? { quotations: s.quotations.map(x => x.id === activeId ? saved : x), unsaved: false }
            : { quotations: s.quotations.map(x => x.id === activeId ? saved : x) }
          )
        }
      },

      // Items
      addItem: (catId) => set(s => {
        if (!s.activeId) return {}
        const newItem: CostItem = { id: `${catId}-${Date.now()}`, desc: '', unidad: 'Und', cant: 0, unit: 0, days: 1 }
        return {
          quotations: s.quotations.map(q =>
            q.id !== s.activeId ? q
              : { ...q, items: { ...q.items, [catId]: [...(q.items[catId] || []), newItem] } }
          ),
          unsaved: true,
        }
      }),

      removeItem: (catId, idx) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q => {
            if (q.id !== s.activeId) return q
            const list = [...(q.items[catId] || [])]
            list.splice(idx, 1)
            return { ...q, items: { ...q.items, [catId]: list } }
          }),
          unsaved: true,
        }
      }),

      patchItem: (catId, idx, field, value) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q => {
            if (q.id !== s.activeId) return q
            const list = [...(q.items[catId] || [])]
            list[idx] = { ...list[idx], [field]: ['cant', 'unit', 'days'].includes(field) ? (parseFloat(value) || 0) : value }
            return { ...q, items: { ...q.items, [catId]: list } }
          }),
          unsaved: true,
        }
      }),

      adjustCant: (catId, idx, delta) => {
        const q = get().quotations.find(x => x.id === get().activeId)
        if (!q) return
        const current = q.items[catId][idx]?.cant ?? 0
        get().patchItem(catId, idx, 'cant', String(Math.max(0, current + delta)))
      },

      adjustDays: (catId, idx, delta) => {
        const q = get().quotations.find(x => x.id === get().activeId)
        if (!q) return
        const current = q.items[catId][idx]?.days ?? 1
        get().patchItem(catId, idx, 'days', String(Math.max(1, current + delta)))
      },

      // Category
      setCatMargin: (catId, margin) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q =>
            q.id !== s.activeId ? q
              : { ...q, categories: q.categories.map(c => c.id === catId ? { ...c, margin } : c) }
          ),
          unsaved: true,
        }
      }),

      toggleCat: (catId, field) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q =>
            q.id !== s.activeId ? q
              : { ...q, categories: q.categories.map(c => c.id === catId ? { ...c, [field]: !c[field] } : c) }
          ),
        }
      }),

      setCatLabel: (catId, label) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q =>
            q.id !== s.activeId ? q
              : { ...q, categories: q.categories.map(c => c.id === catId ? { ...c, label } : c) }
          ),
          unsaved: true,
        }
      }),

      // Lists
      addListItem: (key) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q =>
            q.id !== s.activeId ? q
              : { ...q, [key]: [...(q[key] as string[]), '...'] }
          ),
          unsaved: true,
        }
      }),

      removeListItem: (key, idx) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q => {
            if (q.id !== s.activeId) return q
            const arr = [...(q[key] as string[])]
            arr.splice(idx, 1)
            return { ...q, [key]: arr }
          }),
          unsaved: true,
        }
      }),

      patchListItem: (key, idx, value) => set(s => {
        if (!s.activeId) return {}
        return {
          quotations: s.quotations.map(q => {
            if (q.id !== s.activeId) return q
            const arr = [...(q[key] as string[])]
            arr[idx] = value
            return { ...q, [key]: arr }
          }),
          unsaved: true,
        }
      }),

      // Catalogs — sincroniza con API en background
      upsertCatalogItem: (catId, idx, field, value) => {
        set(s => {
          const list = [...s.catalogs[catId]]
          list[idx] = { ...list[idx], [field]: field === 'price' ? (parseFloat(value) || 0) : value }
          return { catalogs: { ...s.catalogs, [catId]: list }, catalogDirty: true }
        })
      },

      addCatalogItem: (catId, item) => {
        const tempId = `tmp-${Date.now()}`
        const newItem: CatalogItemUI = { ...item, id: tempId }
        set(s => ({ catalogs: { ...s.catalogs, [catId]: [...s.catalogs[catId], newItem] }, catalogDirty: true }))
      },

      deleteCatalogItem: (catId, idx) => {
        const item = get().catalogs[catId][idx]
        set(s => {
          const list = [...s.catalogs[catId]]
          list.splice(idx, 1)
          return { catalogs: { ...s.catalogs, [catId]: list }, catalogDirty: true }
        })
        if (item?.id && !item.id.startsWith('tmp-')) api.deleteCatalogItem(item.id).catch(() => {})
      },

      saveCatalogs: async () => {
        const { catalogs } = get()
        const CATS: CategoryId[] = ['mo', 'log', 'mat', 'rep', 'ins']
        for (const catId of CATS) {
          const items = catalogs[catId]
          for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx]
            if (!item.id || item.id.startsWith('tmp-')) {
              // Ítem nuevo — crear en backend y reemplazar ID temporal
              const tempId = item.id
              const saved = await api.createCatalogItem(catId, item, idx)
              set(s => ({
                catalogs: {
                  ...s.catalogs,
                  [catId]: s.catalogs[catId].map(i => i.id === tempId ? saved : i),
                },
              }))
            } else {
              await api.updateCatalogItem(item.id, catId, item)
            }
          }
        }
        set({ catalogDirty: false })
      },

      // UI
      setTab:    (t) => set({ activeTab: t }),
      markSaved: ()  => set({ unsaved: false }),
    }),
    {
      name: 'maestro-comercial-v2',
      partialize: (s) => ({
        uf:         s.uf,
        iva:        s.iva,
        catalogs:   s.catalogs,
        clients:    s.clients,
        quotations: s.quotations,
        activeId:   s.activeId,
      }),
    }
  )
)

// ── Selectors ──────────────────────────────────────────────────
export const useActiveQuotation = () => {
  const { quotations, activeId } = useMaestro()
  return quotations.find(q => q.id === activeId) ?? null
}
