import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'
import { mtcConfigSchema } from '../../schemas/quotations'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const SOURCE_ID = '22222222-2222-4222-8222-222222222222'
const NEW_ID = '44444444-4444-4444-8444-444444444444'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const baseRow = {
  id: SOURCE_ID,
  correlative: 'SYM-028-11-2026',
  client_id: CLIENT_ID,
  contact_id: null,
  enduser: null,
  ref: null,
  date: '2026-11-04',
  valid_until: null,
  status: 'Borrador',
  oper_state: null,
  uf_value: 39000,
  iva_pct: 19,
  notes: null,
  version: 1,
  kind: 'maintenance',
  equipment_count: null,
  equipment_description: null,
  frequency: 'bimestral',
  visits_per_year: null,
  contract_start_date: null,
  show_uf_equivalent: false,
  show_usd_equivalent: false,
  usd_value: null,
}

// El orden de las claves sigue el del esquema Zod para que JSON.stringify
// del cuerpo original y del parseado coincidan.
const system1 = {
  id: 's1',
  name: 'Sistema 1',
  frequency: 'mensual',
  special_months: null,
  schedule: 'habil',
  currency: 'CLP',
  summary_text: null,
  consumables: { enabled: false, margin: 30, rows: [] },
  categories: null,
  items: null,
}
const system2 = {
  ...system1,
  id: 's2',
  name: 'Sistema 2',
  frequency: 'especial',
  special_months: 3,
  categories: [
    {
      id: 'mo',
      label: 'Mano de obra',
      margin: 30,
      color: '#fff',
      showDetails: true,
      showValues: true,
      note: '',
      collapsed: false,
    },
  ],
  // costeo por defecto del frontend: filas en blanco (desc vacio)
  items: { mo: [{ id: 'i1', desc: '', unidad: 'Hrs', cant: 0, unit: 0, days: 1 }] },
}
const validConfig = {
  v: 1,
  summary_mode: false,
  show_summary_table: true,
  systems: [system1, system2],
}

function makeFakeDb(sourceMtc: unknown = null) {
  const captured: { insert: unknown[]; update: unknown[] } = { insert: [], update: [] }
  const row = { ...baseRow, mtc_config: sourceMtc }
  async function query(sql: string, params: unknown[] = []) {
    const s = sql.trim()
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK'))
      return { rows: [] }
    if (s.startsWith('SELECT q.*')) {
      const [id] = params
      if (id === SOURCE_ID) return { rows: [{ ...row, client_name: 'Cliente' }] }
      if (id === NEW_ID) return { rows: [{ ...row, id: NEW_ID, client_name: 'Cliente' }] }
      return { rows: [] }
    }
    if (s.startsWith('SELECT status FROM quotations')) return { rows: [{ status: 'Borrador' }] }
    if (s.startsWith('INSERT INTO quotations')) {
      captured.insert = params
      return { rows: [{ ...row, id: NEW_ID }] }
    }
    if (s.startsWith('UPDATE quotations')) {
      captured.update = params
      return { rows: [row] }
    }
    if (
      s.startsWith('SELECT * FROM quotation_') ||
      s.startsWith('SELECT * FROM v_quotation_totals') ||
      s.includes('DELETE FROM quotation_') ||
      s.includes('INSERT INTO quotation_')
    )
      return { rows: [] }
    throw new Error(`Fake DB: query sin manejar — ${s.slice(0, 80)}`)
  }
  return { query, captured }
}

function buildApp(sourceMtc: unknown = null) {
  const db = makeFakeDb(sourceMtc)
  const fakePool = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  } as unknown as Parameters<typeof createQuotationsRouter>[0]
  const app = express()
  app.use(express.json())
  app.use('/api/quotations', createQuotationsRouter(fakePool))
  return { app, db }
}

function authHeader() {
  process.env.JWT_SECRET = JWT_SECRET
  const token = jwt.sign({ id: 'u1', email: 't@t.com', name: 'T', role: 'admin' }, JWT_SECRET)
  return `Bearer ${token}`
}

const createBody = (extra: Record<string, unknown> = {}) => ({
  client_id: CLIENT_ID,
  correlative: 'SYM-100-11-2026',
  kind: 'maintenance',
  frequency: 'bimestral',
  ...extra,
})
const updateBody = (extra: Record<string, unknown> = {}) => ({
  ...createBody(),
  version: 1,
  ...extra,
})

