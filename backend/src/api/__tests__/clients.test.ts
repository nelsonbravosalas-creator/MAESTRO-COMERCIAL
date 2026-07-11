import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createClientsRouter } from '../clients'

const JWT_SECRET = 'test-secret'

interface FakeState {
  clients: Record<string, { id: string; deleted: boolean }>
  quotationsByClient: Record<string, number>
}

// Fake DB en memoria: solo cubre lo que DELETE /:id necesita de `pool`.
// El objetivo es probar que el chequeo server-side de "cliente con
// cotizaciones asociadas" (agregado tras el audit de bugs) funciona, sin
// necesitar una Postgres real.
function makeFakeDb(state: FakeState) {
  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('SELECT 1 FROM quotations')) {
      const [clientId] = params
      const count = state.quotationsByClient[clientId] ?? 0
      return { rows: count > 0 ? [{ exists: 1 }] : [] }
    }

    if (s.startsWith('UPDATE clients')) {
      const [clientId] = params
      const client = state.clients[clientId]
      if (!client || client.deleted) return { rows: [] }
      client.deleted = true
      return { rows: [{ id: clientId }] }
    }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }

  return { query }
}

function buildApp(state: FakeState) {
  const db = makeFakeDb(state)
  const fakePool: any = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/clients', createClientsRouter(fakePool))
  return app
}

function authHeader() {
  const token = jwt.sign({ id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' }, JWT_SECRET)
  return `Bearer ${token}`
}

describe('DELETE /api/clients/:id — protección server-side contra cotizaciones asociadas', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('rechaza con 409 si el cliente tiene cotizaciones asociadas', async () => {
    const app = buildApp({
      clients: { c1: { id: 'c1', deleted: false } },
      quotationsByClient: { c1: 2 },
    })
    const res = await request(app).delete('/api/clients/c1').set('Authorization', authHeader())

    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/cotizaciones asociadas/i)
  })

  it('elimina (soft-delete) si no tiene cotizaciones asociadas', async () => {
    const app = buildApp({
      clients: { c1: { id: 'c1', deleted: false } },
      quotationsByClient: {},
    })
    const res = await request(app).delete('/api/clients/c1').set('Authorization', authHeader())

    expect(res.status).toBe(200)
  })

  it('devuelve 404 si el cliente no existe', async () => {
    const app = buildApp({ clients: {}, quotationsByClient: {} })
    const res = await request(app).delete('/api/clients/no-existe').set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })

  it('rechaza la petición sin token de autenticación', async () => {
    const app = buildApp({ clients: { c1: { id: 'c1', deleted: false } }, quotationsByClient: {} })
    const res = await request(app).delete('/api/clients/c1')

    expect(res.status).toBe(401)
  })
})
