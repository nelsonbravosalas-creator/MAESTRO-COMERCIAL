import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const SOURCE_ID = '22222222-2222-4222-8222-222222222222'
const NEW_ID = '44444444-4444-4444-8444-444444444444'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const sourceRow = {
  id: SOURCE_ID,
  correlative: 'SYM-028-11-2026',
  client_id: CLIENT_ID,
  contact_id: null,
  enduser: null,
  ref: 'Referencia',
  date: '2026-11-04',
  valid_until: null,
  status: 'Emitida',
  oper_state: null,
  uf_value: 39000,
  iva_pct: 19,
  notes: null,
  version: 1,
  kind: 'project',
  equipment_count: null,
  equipment_description: null,
  frequency: null,
  visits_per_year: null,
  contract_start_date: null,
  show_uf_equivalent: false,
  show_usd_equivalent: false,
  usd_value: null,
}

// ── Fake DB en memoria ──────────────────────────────────────────
// Solo cubre lo que POST /:id/duplicate necesita: leer la cotización origen,
// insertar la copia (guardando los parámetros para inspección) y releerla.
function makeFakeDb() {
  const inserted: { params: any[] } = { params: [] }

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
      return { rows: [] }
    }
    if (s.startsWith('SELECT q.*')) {
      const [id] = params
      if (id === SOURCE_ID) return { rows: [{ ...sourceRow, client_name: 'Cliente Test' }] }
      if (id === NEW_ID)
        return { rows: [{ ...sourceRow, id: NEW_ID, client_name: 'Cliente Test' }] }
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO quotations')) {
      inserted.params = params
      return { rows: [{ ...sourceRow, id: NEW_ID }] }
    }
    if (
      s.startsWith('SELECT * FROM quotation_') ||
      s.startsWith('SELECT * FROM v_quotation_totals') ||
      s.includes('DELETE FROM quotation_') ||
      s.includes('INSERT INTO quotation_')
    ) {
      return { rows: [] }
    }
    throw new Error(`Fake DB: query sin manejar en el test — ${s.slice(0, 80)}`)
  }

  return { query, inserted }
}

function buildApp() {
  const db = makeFakeDb()
  const fakePool: any = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/quotations', createQuotationsRouter(fakePool))
  return { app, db }
}

function authHeader() {
  const token = jwt.sign(
    { id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' },
    JWT_SECRET
  )
  return `Bearer ${token}`
}

describe('POST /api/quotations/:id/duplicate', () => {
  it('duplica con correlativo nuevo sin version_reason (botón Duplicar)', async () => {
    process.env.JWT_SECRET = JWT_SECRET
    const { app, db } = buildApp()
    const res = await request(app)
      .post(`/api/quotations/${SOURCE_ID}/duplicate`)
      .set('Authorization', authHeader())
      .send({ correlative: 'SYM-029-11-2026' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(NEW_ID)
    // version_reason queda nulo en una copia normal
    expect(db.inserted.params[22]).toBeNull()
  })

  it('rechaza una nueva versión (-V{n}) sin version_reason', async () => {
    process.env.JWT_SECRET = JWT_SECRET
    const { app } = buildApp()
    const res = await request(app)
      .post(`/api/quotations/${SOURCE_ID}/duplicate`)
      .set('Authorization', authHeader())
      .send({ correlative: 'SYM-028-11-2026-V2' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/version_reason/)
  })

  it('crea una nueva versión (-V{n}) cuando trae version_reason', async () => {
    process.env.JWT_SECRET = JWT_SECRET
    const { app, db } = buildApp()
    const res = await request(app)
      .post(`/api/quotations/${SOURCE_ID}/duplicate`)
      .set('Authorization', authHeader())
      .send({ correlative: 'SYM-028-11-2026-V2', version_reason: 'Ajuste de margen' })

    expect(res.status).toBe(201)
    expect(db.inserted.params[22]).toBe('Ajuste de margen')
    expect(db.inserted.params[23]).toBe(SOURCE_ID)
  })

  it('devuelve 400 si falta el correlativo', async () => {
    process.env.JWT_SECRET = JWT_SECRET
    const { app } = buildApp()
    const res = await request(app)
      .post(`/api/quotations/${SOURCE_ID}/duplicate`)
      .set('Authorization', authHeader())
      .send({})

    expect(res.status).toBe(400)
  })
})
