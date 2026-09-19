import { describe, it, expect } from 'vitest'
import express from 'express'
import bodyParser from 'body-parser'
import request from 'supertest'
import type { Pool } from 'pg'
import { createAuthThrottle, ipAndEmailKey, ipKey } from '../authThrottle'

interface FakeState {
  /** undefined = no hay fila para ese bucket (ventana nueva o vencida). */
  count?: number
  retryAfter?: number
  failRead?: boolean
}

function makeFakePool(state: FakeState) {
  const reads: unknown[][] = []
  const writes: unknown[][] = []
  let resolveWrite: (() => void) | null = null
  const nextWrite = () =>
    new Promise<void>(resolve => {
      resolveWrite = resolve
    })

  // El middleware solo usa pool.query; el resto de la interfaz de Pool no se
  // toca, así que se construye el mínimo y se afirma el tipo una sola vez.
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim()
      if (s.startsWith('SELECT attempt_count')) {
        reads.push(params)
        if (state.failRead) throw new Error('conexión a la base de datos caída')
        if (state.count === undefined) return { rows: [] }
        return { rows: [{ attempt_count: state.count, retry_after: state.retryAfter ?? 900 }] }
      }
      if (s.startsWith('INSERT INTO auth_throttle')) {
        writes.push(params)
        resolveWrite?.()
        return { rows: [] }
      }
      throw new Error(`Fake pool: query sin manejar — ${s}`)
    },
  }
  return { pool: pool as unknown as Pool, reads, writes, nextWrite }
}

const MENSAJE = { error: 'Too many requests', message: 'Demasiados intentos.' }

function buildApp(pool: Pool, overrides: Partial<Parameters<typeof createAuthThrottle>[1]> = {}) {
  const app = express()
  app.use(bodyParser.json())
  app.use(
    '/login',
    createAuthThrottle(pool, {
      name: 'login',
      windowMinutes: 15,
      max: 5,
      keyGenerator: ipAndEmailKey,
      countWhen: status => status === 401 || status === 423,
      message: MENSAJE,
      ...overrides,
    })
  )
  // El body decide el resultado para poder probar éxito y fallo con la misma ruta.
  app.post('/login', (req, res) => {
    const { ok } = req.body as { ok?: boolean }
    return ok ? res.json({ token: 't' }) : res.status(401).json({ error: 'Unauthorized' })
  })
  return app
}

describe('createAuthThrottle — contador compartido en Postgres', () => {
  it('deja pasar mientras el contador está bajo el máximo', async () => {
    const { pool } = makeFakePool({ count: 4 })
    const res = await request(buildApp(pool)).post('/login').send({ ok: true })

    expect(res.status).toBe(200)
  })

  it('responde 429 con Retry-After cuando el contador alcanzó el máximo', async () => {
    const { pool, writes } = makeFakePool({ count: 5, retryAfter: 420 })
    const res = await request(buildApp(pool)).post('/login').send({ ok: true })

    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBe('420')
    expect(res.body).toEqual(MENSAJE)
    // El intento bloqueado no vuelve a sumar: si lo hiciera, seguir golpeando
    // extendería el bloqueo para siempre sin que el atacante pague nada.
    expect(writes).toHaveLength(0)
  })

  // Este es el escenario que motiva todo: la instancia que atiende la petición
  // nunca vio un intento (su MemoryStore está en cero), pero el contador
  // compartido ya está en el tope. Sin esta tabla, la petición pasaría.
  it('bloquea aunque la instancia que atiende no haya visto ningún intento', async () => {
    const { pool } = makeFakePool({ count: 5 })
    const app = buildApp(pool)
    const res = await request(app).post('/login').send({ ok: false })

    expect(res.status).toBe(429)
  })

  it('registra el intento fallido en el bucket correcto', async () => {
    const { pool, writes, nextWrite } = makeFakePool({})
    const esperaEscritura = nextWrite()
    const res = await request(buildApp(pool))
      .post('/login')
      .send({ ok: false, email: 'Nelson@Example.com' })
    await esperaEscritura

    expect(res.status).toBe(401)
    expect(writes).toHaveLength(1)
    expect(String(writes[0][0])).toMatch(/^login:.*:nelson@example\.com$/)
    expect(writes[0][1]).toBe(15)
  })

  it('no cuenta un login exitoso', async () => {
    const { pool, writes } = makeFakePool({})
    const res = await request(buildApp(pool)).post('/login').send({ ok: true })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(res.status).toBe(200)
    expect(writes).toHaveLength(0)
  })

  it('cuenta todo intento cuando countWhen lo pide (caso forgot-password)', async () => {
    const { pool, writes, nextWrite } = makeFakePool({})
    const esperaEscritura = nextWrite()
    await request(buildApp(pool, { countWhen: () => true }))
      .post('/login')
      .send({ ok: true })
    await esperaEscritura

    expect(writes).toHaveLength(1)
  })

  // Falla abierta: el login consulta `users` de todas formas, así que si
  // Postgres no responde el login ya está caído — convertirlo además en un 429
  // masivo no protegería de nada.
  it('deja pasar la petición si el contador no se puede leer', async () => {
    const { pool } = makeFakePool({ failRead: true })
    const res = await request(buildApp(pool)).post('/login').send({ ok: true })

    expect(res.status).toBe(200)
  })

  it('aísla los buckets por nombre de limitador', async () => {
    const { pool, reads } = makeFakePool({ count: 0 })
    await request(buildApp(pool, { name: 'forgot-password', keyGenerator: ipKey }))
      .post('/login')
      .send({ ok: true })

    expect(String(reads[0][0])).toMatch(/^forgot-password:/)
  })
})
