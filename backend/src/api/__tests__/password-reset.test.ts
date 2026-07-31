import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createAuthRouter } from '../auth'
import { setMailer } from '../../services/mailer'

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface FakeUser {
  id: string
  email: string
  name: string
  password_hash: string
  is_active: boolean
}

interface FakeReset {
  id: string
  user_id: string
  token_hash: string
  expires_at: string
  used_at: string | null
}

let resetSeq = 0

function makeFakeDb(users: FakeUser[], resets: FakeReset[]) {
  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] }

    if (s.startsWith('SELECT id, name FROM users')) {
      const [email] = params
      const user = users.find(u => u.email.toLowerCase() === email && u.is_active)
      return { rows: user ? [{ id: user.id, name: user.name }] : [] }
    }

    if (s.startsWith('UPDATE password_resets SET used_at = NOW() WHERE user_id')) {
      const [userId] = params
      resets.forEach(r => {
        if (r.user_id === userId && !r.used_at) r.used_at = new Date().toISOString()
      })
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO password_resets')) {
      const [user_id, token_hash] = params
      resets.push({
        id: `pr-${++resetSeq}`,
        user_id,
        token_hash,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        used_at: null,
      })
      return { rows: [] }
    }

    if (s.startsWith('SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at')) {
      const [tokenHash] = params
      const reset = resets.find(r => r.token_hash === tokenHash)
      if (!reset) return { rows: [] }
      const user = users.find(u => u.id === reset.user_id)
      if (!user) return { rows: [] }
      return {
        rows: [
          {
            id: reset.id,
            user_id: reset.user_id,
            expires_at: reset.expires_at,
            used_at: reset.used_at,
            email: user.email,
            name: user.name,
          },
        ],
      }
    }

    if (s.startsWith('UPDATE password_resets SET used_at = NOW() WHERE id')) {
      const [id] = params
      const reset = resets.find(r => r.id === id)
      if (reset) reset.used_at = new Date().toISOString()
      return { rows: [] }
    }

    if (s.startsWith('UPDATE users') && s.includes('password_hash = $1, failed_login_attempts')) {
      const [passwordHash, userId] = params
      const user = users.find(u => u.id === userId)
      if (user) user.password_hash = passwordHash
      return { rows: [] }
    }

    if (s.startsWith('UPDATE sessions SET revoked_at = NOW() WHERE user_id')) {
      return { rows: [] }
    }

    if (s.startsWith('SELECT password_hash FROM users')) {
      const [userId] = params
      const user = users.find(u => u.id === userId)
      return { rows: user ? [{ password_hash: user.password_hash }] : [] }
    }

    if (s.startsWith('UPDATE users SET password_hash = $1, updated_at')) {
      const [passwordHash, userId] = params
      const user = users.find(u => u.id === userId)
      if (user) user.password_hash = passwordHash
      return { rows: [] }
    }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }
  return { query }
}

function buildApp(users: FakeUser[], resets: FakeReset[]) {
  const db = makeFakeDb(users, resets)
  const fakePool: any = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(fakePool))
  return app
}

describe('A-04: recuperación y cambio de contraseña', () => {
  let users: FakeUser[]
  let resets: FakeReset[]

  beforeEach(async () => {
    users = [
      {
        id: USER_ID,
        email: 'user@test.cl',
        name: 'Test User',
        password_hash: await bcrypt.hash('viejaClave123', 4),
        is_active: true,
      },
    ]
    resets = []
    resetSeq = 0
    setMailer({ send: async () => ({ ok: true, providerId: 'test' }) })
  })

  it('AC-4.1: responde 202 tanto para correo existente como inexistente', async () => {
    const app = buildApp(users, resets)
    const existing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@test.cl' })
    const missing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'no-existe@test.cl' })
    expect(existing.status).toBe(202)
    expect(missing.status).toBe(202)
  })

  it('AC-4.3: el token de reset es de un solo uso', async () => {
    const app = buildApp(users, resets)
    await request(app).post('/api/auth/forgot-password').send({ email: 'user@test.cl' })
    expect(resets).toHaveLength(1)

    // El token real nunca se expone en la respuesta (solo por correo); en el
    // test se toma directo del estado falso de la tabla — necesitamos el
    // token en claro, así que lo capturamos vía un mailer falso.
    let capturedUrl = ''
    setMailer({
      send: async input => {
        capturedUrl = input.html
        return { ok: true }
      },
    })
    resets = []
    const app2 = buildApp(users, resets)
    await request(app2).post('/api/auth/forgot-password').send({ email: 'user@test.cl' })
    const token = capturedUrl.match(/token=([a-f0-9]+)/)?.[1]
    expect(token).toBeDefined()

    const first = await request(app2)
      .post('/api/auth/reset-password')
      .send({ token, password: 'nuevaClave123' })
    expect(first.status).toBe(200)

    const second = await request(app2)
      .post('/api/auth/reset-password')
      .send({ token, password: 'otraClave123' })
    expect(second.status).toBe(400)
  })

  it('AC-4.5: tras el reset, las sesiones previas quedan revocadas (no lanza error)', async () => {
    let capturedUrl = ''
    setMailer({
      send: async input => {
        capturedUrl = input.html
        return { ok: true }
      },
    })
    const app = buildApp(users, resets)
    await request(app).post('/api/auth/forgot-password').send({ email: 'user@test.cl' })
    const token = capturedUrl.match(/token=([a-f0-9]+)/)?.[1]

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'nuevaClave123' })
    expect(res.status).toBe(200)
  })

  it('AC-4.7: rechaza contraseñas de menos de 8 caracteres', async () => {
    let capturedUrl = ''
    setMailer({
      send: async input => {
        capturedUrl = input.html
        return { ok: true }
      },
    })
    const app = buildApp(users, resets)
    await request(app).post('/api/auth/forgot-password').send({ email: 'user@test.cl' })
    const token = capturedUrl.match(/token=([a-f0-9]+)/)?.[1]

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'abc123' })
    expect(res.status).toBe(400)
  })

  it('AC-4.7: rechaza contraseñas solo numéricas', async () => {
    let capturedUrl = ''
    setMailer({
      send: async input => {
        capturedUrl = input.html
        return { ok: true }
      },
    })
    const app = buildApp(users, resets)
    await request(app).post('/api/auth/forgot-password').send({ email: 'user@test.cl' })
    const token = capturedUrl.match(/token=([a-f0-9]+)/)?.[1]

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: '12345678' })
    expect(res.status).toBe(400)
  })

  it('change-password: rechaza con 401 si la contraseña actual es incorrecta', async () => {
    const app = buildApp(users, resets)
    const token = jwt.sign(
      { id: USER_ID, email: 'user@test.cl', name: 'Test', role: 'user' },
      'test-secret-test-secret-test-secret'
    )
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'incorrecta', new_password: 'nuevaClave123' })
    expect(res.status).toBe(401)
  })

  it('change-password: cambia la contraseña con la actual correcta', async () => {
    const app = buildApp(users, resets)
    const token = jwt.sign(
      { id: USER_ID, email: 'user@test.cl', name: 'Test', role: 'user' },
      'test-secret-test-secret-test-secret'
    )
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'viejaClave123', new_password: 'nuevaClave123' })
    expect(res.status).toBe(200)
  })
})
