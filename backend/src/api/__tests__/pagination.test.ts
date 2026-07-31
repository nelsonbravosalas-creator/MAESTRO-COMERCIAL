import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'

const JWT_SECRET = 'test-secret-test-secret-test-secret'

interface FakeQuotation {
  id: string
  created_at: string
  correlative: string
}

// Genera 120 cotizaciones falsas con created_at decreciente (la más nueva primero,
// como en la tabla real) para poder recorrer varias páginas.
function makeDataset(count: number): FakeQuotation[] {
  const rows: FakeQuotation[] = []
  for (let i = 0; i < count; i++) {
    const n = String(i).padStart(4, '0')
    rows.push({
      id: `00000000-0000-4000-8000-${n}00000000`.slice(0, 36).padEnd(36, '0'),
      created_at: new Date(2026, 0, 1, 0, 0, count - i).toISOString(),
      correlative: `SYM-${n}-01-2026`,
    })
  }
  return rows
}

function makeFakeDb(dataset: FakeQuotation[]) {
  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('SELECT q.*,')) {
      const [limitPlusOne, cursorCreatedAt, cursorId] = params
      let rows = [...dataset].sort((a, b) => {
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
        return a.id < b.id ? 1 : -1
      })
      if (cursorCreatedAt) {
        rows = rows.filter(r => {
          if (r.created_at !== cursorCreatedAt) return r.created_at < cursorCreatedAt
          return r.id < cursorId
        })
      }
      rows = rows.slice(0, limitPlusOne)
      return {
        rows: rows.map(r => ({
          ...r,
          client_name: 'Cliente',
          contact_name: null,
          costo_neto: 0,
          venta_neta: 0,
          beneficio_bruto: 0,
        })),
      }
    }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }
  return { query }
}

function buildApp(dataset: FakeQuotation[]) {
  const db = makeFakeDb(dataset)
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
  const token = jwt.sign(
    { id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' },
    JWT_SECRET
  )
  return `Bearer ${token}`
}

describe('A-11: paginación keyset de GET /api/quotations', () => {
  it('AC-11.1: responde { data, next_cursor, has_more }', async () => {
    const app = buildApp(makeDataset(5))
    const res = await request(app).get('/api/quotations').set('Authorization', authHeader())
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body).toHaveProperty('next_cursor')
    expect(res.body).toHaveProperty('has_more')
  })

  it('AC-11.2: el límite por defecto es 50', async () => {
    const app = buildApp(makeDataset(80))
    const res = await request(app).get('/api/quotations').set('Authorization', authHeader())
    expect(res.body.data).toHaveLength(50)
    expect(res.body.has_more).toBe(true)
  })

  it('AC-11.2: limit=5000 se rechaza con 400 (máximo 200)', async () => {
    const app = buildApp(makeDataset(5))
    const res = await request(app)
      .get('/api/quotations?limit=5000')
      .set('Authorization', authHeader())
    expect(res.status).toBe(400)
  })

  it('AC-11.3: recorrer todas las páginas devuelve todos los elementos sin duplicados ni omisiones', async () => {
    const dataset = makeDataset(120)
    const app = buildApp(dataset)

    const seen = new Set<string>()
    let cursor: string | undefined
    let guard = 0
    while (guard++ < 20) {
      const qs = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50'
      const res = await request(app).get(`/api/quotations${qs}`).set('Authorization', authHeader())
      expect(res.status).toBe(200)
      for (const row of res.body.data) {
        expect(seen.has(row.id)).toBe(false) // sin duplicados
        seen.add(row.id)
      }
      if (!res.body.has_more) break
      cursor = res.body.next_cursor
    }

    expect(seen.size).toBe(120) // sin omisiones
  })
})
