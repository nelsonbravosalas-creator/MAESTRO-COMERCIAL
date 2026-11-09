// Dotación sugerida a partir de las HH calculadas. El LLM nunca calcula cantidades.
import { httpError } from '../../utils/httpError'
import type { Parametros } from '../params'

export interface EntradaDotacion {
  hh: number
  tecnicos?: number
  ayudantes?: number
  /** Días impuestos por el cliente; si se da, no se calculan. */
  jornadas_fijadas?: number
}

export interface ResultadoDotacion {
  personas: number
  dias: number
  hh_calculadas: number
  hh_cotizadas: number
  holgura_hh: number
  advertencias: string[]
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

function entero(valor: unknown, etiqueta: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw httpError(`${etiqueta} debe ser un número.`, 422)
  }
  if (!Number.isInteger(valor) || valor < 0) {
    throw httpError(`${etiqueta} debe ser un entero no negativo.`, 422)
  }
  return valor
}

export function sugerirDotacion(input: EntradaDotacion, params: Parametros): ResultadoDotacion {
  const { eficiencia, horas_jornada } = params.hh
  if (
    !Number.isFinite(eficiencia) ||
    !Number.isFinite(horas_jornada) ||
    eficiencia <= 0 ||
    eficiencia > 1 ||
    horas_jornada <= 0
  ) {
    throw httpError('Los parámetros de horas-hombre no son válidos.', 422)
  }
  if (typeof input.hh !== 'number' || !Number.isFinite(input.hh)) {
    throw httpError('Las horas-hombre deben ser un número.', 422)
  }
  if (input.hh < 0) throw httpError('Las horas-hombre no pueden ser negativas.', 422)

  const tecnicos = input.tecnicos === undefined ? 1 : entero(input.tecnicos, 'Los técnicos')
  const ayudantes = input.ayudantes === undefined ? 1 : entero(input.ayudantes, 'Los ayudantes')
  const personas = tecnicos + ayudantes
  if (personas < 1) throw httpError('La dotación debe tener al menos una persona.', 422)

  const advertencias: string[] = []
  let dias: number
  let hhCotizadas: number
  if (input.jornadas_fijadas !== undefined && input.jornadas_fijadas !== null) {
    const j = input.jornadas_fijadas
    if (typeof j !== 'number' || !Number.isFinite(j)) {
      throw httpError('Las jornadas fijadas deben ser un número.', 422)
    }
    if (!Number.isInteger(j) || j < 1) {
      throw httpError('Las jornadas fijadas deben ser un entero positivo.', 422)
    }
    dias = j
    hhCotizadas = personas * j * horas_jornada
  } else {
    // Se redondea la razón a 6 decimales para que el punto flotante no sume un día de más.
    const razon = Math.round((input.hh / (personas * horas_jornada * eficiencia)) * 1e6) / 1e6
    // Mínimo 1 día: aun con 0 HH la visita se cotiza como una jornada.
    dias = Math.max(1, Math.ceil(razon))
    hhCotizadas = input.hh
  }
  const holgura = Math.round((hhCotizadas - input.hh) * 100) / 100
  if (holgura < 0) {
    advertencias.push(
      `${dias === 1 ? 'La jornada fijada no alcanza' : `Las ${dias} jornadas fijadas no alcanzan`}: faltan ${fmt(-holgura)} HH respecto de lo calculado.`
    )
  }
  return {
    personas,
    dias,
    hh_calculadas: input.hh,
    hh_cotizadas: hhCotizadas,
    holgura_hh: holgura,
    advertencias,
  }
}
