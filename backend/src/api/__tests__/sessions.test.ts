import { describe, it, expect, beforeEach } from 'vitest'
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

interface FakeSession {
  id: string
  user_id: string
  refresh_token_hash: string
  ip_address: string | null
  user_agent: string | null
  expires_at: string
  revoked_at: string | null
}

let sessionSeq = 0

function makeFakeDb(users: FakeUser[], sessions: FakeSession[]) {
  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('SELECT id, email, name, password_hash, role, is_active')) {
      const [email] = params
      const user = users.find(u => u.email.toLowerCase() === email)
      return { rows: user ? [user] : [] }
    }

    if (s.startsWith('UPDATE users') && s.includes('last_login_at = NOW()')) {
      const [id] = params
      const user = users.find(u => u.id === id)
      return { rows: user ? [{ ...user }] : [] }
    }

    if (s.startsWith('UPDATE users') && s.includes('failed_login_attempts = $2')) {
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO sessions')) {
      const [user_id, refresh_token_hash, ip_address, user_agent] = params
      sessions.push({
        id: `sess-${++sessionSeq}`,
        user_id,
        refresh_token_hash,
        ip_address,
        user_agent,
        expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        revoked_at: null,
      })
      return { rows: [] }
    }

    if (s.startsWith('SELECT s.id, s.user_id, s.revoked_at')) {
      const [hash] = params
      const session = sessions.find(sess => sess.refresh_token_hash === hash)
      if (!session) return { rows: [] }
      const user = users.find(u => u.id === session.user_id)
      if (!user) return { rows: [] }
      return {
        rows: [
          {
            id: session.id,
            user_id: session.user_id,
            revoked_at: session.revoked_at,
            expires_at: session.expires_at,
            uid: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            is_active: user.is_active,
          },
        ],
      }
    }

    if (s.startsWith('UPDATE sessions SET revoked_at = NOW() WHERE user_id')) {
      const [userId] = params
      sessions.forEach(sess => {
        if (sess.user_id === userId && !sess.revoked_at) sess.revoked_at = new Date().toISOString()
      })
      return { rows: [] }
    }

    if (s.startsWith('UPDATE sessions SET revoked_at = NOW() WHERE id')) {
      const [id] = params
      const session = sessions.find(sess => sess.id === id)
      if (session) session.revoked_at = new Date().toISOString()
      return { rows: [] }
    }

    if (s.startsWith('UPDATE sessions SET revoked_at = NOW() WHERE refresh_token_hash')) {
      const [hash] = params
      const session = sessions.find(sess => sess.refresh_token_hash === hash)
      if (session) session.revoked_at = new Date().toISOString()
      return { rows: [] }
    }

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }
  return { query }
}

function buildApp(users: FakeUser[], sessions: FakeSession[]) {
  const db = makeFakeDb(users, sessions)
  const fakePool: any = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(fakePool))
  return app
}

async function makeUser(overrides: Partial<FakeUser> = {}): Promise<FakeUser> {
  return {
    id: 'u1',
    email: 'user@test.cl',
    password_hash: await bcrypt.hash('correcto123', 4),
    name: 'Test User',
    role: 'admin',
    is_active: true,
    failed_login_attempts: 0,
    locked_until: null,
    ...overrides,
  }
}

describe('A-02: sesiones revocables', () => {
  let users: FakeUser[]
  let sessions: FakeSession[]

  beforeEach(async () => {
    users = [await makeUser()]
    sessions = []
  })

  it('AC-2.1: el refresh token se guarda hasheado, no en claro', async () => {
    const app = buildApp(users, sessions)
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.cl', password: 'correcto123' })
    expect(login.status).toBe(200)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].refresh_token_hash).not.toBe(login.body.refresh_token)
    expect(sessions[0].refresh_token_hash).toMatch(/^[a-f0-9]{64}$/) // sha256 hex
  })

  it('AC-2.3: /refresh rota el token — el nuevo funciona, la sesión vieja queda revocada', async () => {
    const app = buildApp(users, sessions)
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.cl', password: 'correcto123' })
    const rt1 = login.body.refresh_token

    const refresh1 = await request(app).post('/api/auth/refresh').send({ refresh_token: rt1 })
    expect(refresh1.status).toBe(200)
    expect(refresh1.body.refresh_token).toBeDefined()
    expect(refresh1.body.refresh_token).not.toBe(rt1)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].revoked_at).not.toBeNull() // la sesión original quedó revocada
  })

  it('AC-2.2/AC-2.4: reusar un refresh token ya rotado devuelve 401 y revoca todas las sesiones', async () => {
    const app = buildApp(users, sessions)
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.cl', password: 'correcto123' })
    const rt1 = login.body.refresh_token

    const refresh1 = await request(app).post('/api/auth/refresh').send({ refresh_token: rt1 })
    const rt2 = refresh1.body.refresh_token

    // Reusar rt1 (ya rotado) — señal de robo
    const reuse = await request(app).post('/api/auth/refresh').send({ refresh_token: rt1 })
    expect(reuse.status).toBe(401)

    // rt2, aunque válido, ahora también quedó revocado por la detección de reuso
    const afterReuse = await request(app).post('/api/auth/refresh').send({ refresh_token: rt2 })
    expect(afterReuse.status).toBe(401)
  })

  it('AC-2.5: logout revoca la sesión y el refresh token deja de servir', async () => {
    const app = buildApp(users, sessions)
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@test.cl', password: 'correcto123' })
    const rt = login.body.refresh_token

    const logout = await request(app).post('/api/auth/logout').send({ refresh_token: rt })
    expect(logout.status).toBe(204)

    const afterLogout = await request(app).post('/api/auth/refresh').send({ refresh_token: rt })
    expect(afterLogout.status).toBe(401)
  })
})
