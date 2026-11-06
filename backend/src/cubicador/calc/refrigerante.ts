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
}

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
  return { clave, datos: params.refrigerantes[clave] }
}

function validarLargo(largo: number): void {
  if (typeof largo !== 'number' || !Number.isFinite(largo) || largo < 0) {
    throw httpError('El largo de la línea debe ser un número mayor o igual a cero', 422)
  }
}

/** Volumen interior de la linea en litros: pi/4 x d² por metro. */
export function volumenLinea(diam: string, largoM: number, params: Parametros): number {
  const dMm = params.cobre[normalizarDiametro(diam)]
  if (dMm === undefined) throw httpError(`Diámetro de cobre desconocido: ${diam}`, 422)
  validarLargo(largoM)
  const dDm = dMm / 100 // mm -> dm
  return (Math.PI / 4) * dDm * dDm * (largoM * 10) // dm² x dm = litros
}

export function calcularRefrigerante(
  input: EntradaRefrigerante,
  params: Parametros
): ResultadoRefrigerante {
  const { clave, datos } = buscarRefrigerante(input.refrigerante, params)
  const placa = input.carga_placa_kg ?? 0
  if (!Number.isFinite(placa) || placa < 0) {
    throw httpError('La carga de placa no puede ser negativa', 422)
  }
  if (!Number.isFinite(input.reutilizable_kg) || input.reutilizable_kg < 0) {
    throw httpError('El refrigerante reutilizable no puede ser negativo', 422)
  }
  validarLargo(input.lineas.liquido.largo_m)
  validarLargo(input.lineas.gas.largo_m)

  let kg: number
  let formula: string

  if (input.metodo === 'bombeo') {
    const { tramo, merma, holgura } = params.bombeo
    kg = r1(tramo + merma + holgura)
    formula = `${fmt(tramo, 1)} + ${fmt(merma, 1)} + ${fmt(holgura, 1)} = ${fmt(kg, 1)} kg`
  } else {
    const esInstalacion = input.tipo_trabajo === 'instalacion'
    // Instalacion: el equipo trae cargado el largo incluido; solo se cobra el exceso.
    const largoCobrado = (largo: number) =>
      esInstalacion ? Math.max(0, largo - input.largo_incluido_m) : largo
    const liq = input.lineas.liquido
    const gas = input.lineas.gas
    const kgLiquido =
      volumenLinea(liq.diametro, largoCobrado(liq.largo_m), params) * datos.densidad_liquido_kg_l
    const conVapor = input.sistema === 'camara' || input.sistema === 'central'
    // Valida el diametro de gas aunque no aporte masa.
    const litrosGas = volumenLinea(gas.diametro, largoCobrado(gas.largo_m), params)
    const kgVapor =
      conVapor && datos.densidad_vapor_kg_l !== undefined
        ? litrosGas * datos.densidad_vapor_kg_l
        : 0
    const base = esInstalacion ? 0 : placa
    const factorMerma = 1 + params.merma_pct / 100
    const neto = Math.max(0, base + kgLiquido + kgVapor - input.reutilizable_kg)
    kg = r1(neto * factorMerma)

    const partes = [fmt(base, 1), fmt(kgLiquido, 2)]
    if (kgVapor > 0) partes.push(fmt(kgVapor, 2))
    const suma = partes.join(' + ')
    const cuenta =
      input.reutilizable_kg > 0 ? `(${suma} − ${fmt(input.reutilizable_kg, 1)})` : `(${suma})`
    formula = `${cuenta} × ${fmt(factorMerma, 2)} = ${fmt(kg, 1)} kg`
  }

  const cilindros = kg > 0 ? Math.ceil(kg / datos.kg_cilindro) : 0
  const sobrante_kg = r1(cilindros * datos.kg_cilindro - kg)
  return {
    kg,
    cilindros,
    kg_cilindro: datos.kg_cilindro,
    sobrante_kg,
    formula: `${clave}: ${formula}`,
  }
}
