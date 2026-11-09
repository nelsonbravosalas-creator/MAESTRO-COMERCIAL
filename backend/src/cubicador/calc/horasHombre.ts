// Horas-hombre por actividad. El LLM nunca calcula cantidades.
import { httpError } from '../../utils/httpError'
import type { Parametros } from '../params'

export interface DatosHH {
  actividad: string
  unidades_interiores?: number
  unidades_exteriores?: number
  largo_linea_m?: number
  /** Barridos de flushing; cada uno suma `hh_barrido` HH. */
  barridos?: number
}

export interface TareaHH {
  descripcion: string
  hh: number
  cantidad?: number
}

function noNegativo(valor: unknown, etiqueta: string, genero: 'f' | 'mp' = 'mp'): number {
  if (valor === undefined || valor === null) return 0
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw httpError(
      `${etiqueta} ${genero === 'f' ? 'debe ser un número' : 'deben ser números'}.`,
      422
    )
  }
  if (valor < 0) {
    throw httpError(
      `${etiqueta} ${genero === 'f' ? 'no puede ser negativa' : 'no pueden ser negativos'}.`,
      422
    )
  }
  return valor
}

const redondear1 = (n: number) => Math.round(n * 10) / 10

export function listaTareas(datos: DatosHH, params: Parametros): TareaHH[] {
  const tareas = params.hh.tareas
  const validas = Object.keys(tareas)
  if (
    typeof datos.actividad !== 'string' ||
    !Object.prototype.hasOwnProperty.call(tareas, datos.actividad)
  ) {
    throw httpError(
      `La actividad "${String(datos.actividad)}" no es válida. Actividades válidas: ${validas.join(', ')}.`,
      422
    )
  }
  const cantidades = {
    interior: noNegativo(datos.unidades_interiores, 'Las unidades interiores'),
    exterior: noNegativo(datos.unidades_exteriores, 'Las unidades exteriores'),
    metro_linea: noNegativo(datos.largo_linea_m, 'El largo de la línea', 'f'),
  }
  const barridos = noNegativo(datos.barridos, 'Los barridos')

  const filas: TareaHH[] = []
  for (const t of tareas[datos.actividad]) {
    if (t.por === undefined) {
      filas.push({ descripcion: t.descripcion, hh: t.hh })
      continue
    }
    const cantidad = cantidades[t.por]
    if (cantidad > 0) filas.push({ descripcion: t.descripcion, hh: t.hh * cantidad, cantidad })
  }
  if (barridos > 0) {
    filas.push({
      descripcion: 'Barridos de flushing',
      hh: barridos * params.hh.hh_barrido,
      cantidad: barridos,
    })
  }
  return filas
}

export function calcularHH(tareas: TareaHH[], factor = 1): { filas: TareaHH[]; total: number } {
  if (typeof factor !== 'number' || !Number.isFinite(factor)) {
    throw httpError('El factor de dificultad debe ser un número.', 422)
  }
  if (factor <= 0) throw httpError('El factor de dificultad debe ser mayor que cero.', 422)
  const suma = tareas.reduce((acc, t) => acc + t.hh, 0)
  return { filas: tareas, total: redondear1(suma * factor) }
}
