// ============================================================
// MAESTRO COMERCIAL — API Client v2.0
// Mapea backend ↔ tipos UI del store
// ============================================================
import type {
  CatalogItemUI,
  CatalogsUI,
  CategoryId,
  MasterClient,
  MasterQuotation,
  CostCategory,
  CostItem,
  InvoiceMilestone,
  QuotationActivity,
  AgingTramo,
  CarteraData,
  CycleTimes,
  MarginAnalysisRow,
} from '../types'

// ── Base URL ──────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL ?? ''

// ── Token helpers ─────────────────────────────────────────────
const getToken = () => localStorage.getItem('authToken') ?? ''
const clearAuth = () => {
  localStorage.removeItem('authToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

// ── Errores ───────────────────────────────────────────────────
// Lleva el status HTTP para que el caller distinga p.ej. un 409
// (conflicto de versión) de un error genérico de red/servidor.
export class ApiError extends Error {
  status: number
  data?: unknown
  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

// ── Fetch base ────────────────────────────────────────────────
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    // Intentar refresh antes de desloguear
    const refreshed = await tryRefresh()
    if (refreshed) return req<T>(method, path, body)
    clearAuth()
    window.location.reload()
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, err.message ?? err.error ?? `HTTP ${res.status}`, err)
  }

  return res.json() as Promise<T>
}

async function tryRefresh(): Promise<boolean> {
  const rt = localStorage.getItem('refreshToken')
  if (!rt) return false
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) return false
    const data = await res.json()
    localStorage.setItem('authToken', data.token)
    // Actualizar refresh token si el backend rota tokens
    if (data.refresh_token) localStorage.setItem('refreshToken', data.refresh_token)
    return true
  } catch {
    return false
  }
}

const get = <T>(path: string) => req<T>('GET', path)
const post = <T>(path: string, body: unknown) => req<T>('POST', path, body)
const put = <T>(path: string, body: unknown) => req<T>('PUT', path, body)
const patch = <T>(path: string, body: unknown) => req<T>('PATCH', path, body)
const del = <T>(path: string) => req<T>('DELETE', path)

interface CursorPage<T> {
  data: T[]
  next_cursor: string | null
  has_more: boolean
}

// A-11: el backend pagina por cursor (máx. 200 filas por página) en vez de
// devolver la tabla completa en una sola consulta. La UI actual sigue
// trabajando con la lista completa en memoria (ordena/filtra en el cliente),
// así que acá se recorren las páginas y se concatenan — sin eso, una cuenta
// con más de 200 cotizaciones dejaría de ver el resto en silencio.
// Tope de seguridad en 20 páginas (4000 filas): más que eso, lo que hace
// falta es una UI con paginación real, no seguir subiendo este número.
async function getAllPages<T>(basePath: string, limit = 200): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })
    const res = await get<CursorPage<T>>(`${basePath}?${qs.toString()}`)
    items.push(...res.data)
    if (!res.has_more || !res.next_cursor) break
    cursor = res.next_cursor
  }
  return items
}

// ── Mapeos backend ↔ UI ───────────────────────────────────────

function toCatalogItemUI(i: any): CatalogItemUI {
  return { id: i.id, desc: i.description, unidad: i.unit_name, price: i.unit_price }
}

function fromCatalogItemUI(catId: CategoryId, i: CatalogItemUI, sortOrder = 0) {
  return {
    category_id: catId,
    description: i.desc,
    unit_name: i.unidad,
    unit_price: i.price,
    sort_order: sortOrder,
  }
}

