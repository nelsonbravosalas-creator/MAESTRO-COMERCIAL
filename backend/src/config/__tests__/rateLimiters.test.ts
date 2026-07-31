import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { loginLimiter } from '../rateLimiters'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/login', loginLimiter())
  app.post('/login', (_req, res) => res.status(401).json({ error: 'Unauthorized' }))
  return app
}

describe('loginLimiter (C-04)', () => {
  it('permite hasta 5 intentos y bloquea el 6.º con 429', async () => {
    const app = buildApp()
    const body = { email: 'victima@test.cl' }

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/login').send(body)
      expect(res.status).toBe(401)
    }

    const blocked = await request(app).post('/login').send(body)
    expect(blocked.status).toBe(429)
  })

  it('no comparte el contador entre usuarios distintos (misma IP)', async () => {
    const app = buildApp()

    for (let i = 0; i < 5; i++) {
      await request(app).post('/login').send({ email: 'usuario-a@test.cl' })
    }
    const blockedA = await request(app).post('/login').send({ email: 'usuario-a@test.cl' })
    expect(blockedA.status).toBe(429)

    const otroUsuario = await request(app).post('/login').send({ email: 'usuario-b@test.cl' })
    expect(otroUsuario.status).toBe(401)
  })
})
