import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { requestIdMiddleware } from '../requestId'

function buildApp() {
  const app = express()
  app.use(requestIdMiddleware)
  app.get('/ping', (req: any, res) => res.json({ requestId: req.requestId }))
  return app
}

describe('requestIdMiddleware (C-08)', () => {
  it('genera un x-request-id y lo devuelve también en el body via req.requestId', async () => {
    const app = buildApp()
    const res = await request(app).get('/ping')
    expect(res.headers['x-request-id']).toBeDefined()
    expect(res.body.requestId).toBe(res.headers['x-request-id'])
  })

  it('reutiliza un x-request-id entrante en vez de generar uno nuevo', async () => {
    const app = buildApp()
    const res = await request(app).get('/ping').set('x-request-id', 'abc-123')
    expect(res.headers['x-request-id']).toBe('abc-123')
    expect(res.body.requestId).toBe('abc-123')
  })
})
