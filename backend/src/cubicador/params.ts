// Parametros de calculo del cubicador. Los calculadores son puros y reciben
// `Parametros`; solo `cargarParametros` toca la base de datos.
import type { Pool } from 'pg'
import { logger } from '../utils/logger'

export interface Refrigerante {
  densidad_liquido_kg_l: number
  kg_cilindro: number
  densidad_vapor_kg_l?: number
}

// Interfaz extensible: las tareas siguientes agregan claves (nitrogeno, hh, cierre...).
export interface Parametros {
  /** Diametro interior del cobre en mm, por medida nominal. */
  cobre: Record<string, number>
  refrigerantes: Record<string, Refrigerante>
  merma_pct: number
  bombeo: { tramo: number; merma: number; holgura: number }
}

export const PARAMETROS_BASE: Parametros = {
  cobre: { '1/4': 4.75, '3/8': 7.92, '1/2': 11.1, '5/8': 14.28, '3/4': 17.45, '7/8': 20.6 },
  refrigerantes: {
    'R-410A': { densidad_liquido_kg_l: 1.06, kg_cilindro: 11.3 },
    'R-404A': { densidad_liquido_kg_l: 1.045, kg_cilindro: 10.9, densidad_vapor_kg_l: 0.0195 },
    // validar contra ficha del fabricante
    'R-32': { densidad_liquido_kg_l: 0.96, kg_cilindro: 9 },
    // validar contra ficha del fabricante
    'R-134a': { densidad_liquido_kg_l: 1.21, kg_cilindro: 13.6 },
    // validar contra ficha del fabricante
    'R-407C': { densidad_liquido_kg_l: 1.13, kg_cilindro: 11.3 },
    // validar contra ficha del fabricante
    'R-22': { densidad_liquido_kg_l: 1.19, kg_cilindro: 13.6 },
  },
  merma_pct: 5,
  bombeo: { tramo: 0.2, merma: 0.3, holgura: 0.5 },
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Mezcla generica: por cada clave, objeto sobre objeto (superficial); otro valor reemplaza. */
export function mezclarParametros(
  base: Parametros,
  filas: { clave: string; valor: unknown }[]
): Parametros {
  const out: Record<string, unknown> = { ...base }
  for (const { clave, valor } of filas) {
    const actual = out[clave]
    out[clave] = esObjeto(actual) && esObjeto(valor) ? { ...actual, ...valor } : valor
  }
  return out as unknown as Parametros
}

export async function cargarParametros(pool: Pool): Promise<Parametros> {
  try {
    const r = await pool.query('SELECT clave, valor FROM cubicador_parametros')
    return mezclarParametros(PARAMETROS_BASE, r.rows as { clave: string; valor: unknown }[])
  } catch (err) {
    logger.error('cubicador: no se pudieron cargar los parámetros, se usa la base', {
      error: err instanceof Error ? err.message : String(err),
    })
    return PARAMETROS_BASE
  }
}