function toMasterClient(c: any): MasterClient {
  const primary = (c.contacts ?? []).find((ct: any) => ct.is_primary) ?? c.contacts?.[0] ?? {}
  return {
    id: c.id,
    name: c.name ?? '',
    rut: c.rut ?? '',
    activity: c.activity ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    contact: primary.name ?? '',
    cargo: primary.cargo ?? '',
    email: primary.email ?? '',
    phone: primary.phone ?? '',
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}

function quotationVentaNeta(q: any): number {
  return Number(q.totals?.venta_neta ?? q.venta_neta ?? 0) || 0
}

function toMasterQuotation(q: any): MasterQuotation {
  // Reconstruir categorías desde quotation_categories
  const catMap: Record<string, any> = {}
  for (const qc of q.categories ?? []) catMap[qc.category_id] = qc

  const catIds: CategoryId[] = ['mo', 'log', 'mat', 'rep', 'ins']

  const defaultCatMeta: Record<CategoryId, { label: string; color: string }> = {
    mo: { label: 'Mano de Obra Especializada', color: '#1e293b' },
    log: { label: 'Logística y Operación', color: '#475569' },
    mat: { label: 'Provisión de Materiales', color: '#1e3a8a' },
    rep: { label: 'Suministro Equipos o Repuestos', color: '#312e81' },
    ins: { label: 'Insumos Industriales y Gases', color: '#164e63' },
  }

  const defaultMargins: Record<string, number> = { mo: 35, log: 30, mat: 30, rep: 30, ins: 30 }

  const categories: CostCategory[] = catIds.map(cid => {
    const qc = catMap[cid]
    return {
      id: cid,
      label: qc?.label ?? defaultCatMeta[cid].label,
      margin: qc?.margin_pct ?? defaultMargins[cid] ?? 30,
      color: qc?.color ?? defaultCatMeta[cid].color,
      showDetails: false,
      showValues: false,
      note: qc?.note ?? '',
      collapsed: cid !== 'mo',
    }
  })

  // Reconstruir items desde quotation_line_items
  const items: Record<CategoryId, CostItem[]> = { mo: [], log: [], mat: [], rep: [], ins: [] }
  for (const li of q.line_items ?? []) {
    const cid = li.category_id as CategoryId
    if (!items[cid]) items[cid] = []
    items[cid].push({
      id: li.id,
      desc: li.description,
      unidad: li.unit_name,
      cant: li.quantity,
      unit: li.unit_price,
      days: li.days,
    })
  }

  // Reconstruir scope / exclusions / commercial desde quotation_terms
  const scope: string[] = []
  const exclusions: string[] = []
  const commercial: string[] = []
  for (const t of (q.terms ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order)) {
    if (t.term_type === 'scope') scope.push(t.content)
    if (t.term_type === 'exclusion') exclusions.push(t.content)
    if (t.term_type === 'commercial') commercial.push(t.content)
  }

  return {
    id: q.id,
    correlative: q.correlative,
    client_id: q.client_id,
    client_name: q.client_name ?? '',
    contact_id: q.contact_id ?? null,
    contact: q.contact_name ?? '',
    enduser: q.enduser ?? '',
    ref: q.ref ?? '',
    date: (q.date ?? '').slice(0, 10),
    valid_until: q.valid_until ?? null,
    status: q.status,
    operState: q.oper_state ?? null,
    uf: q.uf_value,
    iva: q.iva_pct,
    notes: q.notes ?? null,
    version: q.version ?? 1,
    categories,
    items,
    scope,
    exclusions,
    commercial,
    total: quotationVentaNeta(q),
    created_at: q.created_at,
    updated_at: q.updated_at,
    kind: q.kind ?? 'project',
    equipment_count: q.equipment_count ?? null,
    equipment_description: q.equipment_description ?? null,
    frequency: q.frequency ?? null,
    visits_per_year: q.visits_per_year ?? null,
    contract_start_date: q.contract_start_date ?? null,
    usd: Number(q.usd_value) || 0,
    show_uf_equivalent: Boolean(q.show_uf_equivalent),
    show_usd_equivalent: Boolean(q.show_usd_equivalent),
    invoice_count: Number(q.invoice_count) || 0,
    invoice_count_max: Number(q.invoice_count_max) || 1,
    total_con_iva: Number(q.total_con_iva) || 0,
    invoiced_total: Number(q.invoiced_total) || 0,
    oc_number: q.oc_number ?? null,
    oc_date: q.oc_date ?? null,
    oc_conditions: q.oc_conditions ?? null,
    oc_document_name: q.oc_document_name ?? null,
    oc_document_size: q.oc_document_size ?? null,
    loss_reason: q.loss_reason ?? null,
    loss_competitor: q.loss_competitor ?? null,
    loss_notes: q.loss_notes ?? null,
    follow_up_date: q.follow_up_date ?? null,
    sent_at: q.sent_at ?? null,
    awarded_at: q.awarded_at ?? null,
    closed_at: q.closed_at ?? null,
    version_reason: q.version_reason ?? null,
    parent_version_id: q.parent_version_id ?? null,
    approved_by: q.approved_by ?? null,
    approved_at: q.approved_at ?? null,
    approval_notes: q.approval_notes ?? null,
  }
}

function fromMasterQuotation(q: MasterQuotation) {
  const categories = q.categories.map((c, idx) => ({
    category_id: c.id,
    label: c.label,
    margin_pct: c.margin,
    color: c.color,
    note: c.note,
    sort_order: idx,
  }))

  const line_items: any[] = []
  for (const cid of Object.keys(q.items) as CategoryId[]) {
    q.items[cid].forEach((item, idx) => {
      if (!item.desc?.trim()) return // omite filas sin descripción (fallarían min(1))
      line_items.push({
        id: item.id,
        category_id: cid,
        description: item.desc,
        unit_name: item.unidad,
        quantity: item.cant,
        days: item.days ?? 1,
        unit_price: item.unit,
        sort_order: idx,
      })
    })
  }

  const terms: any[] = [
    ...q.scope
      .filter(c => c?.trim())
      .map((c, i) => ({ term_type: 'scope', content: c, sort_order: i })),
    ...q.exclusions
      .filter(c => c?.trim())
      .map((c, i) => ({ term_type: 'exclusion', content: c, sort_order: i })),
    ...q.commercial
      .filter(c => c?.trim())
      .map((c, i) => ({ term_type: 'commercial', content: c, sort_order: i })),
  ]

  return {
    correlative: q.correlative,
    client_id: q.client_id,
    contact_id: q.contact_id ?? null,
    enduser: q.enduser,
    ref: q.ref,
    date: q.date,
    valid_until: q.valid_until || null,
    status: q.status,
    oper_state: q.operState?.trim() ? q.operState : null,
    uf_value: q.uf,
    iva_pct: q.iva,
    notes: q.notes || null,
    version: q.version || 1,
    categories,
    line_items,
    terms,
    kind: q.kind ?? 'project',
    equipment_count: q.equipment_count ?? null,
    equipment_description: q.equipment_description ?? null,
    frequency: q.frequency ?? null,
    visits_per_year: q.visits_per_year ?? null,
    contract_start_date: q.contract_start_date || null,
    usd_value: q.usd || 0,
    show_uf_equivalent: Boolean(q.show_uf_equivalent),
    show_usd_equivalent: Boolean(q.show_usd_equivalent),
  }
}

export interface ImportQuotationReport {
  cliente: { accion: 'existente' | 'creado'; client_id: string }
  uf: { valor: number; fuente: 'mindicador' | 'manual' }
  lineas_total: number
  lineas_vinculadas_catalogo: number
  lineas_sin_match: Array<{ descripcion: string; motivo: 'sin_match' | 'ambiguo' | string }>
  advertencias: string[]
}

export interface ImportQuotationResult {
  quotation: MasterQuotation
  reporte_importacion: ImportQuotationReport
}

// ── Facturas ──────────────────────────────────────────────────
// Espejo del payment_state calculado por v_invoice_balance (ver
// backend/src/api/invoices.ts).
export type InvoicePaymentState =
  'al_dia' | 'por_vencer' | 'vencida' | 'parcial' | 'parcial_vencida' | 'pagada' | 'anulada'

export interface Invoice {
  id: string
  number: string
  status: 'draft' | 'issued' | 'paid' | 'cancelled'
  client_id: string
  client_name: string | null
  quotation_id: string | null
  quotation_correlative: string | null
  date: string
  due_date: string | null
  payment_term: string
  doc_type: string
  total_amount: string | number
  paid_amount: string | number | null
  balance: string | number | null
  days_overdue: number | null
  payment_state: InvoicePaymentState | null
  observations: string | null
  follow_up_date: string | null
  is_factored: boolean
  factoring_company: string | null
  factoring_type: string | null
  sii_document_name: string | null
  sii_document_size: number | null
}

export interface InvoicePayment {
  id: string
  paid_at: string
  amount: string | number
  method: string
  reference: string | null
  observations: string | null
  created_by_name: string | null
}

export interface InvoiceFactoring {
  id: string
  company: string
  type: string | null
  status: string
  ceded_at: string | null
  advance_amount: string | number
  rate_pct: string | number | null
  cost_amount: string | number
  expected_settle_at: string | null
  settled_at: string | null
  observations: string | null
}

export interface InvoiceDetail extends Invoice {
  items: unknown[]
  payments: InvoicePayment[]
  factoring: InvoiceFactoring | null
}

export interface InvoiceSummary {
  by_state: Partial<Record<InvoicePaymentState, { count: number; balance: number }>>
  total_outstanding: number
}

export interface InvoiceCreatePayload {
  project_id?: string | null
  quotation_id?: string | null
  client_id: string
  number?: string
  date: string
  payment_term?: string | null
  due_date?: string | null
  doc_type?: string
  items: Array<{ description: string; quantity: number; unit_price: number }>
}

export interface InvoiceFollowUpPayload {
  number?: string | null
  observations: string | null
  follow_up_date: string | null
  due_date?: string | null
  payment_term?: string | null
}

export interface InvoiceStatusPayload {
  status: string
  is_factored?: boolean | null
}

export interface InvoicePaymentPayload {
  amount: number
  method: string | null
  paid_at: string
  reference: string | null
  observations?: string | null
}

export interface InvoiceFactoringPayload {
  type: string | null
  company: string
  ceded_at?: string | null
  advance_amount?: number
  rate_pct?: number | null
  cost_amount?: number
  expected_settle_at?: string | null
  settled_at?: string | null
  status?: string | null
  observations?: string | null
}

// ── API pública ───────────────────────────────────────────────

export const api = {
  // ── Auth ────────────────────────────────────────────────────
  login: async (email: string, password: string) => {
    const data: any = await post('/api/auth/login', { email, password })
    localStorage.setItem('authToken', data.token)
    localStorage.setItem('refreshToken', data.refresh_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    return data
  },

  me: () => get<any>('/api/auth/me'),

  logout: async () => {
    const rt = localStorage.getItem('refreshToken')
    if (rt) {
      // Best-effort: si falla (red caída, etc.) igual se limpia la sesión local.
      await post('/api/auth/logout', { refresh_token: rt }).catch(() => {})
    }
    clearAuth()
  },

  logoutAll: async () => {
    await post('/api/auth/logout-all', {}).catch(() => {})
    clearAuth()
  },

  // ── Config ──────────────────────────────────────────────────
  getConfig: () => get<Record<string, string>>('/api/config'),

  // ── Catálogo ────────────────────────────────────────────────
  getCatalog: async (): Promise<CatalogsUI> => {
    const raw: Record<CategoryId, any[]> = await get('/api/catalog')
    const result = {} as CatalogsUI
    for (const cid of Object.keys(raw) as CategoryId[]) {
      result[cid] = raw[cid].map(toCatalogItemUI)
    }
    return result
  },

  createCatalogItem: async (catId: CategoryId, item: CatalogItemUI, sortOrder = 0) => {
    const raw: any = await post('/api/catalog', fromCatalogItemUI(catId, item, sortOrder))
    return toCatalogItemUI(raw)
  },

  updateCatalogItem: async (id: string, catId: CategoryId, item: CatalogItemUI) => {
    const raw: any = await put(`/api/catalog/${id}`, fromCatalogItemUI(catId, item))
    return toCatalogItemUI(raw)
  },

  deleteCatalogItem: (id: string) => del(`/api/catalog/${id}`),

  // ── Clientes ────────────────────────────────────────────────
  getClients: async (): Promise<MasterClient[]> => {
    const raw: any[] = await get('/api/clients')
    return raw.map(toMasterClient)
  },

  createClient: async (c: MasterClient): Promise<MasterClient> => {
    const raw: any = await post('/api/clients', {
      name: c.name,
      rut: c.rut || null,
      activity: c.activity || null,
      address: c.address || null,
      city: c.city || null,
      contacts: c.contact
        ? [
            {
              name: c.contact,
              cargo: c.cargo || null,
              email: c.email || null,
              phone: c.phone || null,
            },
          ]
        : [],
    })
    return toMasterClient(raw)
  },

  updateClient: async (c: MasterClient): Promise<MasterClient> => {
    // Actualizar datos del cliente
    await put(`/api/clients/${c.id}`, {
      name: c.name,
      rut: c.rut || null,
      activity: c.activity || null,
      address: c.address || null,
      city: c.city || null,
    })
    // Actualizar contacto principal si existe
    const contacts: any[] = await get(`/api/clients/${c.id}/contacts`)
    const primary = contacts.find((ct: any) => ct.is_primary) ?? contacts[0]
    if (primary) {
      await put(`/api/clients/${c.id}/contacts/${primary.id}`, {
        name: c.contact || primary.name,
        cargo: c.cargo || null,
        email: c.email || null,
        phone: c.phone || null,
      })
    } else if (c.contact) {
      await post(`/api/clients/${c.id}/contacts`, {
        name: c.contact,
        cargo: c.cargo,
        email: c.email,
        phone: c.phone,
        is_primary: true,
      })
    }
    // Re-fetch para obtener el estado real guardado en el backend
    const updated: any = await get(`/api/clients/${c.id}`)
    return toMasterClient(updated)
  },

  deleteClient: (id: string) => del(`/api/clients/${id}`),

  // ── Cotizaciones ────────────────────────────────────────────
  getQuotations: async (): Promise<MasterQuotation[]> => {
    const raw: any[] = await getAllPages('/api/quotations')
    // Backend SQL devuelve venta_neta plano; el backend JSON-dev devuelve totals.
    // Conservamos ambos formatos para que la columna NETO CLP no vuelva a $0.
    return raw.map(q =>
      toMasterQuotation({
        ...q,
        line_items: [],
        terms: [],
        totals: q.totals ?? { venta_neta: q.venta_neta ?? 0 },
      })
    )
  },

  getQuotation: async (id: string): Promise<MasterQuotation> => {
    const raw: any = await get(`/api/quotations/${id}`)
    return toMasterQuotation(raw)
  },

  createQuotation: async (q: MasterQuotation): Promise<MasterQuotation> => {
    const raw: any = await post('/api/quotations', fromMasterQuotation(q))
    return toMasterQuotation(raw)
  },

  updateQuotation: async (q: MasterQuotation): Promise<MasterQuotation> => {
    const raw: any = await put(`/api/quotations/${q.id}`, fromMasterQuotation(q))
    return toMasterQuotation(raw)
  },

  setQuotationStatus: (id: string, status: string, oper_state?: string) =>
    patch(`/api/quotations/${id}/status`, { status, oper_state }),

  duplicateQuotation: async (id: string, correlative: string): Promise<MasterQuotation> => {
    const raw: any = await post(`/api/quotations/${id}/duplicate`, { correlative })
    return toMasterQuotation(raw)
  },

  deleteQuotation: (id: string) => del(`/api/quotations/${id}`),

  importQuotation: async (payload: unknown): Promise<ImportQuotationResult> => {
    const raw: any = await post('/api/quotations/import', payload)
    return {
      quotation: toMasterQuotation(raw.quotation),
      reporte_importacion: raw.reporte_importacion,
    }
  },

  // ── Proyectos ───────────────────────────────────────────────
  getProjects: () => get<any[]>('/api/projects'),
  getProject: (id: string) => get<any>(`/api/projects/${id}`),
  createProject: (data: any) => post<any>('/api/projects', data),
  updateProject: (id: string, data: any) => put<any>(`/api/projects/${id}`, data),
  deleteProject: (id: string) => del<any>(`/api/projects/${id}`),
  addProjectCost: (projectId: string, cost: any) =>
    post<any>(`/api/projects/${projectId}/costs`, cost),
  updateProjectCost: (projectId: string, costId: string, cost: any) =>
    put<any>(`/api/projects/${projectId}/costs/${costId}`, cost),
  deleteProjectCost: (projectId: string, costId: string) =>
    del<any>(`/api/projects/${projectId}/costs/${costId}`),
  assignUser: (projectId: string, userId: string) =>
    post<any>(`/api/projects/${projectId}/assignments`, { user_id: userId }),
  removeAssignment: (projectId: string, userId: string) =>
    del<any>(`/api/projects/${projectId}/assignments/${userId}`),
  getTasks: (projectId: string) => get<any[]>(`/api/projects/${projectId}/tasks`),
  createTask: (projectId: string, data: any) => post<any>(`/api/projects/${projectId}/tasks`, data),
  updateTask: (projectId: string, taskId: string, data: any) =>
    put<any>(`/api/projects/${projectId}/tasks/${taskId}`, data),
  deleteTask: (projectId: string, taskId: string) =>
    del<any>(`/api/projects/${projectId}/tasks/${taskId}`),

  // ── Facturas ────────────────────────────────────────────────
  // El saldo y el estado de cobranza vienen calculados desde
  // v_invoice_balance: el front nunca los recalcula ni los guarda.
  getInvoices: (params?: { state?: string; client_id?: string }) => {
    const qs = new URLSearchParams()
    if (params?.state) qs.set('state', params.state)
    if (params?.client_id) qs.set('client_id', params.client_id)
    const suffix = qs.toString() ? `?${qs}` : ''
    return get<Invoice[]>(`/api/invoices${suffix}`)
  },
  getInvoice: (id: string) => get<InvoiceDetail>(`/api/invoices/${id}`),
  getInvoiceSummary: () => get<InvoiceSummary>('/api/invoices/summary'),
  createInvoice: (data: InvoiceCreatePayload) => post<Invoice>('/api/invoices', data),
  updateInvoiceFollowUp: (id: string, data: InvoiceFollowUpPayload) =>
    patch<Invoice>(`/api/invoices/${id}/follow-up`, data),
  updateInvoiceStatus: (id: string, data: InvoiceStatusPayload) =>
    patch<Invoice>(`/api/invoices/${id}/status`, data),
  deleteInvoice: (id: string) => del<{ success: boolean }>(`/api/invoices/${id}`),

  getPayments: (invoiceId: string) => get<InvoicePayment[]>(`/api/invoices/${invoiceId}/payments`),
  addPayment: (invoiceId: string, data: InvoicePaymentPayload) =>
    post<InvoicePayment>(`/api/invoices/${invoiceId}/payments`, data),
  deletePayment: (paymentId: string) =>
    del<{ success: boolean }>(`/api/invoices/payments/${paymentId}`),

  saveFactoring: (invoiceId: string, data: InvoiceFactoringPayload) =>
    put<Invoice>(`/api/invoices/${invoiceId}/factoring`, data),
  deleteFactoring: (invoiceId: string) =>
    del<{ success: boolean }>(`/api/invoices/${invoiceId}/factoring`),

  // Sube el PDF SII de una factura. Convierte el File a base64 JSON para no
  // necesitar multipart (sin dependencias adicionales en el backend).
  uploadInvoiceDocument: (id: string, file: File): Promise<Invoice> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1]
          resolve(
            await post<Invoice>(`/api/invoices/${id}/document`, {
              data: base64,
              name: file.name,
              size: file.size,
            })
          )
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
      reader.readAsDataURL(file)
    }),

  // Descarga el PDF SII y lo dispara como descarga del navegador.
  downloadInvoiceDocument: async (id: string): Promise<void> => {
    const token = localStorage.getItem('authToken')
    const res = await fetch(`/api/invoices/${id}/document`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('No se pudo descargar el documento')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'documento.pdf'
    a.click()
    URL.revokeObjectURL(url)
  },

  // Configura cuántas facturas puede emitir una cotización Adjudicada (1 o 2).
  updateQuotationBillingSplit: (id: string, invoice_count_max: number) =>
    patch<{ id: string; invoice_count_max: number }>(`/api/quotations/${id}/billing-split`, {
      invoice_count_max,
    }),

  // ── Pérdida ─────────────────────────────────────────────────────────────────
  updateQuotationLoss: (
    id: string,
    data: { loss_reason: string; loss_competitor?: string | null; loss_notes?: string | null }
  ) => patch<{ id: string }>(`/api/quotations/${id}/loss`, data),

  // ── Seguimiento ──────────────────────────────────────────────────────────────
  updateFollowUpDate: (id: string, follow_up_date: string | null) =>
    patch<{ id: string; follow_up_date: string | null }>(`/api/quotations/${id}/follow-up`, {
      follow_up_date,
    }),

  // ── Milestones ───────────────────────────────────────────────────────────────
  getMilestones: (id: string) =>
    get<{ milestones: InvoiceMilestone[] }>(`/api/quotations/${id}/milestones`),
  saveMilestone: (
    id: string,
    invoiceNumber: 1 | 2,
    data: { description: string; pct_of_total?: number | null }
  ) => put<InvoiceMilestone>(`/api/quotations/${id}/milestones/${invoiceNumber}`, data),
  deleteMilestone: (id: string, invoiceNumber: 1 | 2) =>
    del<{ ok: boolean }>(`/api/quotations/${id}/milestones/${invoiceNumber}`),

  // ── Actividades ───────────────────────────────────────────────────────────────
  getActivities: (id: string) =>
    get<{ activities: QuotationActivity[] }>(`/api/quotations/${id}/activities`),
  createActivity: (id: string, data: { activity_type: string; content: string }) =>
    post<QuotationActivity>(`/api/quotations/${id}/activities`, data),
  deleteActivity: (activityId: string) => del<{ ok: boolean }>(`/api/activities/${activityId}`),

  // ── Version diff ─────────────────────────────────────────────────────────────
  getVersionDiff: (id: string) => get<{ versions: any[] }>(`/api/quotations/${id}/version-diff`),

  // ── Aprobación ────────────────────────────────────────────────────────────────
  approveQuotation: (id: string, approval_notes?: string | null) =>
    post<{ id: string; status: string; approved_at: string }>(`/api/quotations/${id}/approve`, {
      approval_notes,
    }),

  // ── Dashboard ───────────────────────────────────────────────
  getKPIs: () => get<Record<string, unknown>>('/api/dashboard/kpis'),
  getAging: () => get<{ aging: AgingTramo[]; timestamp: string }>('/api/dashboard/aging'),
  getCartera: () => get<{ cartera: CarteraData; timestamp: string }>('/api/dashboard/cartera'),
  getCycleTimes: () =>
    get<{ cycle_times: CycleTimes; timestamp: string }>('/api/dashboard/cycle-times'),
  getMarginAnalysis: () =>
    get<{ analysis: MarginAnalysisRow[]; timestamp: string }>('/api/dashboard/margin-analysis'),
}

export default api
