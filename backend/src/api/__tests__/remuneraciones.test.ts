/* eslint-disable @typescript-eslint/no-explicit-any -- fake pool tipado de forma laxa, igual que electrical-catalog.test.ts */
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createRemuneracionesRouter } from '../remuneraciones'
import { DEFAULT_PARAMETROS, calcularPerfil } from '../../services/remuneraciones'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const MO_ID = '11111111-1111-4111-8111-111111111111'
const LOG_ID = '22222222-2222-4222-8222-222222222222'

const INPUTS = {
  sueldoLiquido: 800000,
  tipoContrato: 'Indefinido',
  jornadaSemanal: 44,
  seguroElectrico: false,
  colacionMensual: 45000,
  movilizacionMensual: 35000,
  bonoVacacionesAnual: 0,
  aguinaldoFiestasPatriasAnual: 0,
  aguinaldoNavidadAnual: 0,
} as const

// ── Fake DB en memoria ──────────────────────────────────────────
// Despacha por el texto de la sentencia, igual que electrical-catalog.test.ts.
function makeFakeDb() {
  const items: any[] = [
    { id: MO_ID, category_id: 'mo', is_active: true, unit_price: 0 },
    { id: LOG_ID, category_id: 'log', is_active: true, unit_price: 0 },
  ]
  const versiones: any[] = []
  const perfiles: any[] = []

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(s)) return { rows: [] }
    if (s.startsWith('SELECT id, params FROM remuneraciones_parametros')) {
      return {
        rows: versiones
          .filter(v => v.superseded_at === null)
          .map(v => ({ id: v.id, params: v.params })),
      }
    }
    if (s.startsWith('UPDATE remuneraciones_parametros SET superseded_at')) {
      versiones.forEach(v => (v.superseded_at = v.superseded_at ?? 'hoy'))
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO remuneraciones_parametros')) {
      const row = {
        id: `v${versiones.length + 1}`,
        params: JSON.parse(params[0]),
        superseded_at: null,
      }
      versiones.push(row)
      return { rows: [{ id: row.id, params: row.params }] }
    }
    if (s.startsWith('SELECT id FROM catalog_items WHERE id')) {
      const row = items.find(i => i.id === params[0] && i.category_id === 'mo' && i.is_active)
      return { rows: row ? [{ id: row.id }] : [] }
    }
    if (s.startsWith('WITH perfil AS')) {
      const [id, inputs, resultado, costo] = params
      const row = {
        catalog_item_id: id,
        inputs: JSON.parse(inputs),
        resultado: JSON.parse(resultado),
        costo_diario: costo,
      }
      const idx = perfiles.findIndex(p => p.catalog_item_id === id)
      if (idx >= 0) perfiles[idx] = row
      else perfiles.push(row)
      items.find(i => i.id === id).unit_price = costo
      return { rows: [row] }
    }
    if (s.startsWith('SELECT catalog_item_id, inputs, resultado')) {
      return { rows: perfiles }
    }
    if (s.startsWith('SELECT p.catalog_item_id, p.inputs, c.unit_price')) {
      return {
        rows: perfiles.map(p => ({
          catalog_item_id: p.catalog_item_id,
          inputs: p.inputs,
          unit_price: items.find(i => i.id === p.catalog_item_id).unit_price,
        })),
      }
    }
    if (s.startsWith('WITH datos AS')) {
      const [ids, costos, resultados] = params
      ids.forEach((id: string, k: number) => {
        const perfil = perfiles.find(p => p.catalog_item_id === id)
        perfil.costo_diario = costos[k]
        perfil.resultado = JSON.parse(resultados[k])
        items.find(i => i.id === id).unit_price = costos[k]
      })
      return { rows: [] }
    }
    throw new Error(`Fake DB: query sin manejar — ${s.slice(0, 80)}`)
  }

  const client = { query, release: () => undefined }
  return { pool: { query, connect: async () => client } as any, items, versiones, perfiles }
}

function buildApp() {
  const db = makeFakeDb()
  const app = express()
  app.use(express.json())
  app.use('/api/remuneraciones', createRemuneracionesRouter(db.pool))
  return { app, db }
}

function authHeader(role = 'manager') {
  return `Bearer ${jwt.sign({ id: 'u1', email: 't@t.cl', name: 'Test', role }, JWT_SECRET)}`
}

