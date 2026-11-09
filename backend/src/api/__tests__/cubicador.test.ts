import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import type { Pool } from 'pg'
import { createCubicadorRouter } from '../cubicador'
import { httpError } from '../../utils/httpError'
import type { EstadoCubicador } from '../../cubicador/ejecutar'

const JWT_SECRET = 'test-secret-test-secret-test-secret'
const BORRADOR_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('../../cubicador/ejecutar', () => ({ ejecutarCubicacion: vi.fn() }))
import { ejecutarCubicacion } from '../../cubicador/ejecutar'
const ejecutarMock = vi.mocked(ejecutarCubicacion)

const authHeader = () => {
  const token = jwt.sign(
    { id: 'u1', email: 'test@test.com', name: 'Test', role: 'admin' },
    JWT_SECRET
  )
  return `Bearer ${token}`
}

// Pool falso: solo atiende el contador del throttle (sin filas = sin limite alcanzado).
const pool = { query: async () => ({ rows: [] }) } as unknown as Pool

const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/api/chatbot/cubicador', createCubicadorRouter(pool))
  return app
}

const estado: EstadoCubicador = {
  borrador_id: BORRADOR_ID,
  perfil: 'hvac',
  estado: 'cubicado',
  compuerta: { respondidas: 3, requeridas: 3, habilitado: true, faltantes: [], siguientes: [] },
  datos_completos: 3,
  datos_totales: 5,
  resultado: { items: [], supuestos: [], advertencias: [], dotacion: null },
  precios_pendientes: 0,
}

describe('POST /api/chatbot/cubicador/:id/cubicar', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })
  beforeEach(() => {
    ejecutarMock.mockReset()
  })

  it('sin sesión responde 401', async () => {
    const res = await request(buildApp()).post(`/api/chatbot/cubicador/${BORRADOR_ID}/cubicar`)
    expect(res.status).toBe(401)
    expect(ejecutarMock).not.toHaveBeenCalled()
  })

  it('id que no es uuid responde 400', async () => {
    const res = await request(buildApp())
      .post('/api/chatbot/cubicador/no-es-uuid/cubicar')
      .set('Authorization', authHeader())
    expect(res.status).toBe(400)
  })

  it('compuerta cerrada responde 422 con faltantes y motivo', async () => {
    ejecutarMock.mockImplementation(async () => {
      throw httpError('Faltan datos para cubicar.', 422, {
        faltantes: ['potencia'],
        siguientes: ['¿Qué potencia tiene el equipo?'],
      })
    })
    const res = await request(buildApp())
      .post(`/api/chatbot/cubicador/${BORRADOR_ID}/cubicar`)
      .set('Authorization', authHeader())
    expect(res.status).toBe(422)
    expect(res.body.faltantes).toEqual(['potencia'])
    expect(res.body.siguientes).toEqual(['¿Qué potencia tiene el equipo?'])
    expect(res.body.motivo).toBe('Faltan datos para cubicar.')
  })

  it('borrador ajeno o vencido responde 404', async () => {
    ejecutarMock.mockImplementation(async () => {
      throw httpError('Borrador no encontrado', 404)
    })
    const res = await request(buildApp())
      .post(`/api/chatbot/cubicador/${BORRADOR_ID}/cubicar`)
      .set('Authorization', authHeader())
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Borrador no encontrado')
  })

  it('cubica y devuelve el resultado del usuario autenticado', async () => {
    ejecutarMock.mockResolvedValue(estado)
    const res = await request(buildApp())
      .post(`/api/chatbot/cubicador/${BORRADOR_ID}/cubicar`)
      .set('Authorization', authHeader())
    expect(res.status).toBe(200)
    expect(res.body).toEqual(estado)
    expect(ejecutarMock).toHaveBeenCalledWith(pool, BORRADOR_ID, 'u1')
  })

  it('un error inesperado responde 500 con mensaje genérico', async () => {
    ejecutarMock.mockImplementation(async () => {
      throw new Error('conexion rota con host interno')
    })
    const res = await request(buildApp())
      .post(`/api/chatbot/cubicador/${BORRADOR_ID}/cubicar`)
      .set('Authorization', authHeader())
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('host interno')
  })
})
