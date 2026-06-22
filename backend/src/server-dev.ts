// ============================================================
// MAESTRO COMERCIAL — Dev Server v2.0
// Express + JSON File DB | Alineado con schema v2.0
// ============================================================
import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

dotenv.config()

const app: Express = express()
const PORT  = process.env.PORT || 3000
const SECRET = process.env.JWT_SECRET || 'dev-secret-maestro'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url))

const DB_PATH = path.join(_dirname, '../db.json')

// ── Tipo DB ───────────────────────────────────────────────────
interface DB {
  app_config:             any[]
  users:                  any[]
  catalog_items:          any[]
  clients:                any[]
  client_contacts:        any[]
  quotations:             any[]
  quotation_categories:   any[]
  quotation_line_items:   any[]
  quotation_terms:        any[]
  projects:               any[]
  project_assignments:    any[]
  execution_costs:        any[]
  invoices:               any[]
  invoice_items:          any[]
  audit_logs:             any[]
  sync_events:            any[]
}

const EMPTY_DB: DB = {
  app_config: [], users: [], catalog_items: [], clients: [],
  client_contacts: [], quotations: [], quotation_categories: [],
  quotation_line_items: [], quotation_terms: [], projects: [],
  project_assignments: [], execution_costs: [], invoices: [],
  invoice_items: [], audit_logs: [], sync_events: [],
}

// ── IO ────────────────────────────────────────────────────────
const loadDB = (): DB => {
  try {
    return { ...EMPTY_DB, ...JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) }
  } catch {
    return { ...EMPTY_DB }
  }
}

const saveDB = (db: DB) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

let db = loadDB()

// ── Helpers ───────────────────────────────────────────────────
const now = () => new Date().toISOString()
const uid = () => randomUUID()

const cfg = (key: string) =>
  db.app_config.find((c: any) => c.key === key)?.value

const calcQuotationTotals = (quotationId: string) => {
  const cats  = db.quotation_categories.filter((c: any) => c.quotation_id === quotationId)
  const items = db.quotation_line_items.filter((i: any) => i.quotation_id === quotationId)
  const q     = db.quotations.find((q: any) => q.id === quotationId)
  if (!q) return null

  let costo_neto = 0
  let venta_neta = 0

  for (const item of items) {
    const cat    = cats.find((c: any) => c.category_id === item.category_id)
    const margin = cat ? Math.min(Math.max(Number(cat.margin_pct), 0), 99.99) : 30
    const costo  = (item.quantity || 0) * (item.days || 1) * (item.unit_price || 0)
    costo_neto  += costo
    venta_neta  += costo / (1 - margin / 100)
  }

  const beneficio_bruto = venta_neta - costo_neto
  const iva_monto       = venta_neta * ((q.iva_pct || 19) / 100)
  const total_con_iva   = venta_neta + iva_monto

  return { quotation_id: quotationId, costo_neto, venta_neta, beneficio_bruto, iva_monto, total_con_iva }
}

const buildQuotationFull = (q: any) => ({
  ...q,
  client_name:  db.clients.find((c: any) => c.id === q.client_id)?.name || null,
  contact_name: q.contact_id
    ? db.client_contacts.find((c: any) => c.id === q.contact_id)?.name || null
    : null,
  categories: db.quotation_categories.filter((c: any) => c.quotation_id === q.id)
    .sort((a: any, b: any) => a.sort_order - b.sort_order),
  line_items: db.quotation_line_items.filter((i: any) => i.quotation_id === q.id)
    .sort((a: any, b: any) => a.sort_order - b.sort_order),
  terms: db.quotation_terms.filter((t: any) => t.quotation_id === q.id)
    .sort((a: any, b: any) => a.sort_order - b.sort_order),
  totals: calcQuotationTotals(q.id),
})

// ── Middleware auth inline ────────────────────────────────────
interface AuthReq extends Request { user?: any }

const requireAuth = (req: AuthReq, res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Sin token de autorización' })
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), SECRET)
    next()
  } catch (e: any) {
    return res.status(401).json({
      error: e.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido',
    })
  }
}

const requireRole = (...roles: string[]) =>
  (req: AuthReq, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'Sin permisos suficientes' })
    next()
  }

// ── Express setup ─────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    process.env.FRONTEND_URL || '',
  ].filter(Boolean),
  credentials: true,
}))
app.use(bodyParser.json({ limit: '10mb' }))
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// ────────────────────────────────────────────────────────────
// HEALTH
// ────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', mode: 'JSON-DEV', timestamp: now() })
})