describe('mtc_config en POST/PUT/duplicate', () => {
  it('POST guarda mtc_config como ultimo parametro y acepta bimestral', async () => {
    const { app, db } = buildApp()
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', authHeader())
      .send(createBody({ mtc_config: validConfig }))
    expect(res.status).toBe(201)
    expect(db.captured.insert[db.captured.insert.length - 1]).toBe(JSON.stringify(validConfig))
  })

  it('POST sin mtc_config manda null', async () => {
    const { app, db } = buildApp()
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', authHeader())
      .send(createBody())
    expect(res.status).toBe(201)
    expect(db.captured.insert[db.captured.insert.length - 1]).toBeNull()
  })

  it.each(['unico', 'especial'])('POST acepta frequency %s', async freq => {
    const { app } = buildApp()
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', authHeader())
      .send(createBody({ frequency: freq }))
    expect(res.status).toBe(201)
  })

  it('PUT sin la clave mtc_config manda false y null; id/version no se mueven', async () => {
    const { app, db } = buildApp()
    const res = await request(app)
      .put(`/api/quotations/${SOURCE_ID}`)
      .set('Authorization', authHeader())
      .send(updateBody())
    expect(res.status).toBe(200)
    const p = db.captured.update
    expect(p[21]).toBe(SOURCE_ID)
    expect(p[22]).toBe(1)
    expect(p[p.length - 2]).toBe(false)
    expect(p[p.length - 1]).toBeNull()
  })

  it('PUT con mtc_config valido manda true y el JSON', async () => {
    const { app, db } = buildApp()
    const res = await request(app)
      .put(`/api/quotations/${SOURCE_ID}`)
      .set('Authorization', authHeader())
      .send(updateBody({ mtc_config: validConfig }))
    expect(res.status).toBe(200)
    expect(db.captured.update[db.captured.update.length - 2]).toBe(true)
    expect(db.captured.update[db.captured.update.length - 1]).toBe(JSON.stringify(validConfig))
  })

  it('PUT con mtc_config null manda true y null', async () => {
    const { app, db } = buildApp()
    const res = await request(app)
      .put(`/api/quotations/${SOURCE_ID}`)
      .set('Authorization', authHeader())
      .send(updateBody({ mtc_config: null }))
    expect(res.status).toBe(200)
    expect(db.captured.update[db.captured.update.length - 2]).toBe(true)
    expect(db.captured.update[db.captured.update.length - 1]).toBeNull()
  })

  it('duplicar copia el mtc_config de la fila origen', async () => {
    const { app, db } = buildApp(validConfig)
    const res = await request(app)
      .post(`/api/quotations/${SOURCE_ID}/duplicate`)
      .set('Authorization', authHeader())
      .send({ correlative: 'SYM-101-11-2026' })
    expect(res.status).toBe(201)
    expect(db.captured.insert[db.captured.insert.length - 1]).toBe(JSON.stringify(validConfig))
  })

  it('POST rechaza con 400 un mtc_config sin sistemas', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .post('/api/quotations')
      .set('Authorization', authHeader())
      .send(createBody({ mtc_config: { ...validConfig, systems: [] } }))
    expect(res.status).toBe(400)
  })
})

describe('mtcConfigSchema', () => {
  const ok = (c: unknown) => mtcConfigSchema.safeParse(c).success
  const withSys = (patch: Record<string, unknown>) => ({
    ...validConfig,
    systems: [{ ...system1, ...patch }],
  })
  const manySystems = (n: number) => ({
    ...validConfig,
    systems: Array.from({ length: n }, (_, i) => ({ ...system1, id: `s${i}` })),
  })

  it('acepta una config valida con costeo por defecto en blanco', () =>
    expect(ok(validConfig)).toBe(true))
  it('rechaza systems vacio', () => expect(ok(manySystems(0))).toBe(false))
  it('rechaza 13 sistemas', () => expect(ok(manySystems(13))).toBe(false))
  it('acepta 12 sistemas', () => expect(ok(manySystems(12))).toBe(true))
  it('rechaza categories no nulo en el primer sistema', () =>
    expect(ok(withSys({ categories: system2.categories }))).toBe(false))
  it('rechaza items no nulo en el primer sistema', () =>
    expect(ok(withSys({ items: system2.items }))).toBe(false))
  it('rechaza frequency quincenal en un sistema', () =>
    expect(ok(withSys({ frequency: 'quincenal' }))).toBe(false))
  it.each([0, 13])('rechaza special_months %s', m =>
    expect(ok(withSys({ special_months: m }))).toBe(false)
  )
  it('rechaza margin 95 en consumibles', () =>
    expect(ok(withSys({ consumables: { enabled: true, margin: 95, rows: [] } }))).toBe(false))
  it('rechaza 101 filas de consumibles', () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({
      id: `r${i}`,
      desc: 'x',
      unidad: 'u',
      per_module: 1,
      modules: 1,
      changes_per_year: 1,
      cost: 1,
    }))
    expect(ok(withSys({ consumables: { enabled: true, margin: 30, rows } }))).toBe(false)
  })
  it('rechaza schedule nocturno', () => expect(ok(withSys({ schedule: 'nocturno' }))).toBe(false))
  it('rechaza v distinto de 1', () => expect(ok({ ...validConfig, v: 2 })).toBe(false))
})
