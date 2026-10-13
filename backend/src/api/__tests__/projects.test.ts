import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createProjectsRouter } from '../projects'

const JWT_SECRET = 'test-secret-test-secret-test-secret'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const USER_A = '22222222-2222-4222-8222-222222222222'
const USER_B = '33333333-3333-4333-8333-333333333333'

interface FakeState {
  insertCalls: { sql: string; params: any[] }[]
}

// Fake DB en memoria: solo cubre lo que POST / necesita de `pool.connect()`.
// Objetivo del test: confirmar que crear un proyecto con varios usuarios
// asignados hace UN solo INSERT multi-fila a project_assignments, no un
// INSERT por usuario (N+1 encontrado en el QA del 2026-10-13).
function makeFakeDb(state: FakeState) {
  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] }

    if (s.startsWith('INSERT INTO projects')) {
      return { rows: [{ id: 'proj-1' }] }
    }

    if (s.startsWith('INSERT INTO project_assignments')) {
      state.insertCalls.push({ sql: s, params })
      return { rows: [] }
    }

    throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
  }

  return { query }
}

function buildApp(state: FakeState) {
  const db = makeFakeDb(state)
  const fakePool: any = {
    query: db.query,
    connect: async () => ({ query: db.query, release: () => {} }),
  }
  const app = express()
  app.use(express.json())
  app.use('/api/projects', createProjectsRouter(fakePool))
  return app
}

function authHeader() {
  const token = jwt.sign(
    { id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' },
    JWT_SECRET
  )
  return `Bearer ${token}`
}

describe('POST /api/projects — asignacion de usuarios sin N+1', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('crea las asignaciones con un solo INSERT multi-fila, no uno por usuario', async () => {
    const state: FakeState = { insertCalls: [] }
    const app = buildApp(state)

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader())
      .send({ client_id: CLIENT_ID, assigned_to: [USER_A, USER_B] })

    expect(res.status).toBe(201)
    expect(state.insertCalls).toHaveLength(1)
    // project_id ($1) y assigned_by ($2) compartidos, un userId por fila.
    expect(state.insertCalls[0].params).toEqual(['proj-1', 'u1', USER_A, USER_B])
    expect(state.insertCalls[0].sql).toContain('($1, $3, $2)')
    expect(state.insertCalls[0].sql).toContain('($1, $4, $2)')
  })

  it('no hace ningun INSERT a project_assignments si assigned_to viene vacio', async () => {
    const state: FakeState = { insertCalls: [] }
    const app = buildApp(state)

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader())
      .send({ client_id: CLIENT_ID })

    expect(res.status).toBe(201)
    expect(state.insertCalls).toHaveLength(0)
  })
})