// ────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────
app.get('/api/config', requireAuth, (_req: Request, res: Response) => {
  const config: Record<string, string> = {}
  db.app_config.forEach((c: any) => { config[c.key] = c.value })
  res.json(config)
})

app.patch('/api/config/:key', requireAuth, requireRole('admin'),
  (req: AuthReq, res: Response) => {
    const { key } = req.params
    const { value } = req.body
    const existing = db.app_config.find((c: any) => c.key === key)
    if (existing) {
      existing.value = String(value)
      existing.updated_at = now()
      existing.updated_by = req.user.id
    } else {
      db.app_config.push({ key, value: String(value), updated_at: now(), updated_by: req.user.id })
    }
    saveDB(db)
    res.json({ key, value: String(value) })
  }
)

// ────────────────────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })

    const user = db.users.find((u: any) =>
      u.email.toLowerCase() === email.toLowerCase() && !u.deleted_at
    )
    if (!user || !user.is_active)
      return res.status(401).json({ error: 'Unauthorized', message: 'Email o contraseña inválidos' })

    let valid = false
    try {
      valid = await bcrypt.compare(password, user.password_hash)
    } catch {
      // fallback si el hash está corrupto
      valid = false
    }
    if (!valid)
      return res.status(401).json({ error: 'Unauthorized', message: 'Email o contraseña inválidos' })

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role }
    const token         = jwt.sign(payload, SECRET, { expiresIn: '8h' })
    const refresh_token = jwt.sign(payload, SECRET, { expiresIn: '30d' })

    user.last_login_at = now()
    user.updated_at    = now()
    saveDB(db)

    return res.json({
      token,
      refresh_token,
      expires_in: 8 * 60 * 60,
      user: {
        id: user.id, email: user.email, name: user.name,
        role: user.role, is_active: user.is_active,
        last_login_at: user.last_login_at,
        created_at: user.created_at, updated_at: user.updated_at,
      },
    })
  } catch (e: any) {
    return res.status(500).json({ error: 'Error interno', message: e.message })
  }
})

app.post('/api/auth/refresh', (req: Request, res: Response) => {
  const { refresh_token } = req.body
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token requerido' })
  try {
    const decoded: any = jwt.verify(refresh_token, SECRET)
    const user = db.users.find((u: any) => u.id === decoded.id && !u.deleted_at)
    if (!user || !user.is_active) return res.status(401).json({ error: 'Token inválido' })
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      SECRET, { expiresIn: '8h' }
    )
    return res.json({ token, expires_in: 8 * 60 * 60 })
  } catch {
    return res.status(401).json({ error: 'Refresh token inválido o expirado' })
  }
})

app.get('/api/auth/me', requireAuth, (req: AuthReq, res: Response) => {
  const user = db.users.find((u: any) => u.id === req.user.id && !u.deleted_at)
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })
  const { password_hash, ...safe } = user
  return res.json(safe)
})

// ────────────────────────────────────────────────────────────
// CATÁLOGO
// ────────────────────────────────────────────────────────────
app.get('/api/catalog', requireAuth, (_req: Request, res: Response) => {
  const items = db.catalog_items
    .filter((i: any) => i.is_active !== false)
    .sort((a: any, b: any) => a.sort_order - b.sort_order)

  const grouped: Record<string, any[]> = { mo: [], log: [], mat: [], rep: [], ins: [] }
  items.forEach((i: any) => { if (grouped[i.category_id]) grouped[i.category_id].push(i) })
  res.json(grouped)
})

app.get('/api/catalog/:category_id', requireAuth, (req: Request, res: Response) => {
  const items = db.catalog_items
    .filter((i: any) => i.category_id === req.params.category_id && i.is_active !== false)
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
  res.json(items)
})

app.post('/api/catalog', requireAuth, requireRole('admin', 'manager'),
  (req: AuthReq, res: Response) => {
    const { category_id, description, unit_name, unit_price, sort_order } = req.body
    if (!category_id || !description || !unit_name)
      return res.status(400).json({ error: 'category_id, description y unit_name son requeridos' })

    const item = {
      id: uid(), category_id, description, unit_name,
      unit_price: Number(unit_price) || 0,
      is_active: true,
      sort_order: Number(sort_order) || 0,
      created_at: now(), updated_at: now(),
    }
    db.catalog_items.push(item)
    saveDB(db)
    res.status(201).json(item)
  }
)

