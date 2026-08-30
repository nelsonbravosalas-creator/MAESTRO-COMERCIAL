import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const QUOTATION_ID = '44444444-4444-4444-8444-444444444444'

// ── Fake DB en memoria ──────────────────────────────────────────
// Cubre PATCH /:id/oc y POST/GET /:id/oc-document: registrar la OC/aceptación
// del cliente y su documento adjunto, sin bloquear nunca el guardado (son
// todos campos opcionales) ni levantar Postgres.
function makeFakeDb({ exists = true }: { exists?: boolean } = {}) {
  let ocDocument: Buffer | null = null
  let ocDocumentName: string | null = null

  async function query(sql: string, params: unknown[] = []) {
    const s = sql.trim()
    if (s.startsWith('UPDATE quotations') && s.includes('oc_number')) {
      if (!exists) return { rows: [] }
      const [oc_number, oc_date, oc_conditions] = params
      return { rows: [{ id: QUOTATION_ID, oc_number, oc_date, oc_conditions }] }
    }
    if (s.startsWith('UPDATE quotations') && s.includes('oc_document_name')) {
      if (!exists) return { rows: [] }
      const [buffer, name, size] = params as [Buffer, string, number]
      ocDocument = buffer
      ocDocumentName = name
      return { rows: [{ id: QUOTATION_ID, oc_document_name: name, oc_document_size: size }] }
    }
    if (s.startsWith('SELECT oc_document, oc_document_name')) {
      if (!exists || !ocDocument) return { rows: exists ? [{ oc_document: null }] : [] }
      return { rows: [{ oc_document: ocDocument, oc_document_name: ocDocumentName }] }
    }
    throw new Error(`Fake DB: query sin manejar — ${s.slice(0, 80)}`)
  }
  return { query }
}

function buildApp(opts: { exists?: boolean } = {}) {
  const db = makeFakeDb(opts)
  const fakePool: any = { query: db.query }
  const app = express()
  app.use(express.json({ limit: '15mb' }))
  app.use('/api/quotations', createQuotationsRouter(fakePool))
  return { app }
}

function authHeader(role = 'manager') {
  return `Bearer ${jwt.sign({ id: 'u1', email: 't@t.cl', name: 'Test', role }, JWT_SECRET)}`
}

describe('PATCH /api/quotations/:id/oc — registro de OC / aceptación', () => {
  it('guarda número, fecha y condiciones', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .patch(`/api/quotations/${QUOTATION_ID}/oc`)
      .set('Authorization', authHeader())
      .send({ oc_number: '4500123', oc_date: '2026-08-01', oc_conditions: 'Pago a 30 días' })

    expect(res.status).toBe(200)
    expect(res.body.oc_number).toBe('4500123')
  })

  it('no bloquea el guardado si solo se manda el número (fecha/condiciones opcionales)', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .patch(`/api/quotations/${QUOTATION_ID}/oc`)
      .set('Authorization', authHeader())
      .send({ oc_number: '4500123' })

    expect(res.status).toBe(200)
  })

  it('responde 404 si la cotización no existe', async () => {
    const { app } = buildApp({ exists: false })
    const res = await request(app)
      .patch(`/api/quotations/${QUOTATION_ID}/oc`)
      .set('Authorization', authHeader())
      .send({ oc_number: '4500123' })

    expect(res.status).toBe(404)
  })
})

describe('POST/GET /api/quotations/:id/oc-document — documento adjunto de la OC', () => {
  it('sube el documento y luego se puede descargar', async () => {
    const { app } = buildApp()
    const content = Buffer.from('contenido de prueba').toString('base64')

    const upload = await request(app)
      .post(`/api/quotations/${QUOTATION_ID}/oc-document`)
      .set('Authorization', authHeader())
      .send({ data: content, name: 'oc-4500123.pdf', size: 20 })

    expect(upload.status).toBe(200)
    expect(upload.body.oc_document_name).toBe('oc-4500123.pdf')

    const download = await request(app)
      .get(`/api/quotations/${QUOTATION_ID}/oc-document`)
      .set('Authorization', authHeader())

    expect(download.status).toBe(200)
    expect(download.headers['content-disposition']).toContain('oc-4500123.pdf')
  })

  it('responde 404 al descargar si no hay documento adjunto', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .get(`/api/quotations/${QUOTATION_ID}/oc-document`)
      .set('Authorization', authHeader())

    expect(res.status).toBe(404)
  })
})
