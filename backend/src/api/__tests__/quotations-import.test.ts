import { describe, it, expect, beforeAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'

const JWT_SECRET = 'test-secret'

const normRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase()

const payload = (overrides: Record<string, any> = {}) => ({
  esquema_version: '1.0',
  origen: {
    skill: 'cotizaciones-inf-hvac-maestro-comercial',
    informe_numero: 'ID-2026-003',
    generado_en: '2026-07-13T18:30:00Z',
  },
  correlative: 'SYM-006-07-2026',
  cliente: {
    nombre: 'CLIMATEMP SPA',
    rut: '77.381.030-3',
    actividad: 'Climatizacion',
    direccion: 'Av. Providencia 1234',
    ciudad: 'Santiago',
    contacto: { nombre: 'Maria Gonzalez', cargo: 'Jefa', email: 'maria@test.cl', telefono: '123' },
  },
  enduser: 'TYPSA',
  ref: 'Reparacion Modulo N2',
  valid_until: '2026-07-28',
  uf_manual: 39500,
  iva_pct: 19,
  notes: 'Generada desde informe ID-2026-003 via skill.',
  categorias: [
    { category_id: 'mo', label: 'Mano de Obra', margin_pct: 35 },
    { category_id: 'ins', label: 'Insumos', margin_pct: 30 },
  ],
  lineas: [
    { category_id: 'mo', descripcion: 'Tecnico Especializado HVAC', unidad: 'Jornada', cantidad: 1, dias: 4, precio_unitario: 150000 },
    { category_id: 'ins', descripcion: 'Acidol COTACO 2kg', unidad: 'kg', cantidad: 2, dias: 1, precio_unitario: 25500 },
  ],
  terminos: {
    scope: ['Recuperacion de refrigerante'],
    exclusion: ['Obras civiles.'],
    commercial: ['Validez de la oferta: 15 dias corridos.'],
  },
  ...overrides,
})

const authHeader = () => {
  const token = jwt.sign({ id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' }, JWT_SECRET)
  return `Bearer ${token}`
}

type State = {
  clients: any[]
  contacts: any[]
  quotations: any[]
  categories: any[]
  lineItems: any[]
  terms: any[]
  catalog: any[]
}

function cloneState(state: State): State {
  return JSON.parse(JSON.stringify(state))
}

function makeFakeDb(seed: Partial<State> = {}, opts: { failLineInsert?: boolean } = {}) {
  let state: State = {
    clients: seed.clients ?? [],
    contacts: seed.contacts ?? [],
    quotations: seed.quotations ?? [],
    categories: seed.categories ?? [],
    lineItems: seed.lineItems ?? [],
    terms: seed.terms ?? [],
    catalog: seed.catalog ?? [
      { id: 'cat-mo-1', category_id: 'mo', description: 'Tecnico Especializado HVAC', is_active: true },
      { id: 'cat-ins-1', category_id: 'ins', description: 'Acidol COTACO', is_active: true },
      { id: 'cat-ins-2', category_id: 'ins', description: 'Acidol', is_active: true },
      { id: 'cat-rep-1', category_id: 'rep', description: 'Filtro', is_active: true },
      { id: 'cat-rep-2', category_id: 'rep', description: 'Filtro Deshidratador', is_active: true },
    ],
  }
  let tx: State | null = null
  let idSeq = 1
  let rollbackCount = 0

  const active = () => tx ?? state
  const nextId = (prefix: string) => `${prefix}-${idSeq++}`

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()
    const db = active()
    if (s === 'BEGIN') { tx = cloneState(state); return { rows: [] } }
    if (s === 'COMMIT') { if (tx) state = tx; tx = null; return { rows: [] } }
    if (s === 'ROLLBACK') { rollbackCount++; tx = null; return { rows: [] } }

    if (s.startsWith('SELECT id FROM quotations WHERE correlative')) {
      return { rows: db.quotations.filter(q => q.correlative === params[0]).map(q => ({ id: q.id })) }
    }
    if (s.startsWith('SELECT correlative FROM quotations WHERE correlative LIKE')) {
      const re = new RegExp(`^${String(params[0]).replace('%', '\\d{3}')}$`)
      return { rows: db.quotations.filter(q => re.test(q.correlative)).map(q => ({ correlative: q.correlative })) }
    }
    if (s.includes('FROM clients') && s.includes('regexp_replace')) {
      return { rows: db.clients.filter(c => normRut(c.rut ?? '') === params[0] && !c.deleted_at).slice(0, 1) }
    }
    if (s.startsWith('UPDATE clients')) {
      const row = db.clients.find(c => c.id === params[3])
      if (!row) return { rows: [] }
      row.activity = row.activity ?? params[0]
      row.address = row.address ?? params[1]
      row.city = row.city ?? params[2]
      return { rows: [row] }
    }
    if (s.startsWith('INSERT INTO clients')) {
      const row = { id: nextId('client'), name: params[0], rut: params[1], activity: params[2], address: params[3], city: params[4], deleted_at: null }
      db.clients.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('SELECT * FROM client_contacts')) {
      if (s.includes('lower(COALESCE(email')) return { rows: db.contacts.filter(c => c.client_id === params[0] && (c.email ?? '').toLowerCase() === String(params[1]).toLowerCase()).slice(0, 1) }
      return { rows: db.contacts.filter(c => c.client_id === params[0] && c.name === params[1]).slice(0, 1) }
    }
    if (s.startsWith('SELECT 1 FROM client_contacts')) {
      return { rows: db.contacts.some(c => c.client_id === params[0] && c.is_primary) ? [{ '?column?': 1 }] : [] }
    }
    if (s.startsWith('UPDATE client_contacts')) {
      const row = db.contacts.find(c => c.id === params[4])
      if (!row) return { rows: [] }
      row.name = params[0] || row.name
      row.cargo = row.cargo ?? params[1]
      row.email = row.email || params[2]
      row.phone = row.phone ?? params[3]
      return { rows: [{ id: row.id }] }
    }
    if (s.startsWith('INSERT INTO client_contacts')) {
      const row = { id: nextId('contact'), client_id: params[0], name: params[1], cargo: params[2], email: params[3], phone: params[4], is_primary: params[5] }
      db.contacts.push(row)
      return { rows: [{ id: row.id }] }
    }
    if (s.startsWith('INSERT INTO quotations')) {
      const row = {
        id: nextId('quote'), correlative: params[0], client_id: params[1], contact_id: params[2],
        enduser: params[3], ref: params[4], date: '2026-07-13', valid_until: params[5],
        status: 'Borrador', oper_state: null, uf_value: params[6], iva_pct: params[7], notes: params[8],
        version: 1, deleted_at: null, created_at: '2026-07-13T00:00:00Z', updated_at: '2026-07-13T00:00:00Z',
      }
      db.quotations.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('INSERT INTO quotation_categories')) {
      db.categories.push({ id: nextId('qcat'), quotation_id: params[0], category_id: params[1], label: params[2], margin_pct: params[3], color: params[4], note: params[5], sort_order: params[6] })
      return { rows: [] }
    }
    if (s.startsWith('SELECT id, description') && s.includes('FROM catalog_items')) {
      return { rows: db.catalog.filter(c => c.category_id === params[0] && c.is_active).map(c => ({ id: c.id, description: c.description })) }
    }
    if (s.startsWith('INSERT INTO quotation_line_items')) {
      if (opts.failLineInsert) throw new Error('line insert failed')
      db.lineItems.push({ id: nextId('line'), quotation_id: params[0], category_id: params[1], catalog_item_id: params[2], description: params[3], unit_name: params[4], quantity: params[5], days: params[6], unit_price: params[7], sort_order: params[8] })
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO quotation_terms')) {
      db.terms.push({ id: nextId('term'), quotation_id: params[0], term_type: params[1], content: params[2], sort_order: params[3] })
      return { rows: [] }
    }
    if (s.startsWith('SELECT q.*')) {
      const q = db.quotations.find(row => row.id === params[0] && !row.deleted_at)
      if (!q) return { rows: [] }
      const client = db.clients.find(c => c.id === q.client_id)
      const contact = db.contacts.find(c => c.id === q.contact_id)
      return { rows: [{ ...q, client_name: client?.name, contact_name: contact?.name ?? null }] }
    }
    if (s.startsWith('SELECT * FROM quotation_categories')) return { rows: db.categories.filter(c => c.quotation_id === params[0]).sort((a, b) => a.sort_order - b.sort_order) }
    if (s.startsWith('SELECT * FROM quotation_line_items')) return { rows: db.lineItems.filter(i => i.quotation_id === params[0]).sort((a, b) => a.sort_order - b.sort_order) }
    if (s.startsWith('SELECT * FROM quotation_terms')) return { rows: db.terms.filter(t => t.quotation_id === params[0]).sort((a, b) => a.sort_order - b.sort_order) }
    if (s.startsWith('SELECT * FROM v_quotation_totals')) {
      const quotationId = params[0]
      const rows = db.lineItems.filter(i => i.quotation_id === quotationId)
      const costo = rows.reduce((sum, line) => sum + Number(line.quantity) * Number(line.days) * Number(line.unit_price), 0)
      const venta = rows.reduce((sum, line) => {
        const cat = db.categories.find(c => c.quotation_id === quotationId && c.category_id === line.category_id)
        const margin = Number(cat?.margin_pct ?? 30)
        return sum + (Number(line.quantity) * Number(line.days) * Number(line.unit_price)) / (1 - margin / 100)
      }, 0)
      return { rows: [{ quotation_id: quotationId, costo_neto: costo, venta_neta: venta, beneficio_bruto: venta - costo }] }
    }
    throw new Error(`Fake DB: query sin manejar ${s}`)
  }

  return {
    pool: { query, connect: async () => ({ query, release: () => {} }) } as any,
    getState: () => state,
    getRollbackCount: () => rollbackCount,
  }
}

const buildApp = (db: ReturnType<typeof makeFakeDb>) => {
  const app = express()
  app.use(express.json())
  app.use('/api/quotations', createQuotationsRouter(db.pool))
  return app
}

describe('POST /api/quotations/import', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('crea una cotizacion completa con cliente nuevo', async () => {
    const db = makeFakeDb()
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload())
    expect(res.status).toBe(201)
    expect(res.body.quotation.correlative).toBe('SYM-006-07-2026')
    expect(res.body.reporte_importacion.cliente.accion).toBe('creado')
    expect(db.getState().clients).toHaveLength(1)
    expect(db.getState().lineItems).toHaveLength(2)
  })

  it('usa cliente existente por RUT normalizado y completa campos nulos', async () => {
    const db = makeFakeDb({ clients: [{ id: 'client-1', name: 'CLIMATEMP SPA', rut: '77.381.030-3', activity: null, address: null, city: null, deleted_at: null }] })
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload({ correlative: 'SYM-007-07-2026' }))
    expect(res.status).toBe(201)
    expect(res.body.reporte_importacion.cliente.accion).toBe('existente')
    expect(db.getState().clients).toHaveLength(1)
    expect(db.getState().clients[0].address).toBe('Av. Providencia 1234')
  })

  it('devuelve 409 con sugerido si el correlativo ya existe', async () => {
    const db = makeFakeDb({ quotations: [{ id: 'quote-0', correlative: 'SYM-006-07-2026' }] })
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload())
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Correlativo ya existe')
    expect(res.body.sugerido).toBe('SYM-001-07-2026')
  })

  it('rechaza correlativo con formato invalido', async () => {
    const db = makeFakeDb()
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload({ correlative: 'MAL-1' }))
    expect(res.status).toBe(422)
    expect(res.body.message).toMatch(/SYM-000-MM-YYYY/)
  })

  it('rechaza RUT invalido', async () => {
    const db = makeFakeDb()
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload({ cliente: { ...payload().cliente, rut: '77.381.030-1' } }))
    expect(res.status).toBe(422)
    expect(res.body.error).toBe('RUT invalido')
  })

  it('prioriza uf_manual y no consulta mindicador', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any)
    const db = makeFakeDb()
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload({ correlative: 'SYM-008-07-2026', uf_manual: 41000 }))
    expect(res.status).toBe(201)
    expect(res.body.reporte_importacion.uf).toEqual({ valor: 41000, fuente: 'manual' })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('reporta matching exacto, ambiguo y sin match', async () => {
    const db = makeFakeDb()
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload({
      correlative: 'SYM-009-07-2026',
      lineas: [
        { category_id: 'mo', descripcion: 'Tecnico Especializado HVAC', unidad: 'Jornada', cantidad: 1, dias: 1, precio_unitario: 1 },
        { category_id: 'rep', descripcion: 'Filtro Deshidratador Grande', unidad: 'Uni', cantidad: 1, dias: 1, precio_unitario: 1 },
        { category_id: 'mat', descripcion: 'Material inexistente', unidad: 'Und', cantidad: 1, dias: 1, precio_unitario: 1 },
      ],
    }))
    expect(res.status).toBe(201)
    expect(res.body.reporte_importacion.lineas_vinculadas_catalogo).toBe(1)
    expect(res.body.reporte_importacion.lineas_sin_match).toEqual([
      { descripcion: 'Filtro Deshidratador Grande', motivo: 'ambiguo' },
      { descripcion: 'Material inexistente', motivo: 'sin_match' },
    ])
  })

  it('hace rollback si falla la insercion de lineas', async () => {
    const db = makeFakeDb({}, { failLineInsert: true })
    const res = await request(buildApp(db)).post('/api/quotations/import').set('Authorization', authHeader()).send(payload({ correlative: 'SYM-010-07-2026' }))
    expect(res.status).toBe(500)
    expect(db.getRollbackCount()).toBeGreaterThan(0)
    expect(db.getState().quotations).toHaveLength(0)
    expect(db.getState().clients).toHaveLength(0)
  })
})