app.put('/api/catalog/:id', requireAuth, requireRole('admin', 'manager'),
  (req: Request, res: Response) => {
    const item = db.catalog_items.find((i: any) => i.id === req.params.id)
    if (!item) return res.status(404).json({ error: 'Item no encontrado' })
    Object.assign(item, { ...req.body, id: item.id, updated_at: now() })
    saveDB(db)
    res.json(item)
  }
)

app.delete('/api/catalog/:id', requireAuth, requireRole('admin'),
  (req: Request, res: Response) => {
    const item = db.catalog_items.find((i: any) => i.id === req.params.id)
    if (!item) return res.status(404).json({ error: 'Item no encontrado' })
    item.is_active = false
    item.updated_at = now()
    saveDB(db)
    res.json({ message: 'Item desactivado' })
  }
)

// ────────────────────────────────────────────────────────────
// CLIENTES
// ────────────────────────────────────────────────────────────
app.get('/api/clients', requireAuth, (_req: Request, res: Response) => {
  const clients = db.clients
    .filter((c: any) => !c.deleted_at)
    .map((c: any) => ({
      ...c,
      contacts: db.client_contacts.filter((cc: any) => cc.client_id === c.id),
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
  res.json(clients)
})

app.get('/api/clients/:id', requireAuth, (req: Request, res: Response) => {
  const client = db.clients.find((c: any) => c.id === req.params.id && !c.deleted_at)
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
  res.json({
    ...client,
    contacts: db.client_contacts.filter((cc: any) => cc.client_id === client.id),
  })
})

app.post('/api/clients', requireAuth, (req: AuthReq, res: Response) => {
  const { name, rut, activity, address, city, contacts } = req.body
  if (!name) return res.status(400).json({ error: 'name es requerido' })

  if (rut && db.clients.find((c: any) => c.rut === rut && !c.deleted_at))
    return res.status(409).json({ error: 'Ya existe un cliente con ese RUT' })

  const client = {
    id: uid(), name, rut: rut || null, activity: activity || null,
    address: address || null, city: city || null,
    created_at: now(), updated_at: now(), deleted_at: null,
    created_by: req.user.id,
  }
  db.clients.push(client)

  if (Array.isArray(contacts) && contacts.length > 0) {
    contacts.forEach((ct: any, idx: number) => {
      db.client_contacts.push({
        id: uid(), client_id: client.id,
        name: ct.name, cargo: ct.cargo || null,
        email: ct.email || null, phone: ct.phone || null,
        is_primary: idx === 0,
        created_at: now(), updated_at: now(),
      })
    })
  }

  saveDB(db)
  res.status(201).json({
    ...client,
    contacts: db.client_contacts.filter((cc: any) => cc.client_id === client.id),
  })
})

app.put('/api/clients/:id', requireAuth, (req: AuthReq, res: Response) => {
  const client = db.clients.find((c: any) => c.id === req.params.id && !c.deleted_at)
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
  const { name, rut, activity, address, city } = req.body
  Object.assign(client, {
    name: name ?? client.name,
    rut: rut ?? client.rut,
    activity: activity ?? client.activity,
    address: address ?? client.address,
    city: city ?? client.city,
    updated_at: now(),
  })
  saveDB(db)
  res.json({ ...client, contacts: db.client_contacts.filter((cc: any) => cc.client_id === client.id) })
})

app.delete('/api/clients/:id', requireAuth, requireRole('admin', 'manager'),
  (req: Request, res: Response) => {
    const client = db.clients.find((c: any) => c.id === req.params.id && !c.deleted_at)
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
    client.deleted_at = now()
    saveDB(db)
    res.json({ message: 'Cliente eliminado' })
  }
)

// Contactos
app.get('/api/clients/:id/contacts', requireAuth, (req: Request, res: Response) => {
  res.json(db.client_contacts.filter((cc: any) => cc.client_id === req.params.id))
})

app.post('/api/clients/:id/contacts', requireAuth, (req: Request, res: Response) => {
  const client = db.clients.find((c: any) => c.id === req.params.id && !c.deleted_at)
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' })
  const { name, cargo, email, phone, is_primary } = req.body
  if (!name) return res.status(400).json({ error: 'name es requerido' })
  if (is_primary) {
    db.client_contacts
      .filter((cc: any) => cc.client_id === req.params.id)
      .forEach((cc: any) => { cc.is_primary = false })
  }
  const contact = {
    id: uid(), client_id: req.params.id,
    name, cargo: cargo || null, email: email || null, phone: phone || null,
    is_primary: !!is_primary,
    created_at: now(), updated_at: now(),
  }
  db.client_contacts.push(contact)
  saveDB(db)
  res.status(201).json(contact)
})

app.put('/api/clients/:cid/contacts/:id', requireAuth, (req: Request, res: Response) => {
  const contact = db.client_contacts.find(
    (cc: any) => cc.id === req.params.id && cc.client_id === req.params.cid
  )
  if (!contact) return res.status(404).json({ error: 'Contacto no encontrado' })
  Object.assign(contact, { ...req.body, id: contact.id, client_id: contact.client_id, updated_at: now() })
  saveDB(db)
  res.json(contact)
})

app.delete('/api/clients/:cid/contacts/:id', requireAuth, (req: Request, res: Response) => {
  const idx = db.client_contacts.findIndex(
    (cc: any) => cc.id === req.params.id && cc.client_id === req.params.cid
  )
  if (idx === -1) return res.status(404).json({ error: 'Contacto no encontrado' })
  db.client_contacts.splice(idx, 1)
  saveDB(db)
  res.json({ message: 'Contacto eliminado' })
})

// ────────────────────────────────────────────────────────────
// COTIZACIONES
// ────────────────────────────────────────────────────────────
app.get('/api/quotations', requireAuth, (_req: Request, res: Response) => {
  const list = db.quotations
    .filter((q: any) => !q.deleted_at)
    .map((q: any) => ({
      ...q,
      client_name: db.clients.find((c: any) => c.id === q.client_id)?.name || null,
      totals: calcQuotationTotals(q.id),
    }))
    .sort((a: any, b: any) => b.date.localeCompare(a.date))
  res.json(list)
})

app.get('/api/quotations/:id', requireAuth, (req: Request, res: Response) => {
  const q = db.quotations.find((q: any) => q.id === req.params.id && !q.deleted_at)
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' })
  res.json(buildQuotationFull(q))
})

app.post('/api/quotations', requireAuth, (req: AuthReq, res: Response) => {
  try {
    const {
      correlative, client_id, contact_id, enduser, ref, date, valid_until,
      status, oper_state, uf_value, iva_pct, notes,
      categories, line_items, terms,
    } = req.body

    if (!client_id) return res.status(400).json({ error: 'client_id es requerido' })
    if (!correlative) return res.status(400).json({ error: 'correlative es requerido' })

    if (db.quotations.find((q: any) => q.correlative === correlative))
      return res.status(409).json({ error: 'Correlativo ya existe' })

    const qId = uid()
    const quotation = {
      id: qId, correlative, client_id,
      contact_id: contact_id || null,
      enduser: enduser || null, ref: ref || null,
      date: date || new Date().toISOString().slice(0, 10),
      valid_until: valid_until || null,
      status: status || 'Borrador',
      oper_state: oper_state || null,
      uf_value: Number(uf_value) || Number(cfg('uf_value')) || 39500,
      iva_pct: Number(iva_pct) || Number(cfg('iva_pct')) || 19,
      notes: notes || null,
      version: 1,
      created_at: now(), updated_at: now(), deleted_at: null,
      created_by: req.user.id,
    }
    db.quotations.push(quotation)

    // Categorías
    const defaultCats = [
      { id: 'mo',  label: 'Mano de Obra Especializada',     margin_pct: 35, color: '#1e293b', sort_order: 0 },
      { id: 'log', label: 'Logística y Operación',          margin_pct: 30, color: '#475569', sort_order: 1 },
      { id: 'mat', label: 'Provisión de Materiales',        margin_pct: 30, color: '#1e3a8a', sort_order: 2 },
      { id: 'rep', label: 'Suministro Equipos o Repuestos', margin_pct: 30, color: '#312e81', sort_order: 3 },
      { id: 'ins', label: 'Insumos Industriales y Gases',   margin_pct: 30, color: '#164e63', sort_order: 4 },
    ]
    const catList = Array.isArray(categories) && categories.length > 0 ? categories : defaultCats
    catList.forEach((c: any) => {
      db.quotation_categories.push({
        id: uid(), quotation_id: qId,
        category_id: c.category_id || c.id,
        label: c.label, margin_pct: Number(c.margin_pct) || Number(c.margin) || 30,
        color: c.color || null, note: c.note || null,
        sort_order: Number(c.sort_order) || 0,
      })
    })

    // Líneas
    if (Array.isArray(line_items)) {
      line_items.forEach((i: any, idx: number) => {
        db.quotation_line_items.push({
          id: uid(), quotation_id: qId,
          category_id: i.category_id,
          catalog_item_id: i.catalog_item_id || null,
          description: i.description || '',
          unit_name: i.unit_name || i.unidad || 'Und',
          quantity: Number(i.quantity || i.cant) || 0,
          days: Number(i.days) || 1,
          unit_price: Number(i.unit_price || i.unit) || 0,
          sort_order: Number(i.sort_order) || idx,
          created_at: now(), updated_at: now(),
        })
      })
    }

    // Términos
    if (Array.isArray(terms)) {
      terms.forEach((t: any, idx: number) => {
        db.quotation_terms.push({
          id: uid(), quotation_id: qId,
          term_type: t.term_type,
          content: t.content,
          sort_order: Number(t.sort_order) || idx,
        })
      })
    }

    saveDB(db)
    res.status(201).json(buildQuotationFull(quotation))
  } catch (e: any) {
    res.status(500).json({ error: 'Error interno', message: e.message })
  }
})

app.put('/api/quotations/:id', requireAuth, (req: AuthReq, res: Response) => {
  const q = db.quotations.find((q: any) => q.id === req.params.id && !q.deleted_at)
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' })

  const {
    client_id, contact_id, enduser, ref, date, valid_until,
    status, oper_state, uf_value, iva_pct, notes,
    categories, line_items, terms,
  } = req.body

  Object.assign(q, {
    client_id:   client_id   ?? q.client_id,
    contact_id:  contact_id  ?? q.contact_id,
    enduser:     enduser     ?? q.enduser,
    ref:         ref         ?? q.ref,
    date:        date        ?? q.date,
    valid_until: valid_until ?? q.valid_until,
    status:      status      ?? q.status,
    oper_state:  oper_state  ?? q.oper_state,
    uf_value:    uf_value    != null ? Number(uf_value)  : q.uf_value,
    iva_pct:     iva_pct     != null ? Number(iva_pct)   : q.iva_pct,
    notes:       notes       ?? q.notes,
    version:     q.version + 1,
    updated_at:  now(),
  })

  // Reemplazar categorías si vienen en el body
  if (Array.isArray(categories)) {
    db.quotation_categories = db.quotation_categories.filter((c: any) => c.quotation_id !== q.id)
    categories.forEach((c: any) => {
      db.quotation_categories.push({
        id: uid(), quotation_id: q.id,
        category_id: c.category_id || c.id,
        label: c.label, margin_pct: Number(c.margin_pct || c.margin) || 30,
        color: c.color || null, note: c.note || null,
        sort_order: Number(c.sort_order) || 0,
      })
    })
  }

  // Reemplazar líneas si vienen en el body
  if (Array.isArray(line_items)) {
    db.quotation_line_items = db.quotation_line_items.filter((i: any) => i.quotation_id !== q.id)
    line_items.forEach((i: any, idx: number) => {
      db.quotation_line_items.push({
        id: i.id || uid(), quotation_id: q.id,
        category_id: i.category_id,
        catalog_item_id: i.catalog_item_id || null,
        description: i.description || '',
        unit_name: i.unit_name || i.unidad || 'Und',
        quantity: Number(i.quantity || i.cant) || 0,
        days: Number(i.days) || 1,
        unit_price: Number(i.unit_price || i.unit) || 0,
        sort_order: Number(i.sort_order) || idx,
        created_at: i.created_at || now(), updated_at: now(),
      })
    })
  }

  // Reemplazar términos si vienen en el body
  if (Array.isArray(terms)) {
    db.quotation_terms = db.quotation_terms.filter((t: any) => t.quotation_id !== q.id)
    terms.forEach((t: any, idx: number) => {
      db.quotation_terms.push({
        id: t.id || uid(), quotation_id: q.id,
        term_type: t.term_type, content: t.content,
        sort_order: Number(t.sort_order) || idx,
      })
    })
  }

  saveDB(db)
  res.json(buildQuotationFull(q))
})

app.patch('/api/quotations/:id/status', requireAuth, (req: Request, res: Response) => {
  const q = db.quotations.find((q: any) => q.id === req.params.id && !q.deleted_at)
  if (!q) return res.status(404).json({ error: 'Cotización no encontrada' })
  const { status, oper_state } = req.body
  if (status)     q.status     = status
  if (oper_state) q.oper_state = oper_state
  q.updated_at = now()
  saveDB(db)
  res.json({ id: q.id, status: q.status, oper_state: q.oper_state })
})

app.post('/api/quotations/:id/duplicate', requireAuth, (req: AuthReq, res: Response) => {
  const src = db.quotations.find((q: any) => q.id === req.params.id && !q.deleted_at)
  if (!src) return res.status(404).json({ error: 'Cotización no encontrada' })

  const { correlative } = req.body
  if (!correlative) return res.status(400).json({ error: 'correlative es requerido' })
  if (db.quotations.find((q: any) => q.correlative === correlative))
    return res.status(409).json({ error: 'Correlativo ya existe' })

  const newId = uid()
  const copy = { ...src, id: newId, correlative, status: 'Borrador', version: 1, created_at: now(), updated_at: now() }
  db.quotations.push(copy)

  db.quotation_categories
    .filter((c: any) => c.quotation_id === src.id)
    .forEach((c: any) => db.quotation_categories.push({ ...c, id: uid(), quotation_id: newId }))

  db.quotation_line_items
    .filter((i: any) => i.quotation_id === src.id)
    .forEach((i: any) => db.quotation_line_items.push({ ...i, id: uid(), quotation_id: newId, created_at: now(), updated_at: now() }))

  db.quotation_terms
    .filter((t: any) => t.quotation_id === src.id)
    .forEach((t: any) => db.quotation_terms.push({ ...t, id: uid(), quotation_id: newId }))

  saveDB(db)
  res.status(201).json(buildQuotationFull(copy))
})

app.delete('/api/quotations/:id', requireAuth, requireRole('admin', 'manager'),
  (req: Request, res: Response) => {
    const q = db.quotations.find((q: any) => q.id === req.params.id && !q.deleted_at)
    if (!q) return res.status(404).json({ error: 'Cotización no encontrada' })
    q.deleted_at = now()
    saveDB(db)
    res.json({ message: 'Cotización eliminada' })
  }
)

// ────────────────────────────────────────────────────────────
// PROYECTOS
// ────────────────────────────────────────────────────────────
app.get('/api/projects', requireAuth, (_req: Request, res: Response) => {
  const list = db.projects
    .filter((p: any) => !p.deleted_at)
    .map((p: any) => ({
      ...p,
      client_name: db.clients.find((c: any) => c.id === p.client_id)?.name || null,
      gasto_real: db.execution_costs
        .filter((ec: any) => ec.project_id === p.id)
        .reduce((s: number, ec: any) => s + (ec.quantity || 1) * (ec.unit_price || 0), 0),
    }))
  res.json(list)
})

app.get('/api/projects/:id', requireAuth, (req: Request, res: Response) => {
  const p = db.projects.find((p: any) => p.id === req.params.id && !p.deleted_at)
  if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
  const gasto_real = db.execution_costs
    .filter((ec: any) => ec.project_id === p.id)
    .reduce((s: number, ec: any) => s + (ec.quantity || 1) * (ec.unit_price || 0), 0)
  res.json({
    ...p,
    client_name: db.clients.find((c: any) => c.id === p.client_id)?.name || null,
    gasto_real,
    saldo: p.budget - gasto_real,
    costs: db.execution_costs.filter((ec: any) => ec.project_id === p.id),
    assignments: db.project_assignments.filter((a: any) => a.project_id === p.id),
  })
})

app.post('/api/projects', requireAuth, (req: AuthReq, res: Response) => {
  const { quotation_id, client_id, name, status, start_date, end_date, budget } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id es requerido' })
  const project = {
    id: uid(), quotation_id: quotation_id || null, client_id,
    name: name || 'Proyecto sin nombre',
    status: status || 'planning',
    start_date: start_date || null, end_date: end_date || null,
    budget: Number(budget) || 0, progress_pct: 0,
    created_at: now(), updated_at: now(), deleted_at: null,
    created_by: req.user.id,
  }
  db.projects.push(project)
  saveDB(db)
  res.status(201).json(project)
})

app.put('/api/projects/:id', requireAuth, (req: Request, res: Response) => {
  const p = db.projects.find((p: any) => p.id === req.params.id && !p.deleted_at)
  if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
  const { name, status, start_date, end_date, budget, progress_pct } = req.body
  Object.assign(p, {
    name:         name         ?? p.name,
    status:       status       ?? p.status,
    start_date:   start_date   ?? p.start_date,
    end_date:     end_date     ?? p.end_date,
    budget:       budget       != null ? Number(budget)       : p.budget,
    progress_pct: progress_pct != null ? Number(progress_pct) : p.progress_pct,
    updated_at: now(),
  })
  saveDB(db)
  res.json(p)
})

app.delete('/api/projects/:id', requireAuth, requireRole('admin', 'manager'),
  (req: Request, res: Response) => {
    const p = db.projects.find((p: any) => p.id === req.params.id && !p.deleted_at)
    if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
    p.deleted_at = now()
    saveDB(db)
    res.json({ message: 'Proyecto eliminado' })
  }
)

// Costos de ejecución
app.get('/api/projects/:id/costs', requireAuth, (req: Request, res: Response) => {
  res.json(db.execution_costs.filter((ec: any) => ec.project_id === req.params.id))
})

app.post('/api/projects/:id/costs', requireAuth, (req: AuthReq, res: Response) => {
  const project = db.projects.find((p: any) => p.id === req.params.id && !p.deleted_at)
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
  const { category_id, description, quantity, unit_price } = req.body
  if (!description) return res.status(400).json({ error: 'description es requerido' })
  const cost = {
    id: uid(), project_id: req.params.id,
    category_id: category_id || null,
    description,
    quantity: Number(quantity) || 1,
    unit_price: Number(unit_price) || 0,
    created_at: now(), updated_at: now(),
    created_by: req.user.id,
  }
  db.execution_costs.push(cost)
  saveDB(db)
  res.status(201).json(cost)
})

app.delete('/api/projects/:pid/costs/:id', requireAuth, (req: Request, res: Response) => {
  const idx = db.execution_costs.findIndex(
    (ec: any) => ec.id === req.params.id && ec.project_id === req.params.pid
  )
  if (idx === -1) return res.status(404).json({ error: 'Costo no encontrado' })
  db.execution_costs.splice(idx, 1)
  saveDB(db)
  res.json({ message: 'Costo eliminado' })
})

// ────────────────────────────────────────────────────────────
// FACTURAS
// ────────────────────────────────────────────────────────────
app.get('/api/invoices', requireAuth, (_req: Request, res: Response) => {
  res.json(
    db.invoices
      .filter((i: any) => !i.deleted_at)
      .map((i: any) => ({
        ...i,
        client_name: db.clients.find((c: any) => c.id === i.client_id)?.name || null,
      }))
      .sort((a: any, b: any) => b.date.localeCompare(a.date))
  )
})

app.post('/api/invoices', requireAuth, (req: AuthReq, res: Response) => {
  const { project_id, client_id, number, date, payment_cond, due_date, items } = req.body
  if (!client_id) return res.status(400).json({ error: 'client_id es requerido' })

  let net_amount = 0
  const lineItems: any[] = []

  if (Array.isArray(items)) {
    items.forEach((item: any, idx: number) => {
      const subtotal = (item.quantity || 0) * (item.unit_price || 0)
      net_amount += subtotal
      lineItems.push({
        id: uid(), description: item.description || '',
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        sort_order: idx,
        created_at: now(),
      })
    })
  }

  const iva_pct    = Number(cfg('iva_pct')) || 19
  const tax_amount  = net_amount * (iva_pct / 100)
  const total_amount = net_amount + tax_amount
  const invNumber = number || `F-${String(db.invoices.length + 1).padStart(6, '0')}`

  const invoice = {
    id: uid(), project_id: project_id || null, client_id,
    number: invNumber,
    date: date || new Date().toISOString().slice(0, 10),
    payment_cond: payment_cond || 'credit',
    due_date: due_date || null,
    net_amount, tax_amount, total_amount,
    is_factored: false, status: 'draft',
    created_at: now(), updated_at: now(), deleted_at: null,
    created_by: req.user.id,
  }
  db.invoices.push(invoice)
  lineItems.forEach(li => db.invoice_items.push({ ...li, invoice_id: invoice.id }))
  saveDB(db)
  res.status(201).json({ ...invoice, items: lineItems })
})

app.patch('/api/invoices/:id/status', requireAuth, (req: Request, res: Response) => {
  const inv = db.invoices.find((i: any) => i.id === req.params.id && !i.deleted_at)
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada' })
  inv.status = req.body.status
  inv.updated_at = now()
  saveDB(db)
  res.json({ id: inv.id, status: inv.status })
})

app.delete('/api/invoices/:id', requireAuth, requireRole('admin'),
  (req: Request, res: Response) => {
    const inv = db.invoices.find((i: any) => i.id === req.params.id && !i.deleted_at)
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada' })
    inv.deleted_at = now()
    saveDB(db)
    res.json({ message: 'Factura eliminada' })
  }
)

// ────────────────────────────────────────────────────────────
// DASHBOARD
// ────────────────────────────────────────────────────────────
app.get('/api/dashboard/kpis', requireAuth, (_req: Request, res: Response) => {
  const activeQuotes   = db.quotations.filter((q: any) => !q.deleted_at)
  const activeProjects = db.projects.filter((p: any) => !p.deleted_at)
  const activeInvoices = db.invoices.filter((i: any) => !i.deleted_at && i.status !== 'cancelled')
  const activeClients  = db.clients.filter((c: any) => !c.deleted_at)

  const totalFacturado = activeInvoices
    .reduce((s: number, i: any) => s + (i.total_amount || 0), 0)

  const totalGasto = db.execution_costs
    .reduce((s: number, ec: any) => s + (ec.quantity || 1) * (ec.unit_price || 0), 0)

  const totalVentaCotizaciones = activeQuotes
    .filter((q: any) => ['Emitida', 'Enviada'].includes(q.status))
    .reduce((s: number, q: any) => s + (calcQuotationTotals(q.id)?.venta_neta || 0), 0)

  const margen = totalFacturado > 0
    ? ((totalFacturado - totalGasto) / totalFacturado) * 100 : 0

  res.json({
    kpis: {
      clientes_activos:       activeClients.length,
      cotizaciones_abiertas:  activeQuotes.filter((q: any) => ['Emitida', 'Enviada'].includes(q.status)).length,
      proyectos_en_curso:     activeProjects.filter((p: any) => p.status === 'in_progress').length,
      total_facturado:        Math.round(totalFacturado),
      total_gasto_obra:       Math.round(totalGasto),
      margen_bruto_pct:       Math.round(margen * 100) / 100,
      pipeline_cotizaciones:  Math.round(totalVentaCotizaciones),
    },
    timestamp: now(),
  })
})

// ────────────────────────────────────────────────────────────
// SYNC (bidireccional frontend ↔ backend)
// ────────────────────────────────────────────────────────────
app.get('/api/sync/events', requireAuth, (req: Request, res: Response) => {
  const since = Number(req.query.since) || 0
  const events = db.sync_events.filter((e: any) => e.id > since)
  res.json({ events, last_seq: events.length > 0 ? events[events.length - 1].id : since })
})

app.post('/api/sync/events', requireAuth, (req: Request, res: Response) => {
  const events: any[] = Array.isArray(req.body.events) ? req.body.events : [req.body]
  const results: any[] = []
  let lastId = db.sync_events.length

  events.forEach((evt: any) => {
    lastId++
    const stored = {
      id: lastId,
      client_uid:  evt.client_uid  || 'unknown',
      entity_type: evt.entity_type,
      entity_id:   evt.entity_id,
      action:      evt.action,
      payload:     evt.payload,
      server_seq:  lastId,
      applied_at:  now(),
      conflict:    false,
      created_at:  now(),
    }
    db.sync_events.push(stored)
    results.push({ id: stored.id, server_seq: lastId })
  })

  saveDB(db)
  res.json({ applied: results })
})

// ────────────────────────────────────────────────────────────
// 404 y Error handler
// ────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint no encontrado', path: req.path })
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌', err.message)
  res.status(500).json({ error: 'Error interno del servidor', message: err.message })
})

// ── Arrancar ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('')
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║     MAESTRO COMERCIAL — Backend v2.0         ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log(`║  Puerto : ${PORT}`)
  console.log(`║  Modo   : JSON Dev (db.json)`)
  console.log('╠══════════════════════════════════════════════╣')
  console.log('║  Endpoints disponibles:')
  console.log('║  POST /api/auth/login')
  console.log('║  GET  /api/config')
  console.log('║  GET  /api/catalog')
  console.log('║  GET  /api/clients')
  console.log('║  GET  /api/quotations')
  console.log('║  GET  /api/projects')
  console.log('║  GET  /api/invoices')
  console.log('║  GET  /api/dashboard/kpis')
  console.log('║  GET  /api/sync/events')
  console.log('╠══════════════════════════════════════════════╣')
  console.log('║  Usuarios:')
  console.log('║  nbravo.nbyb@gmail.com / 3571 (admin)')
  console.log('║  hmeza.nbyb@gmail.com  / 4321 (manager)')
  console.log('╚══════════════════════════════════════════════╝')
  console.log('')
})

export default app
