// Horas-hombre por actividad. El LLM nunca calcula cantidades.
import { httpError } from '../../utils/httpError'
import type { Parametros, TareaParam } from '../params'

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
const redondear2 = (n: number) => Math.round(n * 100) / 100
const POR_VALIDOS: readonly string[] = ['interior', 'exterior', 'metro_linea']

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
  const cantidades: Record<string, number> = {
    interior: noNegativo(datos.unidades_interiores, 'Las unidades interiores'),
    exterior: noNegativo(datos.unidades_exteriores, 'Las unidades exteriores'),
    metro_linea: noNegativo(datos.largo_linea_m, 'El largo de la línea', 'f'),
  }
  const barridos = noNegativo(datos.barridos, 'Los barridos')

  const lista: unknown = tareas[datos.actividad]
  if (!Array.isArray(lista)) {
    throw httpError(
      `Los parámetros de horas-hombre de "${datos.actividad}" no son válidos: la lista de tareas debe ser una lista.`,
      422
    )
  }

  const filas: TareaHH[] = []
  for (const [i, t] of (lista as unknown[]).entries()) {
    const fila = t as Partial<TareaParam> | null
    const donde = `La tarea ${i + 1} de "${datos.actividad}"`
    if (typeof fila !== 'object' || fila === null) {
      throw httpError(`${donde} no es válida.`, 422)
    }
    if (typeof fila.descripcion !== 'string' || fila.descripcion.trim() === '') {
      throw httpError(`${donde} no tiene una descripción válida.`, 422)
    }
    if (typeof fila.hh !== 'number' || !Number.isFinite(fila.hh) || fila.hh < 0) {
      throw httpError(
        `${donde} ("${fila.descripcion}") tiene horas-hombre inválidas: deben ser un número no negativo.`,
        422
      )
    }
    if (fila.por === undefined) {
      filas.push({ descripcion: fila.descripcion, hh: redondear2(fila.hh) })
      continue
    }
    if (!POR_VALIDOS.includes(fila.por)) {
      throw httpError(
        `${donde} ("${fila.descripcion}") tiene una unidad "${String(fila.por)}" no válida. Unidades válidas: ${POR_VALIDOS.join(', ')}.`,
        422
      )
    }
    const cantidad = cantidades[fila.por]
    if (cantidad > 0) {
      filas.push({ descripcion: fila.descripcion, hh: redondear2(fila.hh * cantidad), cantidad })
    }
  }
  if (barridos > 0) {
    const hhBarrido = params.hh.hh_barrido
    if (typeof hhBarrido !== 'number' || !Number.isFinite(hhBarrido) || hhBarrido < 0) {
      throw httpError(
        'Los parámetros de horas-hombre no son válidos: las HH por barrido deben ser un número no negativo.',
        422
      )
    }
    filas.push({
      descripcion: 'Barridos de flushing',
      hh: redondear2(barridos * hhBarrido),
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
  const total = redondear1(suma * factor)
  if (!Number.isFinite(total)) {
    throw httpError('El total de horas-hombre no es un número válido.', 422)
  }
  return { filas: tareas, total }
}
