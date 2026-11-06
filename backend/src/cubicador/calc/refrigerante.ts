// Calculadora determinista de refrigerante. El LLM nunca calcula cantidades.
import { httpError } from '../../utils/httpError'
import type { Parametros, Refrigerante } from '../params'

export interface Linea {
  diametro: string
  largo_m: number
}

export interface EntradaRefrigerante {
  tipo_trabajo: string
  sistema: string
  refrigerante: string
  metodo: 'total' | 'bombeo'
  carga_placa_kg?: number
  /** Largo de linea que el equipo ya trae cargado (solo instalacion). */
  largo_incluido_m: number
  lineas: { liquido: Linea; gas: Linea }
  reutilizable_kg: number
}

export interface ResultadoRefrigerante {
  kg: number
  cilindros: number
  kg_cilindro: number
  sobrante_kg: number
  formula: string
  advertencias: string[]
}

const SISTEMAS = ['split', 'multisplit', 'vrf', 'precision', 'camara', 'central']
const METODOS = ['total', 'bombeo']

const r1 = (n: number) => Math.round(n * 10) / 10
const fmt = (n: number, dec: number) => n.toFixed(dec).replace('.', ',')

function normalizarDiametro(d: string): string {
  return String(d)
    .toLowerCase()
    .replace(/["”″']/g, '')
    .replace(/(pulgadas|pulgada|pulg|in)\b/g, '')
    .replace(/\s+/g, '')
}

function buscarRefrigerante(
  nombre: string,
  params: Parametros
): { clave: string; datos: Refrigerante } {
  const limpio = (s: string) => s.toUpperCase().replace(/[\s-]/g, '')
  const clave = Object.keys(params.refrigerantes).find(k => limpio(k) === limpio(String(nombre)))
  if (!clave) throw httpError(`Refrigerante desconocido: ${nombre}`, 422)
  const datos = params.refrigerantes[clave]
  if (
    !Number.isFinite(datos.densidad_liquido_kg_l) ||
    !Number.isFinite(datos.kg_cilindro) ||
    datos.kg_cilindro <= 0
  ) {
    throw httpError(`Los parámetros del refrigerante ${clave} no son válidos`, 422)
  }
  return { clave, datos }
}

function validarLargo(largo: unknown): void {
  if (typeof largo !== 'number' || !Number.isFinite(largo) || largo < 0) {
    throw httpError('El largo de la línea debe ser un número mayor o igual a cero', 422)
  }
}

function numeroNoNegativo(valor: unknown, etiqueta: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw httpError(`${etiqueta} debe ser un número.`, 422)
  }
  if (valor < 0) throw httpError(`${etiqueta} no puede ser negativa.`, 422)
  return valor
}

/** Volumen interior de la linea en litros: pi/4 x d² por metro. */
export function volumenLinea(diam: string, largoM: number, params: Parametros): number {
  const dMm = params.cobre[normalizarDiametro(diam)]
  if (dMm === undefined || !Number.isFinite(dMm)) {
    throw httpError(
      `Diámetro de cobre desconocido: ${diam}. Diámetros válidos: ${Object.keys(params.cobre).join(', ')}`,
      422
    )
  }
  validarLargo(largoM)
  const dDm = dMm / 100 // mm -> dm
  return (Math.PI / 4) * dDm * dDm * (largoM * 10) // dm² x dm = litros
}

export function calcularRefrigerante(
  input: EntradaRefrigerante,
  params: Parametros
): ResultadoRefrigerante {
  if (!METODOS.includes(input.metodo)) {
    throw httpError(`Método desconocido: ${String(input.metodo)}. Use total o bombeo.`, 422)
  }
  if (!SISTEMAS.includes(input.sistema)) {
    throw httpError(`Sistema desconocido: ${String(input.sistema)}.`, 422)
  }
  const { clave, datos } = buscarRefrigerante(input.refrigerante, params)
  const esInstalacion = input.tipo_trabajo === 'instalacion'

  const reutilizable = numeroNoNegativo(input.reutilizable_kg ?? 0, 'El refrigerante reutilizable')
  let placa = 0
  if (input.carga_placa_kg !== undefined && input.carga_placa_kg !== null) {
    if (typeof input.carga_placa_kg !== 'number' || !Number.isFinite(input.carga_placa_kg)) {
      throw httpError('La carga de placa debe ser un número.', 422)
    }
    placa = input.carga_placa_kg
  }
  if (input.metodo === 'total' && !esInstalacion && !(placa > 0)) {
    throw httpError(
      'La carga de placa es obligatoria cuando se recupera todo el refrigerante.',
      422
    )
  }
  numeroNoNegativo(placa, 'La carga de placa')

  const advertencias: string[] = []
  let kg: number
  let formula: string

  if (input.metodo === 'bombeo') {
    const { tramo, merma, holgura } = params.bombeo
    if (![tramo, merma, holgura].every(Number.isFinite)) {
      throw httpError('Los parámetros de bombeo no son válidos.', 422)
    }
    kg = r1(tramo + merma + holgura)
    formula = `${fmt(tramo, 1)} + ${fmt(merma, 1)} + ${fmt(holgura, 1)} = ${fmt(kg, 1)} kg`
  } else {
    if (!Number.isFinite(params.merma_pct) || params.merma_pct < 0) {
      throw httpError('El parámetro de merma no es válido.', 422)
    }
    const liq = input.lineas?.liquido
    if (!liq) throw httpError('Falta la línea de líquido.', 422)
    const gas = input.lineas?.gas
    const conVapor = input.sistema === 'camara' || input.sistema === 'central'
    if (!gas && conVapor) throw httpError('Falta la línea de gas (succión).', 422)

    // Instalacion: el equipo trae cargado el largo incluido; solo se cobra el exceso.
    const largoCobrado = (largo: number) =>
      esInstalacion ? Math.max(0, largo - (input.largo_incluido_m ?? 0)) : largo
    const kgLiquido =
      volumenLinea(liq.diametro, largoCobrado(liq.largo_m), params) * datos.densidad_liquido_kg_l
    let kgVapor = 0
    let nota = ''
    if (gas) {
      // Valida el diametro de gas aunque no aporte masa.
      const litrosGas = volumenLinea(gas.diametro, largoCobrado(gas.largo_m), params)
      if (conVapor) {
        if (datos.densidad_vapor_kg_l !== undefined && Number.isFinite(datos.densidad_vapor_kg_l)) {
          kgVapor = litrosGas * datos.densidad_vapor_kg_l
        } else {
          const aviso = `No se incluyó el vapor de la línea de succión: falta la densidad de vapor de ${clave} en los parámetros.`
          advertencias.push(aviso)
          nota = ' (sin vapor de succión)'
        }
      }
    }
    const base = esInstalacion ? 0 : placa
    const factorMerma = 1 + params.merma_pct / 100
    const neto = Math.max(0, base + kgLiquido + kgVapor - reutilizable)
    kg = r1(neto * factorMerma)

    const partes = [fmt(base, 1), fmt(kgLiquido, 2)]
    if (kgVapor > 0) partes.push(fmt(kgVapor, 2))
    const suma = partes.join(' + ')
    const cuenta = reutilizable > 0 ? `(${suma} − ${fmt(reutilizable, 1)})` : `(${suma})`
    formula = `${cuenta} × ${fmt(factorMerma, 2)} = ${fmt(kg, 1)} kg${nota}`
  }

  const cilindros = kg > 0 ? Math.ceil(kg / datos.kg_cilindro) : 0
  const sobrante_kg = r1(cilindros * datos.kg_cilindro - kg)
  return {
    kg,
    cilindros,
    kg_cilindro: datos.kg_cilindro,
    sobrante_kg,
    formula: `${clave}: ${formula}`,
    advertencias,
  }
}
