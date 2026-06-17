// ============================================================
// MAESTRO COMERCIAL — API Client v2.0
// Mapea backend ↔ tipos UI del store
// ============================================================
import type {
  CatalogItemUI, CatalogsUI, CategoryId,
  MasterClient, MasterQuotation, CostCategory, CostItem,
} from '../types'

// ── Base URL ──────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL ?? ''

// ── Token helpers ─────────────────────────────────────────────
const getToken  = () => localStorage.getItem('authToken') ?? ''
const clearAuth = () => {
  localStorage.removeItem('authToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
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
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`)
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
    const { token } = await res.json()
    localStorage.setItem('authToken', token)
    return true
  } catch {
    return false
  }
}

const get    = <T>(path: string)                => req<T>('GET',    path)
const post   = <T>(path: string, body: unknown) => req<T>('POST',   path, body)
const put    = <T>(path: string, body: unknown) => req<T>('PUT',    path, body)
const patch  = <T>(path: string, body: unknown) => req<T>('PATCH',  path, body)
const del    = <T>(path: string)                => req<T>('DELETE', path)

// ── Mapeos backend ↔ UI ───────────────────────────────────────

function toCatalogItemUI(i: any): CatalogItemUI {
  return { id: i.id, desc: i.description, unidad: i.unit_name, price: i.unit_price }
}

function fromCatalogItemUI(catId: CategoryId, i: CatalogItemUI, sortOrder = 0) {
  return {
    category_id: catId,
    description: i.desc,
    unit_name:   i.unidad,
    unit_price:  i.price,
    sort_order:  sortOrder,
  }
}

function toMasterClient(c: any): MasterClient {
  const primary = (c.contacts ?? []).find((ct: any) => ct.is_primary) ?? c.contacts?.[0] ?? {}
  return {
    id:         c.id,
    name:       c.name        ?? '',
    rut:        c.rut         ?? '',
    activity:   c.activity    ?? '',
    address:    c.address     ?? '',
    city:       c.city        ?? '',
    contact:    primary.name  ?? '',
    cargo:      primary.cargo ?? '',
    email:      primary.email ?? '',
    phone:      primary.phone ?? '',
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}

function toMasterQuotation(q: any): MasterQuotation {
  // Reconstruir categorías desde quotation_categories
  const catMap: Record<string, any> = {}
  for (const qc of q.categories ?? []) catMap[qc.category_id] = qc

  const catIds: CategoryId[] = ['mo', 'log', 'mat', 'rep', 'ins']

  const defaultCatMeta: Record<CategoryId, { label: string; color: string }> = {
    mo:  { label: 'Mano de Obra Especializada',     color: '#1e293b' },
    log: { label: 'Logística y Operación',          color: '#475569' },
    mat: { label: 'Provisión de Materiales',        color: '#1e3a8a' },
    rep: { label: 'Suministro Equipos o Repuestos', color: '#312e81' },
    ins: { label: 'Insumos Industriales y Gases',   color: '#164e63' },
  }

  const categories: CostCategory[] = catIds.map(cid => {
    const qc = catMap[cid]
    return {
      id:          cid,
      label:       qc?.label       ?? defaultCatMeta[cid].label,
      margin:      qc?.margin_pct  ?? 30,
      color:       qc?.color       ?? defaultCatMeta[cid].color,
      showDetails: false,
      showValues:  false,
      note:        qc?.note        ?? '',
      collapsed:   cid !== 'mo',
    }
  })

  // Reconstruir items desde quotation_line_items
  const items: Record<CategoryId, CostItem[]> = { mo: [], log: [], mat: [], rep: [], ins: [] }
  for (const li of q.line_items ?? []) {
    const cid = li.category_id as CategoryId
    if (!items[cid]) items[cid] = []
    items[cid].push({
      id:    li.id,
      desc:  li.description,
      unidad: li.unit_name,
      cant:  li.quantity,
      unit:  li.unit_price,
      days:  li.days,
    })
  }

  // Reconstruir scope / exclusions / commercial desde quotation_terms
  const scope:      string[] = []
  const exclusions: string[] = []
  const commercial: string[] = []
  for (const t of (q.terms ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order)) {
    if (t.term_type === 'scope')      scope.push(t.content)
    if (t.term_type === 'exclusion')  exclusions.push(t.content)
    if (t.term_type === 'commercial') commercial.push(t.content)
  }

  return {
    id:          q.id,
    correlative: q.correlative,
    client_id:   q.client_id,
    client_name: q.client_name ?? '',
    contact_id:  q.contact_id ?? null,
    contact:     q.contact_name ?? '',
    enduser:     q.enduser ?? '',
    ref:         q.ref ?? '',
    date:        (q.date ?? '').slice(0, 10),
    status:      q.status,
    operState:   q.oper_state ?? '',
    uf:          q.uf_value,
    iva:         q.iva_pct,
    categories,
    items,
    scope,
    exclusions,
    commercial,
    total:       q.totals?.venta_neta ?? 0,
    created_at:  q.created_at,
    updated_at:  q.updated_at,
  }
}

function fromMasterQuotation(q: MasterQuotation) {
  const categories = q.categories.map((c, idx) => ({
    category_id: c.id,
    label:       c.label,
    margin_pct:  c.margin,
    color:       c.color,
    note:        c.note,
    sort_order:  idx,
  }))

  const line_items: any[] = []
  for (const cid of Object.keys(q.items) as CategoryId[]) {
    q.items[cid].forEach((item, idx) => {
      line_items.push({
        id:          item.id,
        category_id: cid,
        description: item.desc,
        unit_name:   item.unidad,
        quantity:    item.cant,
        days:        item.days ?? 1,
        unit_price:  item.unit,
        sort_order:  idx,
      })
    })
  }

  const terms: any[] = [
    ...q.scope.map((c, i)      => ({ term_type: 'scope',      content: c, sort_order: i })),
    ...q.exclusions.map((c, i) => ({ term_type: 'exclusion',  content: c, sort_order: i })),
    ...q.commercial.map((c, i) => ({ term_type: 'commercial', content: c, sort_order: i })),
  ]

  return {
    correlative:  q.correlative,
    client_id:    q.client_id,
    contact_id:   q.contact_id ?? null,
    enduser:      q.enduser,
    ref:          q.ref,
    date:         q.date,
    status:       q.status,
    oper_state:   q.operState?.trim() ? q.operState : null,
    uf_value:     q.uf,
    iva_pct:      q.iva,
    categories,
    line_items,
    terms,
  }
}

// ── API pública ───────────────────────────────────────────────

export const api = {

  // ── Auth ────────────────────────────────────────────────────
  login: async (email: string, password: string) => {
    const data: any = await post('/api/auth/login', { email, password })
    localStorage.setItem('authToken',    data.token)
    localStorage.setItem('refreshToken', data.refresh_token)
    localStorage.setItem('user',         JSON.stringify(data.user))
    return data
  },

  me: () => get<any>('/api/auth/me'),

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
      name:     c.name,
      rut:      c.rut      || null,
      activity: c.activity || null,
      address:  c.address  || null,
      city:     c.city     || null,
      contacts: c.contact ? [{
        name:  c.contact,
        cargo: c.cargo || null,
        email: c.email || null,
        phone: c.phone || null,
      }] : [],
    })
    return toMasterClient(raw)
  },

  updateClient: async (c: MasterClient): Promise<MasterClient> => {
    // Actualizar datos del cliente
    const raw: any = await put(`/api/clients/${c.id}`, {
      name:     c.name,
      rut:      c.rut      || null,
      activity: c.activity || null,
      address:  c.address  || null,
      city:     c.city     || null,
    })
    // Actualizar contacto principal si existe
    const contacts: any[] = await get(`/api/clients/${c.id}/contacts`)
    const primary = contacts.find((ct: any) => ct.is_primary) ?? contacts[0]
    if (primary) {
      await put(`/api/clients/${c.id}/contacts/${primary.id}`, {
        name:  c.contact || primary.name,
        cargo: c.cargo   || null,
        email: c.email   || null,
        phone: c.phone   || null,
      })
    } else if (c.contact) {
      await post(`/api/clients/${c.id}/contacts`, {
        name: c.contact, cargo: c.cargo, email: c.email, phone: c.phone, is_primary: true,
      })
    }
    return toMasterClient({ ...raw, contacts: [{ name: c.contact, cargo: c.cargo, email: c.email, phone: c.phone, is_primary: true }] })
  },

  deleteClient: (id: string) => del(`/api/clients/${id}`),

  // ── Cotizaciones ────────────────────────────────────────────
  getQuotations: async (): Promise<MasterQuotation[]> => {
    const raw: any[] = await get('/api/quotations')
    // Backend devuelve filas planas (JOIN con v_quotation_totals), normalizamos totals
    return raw.map(q => toMasterQuotation({
      ...q,
      line_items: [],
      terms:      [],
      totals:     { venta_neta: q.venta_neta ?? 0 },
    }))
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

  // ── Dashboard ───────────────────────────────────────────────
  getKPIs: () => get<any>('/api/dashboard/kpis'),
}

export default api
