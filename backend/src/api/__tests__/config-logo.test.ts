import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// Auth real requiere JWT; en la prueba el rol llega en la cabecera x-test-role.
vi.mock('../../middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', role: req.headers['x-test-role'] ?? 'user' }
    next()
  },
  roleMiddleware:
    (...roles: string[]) =>
    (req: any, res: any, next: any) =>
      roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' }),
}))

import { createConfigRouter } from '../config'

const VALID_PNG = 'data:image/png;base64,iVBORw0KGgo='

let store: Map<string, string>

function buildApp() {
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim()
      if (s.startsWith('INSERT INTO app_config')) {
        store.set(params[0] as string, params[1] as string)
        return { rows: [] }
      }
      if (s.startsWith('DELETE FROM app_config')) {
        store.delete(params[0] as string)
        return { rows: [] }
      }
      if (s.startsWith('SELECT key, value FROM app_config')) {
        return { rows: [...store.entries()].map(([key, value]) => ({ key, value })) }
      }
      throw new Error(`Fake DB: query sin manejar en el test — ${s}`)
    },
  } as unknown as Parameters<typeof createConfigRouter>[0]

  const app = express()
  // Mismo límite que app.ts: el logo (200 kB máx.) debe llegar al validador.
  app.use(express.json({ limit: '256kb' }))
  app.use('/api/config', createConfigRouter(pool))
  return app
}

describe('logo de la empresa — /api/config/logo', () => {
  beforeEach(() => {
    store = new Map()
  })

  it('un admin guarda un PNG válido en company_logo', async () => {
    const res = await request(buildApp())
      .put('/api/config/logo')
      .set('x-test-role', 'admin')
      .send({ dataUrl: VALID_PNG })

    expect(res.status).toBe(200)
    expect(store.get('company_logo')).toBe(VALID_PNG)
  })

  it('un usuario no admin recibe 403 y no guarda nada', async () => {
    const res = await request(buildApp())
      .put('/api/config/logo')
      .set('x-test-role', 'user')
      .send({ dataUrl: VALID_PNG })

    expect(res.status).toBe(403)
    expect(store.has('company_logo')).toBe(false)
  })

  it('rechaza SVG aunque venga en base64', async () => {
    const res = await request(buildApp())
      .put('/api/config/logo')
      .set('x-test-role', 'admin')
      .send({ dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })

    expect(res.status).toBe(400)
    expect(store.has('company_logo')).toBe(false)
  })

  it('rechaza un logo que supera el tamaño máximo', async () => {
    const res = await request(buildApp())
      .put('/api/config/logo')
      .set('x-test-role', 'admin')
      .send({ dataUrl: 'data:image/png;base64,' + 'A'.repeat(200_001) })

    expect(res.status).toBe(400)
    expect(store.has('company_logo')).toBe(false)
  })

  it('un admin borra el logo', async () => {
    store.set('company_logo', VALID_PNG)
    const res = await request(buildApp()).delete('/api/config/logo').set('x-test-role', 'admin')

    expect(res.status).toBe(200)
    expect(store.has('company_logo')).toBe(false)
  })

  it('el PATCH genérico no puede escribir company_logo', async () => {
    const res = await request(buildApp())
      .patch('/api/config/company_logo')
      .set('x-test-role', 'admin')
      .send({ value: 'data:image/svg+xml;base64,PHN2Zy8+' })

    expect(res.status).toBe(400)
    expect(store.has('company_logo')).toBe(false)
  })
})
