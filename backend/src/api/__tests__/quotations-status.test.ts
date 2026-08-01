import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const QUOTATION_ID = '33333333-3333-4333-8333-333333333333'
const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

// ── Fake DB en memoria ──────────────────────────────────────────
// Cubre solo lo que PATCH /:id/status necesita: el UPDATE de estado y,
// cuando pasa a 'Adjudicada', el flujo de auto-creación de Proyecto
// (dedupe + totalsFor + INSERT). El objetivo es probar que ese INSERT
// se salta para kind='maintenance' — ver A-XX en quotations.ts:818-851.
function makeFakeDb(row: Record<string, any>) {
  let projectsInserted: any[] = []

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('UPDATE quotations') && s.includes('SET status')) {
      const [status, operState] = params
      row.status = status
      row.oper_state = operState ?? row.oper_state
      return { rows: [{ id: row.id, status: row.status, oper_state: row.oper_state }] }
    }

    if (s.startsWith('SELECT q.client_id, q.correlative, q.kind')) {
      return {
        rows: [
          {
            client_id: row.client_id,
            correlative: row.correlative,
            kind: row.kind,
            client_name: 'Cliente Test',
          },
        ],
      }
    }

    if (s.startsWith('SELECT id FROM projects')) {
      return { rows: [] } // nunca hay proyecto previo en este test
    }

    if (s.startsWith('SELECT * FROM v_quotation_totals')) {
      return { rows: [] }
    }

    if (s.startsWith('SELECT iva_pct FROM quotations')) {
      return { rows: [{ iva_pct: 19 }] }
    }

    if (s.startsWith('INSERT INTO projects')) {
      projectsInserted.push(params)
      return { rows: [] }
    }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }

  return { query, getProjectsInserted: () => projectsInserted }
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
  return { app, db }
}

function authHeader() {
  const token = jwt.sign(
    { id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' },
    JWT_SECRET
  )
  return `Bearer ${token}`
}

describe('PATCH /api/quotations/:id/status — auto-creación de Proyecto en Adjudicada', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('crea un Proyecto cuando una cotización de proyecto pasa a Adjudicada', async () => {
    const row = {
      id: QUOTATION_ID,
      correlative: 'SYM-001-01-2026',
      client_id: CLIENT_ID,
      status: 'Enviada',
      oper_state: null,
      kind: 'project',
    }
    const { app, db } = buildApp(row)

    const res = await request(app)
      .patch(`/api/quotations/${QUOTATION_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'Adjudicada' })

    expect(res.status).toBe(200)
    expect(db.getProjectsInserted()).toHaveLength(1)
  })

  it('NO crea un Proyecto cuando un contrato de mantención pasa a Adjudicada', async () => {
    const row = {
      id: QUOTATION_ID,
      correlative: 'MTC-001-2026',
      client_id: CLIENT_ID,
      status: 'Enviada',
      oper_state: null,
      kind: 'maintenance',
    }
    const { app, db } = buildApp(row)

    const res = await request(app)
      .patch(`/api/quotations/${QUOTATION_ID}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'Adjudicada' })

    expect(res.status).toBe(200)
    expect(db.getProjectsInserted()).toHaveLength(0)
  })
})
