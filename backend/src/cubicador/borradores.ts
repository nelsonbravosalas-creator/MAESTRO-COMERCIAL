// Repositorio de borradores del cubicador (tabla cubicador_borradores).
//
// - Cada consulta filtra por user_id: un borrador ajeno nunca se entrega.
// - La actualizacion usa control optimista con `version` dentro del UPDATE.
// - PII A-21: el texto libre de ficha.descripcion pasa por scrubPii antes de guardarse.

import { Pool } from 'pg'
import { httpError } from '../utils/httpError'
import { scrubPii } from '../services/chatbotOps'
import type { Borrador, Ficha, PerfilId, ResultadoCubicacion } from './types'

export interface NuevoBorrador {
  userId: string
  tenantId?: string | null
  quotationId?: string | null
  perfil: PerfilId
  ficha: Ficha
}

export interface CambiosBorrador {
  estado?: Borrador['estado']
  ficha?: Ficha
  resultado?: ResultadoCubicacion | null
  quotation_id?: string | null
}

type Fila = Omit<Borrador, 'expires_at'> & { expires_at: Date | string }

function aBorrador(fila: Fila): Borrador {
  const expires =
    fila.expires_at instanceof Date ? fila.expires_at.toISOString() : String(fila.expires_at)
  return { ...fila, expires_at: expires }
}

function depurarFicha(ficha: Ficha): Ficha {
  return { ...ficha, descripcion: scrubPii(ficha.descripcion ?? '') }
}

export async function crearBorrador(pool: Pool, input: NuevoBorrador): Promise<Borrador> {
  const { rows } = await pool.query(
    `INSERT INTO cubicador_borradores (user_id, tenant_id, quotation_id, perfil, ficha)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.userId,
      input.tenantId ?? null,
      input.quotationId ?? null,
      input.perfil,
      JSON.stringify(depurarFicha(input.ficha)),
    ]
  )
  return aBorrador(rows[0])
}

// null si el borrador no existe, es de otro usuario o ya venció.
export async function obtenerBorrador(
  pool: Pool,
  id: string,
  userId: string
): Promise<Borrador | null> {
  const { rows } = await pool.query(
    `SELECT * FROM cubicador_borradores
      WHERE id = $1 AND user_id = $2 AND expires_at > NOW()`,
    [id, userId]
  )
  return rows[0] ? aBorrador(rows[0]) : null
}

// Borrador en curso del usuario (entrevista o cubicado); ignora ingresados, cancelados y vencidos.
export async function borradorActivo(pool: Pool, userId: string): Promise<Borrador | null> {
  const { rows } = await pool.query(
    `SELECT * FROM cubicador_borradores
      WHERE user_id = $1 AND estado IN ('entrevista', 'cubicado') AND expires_at > NOW()
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId]
  )
  return rows[0] ? aBorrador(rows[0]) : null
}

// Actualiza solo si la version coincide. 409 si cambió; 404 si no existe para el usuario.
export async function actualizarBorrador(
  pool: Pool,
  id: string,
  userId: string,
  cambios: CambiosBorrador,
  versionEsperada: number
): Promise<Borrador> {
  const ficha = cambios.ficha ? JSON.stringify(depurarFicha(cambios.ficha)) : null
  const resultado =
    cambios.resultado === undefined
      ? null
      : cambios.resultado === null
        ? null
        : JSON.stringify(cambios.resultado)
  const cambiaResultado = cambios.resultado !== undefined
  const cambiaCotizacion = cambios.quotation_id !== undefined

  const { rows } = await pool.query(
    `UPDATE cubicador_borradores
        SET estado       = COALESCE($4, estado),
            ficha        = COALESCE($5::jsonb, ficha),
            resultado    = CASE WHEN $6 THEN $7::jsonb ELSE resultado END,
            quotation_id = CASE WHEN $8 THEN $9::uuid ELSE quotation_id END,
            version      = version + 1,
            updated_at   = NOW()
      WHERE id = $1 AND user_id = $2 AND version = $3
      RETURNING *`,
    [
      id,
      userId,
      versionEsperada,
      cambios.estado ?? null,
      ficha,
      cambiaResultado,
      resultado,
      cambiaCotizacion,
      cambios.quotation_id ?? null,
    ]
  )
  if (rows[0]) return aBorrador(rows[0])

  const existe = await pool.query(
    'SELECT id FROM cubicador_borradores WHERE id = $1 AND user_id = $2',
    [id, userId]
  )
  if (existe.rows[0]) throw httpError('El borrador cambió; vuelve a cargarlo.', 409)
  throw httpError('Borrador no encontrado', 404)
}
