import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const { SETUP_SECRET } = vi.hoisted(() => ({ SETUP_SECRET: 'a'.repeat(32) }))

vi.mock('../../config/env', () => ({ env: { ADMIN_SETUP_SECRET: SETUP_SECRET } }))

import { createAdminRouter } from '../admin'

function buildApp() {
  const fakePool: any = {
    query: async (sql: string, params: any[] = []) => {
      const s = sql.trim()
      if (s.startsWith('SELECT id FROM users')) return { rows: [] }
      if (s.startsWith('INSERT INTO users')) {
        return {
          rows: [
            {
              id: 'u1',
              email: params[0],
              name: params[2],
              role: 'admin',
              is_active: true,
              created_at: 'now',
              updated_at: 'now',
            },
          ],
        }
      }
      throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
    },
  }
  const app = express()
  app.use(express.json())
  app.use('/api/admin', createAdminRouter(fakePool))
  return app
}

describe('POST /api/admin/setup — politica de password (A-04)', () => {
  it('rechaza un password de 4 caracteres (el minimo viejo, pre-fix)', async () => {
    const res = await request(buildApp())
      .post('/api/admin/setup')
      .send({ secret: SETUP_SECRET, email: 'nuevo@test.com', password: '1234' })

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/8 caracteres/)
  })

  it('acepta un password que cumple la politica de 8+ caracteres no numerica', async () => {
    const res = await request(buildApp())
      .post('/api/admin/setup')
      .send({ secret: SETUP_SECRET, email: 'nuevo@test.com', password: 'claveSegura1' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('sigue rechazando con 401 si el secret de setup es invalido, antes de llegar a validar el password', async () => {
    const res = await request(buildApp())
      .post('/api/admin/setup')
      .send({ secret: 'secret-incorrecto', email: 'nuevo@test.com', password: '1234' })

    expect(res.status).toBe(401)
  })
})
