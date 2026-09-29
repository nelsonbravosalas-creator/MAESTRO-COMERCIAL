import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createClientsRouter } from '../clients'

const JWT_SECRET = 'test-secret-test-secret-test-secret'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const MISSING_ID = '99999999-9999-4999-8999-999999999999'
const CONTACT_ID = '22222222-2222-4222-8222-222222222222'

interface FakeState {
  clients: Record<string, { id: string; deleted: boolean }>
  quotationsByClient: Record<string, number>
  contacts?: Record<string, { client_id: string }>
  quotationsByContact?: Record<string, number>
}

// Fake DB en memoria: solo cubre lo que DELETE /:id necesita de `pool`.
// El objetivo es probar que el chequeo server-side de "cliente con
// cotizaciones asociadas" (agregado tras el audit de bugs) funciona, sin
// necesitar una Postgres real.
function makeFakeDb(state: FakeState) {
  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('SELECT 1 FROM quotations WHERE contact_id')) {
      const [contactId] = params
      const count = state.quotationsByContact?.[contactId] ?? 0
      return { rows: count > 0 ? [{ exists: 1 }] : [] }
    }

    if (s.startsWith('DELETE FROM client_contacts')) {
      const [contactId, clientId] = params
      const ct = state.contacts?.[contactId]
      if (!ct || ct.client_id !== clientId) return { rows: [] }
      delete state.contacts![contactId]
      return { rows: [{ id: contactId }] }
    }

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
  const token = jwt.sign(
    { id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' },
    JWT_SECRET
  )
  return `Bearer ${token}`
}

describe('DELETE /api/clients/:id — protección server-side contra cotizaciones asociadas', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('rechaza con 409 si el cliente tiene cotizaciones asociadas', async () => {
    const app = buildApp({
      clients: { [CLIENT_ID]: { id: CLIENT_ID, deleted: false } },
      quotationsByClient: { [CLIENT_ID]: 2 },
    })
    const res = await request(app)
      .delete(`/api/clients/${CLIENT_ID}`)
      .set('Authorization', authHeader())

    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/cotizaciones asociadas/i)
  })

  it('elimina (soft-delete) si no tiene cotizaciones asociadas', async () => {
    const app = buildApp({
      clients: { [CLIENT_ID]: { id: CLIENT_ID, deleted: false } },
      quotationsByClient: {},
    })
    const res = await request(app)
      .delete(`/api/clients/${CLIENT_ID}`)
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
  })

  it('devuelve 404 si el cliente no existe', async () => {
    const app = buildApp({ clients: {}, quotationsByClient: {} })
    const res = await request(app)
      .delete(`/api/clients/${MISSING_ID}`)
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })

  it('devuelve 400 si el id no es un UUID válido', async () => {
    const app = buildApp({ clients: {}, quotationsByClient: {} })
    const res = await request(app)
      .delete('/api/clients/no-es-un-uuid')
      .set('Authorization', authHeader())

    expect(res.status).toBe(400)
  })

  it('rechaza la petición sin token de autenticación', async () => {
    const app = buildApp({
      clients: { [CLIENT_ID]: { id: CLIENT_ID, deleted: false } },
      quotationsByClient: {},
    })
    const res = await request(app).delete(`/api/clients/${CLIENT_ID}`)

    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/clients/:id/contacts/:contactId', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  const url = `/api/clients/${CLIENT_ID}/contacts/${CONTACT_ID}`

  it('rechaza con 409 si el contacto está asignado a cotizaciones', async () => {
    const state: FakeState = {
      clients: {},
      quotationsByClient: {},
      contacts: { [CONTACT_ID]: { client_id: CLIENT_ID } },
      quotationsByContact: { [CONTACT_ID]: 1 },
    }
    const res = await request(buildApp(state)).delete(url).set('Authorization', authHeader())

    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/asignado a cotizaciones/i)
    expect(state.contacts![CONTACT_ID]).toBeDefined()
  })

  it('elimina el contacto si no está en uso', async () => {
    const state: FakeState = {
      clients: {},
      quotationsByClient: {},
      contacts: { [CONTACT_ID]: { client_id: CLIENT_ID } },
    }
    const res = await request(buildApp(state)).delete(url).set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(state.contacts![CONTACT_ID]).toBeUndefined()
  })

  it('devuelve 404 si el contacto no pertenece a ese cliente', async () => {
    const state: FakeState = {
      clients: {},
      quotationsByClient: {},
      contacts: { [CONTACT_ID]: { client_id: MISSING_ID } },
    }
    const res = await request(buildApp(state)).delete(url).set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })
})
