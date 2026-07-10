import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'

const JWT_SECRET = 'test-secret'

// ── Fake DB en memoria ──────────────────────────────────────────
// Simula lo mínimo que quotations.ts necesita de `pool`/`PoolClient`
// (BEGIN/COMMIT/ROLLBACK + las queries reales del archivo) sin tocar
// una base Postgres real. El objetivo es probar la lógica de la ruta
// (control de concurrencia optimista vía "version"), no el driver `pg`.
function makeFakeDb(initialRow: Record<string, any>) {
  let row = { ...initialRow }
  let deleted = false

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
      return { rows: [] }
    }

    if (s.startsWith('UPDATE quotations')) {
      const [
        correlative, client_id, contact_id, enduser, ref, date, valid_until,
        status, oper_state, uf_value, iva_pct, notes, quotationId, expectedVersion,
      ] = params
      if (deleted || row.id !== quotationId || row.version !== expectedVersion) {
        return { rows: [] }
      }
      row = {
        ...row,
        correlative, client_id, contact_id, enduser, ref, date, valid_until,
        status, oper_state, uf_value, iva_pct, notes,
        version: row.version + 1,
        updated_at: new Date().toISOString(),
      }
      return { rows: [row] }
    }

    if (s.startsWith('SELECT version FROM quotations')) {
      const [quotationId] = params
      if (deleted || row.id !== quotationId) return { rows: [] }
      return { rows: [{ version: row.version }] }
    }

    if (s.startsWith('SELECT q.*')) {
      const [quotationId] = params
      if (deleted || row.id !== quotationId) return { rows: [] }
      return { rows: [{ ...row, client_name: 'Cliente Test', contact_name: null }] }
    }

    if (s.startsWith('SELECT * FROM quotation_') || s.startsWith('SELECT * FROM v_quotation_totals')) {
      return { rows: [] }
    }

    if (s.startsWith('SELECT iva_pct FROM quotations')) {
      return { rows: deleted ? [] : [{ iva_pct: row.iva_pct }] }
    }

    if (s.includes('DELETE FROM quotation_') || s.includes('INSERT INTO quotation_')) {
      return { rows: [] }
    }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }

  return { query }
}

function buildApp(row: Record<string, any>) {
  const db = makeFakeDb(row)
  const fakePool: any = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/quotations', createQuotationsRouter(fakePool))
  return app
}

function authHeader() {
  const token = jwt.sign({ id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' }, JWT_SECRET)
  return `Bearer ${token}`
}

const baseRow = {
  id: 'q1',
  correlative: 'SYM-001-01-2026',
  client_id: 'c1',
  contact_id: null,
  enduser: null,
  ref: null,
  date: '2026-01-01',
  valid_until: null,
  status: 'Borrador',
  oper_state: null,
  uf_value: 39000,
  iva_pct: 19,
  notes: null,
  version: 1,
  updated_at: '2026-01-01T00:00:00Z',
}

describe('PUT /api/quotations/:id — concurrencia optimista', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('actualiza y sube version cuando el version enviado coincide con el actual', async () => {
    const app = buildApp({ ...baseRow })
    const res = await request(app)
      .put('/api/quotations/q1')
      .set('Authorization', authHeader())
      .send({ client_id: 'c1', correlative: 'SYM-001-01-2026', version: 1 })

    expect(res.status).toBe(200)
    expect(res.body.version).toBe(2)
  })

  it('devuelve 409 si otro usuario ya modificó la cotización (version desactualizado)', async () => {
    const app = buildApp({ ...baseRow, version: 3 })
    const res = await request(app)
      .put('/api/quotations/q1')
      .set('Authorization', authHeader())
      .send({ client_id: 'c1', correlative: 'SYM-001-01-2026', version: 1 })

    expect(res.status).toBe(409)
    expect(res.body.current_version).toBe(3)
    expect(res.body.message).toMatch(/modificada por otro usuario/i)
  })

  it('devuelve 404 si la cotización no existe', async () => {
    const app = buildApp({ ...baseRow })
    const res = await request(app)
      .put('/api/quotations/no-existe')
      .set('Authorization', authHeader())
      .send({ client_id: 'c1', correlative: 'X', version: 1 })

    expect(res.status).toBe(404)
  })

  it('rechaza la petición sin token de autenticación', async () => {
    const app = buildApp({ ...baseRow })
    const res = await request(app)
      .put('/api/quotations/q1')
      .send({ client_id: 'c1', correlative: 'SYM-001-01-2026', version: 1 })

    expect(res.status).toBe(401)
  })
})
