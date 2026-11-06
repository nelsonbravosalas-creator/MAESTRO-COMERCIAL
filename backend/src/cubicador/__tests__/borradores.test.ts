import { describe, it, expect, vi } from 'vitest'
import { Pool } from 'pg'
import { actualizarBorrador, borradorActivo, crearBorrador, obtenerBorrador } from '../borradores'
import type { Ficha } from '../types'

type QueryResult = { rows?: unknown[]; rowCount?: number }
type Handler = (sql: string, params: unknown[]) => QueryResult | undefined

// Pool falso que responde segun el fragmento de SQL. Sin respuesta, devuelve vacio.
function fakePool(handler: Handler = () => undefined) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const r = handler(sql, params) ?? {}
    return { rows: r.rows ?? [], rowCount: r.rowCount ?? r.rows?.length ?? 0 }
  })
  return { query } as unknown as Pool & { query: typeof query }
}

const FICHA: Ficha = { descripcion: 'Mantencion split', datos: {}, no_sabe: [], supuestos: [] }

const FILA = {
  id: 'b1',
  user_id: 'u1',
  tenant_id: null,
  quotation_id: null,
  perfil: 'hvac',
  estado: 'entrevista',
  ficha: FICHA,
  resultado: null,
  version: 1,
  expires_at: new Date('2026-11-13T00:00:00Z'),
}

function primeraConsulta(pool: ReturnType<typeof fakePool>): [string, unknown[]] {
  return pool.query.mock.calls[0] as unknown as [string, unknown[]]
}

describe('obtenerBorrador', () => {
  it('no entrega un borrador ajeno', async () => {
    // El SQL filtra por user_id: para otro usuario no hay filas.
    const pool = fakePool((sql, params) =>
      sql.includes('FROM cubicador_borradores') && params[1] === 'u1' ? { rows: [FILA] } : undefined
    )
    expect(await obtenerBorrador(pool, 'b1', 'otro')).toBeNull()
    const [sql] = primeraConsulta(pool)
    expect(sql).toContain('user_id = $2')
    expect(sql).toContain('expires_at > NOW()')
    expect((await obtenerBorrador(pool, 'b1', 'u1'))?.id).toBe('b1')
  })

  it('normaliza expires_at a ISO', async () => {
    const pool = fakePool(() => ({ rows: [FILA] }))
    const b = await obtenerBorrador(pool, 'b1', 'u1')
    expect(b?.expires_at).toBe('2026-11-13T00:00:00.000Z')
  })
})

describe('actualizarBorrador', () => {
  it('con version vieja lanza 409', async () => {
    // UPDATE no coincide (la version cambio) pero el borrador existe para el usuario.
    const pool = fakePool(sql => (sql.startsWith('SELECT') ? { rows: [{ id: 'b1' }] } : undefined))
    await expect(
      actualizarBorrador(pool, 'b1', 'u1', { estado: 'cubicado' }, 1)
    ).rejects.toMatchObject({ status: 409 })
    const [sql] = primeraConsulta(pool)
    expect(sql).toMatch(/version\s*=\s*version \+ 1/)
    expect(sql).toContain('AND version = $')
  })

  it('responde 404 si el borrador no existe para el usuario', async () => {
    const pool = fakePool(() => undefined)
    await expect(
      actualizarBorrador(pool, 'b1', 'u1', { estado: 'cubicado' }, 1)
    ).rejects.toMatchObject({ status: 404 })
  })

  it('devuelve el borrador actualizado con la version nueva', async () => {
    const pool = fakePool(sql =>
      sql.startsWith('UPDATE') ? { rows: [{ ...FILA, estado: 'cubicado', version: 2 }] } : undefined
    )
    const b = await actualizarBorrador(pool, 'b1', 'u1', { estado: 'cubicado' }, 1)
    expect(b.version).toBe(2)
    expect(b.estado).toBe('cubicado')
  })
})

describe('borradorActivo', () => {
  it('ignora ingresado, cancelado y vencido', async () => {
    const pool = fakePool(() => ({ rows: [FILA] }))
    const b = await borradorActivo(pool, 'u1')
    expect(b?.id).toBe('b1')
    const [sql] = primeraConsulta(pool)
    expect(sql).toContain("estado IN ('entrevista', 'cubicado')")
    expect(sql).toContain('expires_at > NOW()')
  })

  it('devuelve null si no hay borrador activo', async () => {
    expect(await borradorActivo(fakePool(), 'u1')).toBeNull()
  })
})

describe('PII A-21 en ficha.descripcion', () => {
  const conRut: Ficha = { ...FICHA, descripcion: 'Cliente 76.123.456-7 pide cotizar' }

  it('crearBorrador depura el RUT antes de guardar', async () => {
    const pool = fakePool(() => ({ rows: [FILA] }))
    await crearBorrador(pool, { userId: 'u1', perfil: 'hvac', ficha: conRut })
    const guardado = JSON.stringify(primeraConsulta(pool)[1])
    expect(guardado).not.toContain('76.123.456-7')
    expect(guardado).toContain('[RUT]')
  })

  it('actualizarBorrador depura el RUT antes de guardar', async () => {
    const pool = fakePool(() => ({ rows: [FILA] }))
    await actualizarBorrador(pool, 'b1', 'u1', { ficha: conRut }, 1)
    const guardado = JSON.stringify(primeraConsulta(pool)[1])
    expect(guardado).not.toContain('76.123.456-7')
    expect(guardado).toContain('[RUT]')
  })
})
