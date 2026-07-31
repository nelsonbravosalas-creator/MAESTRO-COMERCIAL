import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { validate } from '../validate'

const schema = z.object({
  name: z.string().trim().min(1).max(50),
  age: z.number().int().min(0).max(150),
})

function buildApp() {
  const app = express()
  app.use(express.json())
  app.post('/thing', validate({ body: schema }), (req, res) => res.json(req.body))
  return app
}

describe('validate middleware (A-01)', () => {
  it('AC-1.3: acepta un body válido y deja pasar los datos saneados', async () => {
    const app = buildApp()
    const res = await request(app).post('/thing').send({ name: 'Ok', age: 30 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: 'Ok', age: 30 })
  })

  it('AC-1.3: tipo incorrecto → 400 con details', async () => {
    const app = buildApp()
    const res = await request(app).post('/thing').send({ name: 'Ok', age: 'no-es-un-numero' })
    expect(res.status).toBe(400)
    expect(Array.isArray(res.body.details)).toBe(true)
    expect(res.body.details[0].path).toBe('age')
  })

  it('AC-1.3: fuera de rango → 400', async () => {
    const app = buildApp()
    const res = await request(app).post('/thing').send({ name: 'Ok', age: 999 })
    expect(res.status).toBe(400)
  })

  it('AC-1.3: campo faltante → 400, nunca 500', async () => {
    const app = buildApp()
    const res = await request(app).post('/thing').send({ age: 10 })
    expect(res.status).toBe(400)
  })

  it('AC-1.4: descarta campos no declarados en el esquema', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/thing')
      .send({ name: 'Ok', age: 10, admin: true, extra: 'x' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: 'Ok', age: 10 })
    expect(res.body.admin).toBeUndefined()
  })
})
