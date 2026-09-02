import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createElectricalCatalogRouter } from '../electrical-catalog'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'

// ── Fake DB en memoria ──────────────────────────────────────────
// "Materiales Eléctricos" vive en su propia tabla (electrical_catalog_items,
// sin category_id) — mismo patrón CRUD que catalog.ts, sobre otra tabla.
function makeFakeDb() {
  const items: any[] = []

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()
    if (s.startsWith('SELECT id, description')) {
      return { rows: items.filter(i => i.is_active) }
    }
    if (s.startsWith('INSERT INTO electrical_catalog_items')) {
      const [description, unit_name, unit_price, sort_order] = params
      const row = {
        id: ITEM_ID,
        description,
        unit_name,
        unit_price,
        sort_order,
        is_active: true,
      }
      items.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('UPDATE electrical_catalog_items') && s.includes('description = $1')) {
      const [description, unit_name, unit_price, sort_order, id] = params
      const row = items.find(i => i.id === id)
      if (!row) return { rows: [] }
      Object.assign(row, { description, unit_name, unit_price, sort_order })
      return { rows: [row] }
    }
    if (s.startsWith('UPDATE electrical_catalog_items') && s.includes('is_active = false')) {
      const [id] = params
      const row = items.find(i => i.id === id)
      if (!row) return { rows: [] }
      row.is_active = false
      return { rows: [{ id: row.id }] }
    }
    throw new Error(`Fake DB: query sin manejar — ${s.slice(0, 80)}`)
  }
  return { query, getItems: () => items }
}

function buildApp() {
  const db = makeFakeDb()
  const fakePool: any = { query: db.query }
  const app = express()
  app.use(express.json())
  app.use('/api/electrical-catalog', createElectricalCatalogRouter(fakePool))
  return { app, db }
}

function authHeader(role = 'manager') {
  return `Bearer ${jwt.sign({ id: 'u1', email: 't@t.cl', name: 'Test', role }, JWT_SECRET)}`
}

describe('CRUD /api/electrical-catalog', () => {
  it('crea, lista, actualiza y desactiva un ítem eléctrico', async () => {
    const { app } = buildApp()

    const created = await request(app)
      .post('/api/electrical-catalog')
      .set('Authorization', authHeader())
      .send({ description: 'Cable THHN 12 AWG', unit_name: 'Mt', unit_price: 850, sort_order: 0 })

    expect(created.status).toBe(201)
    expect(created.body.description).toBe('Cable THHN 12 AWG')
    expect(created.body.category_id).toBeUndefined()

    const list = await request(app)
      .get('/api/electrical-catalog')
      .set('Authorization', authHeader())
    expect(list.status).toBe(200)
    expect(list.body).toHaveLength(1)

    const updated = await request(app)
      .put(`/api/electrical-catalog/${ITEM_ID}`)
      .set('Authorization', authHeader())
      .send({ description: 'Cable THHN 10 AWG', unit_name: 'Mt', unit_price: 1200, sort_order: 0 })
    expect(updated.status).toBe(200)
    expect(updated.body.description).toBe('Cable THHN 10 AWG')

    const deleted = await request(app)
      .delete(`/api/electrical-catalog/${ITEM_ID}`)
      .set('Authorization', authHeader('admin'))
    expect(deleted.status).toBe(200)

    const listAfter = await request(app)
      .get('/api/electrical-catalog')
      .set('Authorization', authHeader())
    expect(listAfter.body).toHaveLength(0)
  })

  it('responde 404 al actualizar un ítem que no existe', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .put('/api/electrical-catalog/99999999-9999-4999-8999-999999999999')
      .set('Authorization', authHeader())
      .send({ description: 'X', unit_name: 'Und', unit_price: 1, sort_order: 0 })
    expect(res.status).toBe(404)
  })
})
