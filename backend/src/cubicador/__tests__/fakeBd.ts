// Base falsa en memoria para los borradores del cubicador (solo para tests).
import { vi } from 'vitest'
import { Pool } from 'pg'
import type { Borrador, Ficha, PerfilId } from '../types'

export const FICHA_VRF: Ficha = {
  descripcion: 'Falla en VRF',
  datos: {
    tipo_trabajo: 'reparacion',
    sistema: 'vrf',
    actividad: 'fuga',
    refrigerante: 'R-410A',
    metodo: 'total',
    carga_placa_kg: 8.5,
    linea_liquido: { diametro: '3/8', largo_m: 40 },
    linea_gas: { diametro: '3/4', largo_m: 40 },
    volumen_equipos_l: 13.5,
    uniones: 2,
    estado_texto: 'fuga en una soldadura',
    comuna: 'Maipú',
  },
  no_sabe: [],
  supuestos: [],
}

export function borradorBase(over: Partial<Borrador> = {}): Borrador {
  return {
    id: 'b1',
    user_id: 'u1',
    tenant_id: null,
    quotation_id: null,
    perfil: 'hvac' as PerfilId,
    estado: 'entrevista',
    ficha: { descripcion: '', datos: {}, no_sabe: [], supuestos: [] },
    resultado: null,
    version: 1,
    expires_at: '2099-01-01T00:00:00.000Z',
    ...over,
  }
}

// Responde a las consultas de borradores.ts contra un mapa en memoria.
export function fakeBd(iniciales: Borrador[] = []) {
  const filas = new Map<string, Borrador>(iniciales.map(b => [b.id, b]))
  let seq = 100
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const res = (rows: unknown[]) => ({ rows, rowCount: rows.length })
    if (sql.includes('cubicador_parametros')) return res([])
    // F9: verificación de la cotización abierta antes de proponer el ingreso.
    if (sql.includes('SELECT status FROM quotations')) return res([{ status: 'Borrador' }])
    if (sql.includes('INSERT INTO cubicador_borradores')) {
      const [userId, tenantId, quotationId, perfil, ficha] = params as [
        string,
        string | null,
        string | null,
        PerfilId,
        string,
      ]
      const b = borradorBase({
        id: `b${++seq}`,
        user_id: userId,
        tenant_id: tenantId,
        quotation_id: quotationId,
        perfil,
        ficha: JSON.parse(ficha) as Ficha,
      })
      filas.set(b.id, b)
      return res([b])
    }
    if (sql.includes('UPDATE cubicador_borradores')) {
      const [id, userId, version, estado, ficha, cambiaRes, resultado, cambiaCot, cot] = params as [
        string,
        string,
        number,
        Borrador['estado'] | null,
        string | null,
        boolean,
        string | null,
        boolean,
        string | null,
      ]
      const b = filas.get(id)
      if (!b || b.user_id !== userId || b.version !== version) return res([])
      const nuevo: Borrador = {
        ...b,
        estado: estado ?? b.estado,
        ficha: ficha ? (JSON.parse(ficha) as Ficha) : b.ficha,
        resultado: cambiaRes ? (resultado ? JSON.parse(resultado) : null) : b.resultado,
        quotation_id: cambiaCot ? cot : b.quotation_id,
        version: b.version + 1,
      }
      filas.set(id, nuevo)
      return res([nuevo])
    }
    if (sql.includes('SELECT id FROM cubicador_borradores')) {
      const b = filas.get(params[0] as string)
      return res(b && b.user_id === params[1] ? [{ id: b.id }] : [])
    }
    if (sql.includes("estado IN ('entrevista', 'cubicado')")) {
      const mias = [...filas.values()].filter(
        b => b.user_id === params[0] && (b.estado === 'entrevista' || b.estado === 'cubicado')
      )
      return res(mias.slice(-1))
    }
    if (sql.includes('FROM cubicador_borradores')) {
      const b = filas.get(params[0] as string)
      return res(b && b.user_id === params[1] ? [b] : [])
    }
    return res([])
  })
  return { pool: { query } as unknown as Pool & { query: typeof query }, filas }
}
