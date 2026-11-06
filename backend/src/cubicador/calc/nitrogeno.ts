// Calculadora determinista de nitrógeno. El LLM nunca calcula cantidades.
import { httpError } from '../../utils/httpError'
import type { Parametros } from '../params'

export interface EntradaNitrogeno {
  volumen_l: number
  presion_barg: number
  /** Presión máxima de la placa del equipo; si se da, topa `presion_barg`. */
  presion_max_placa_barg?: number
  minutos_soldadura: number
  /** Barridos de flushing; 0 o ausente = sin flushing. */
  barridos?: number
}

export interface ResultadoNitrogeno {
  m3: number
  balones: number
  formula: string
  advertencias: string[]
}

const fmt = (n: number, dec: number) => n.toFixed(dec).replace('.', ',')

type Genero = 'm' | 'f' | 'mp'

function numeroNoNegativo(valor: unknown, etiqueta: string, genero: Genero = 'm'): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw httpError(
      `${etiqueta} ${genero === 'mp' ? 'deben ser números' : 'debe ser un número'}.`,
      422
    )
  }
  if (valor < 0) {
    const neg = {
      m: 'no puede ser negativo',
      f: 'no puede ser negativa',
      mp: 'no pueden ser negativos',
    }
    throw httpError(`${etiqueta} ${neg[genero]}.`, 422)
  }
  return valor
}

function limpio(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '')
}

/** Presión de prueba por refrigerante; `supuesto` indica que se usó el valor genérico. */
export function presionPrueba(
  refrigerante: string,
  params: Parametros
): { barg: number; supuesto: boolean } {
  const tabla = params.nitrogeno.presion_prueba_barg
  const clave = Object.keys(tabla).find(
    k => k !== 'default' && limpio(k) === limpio(String(refrigerante))
  )
  const valor = clave !== undefined ? tabla[clave] : tabla.default
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw httpError('Los parámetros de presión de prueba no son válidos.', 422)
  }
  return { barg: valor, supuesto: clave === undefined }
}

export function calcularNitrogeno(input: EntradaNitrogeno, params: Parametros): ResultadoNitrogeno {
  const n = params.nitrogeno
  if (
    ![n.caudal_lpm, n.holgura, n.balon_m3, n.presion_barrido_barg].every(Number.isFinite) ||
    n.balon_m3 <= 0 ||
    n.caudal_lpm < 0 ||
    n.holgura <= 0 ||
    n.presion_barrido_barg < 0
  ) {
    throw httpError('Los parámetros de nitrógeno no son válidos.', 422)
  }

  const volumen = numeroNoNegativo(input.volumen_l, 'El volumen')
  const presionPedida = numeroNoNegativo(input.presion_barg, 'La presión', 'f')
  const minutos = numeroNoNegativo(input.minutos_soldadura, 'Los minutos de soldadura', 'mp')
  const barridos =
    input.barridos === undefined || input.barridos === null
      ? 0
      : numeroNoNegativo(input.barridos, 'Los barridos', 'mp')

  let presion = presionPedida
  const advertencias: string[] = []
  const placa = input.presion_max_placa_barg
  if (placa !== undefined && placa !== null) {
    if (typeof placa !== 'number' || !Number.isFinite(placa) || placa <= 0) {
      throw httpError('La presión máxima de placa debe ser un número mayor que cero.', 422)
    }
    if (placa < presionPedida) {
      presion = placa
      advertencias.push(
        `La presión se limitó a ${fmt(placa, 1)} barg por la placa del equipo (se pedían ${fmt(presionPedida, 1)} barg).`
      )
    }
  }

  const litrosPresion = volumen * presion
  const litrosSoldadura = n.caudal_lpm * minutos
  const litrosFlushing = barridos > 0 ? volumen * n.presion_barrido_barg * barridos : 0
  const litros = (litrosPresion + litrosSoldadura + litrosFlushing) * n.holgura

  // Se redondea a 2 decimales en m3 y los balones se calculan sobre ese valor.
  const m3 = Math.round(litros / 10) / 100
  const balones = m3 > 0 ? Math.ceil(m3 / n.balon_m3) : 0

  const partes = [
    `${fmt(volumen, 2)} × ${fmt(presion, 2)}`,
    `${fmt(n.caudal_lpm, 0)} × ${fmt(minutos, 0)}`,
  ]
  if (litrosFlushing > 0) {
    partes.push(
      `${fmt(volumen, 2)} × ${fmt(n.presion_barrido_barg, 0)} × ${fmt(barridos, 0)} = ${fmt(litrosFlushing * n.holgura, 1)}`
    )
  }
  const formula = `(${partes.join(' + ')}) × ${fmt(n.holgura, 2)} = ${fmt(litros, 1)} L = ${fmt(m3, 2)} m³`
  return { m3, balones, formula, advertencias }
}
