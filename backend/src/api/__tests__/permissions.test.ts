import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createQuotationsRouter } from '../quotations'
import { createInvoicesRouter } from '../invoices'
import { createProjectsRouter } from '../projects'
import { createClientsRouter } from '../clients'

const JWT_SECRET = 'test-secret-test-secret-test-secret'

// Pool falso: toda query devuelve "sin filas". Alcanza para llegar hasta el
// handler (404 limpio) y así distinguir 403 (bloqueado por rol) de cualquier
// otra cosa (permitido a nivel de autorización, exista o no el recurso).
const fakePool: any = {
  query: async () => ({ rows: [] }),
  connect: async () => ({
    query: async () => ({ rows: [] }),
    release: () => {},
  }),
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/quotations', createQuotationsRouter(fakePool))
  app.use('/api/invoices', createInvoicesRouter(fakePool))
  app.use('/api/projects', createProjectsRouter(fakePool))
  app.use('/api/clients', createClientsRouter(fakePool))
  return app
}

function tokenFor(role: string) {
  return jwt.sign({ id: 'u1', email: 'test@test.com', name: 'Test', role }, JWT_SECRET)
}

// La matriz literal de C-10: las 6 rutas señaladas como evidencia del hallazgo.
const routes: Array<{ method: 'delete' | 'patch'; path: string; body?: any; label: string }> = [
  { method: 'delete', path: '/api/quotations/00000000-0000-0000-0000-000000000000', label: 'DELETE quotations' },
  { method: 'patch',  path: '/api/quotations/00000000-0000-0000-0000-000000000000/status', body: { status: 'Emitida' }, label: 'PATCH quotations status' },
  { method: 'delete', path: '/api/projects/00000000-0000-0000-0000-000000000000', label: 'DELETE projects' },
  { method: 'delete', path: '/api/clients/00000000-0000-0000-0000-000000000000', label: 'DELETE clients' },
  { method: 'delete', path: '/api/invoices/00000000-0000-0000-0000-000000000000', label: 'DELETE invoices' },
  { method: 'patch',  path: '/api/invoices/00000000-0000-0000-0000-000000000000/status', body: { status: 'issued' }, label: 'PATCH invoices status' },
]

describe('RBAC (C-10) — matriz rol × endpoint', () => {
  const app = buildApp()

  for (const route of routes) {
    it(`${route.label}: role=user recibe 403`, async () => {
      const res = await request(app)[route.method](route.path)
        .set('Authorization', `Bearer ${tokenFor('user')}`)
        .send(route.body ?? {})
      expect(res.status).toBe(403)
    })

    it(`${route.label}: role=admin no recibe 403`, async () => {
      const res = await request(app)[route.method](route.path)
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send(route.body ?? {})
      expect(res.status).not.toBe(403)
    })
  }

  it('DELETE quotations: role=manager recibe 403 (solo admin elimina)', async () => {
    const res = await request(app)
      .delete('/api/quotations/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${tokenFor('manager')}`)
    expect(res.status).toBe(403)
  })

  it('PATCH quotations status: role=manager no recibe 403 (puede cambiar estado)', async () => {
    const res = await request(app)
      .patch('/api/quotations/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${tokenFor('manager')}`)
      .send({ status: 'Emitida' })
    expect(res.status).not.toBe(403)
  })

  it('sin token: 401 en todas las rutas protegidas', async () => {
    for (const route of routes) {
      const res = await request(app)[route.method](route.path).send(route.body ?? {})
      expect(res.status).toBe(401)
    }
  })
})