describe('GET /api/remuneraciones/parametros', () => {
  it('devuelve los valores por defecto y los topes cuando no hay versión guardada', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .get('/api/remuneraciones/parametros')
      .set('Authorization', authHeader())

    expect(res.status).toBe(200)
    expect(res.body.parametrosId).toBeNull()
    expect(res.body.params.imm).toBe(DEFAULT_PARAMETROS.imm)
    expect(res.body.topes.topeGratificacion).toBe(197917)
  })
})

describe('PUT /api/remuneraciones/parametros', () => {
  it('un manager no puede cambiar los parámetros legales', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .put('/api/remuneraciones/parametros')
      .set('Authorization', authHeader('manager'))
      .send(DEFAULT_PARAMETROS)
    expect(res.status).toBe(403)
  })

  it('un admin guarda una versión nueva y reemplaza la anterior', async () => {
    const { app, db } = buildApp()
    const auth = authHeader('admin')

    await request(app)
      .put('/api/remuneraciones/parametros')
      .set('Authorization', auth)
      .send(DEFAULT_PARAMETROS)
    const res = await request(app)
      .put('/api/remuneraciones/parametros')
      .set('Authorization', auth)
      .send({ ...DEFAULT_PARAMETROS, utm: 67000 })

    expect(res.status).toBe(200)
    expect(res.body.params.utm).toBe(67000)
    expect(db.versiones).toHaveLength(2)
    expect(db.versiones[0].superseded_at).not.toBeNull()
    expect(db.versiones[1].superseded_at).toBeNull()
  })

  it('rechaza una tasa fuera de rango', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .put('/api/remuneraciones/parametros')
      .set('Authorization', authHeader('admin'))
      .send({ ...DEFAULT_PARAMETROS, salud: 7 })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/remuneraciones/calcular', () => {
  it('calcula la vista previa sin guardar, igual que el motor', async () => {
    const { app, db } = buildApp()
    const res = await request(app)
      .post('/api/remuneraciones/calcular')
      .set('Authorization', authHeader('manager'))
      .send({ inputs: INPUTS })

    expect(res.status).toBe(200)
    expect(res.body.valorJornada).toBe(calcularPerfil(INPUTS, DEFAULT_PARAMETROS).valorJornada)
    expect(db.perfiles).toHaveLength(0)
  })
})

describe('PUT /api/remuneraciones/perfiles/:catalogItemId', () => {
  it('responde 404 si el ítem no es de Mano de Obra', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .put(`/api/remuneraciones/perfiles/${LOG_ID}`)
      .set('Authorization', authHeader('manager'))
      .send(INPUTS)
    expect(res.status).toBe(404)
  })

  it('guarda el cálculo y actualiza el precio unitario del perfil', async () => {
    const { app, db } = buildApp()
    const res = await request(app)
      .put(`/api/remuneraciones/perfiles/${MO_ID}`)
      .set('Authorization', authHeader('manager'))
      .send(INPUTS)

    const esperado = calcularPerfil(INPUTS, DEFAULT_PARAMETROS).valorJornada
    expect(res.status).toBe(200)
    expect(res.body.costo_diario).toBe(esperado)
    expect(db.items.find(i => i.id === MO_ID).unit_price).toBe(esperado)
    expect(db.perfiles).toHaveLength(1)
  })

  it('rechaza un tipo de contrato inválido', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .put(`/api/remuneraciones/perfiles/${MO_ID}`)
      .set('Authorization', authHeader('manager'))
      .send({ ...INPUTS, tipoContrato: 'Honorarios' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/remuneraciones/recalcular', () => {
  it('un manager no puede recalcular todos los perfiles', async () => {
    const { app } = buildApp()
    const res = await request(app)
      .post('/api/remuneraciones/recalcular')
      .set('Authorization', authHeader('manager'))
    expect(res.status).toBe(403)
  })

  it('recalcula con los parámetros vigentes y devuelve precio antes y después', async () => {
    const { app, db } = buildApp()
    await request(app)
      .put(`/api/remuneraciones/perfiles/${MO_ID}`)
      .set('Authorization', authHeader('manager'))
      .send(INPUTS)
    db.items.find(i => i.id === MO_ID).unit_price = 1

    const res = await request(app)
      .post('/api/remuneraciones/recalcular')
      .set('Authorization', authHeader('admin'))

    expect(res.status).toBe(200)
    expect(res.body.actualizados).toHaveLength(1)
    expect(res.body.actualizados[0]).toMatchObject({ catalogItemId: MO_ID, precioAnterior: 1 })
    expect(db.items.find(i => i.id === MO_ID).unit_price).toBe(res.body.actualizados[0].precioNuevo)
  })
})
