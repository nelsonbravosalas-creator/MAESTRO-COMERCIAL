import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { createAuthRouter } from '../auth'

interface FakeUser {
  id: string
  email: string
  password_hash: string
  name: string
  role: string
  is_active: boolean
  failed_login_attempts: number
  locked_until: string | null
}

function makeFakeDb(users: FakeUser[]) {
  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('SELECT id, email, name, password_hash, role, is_active')) {
      const [email] = params
      const user = users.find(u => u.email.toLowerCase() === email)
      return { rows: user ? [user] : [] }
    }

    if (s.startsWith('UPDATE users') && s.includes('failed_login_attempts = $2')) {
      const [id, attempts, lockNow] = params
      const user = users.find(u => u.id === id)
      if (user) {
        user.failed_login_attempts = attempts
        if (lockNow) user.locked_until = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      }
      return { rows: [] }
    }

    if (s.startsWith('UPDATE users') && s.includes('last_login_at = NOW()')) {
      const [id] = params
      const user = users.find(u => u.id === id)
      if (user) {
        user.failed_login_attempts = 0
        user.locked_until = null
      }
      return { rows: user ? [{ ...user }] : [] }
    }

    if (s.startsWith('INSERT INTO sessions')) {
      return { rows: [] }
    }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }
  return { query }
}

function buildApp(users: FakeUser[]) {
  const db = makeFakeDb(users)
  const fakePool: any = { query: db.query }
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(fakePool))
  return app
}

async function makeUser(overrides: Partial<FakeUser> = {}): Promise<FakeUser> {
  return {
    id: 'u1',
    email: 'user@test.cl',
    password_hash: await bcrypt.hash('correcto123', 10),
    name: 'Test User',
    role: 'admin',
    is_active: true,
    failed_login_attempts: 0,
    locked_until: null,
    ...overrides,
  }
}

describe('POST /api/auth/login', () => {
  it('rechaza con 400 si falta el password, sin importar ALLOW_NO_PIN (C-02)', async () => {
    process.env.ALLOW_NO_PIN = 'true'
    const app = buildApp([await makeUser()])
    const res = await request(app).post('/api/auth/login').send({ email: 'user@test.cl' })
    expect(res.status).toBe(400)
    delete process.env.ALLOW_NO_PIN
  })

  it('acepta credenciales correctas', async () => {
    const app = buildApp([await makeUser()])
    const res = await request(app).post('/api/auth/login').send({ email: 'user@test.cl', password: 'correcto123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  it('bloquea la cuenta tras 10 intentos fallidos (C-04)', async () => {
    const user = await makeUser()
    const app = buildApp([user])

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'user@test.cl', password: 'incorrecto' })
      expect(res.status).toBe(401)
    }

    expect(user.locked_until).not.toBeNull()

    const lockedRes = await request(app).post('/api/auth/login').send({ email: 'user@test.cl', password: 'correcto123' })
    expect(lockedRes.status).toBe(423)
  })
})
