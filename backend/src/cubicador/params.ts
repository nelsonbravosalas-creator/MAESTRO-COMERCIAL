// Parametros de calculo del cubicador. Los calculadores son puros y reciben
// `Parametros`; solo `cargarParametros` toca la base de datos.
import type { Pool } from 'pg'
import { logger } from '../utils/logger'

export interface Refrigerante {
  densidad_liquido_kg_l: number
  kg_cilindro: number
  densidad_vapor_kg_l?: number
}

export interface Nitrogeno {
  /** Caudal de purga durante la soldadura, en L/min. */
  caudal_lpm: number
  /** Factor de holgura sobre el total de litros. */
  holgura: number
  min_por_union: number
  /** Volumen de un balón de nitrógeno, en m3. */
  balon_m3: number
  barridos_flushing: number
  presion_barrido_barg: number
  /** Presión de prueba por código de refrigerante; `default` cubre el resto (supuesto). */
  presion_prueba_barg: Record<string, number>
}

// Interfaz extensible: las tareas siguientes agregan claves (nitrogeno, hh, cierre...).
export interface Parametros {
  /** Diametro interior del cobre en mm, por medida nominal. */
  cobre: Record<string, number>
  refrigerantes: Record<string, Refrigerante>
  merma_pct: number
  bombeo: { tramo: number; merma: number; holgura: number }
  nitrogeno: Nitrogeno
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
  nitrogeno: {
    caudal_lpm: 3,
    holgura: 1.3,
    min_por_union: 15,
    balon_m3: 6,
    barridos_flushing: 3,
    presion_barrido_barg: 5,
    // 37,9 barg = los 550 psi de la plantilla; el resto es un supuesto crítico.
    presion_prueba_barg: { 'R-410A': 37.9, 'R-32': 37.9, default: 9 },
  },
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
    if (esObjeto(actual)) {
      // Una fila que no es objeto no puede corromper la base: se ignora.
      if (esObjeto(valor)) out[clave] = { ...actual, ...valor }
    } else if (typeof actual === 'number') {
      if (typeof valor === 'number' && Number.isFinite(valor)) out[clave] = valor
    } else {
      out[clave] = valor
    }
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
