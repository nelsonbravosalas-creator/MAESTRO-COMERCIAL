import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authMiddleware, optionalAuth, type AuthRequest } from '../auth'
import { env } from '../../config/env'

const user = { id: 'u-1', email: 'nelson@example.com', name: 'Nelson', role: 'admin' }

const sign = (extra: Record<string, unknown>, expiresIn = '1h') =>
  jwt.sign({ ...user, ...extra }, env.JWT_SECRET, { expiresIn } as jwt.SignOptions)

function buildApp() {
  const app = express()
  app.get('/protegido', authMiddleware, (req: AuthRequest, res) => res.json({ id: req.user?.id }))
  app.get('/opcional', optionalAuth, (req: AuthRequest, res) =>
    res.json({ id: req.user?.id ?? null })
  )
  return app
}

describe('authMiddleware — separación access / refresh', () => {
  it('rechaza con 401 un refresh token usado como Bearer', async () => {
    const res = await request(buildApp())
      .get('/protegido')
      .set('Authorization', `Bearer ${sign({ kind: 'refresh' }, '30d')}`)

    expect(res.status).toBe(401)
    expect(res.body.id).toBeUndefined()
  })

  it('no distingue en la respuesta un refresh token de un token con firma inválida', async () => {
    const app = buildApp()
    const conRefresh = await request(app)
      .get('/protegido')
      .set('Authorization', `Bearer ${sign({ kind: 'refresh' }, '30d')}`)
    const conFirmaMala = await request(app)
      .get('/protegido')
      .set('Authorization', `Bearer ${jwt.sign(user, 'otro-secreto-distinto-de-32-caracteres')}`)

    expect(conRefresh.status).toBe(conFirmaMala.status)
    expect(conRefresh.body).toEqual(conFirmaMala.body)
  })

  it('acepta un access token nuevo (kind: access)', async () => {
    const res = await request(buildApp())
      .get('/protegido')
      .set('Authorization', `Bearer ${sign({ kind: 'access' })}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('u-1')
  })

  // Los access tokens emitidos antes de este cambio no llevan `kind`. Si el
  // middleware los rechazara, el despliegue desconectaría a todas las sesiones
  // vivas de golpe; este test es el que fija esa compatibilidad y el que hay
  // que borrar el día que el chequeo se endurezca a lista blanca estricta.
  it('sigue aceptando un access token legado sin claim kind', async () => {
    const res = await request(buildApp())
      .get('/protegido')
      .set('Authorization', `Bearer ${sign({})}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('u-1')
  })

  it('rechaza cualquier kind desconocido, no solo refresh', async () => {
    const res = await request(buildApp())
      .get('/protegido')
      .set('Authorization', `Bearer ${sign({ kind: 'reset' })}`)

    expect(res.status).toBe(401)
  })
})

describe('optionalAuth — separación access / refresh', () => {
  it('ignora un refresh token en vez de autenticar con él', async () => {
    const res = await request(buildApp())
      .get('/opcional')
      .set('Authorization', `Bearer ${sign({ kind: 'refresh' }, '30d')}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBeNull()
  })

  it('autentica con un access token', async () => {
    const res = await request(buildApp())
      .get('/opcional')
      .set('Authorization', `Bearer ${sign({ kind: 'access' })}`)

    expect(res.body.id).toBe('u-1')
  })
})
