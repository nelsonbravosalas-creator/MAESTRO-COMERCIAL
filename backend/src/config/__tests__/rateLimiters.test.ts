import { describe, it, expect, vi, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { loginLimiter, forgotPasswordLimiterOptions } from '../rateLimiters'
import rateLimit from 'express-rate-limit'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/login', loginLimiter())
  app.post('/login', (_req, res) => res.status(401).json({ error: 'Unauthorized' }))
  return app
}

function buildForwardedApp(limiterOptions = forgotPasswordLimiterOptions) {
  const app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  app.use('/login', rateLimit(limiterOptions))
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

describe('keyGenerator con IPv6 (ERR_ERL_KEY_GEN_IPV6)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('no reporta el ValidationError de express-rate-limit al construir el limiter', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    rateLimit(forgotPasswordLimiterOptions)

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('agrupa direcciones IPv6 de la misma subred bajo el mismo contador (no permite bypass)', async () => {
    const app = buildForwardedApp()
    const email = 'victima@test.cl'

    // Misma subred /56, direcciones distintas: no deben poder rotarse para
    // evadir el límite (3 solicitudes/hora) de forgotPasswordLimiter.
    const ips = ['2001:db8:1234::1', '2001:db8:1234::2', '2001:db8:1234::3']

    for (const ip of ips) {
      const res = await request(app).post('/login').set('X-Forwarded-For', ip).send({ email })
      expect(res.status).toBe(401)
    }

    const blocked = await request(app)
      .post('/login')
      .set('X-Forwarded-For', '2001:db8:1234::4')
      .send({ email })
    expect(blocked.status).toBe(429)
  })
})
