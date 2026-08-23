import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createInvoicesRouter } from '../invoices'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const INVOICE_ID = '33333333-3333-4333-8333-333333333333'

// ── Fake DB en memoria ──────────────────────────────────────────
// Cubre PATCH /:id/follow-up: el N° de factura se corrige a mano ahí (folio
// real del SII) y debe respetar la restricción de unicidad de `number` igual
// que la creación (invoices-create.test.ts).
function makeFakeDb({ duplicateNumber }: { duplicateNumber?: string } = {}) {
  async function query(sql: string, params: unknown[] = []) {
    const s = sql.trim()
    if (s.startsWith('UPDATE invoices')) {
      const number = params[0] as string | undefined
      if (duplicateNumber && number === duplicateNumber) {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        })
      }
      return { rows: [{ id: INVOICE_ID, number: number ?? 'F-000001', status: 'draft' }] }
    }
    throw new Error(`Fake DB: query sin manejar — ${s.slice(0, 80)}`)
  }
  return { query }
}

function buildApp(opts: { duplicateNumber?: string } = {}) {
  const db = makeFakeDb(opts)
  const fakePool: any = { query: db.query }
  const app = express()
  app.use(express.json())
  app.use('/api/invoices', createInvoicesRouter(fakePool))
  return { app }
}

function authHeader(role = 'manager') {
  return `Bearer ${jwt.sign({ id: 'u1', email: 't@t.cl', name: 'Test', role }, JWT_SECRET)}`
}

describe('PATCH /api/invoices/:id/follow-up — corrección manual del N° de factura', () => {
  it('actualiza el número cuando no hay conflicto', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .patch(`/api/invoices/${INVOICE_ID}/follow-up`)
      .set('Authorization', authHeader())
      .send({ number: '1204', observations: null, follow_up_date: null })

    expect(res.status).toBe(200)
    expect(res.body.number).toBe('1204')
  })

  it('responde 409 con mensaje claro si el número ya está en uso en otra factura', async () => {
    const { app } = buildApp({ duplicateNumber: '1204' })
    const res = await request(app)
      .patch(`/api/invoices/${INVOICE_ID}/follow-up`)
      .set('Authorization', authHeader())
      .send({ number: '1204', observations: null, follow_up_date: null })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invoice_number_exists')
  })
})
