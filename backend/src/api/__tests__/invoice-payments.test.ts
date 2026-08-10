import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createInvoicesRouter } from '../invoices'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const INVOICE_ID = '44444444-4444-4444-8444-444444444444'
const PAYMENT_ID = '55555555-5555-4555-8555-555555555555'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

// ── Fake DB en memoria ──────────────────────────────────────────
// Simula lo justo para el flujo de abonos: el saldo se recalcula desde los
// pagos registrados igual que hace v_invoice_balance en Postgres, para que el
// test verifique la regla de negocio (no aceptar abonos sobre el saldo) y no
// una respuesta fija.
function makeFakeDb(invoice: Record<string, any>) {
  const payments: any[] = []
  const statusUpdates: string[] = []

  const balance = () =>
    Number(invoice.total_amount) - payments.reduce((s, p) => s + Number(p.amount), 0)

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('SELECT i.id, b.balance')) {
      if (params[0] !== invoice.id) return { rows: [] }
      return { rows: [{ id: invoice.id, balance: balance() }] }
    }

    if (s.startsWith('INSERT INTO invoice_payments')) {
      const [invoice_id, paid_at, amount, method, reference, observations] = params
      const row = { id: PAYMENT_ID, invoice_id, paid_at, amount, method, reference, observations }
      payments.push(row)
      return { rows: [row] }
    }

    if (s.startsWith('SELECT balance FROM v_invoice_balance')) {
      return { rows: [{ balance: balance() }] }
    }

    if (s.startsWith("UPDATE invoices SET status = 'paid'")) {
      statusUpdates.push('paid')
      invoice.status = 'paid'
      return { rows: [] }
    }

    if (s.startsWith('DELETE FROM invoice_payments')) {
      const idx = payments.findIndex(p => p.id === params[0])
      if (idx === -1) return { rows: [] }
      const [removed] = payments.splice(idx, 1)
      return { rows: [{ invoice_id: removed.invoice_id }] }
    }

    if (s.startsWith('UPDATE invoices i')) {
      statusUpdates.push('issued')
      return { rows: [] }
    }

    if (s.startsWith('SELECT p.*, u.name')) {
      return { rows: payments }
    }

    throw new Error(`Fake DB: query sin manejar — ${s.slice(0, 60)}`)
  }

  return {
    query,
    getPayments: () => payments,
    getStatusUpdates: () => statusUpdates,
    getBalance: balance,
  }
}

function buildApp(invoice: Record<string, any>) {
  const db = makeFakeDb(invoice)
  const fakePool: any = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/invoices', createInvoicesRouter(fakePool))
  return { app, db }
}

function authHeader(role = 'admin') {
  return `Bearer ${jwt.sign({ id: 'u1', email: 't@t.cl', name: 'Test', role }, JWT_SECRET)}`
}

const nuevaFactura = () => ({
  id: INVOICE_ID,
  client_id: CLIENT_ID,
  total_amount: 1190000,
  status: 'issued',
})

describe('POST /api/invoices/:id/payments — registro de abonos', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('registra un abono parcial y deja saldo pendiente', async () => {
    const { app, db } = buildApp(nuevaFactura())

    const res = await request(app)
      .post(`/api/invoices/${INVOICE_ID}/payments`)
      .set('Authorization', authHeader())
      .send({ amount: 400000, method: 'transferencia' })

    expect(res.status).toBe(201)
    expect(db.getPayments()).toHaveLength(1)
    expect(db.getBalance()).toBe(790000)
    // Con saldo pendiente la factura NO debe marcarse pagada.
    expect(db.getStatusUpdates()).not.toContain('paid')
  })

  it('marca la factura como pagada cuando el saldo llega a cero', async () => {
    const { app, db } = buildApp(nuevaFactura())

    await request(app)
      .post(`/api/invoices/${INVOICE_ID}/payments`)
      .set('Authorization', authHeader())
      .send({ amount: 400000 })

    const res = await request(app)
      .post(`/api/invoices/${INVOICE_ID}/payments`)
      .set('Authorization', authHeader())
      .send({ amount: 790000 })

    expect(res.status).toBe(201)
    expect(db.getBalance()).toBe(0)
    expect(db.getStatusUpdates()).toContain('paid')
  })

  it('rechaza un abono mayor al saldo pendiente', async () => {
    const { app, db } = buildApp(nuevaFactura())

    const res = await request(app)
      .post(`/api/invoices/${INVOICE_ID}/payments`)
      .set('Authorization', authHeader())
      .send({ amount: 2000000 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Payment exceeds balance')
    expect(res.body.balance).toBe(1190000)
    // Lo importante: no se guardó nada.
    expect(db.getPayments()).toHaveLength(0)
  })

  it('rechaza un abono de monto cero o negativo', async () => {
    const { app, db } = buildApp(nuevaFactura())

    for (const amount of [0, -5000]) {
      const res = await request(app)
        .post(`/api/invoices/${INVOICE_ID}/payments`)
        .set('Authorization', authHeader())
        .send({ amount })
      expect(res.status).toBe(400)
    }
    expect(db.getPayments()).toHaveLength(0)
  })

  it('devuelve 404 si la factura no existe', async () => {
    const { app } = buildApp(nuevaFactura())

    const res = await request(app)
      .post(`/api/invoices/99999999-9999-4999-8999-999999999999/payments`)
      .set('Authorization', authHeader())
      .send({ amount: 1000 })

    expect(res.status).toBe(404)
  })

  it('un usuario sin rol admin/manager no puede registrar abonos', async () => {
    const { app, db } = buildApp(nuevaFactura())

    const res = await request(app)
      .post(`/api/invoices/${INVOICE_ID}/payments`)
      .set('Authorization', authHeader('user'))
      .send({ amount: 1000 })

    expect(res.status).toBe(403)
    expect(db.getPayments()).toHaveLength(0)
  })
})

describe('DELETE /api/invoices/payments/:paymentId — reversar un abono', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('elimina el abono y reabre la factura pagada', async () => {
    const invoice = nuevaFactura()
    const { app, db } = buildApp(invoice)

    await request(app)
      .post(`/api/invoices/${INVOICE_ID}/payments`)
      .set('Authorization', authHeader())
      .send({ amount: 1190000 })
    expect(db.getBalance()).toBe(0)

    const res = await request(app)
      .delete(`/api/invoices/payments/${PAYMENT_ID}`)
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(db.getPayments()).toHaveLength(0)
    expect(db.getBalance()).toBe(1190000)
    expect(db.getStatusUpdates()).toContain('issued')
  })

  it('devuelve 404 si el abono no existe', async () => {
    const { app } = buildApp(nuevaFactura())

    const res = await request(app)
      .delete(`/api/invoices/payments/99999999-9999-4999-8999-999999999999`)
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })
})
