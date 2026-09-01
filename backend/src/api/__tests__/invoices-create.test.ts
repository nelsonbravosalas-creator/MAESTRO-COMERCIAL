import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createInvoicesRouter } from '../invoices'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const QUOTATION_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

// ── Fake DB en memoria ──────────────────────────────────────────
// Cubre el bloque de validación de POST /api/invoices (cap/saldo por
// cotización) sin levantar Postgres: cada test arma una cotización con el
// `kind`, tope y saldo ya facturado que quiere probar.
function makeFakeDb(quotation: {
  kind: 'project' | 'maintenance'
  invoice_count_max: number
  existingCount: number
  existingTotalEmitido: number
  ventaNeta: number
  ivaPct: number
}) {
  const inserted: any[] = []

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s === "SELECT value FROM app_config WHERE key = 'iva_pct'") {
      return { rows: [{ value: String(quotation.ivaPct) }] }
    }
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] }
    if (s.startsWith('SELECT invoice_count_max, kind FROM quotations')) {
      if (params[0] !== QUOTATION_ID) return { rows: [] }
      return { rows: [{ invoice_count_max: quotation.invoice_count_max, kind: quotation.kind }] }
    }
    if (s.startsWith('SELECT venta_neta, iva_pct FROM v_quotation_totals')) {
      return { rows: [{ venta_neta: quotation.ventaNeta, iva_pct: quotation.ivaPct }] }
    }
    if (s.startsWith('SELECT COUNT(*)::int AS cnt')) {
      return {
        rows: [{ cnt: quotation.existingCount, total_emitido: quotation.existingTotalEmitido }],
      }
    }
    if (s.startsWith('INSERT INTO invoices')) {
      const row = {
        id: 'new-invoice-id',
        project_id: params[0],
        quotation_id: params[1],
        client_id: params[2],
        number: params[3],
        date: params[4],
        net_amount: params[7],
        tax_amount: params[8],
        total_amount: params[9],
        status: 'draft',
      }
      inserted.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('INSERT INTO invoice_items')) {
      return { rows: [] }
    }

    throw new Error(`Fake DB: query sin manejar — ${s.slice(0, 80)}`)
  }

  return { query, getInserted: () => inserted }
}

function buildApp(quotation: Parameters<typeof makeFakeDb>[0]) {
  const db = makeFakeDb(quotation)
  const fakePool: any = {
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/invoices', createInvoicesRouter(fakePool))
  return { app, db }
}

function authHeader(role = 'manager') {
  return `Bearer ${jwt.sign({ id: 'u1', email: 't@t.cl', name: 'Test', role }, JWT_SECRET)}`
}

const basePayload = {
  quotation_id: QUOTATION_ID,
  client_id: CLIENT_ID,
  date: '2026-01-15',
  doc_type: 'factura_afecta',
  items: [{ description: 'Ítem', quantity: 1, unit_price: 100000 }],
}

describe('POST /api/invoices — validación de cupo/saldo por cotización', () => {
  it('rechaza una 2ª factura sobre una cotización kind=project que ya alcanzó su invoice_count_max', async () => {
    const { app } = buildApp({
      kind: 'project',
      invoice_count_max: 1,
      existingCount: 1,
      existingTotalEmitido: 119000,
      ventaNeta: 100000,
      ivaPct: 19,
    })
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', authHeader())
      .send(basePayload)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('invoice_cap_exceeded')
  })

  it('permite una 2ª factura sobre una mantención (kind=maintenance) aunque supere invoice_count_max', async () => {
    const { app } = buildApp({
      kind: 'maintenance',
      invoice_count_max: 1, // valor por defecto, nunca configurado para mantenciones
      existingCount: 1, // ya tiene una factura de un período anterior
      existingTotalEmitido: 119000,
      ventaNeta: 100000, // en una mantención representa el valor de UNA visita
      ivaPct: 19,
    })
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', authHeader())
      .send(basePayload)

    expect(res.status).toBe(201)
    expect(res.body.quotation_id).toBe(QUOTATION_ID)
  })
})

describe('POST /api/invoices — folio del SII', () => {
  const quotation = {
    kind: 'maintenance' as const,
    invoice_count_max: 1,
    existingCount: 0,
    existingTotalEmitido: 0,
    ventaNeta: 100000,
    ivaPct: 19,
  }

  it('no rellena un folio inventado cuando no se manda number — queda null ("Pendiente")', async () => {
    const { app } = buildApp(quotation)
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', authHeader())
      .send(basePayload)

    expect(res.status).toBe(201)
    expect(res.body.number).toBeNull()
  })

  it('respeta el número cuando sí se ingresa a mano', async () => {
    const { app } = buildApp(quotation)
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', authHeader())
      .send({ ...basePayload, number: '1204' })

    expect(res.status).toBe(201)
    expect(res.body.number).toBe('1204')
  })
})
