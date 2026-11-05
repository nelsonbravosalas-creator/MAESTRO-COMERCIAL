// Calculadora de remuneraciones: del sueldo líquido de un trabajador a su
// costo empresa por día trabajado. Porta `calcular_perfil` (modo líquido,
// dotación 1) del motor de costeo de la oficina de propuestas
// (plugin oficina-de-propuestas 0.2.0, motor_costeo/motor/capa4_remuneraciones.py)
// y sus reglas de redondeo. Función pura: no toca la base de datos.

import type { RemuneracionParametros, PerfilInputs } from '../schemas/remuneraciones'

export type { RemuneracionParametros, PerfilInputs }

// Valores de parametros_legales.json (revisado 2026-10-24) y de las hojas
// Leyes_Sociales y Dotacion. Personal del libro COSTEO INTEGRADO.
export const DEFAULT_PARAMETROS: RemuneracionParametros = {
  imm: 500000,
  uf: 39744,
  utm: 66500,
  topeAfpSaludSisUf: 84.3,
  topeAfcUf: 126.6,
  gratificacionTopeImm: 4.75,
  diasBaseMes: 30,
  diasTrabajadosMes: 20,
  horasFactorHe: 28,
  factorHoraExtra: 1.5,
  afpFondo: 0.1,
  afpComision: 0.0144,
  salud: 0.07,
  afcTrabajadorIndefinido: 0.006,
  afcTrabajadorPlazoFijo: 0,
  sis: 0.0149,
  mutualBasica: 0.009,
  mutualSanna: 0.0003,
  mutualAdicional: 0.0085,
  afcPatronalIndefCic: 0.016,
  afcPatronalIndefFcs: 0.008,
  afcPatronalPlazoFijo: 0.03,
  seguroElectrico: 0.0348,
  provisionVacaciones: 0.0417,
  provisionIas: 0.0833,
  movilizacionDiaria: 2000,
  diasMovilizacion: 30,
  colacionDiaria: 11000,
  diasColacion: 21,
  bonoVacacionesAnual: 0,
  aguinaldoFiestasPatriasAnual: 50000,
  aguinaldoNavidadAnual: 50000,
  // Por defecto el IUSC lo retiene el trabajador y no entra al costo empresa.
  // Solo se suma si la empresa garantiza el líquido (ver calcularPerfil).
  incluirIuscCosto: false,
  iuscTramos: [
    { hasta: 13.5, tasa: 0, rebajaUtm: 0 },
    { hasta: 30, tasa: 0.04, rebajaUtm: 0.54 },
    { hasta: 50, tasa: 0.08, rebajaUtm: 1.74 },
    { hasta: 70, tasa: 0.135, rebajaUtm: 4.49 },
    { hasta: 90, tasa: 0.23, rebajaUtm: 11.14 },
    { hasta: 120, tasa: 0.304, rebajaUtm: 17.8 },
    { hasta: 310, tasa: 0.35, rebajaUtm: 23.32 },
    { hasta: null, tasa: 0.4, rebajaUtm: 30.82 },
  ],
}

// Redondeo al estilo Excel: la mitad se aleja de cero (replica util.py).
export function xround(x: number, n = 0): number {
  const factor = 10 ** n
  const v = Math.abs(x) * factor
  const r = Math.floor(v + 0.5 + 1e-9) / factor
  return x >= 0 ? r : -r
}

export function topesDerivados(p: RemuneracionParametros) {
  return {
    topeGratificacion: xround((p.gratificacionTopeImm * p.imm) / 12),
    topeAfpSaludClp: xround(p.topeAfpSaludSisUf * p.uf),
    topeAfcClp: xround(p.topeAfcUf * p.uf),
  }
}

// Impuesto único mensual según tramos en UTM (tabla SII). El primer tramo
// está exento: su límite superior es el tope de exención.
function iuscPorTrabajador(baseTributable: number, p: RemuneracionParametros): number {
  const exento = p.iuscTramos[0].hasta ?? 0
  if (baseTributable <= exento * p.utm) return 0
  for (const tramo of p.iuscTramos) {
    if (tramo.hasta === null || baseTributable <= tramo.hasta * p.utm) {
      return Math.max(0, baseTributable * tramo.tasa - tramo.rebajaUtm * p.utm)
    }
  }
  return 0
}

function tasasContrato(
  tipo: PerfilInputs['tipoContrato'],
  electrico: boolean,
  p: RemuneracionParametros
) {
  const indefinido = tipo === 'Indefinido'
  const afcTrab = indefinido ? p.afcTrabajadorIndefinido : p.afcTrabajadorPlazoFijo
  const afcPat = indefinido ? p.afcPatronalIndefCic + p.afcPatronalIndefFcs : p.afcPatronalPlazoFijo
  return {
    afcTrab,
    afcPat,
    electrico: electrico ? p.seguroElectrico : 0,
    tDesc: p.afpFondo + p.afpComision + p.salud + afcTrab,
  }
}

// Base y gratificación Art. 50 a partir del imponible sin fijos.
// La gratificación es 25 % de la base, con tope: I = B + MIN(25 % × B, tope).
function splitBase(imponibleSinFijos: number, tope: number) {
  const baseSinTope = imponibleSinFijos / 1.25
  if (0.25 * baseSinTope <= tope) {
    const base = xround(baseSinTope)
    return { base, gratificacion: Math.min(xround(0.25 * base), tope) }
  }
  return { base: imponibleSinFijos - tope, gratificacion: tope }
}

interface ContextoDespeje {
  p: RemuneracionParametros
  tasas: ReturnType<typeof tasasContrato>
  tope: number
  topeAfp: number
  topeAfc: number
  // Bono de vacaciones y aguinaldos mensualizados: imponibles, no dependen del sueldo.
  fijos: number
  noImponible: number
}

// Líquido que resulta de un imponible total, con el mismo cálculo de descuentos
// que usa calcularPerfil (AFP, salud, AFC e impuesto único).
function liquidoPara(imponibleTotal: number, c: ContextoDespeje): number {
  const { base, gratificacion } = splitBase(imponibleTotal - c.fijos, c.tope)
  const imponible = base + gratificacion + c.fijos
  const afp = xround(Math.min(imponible, c.topeAfp) * (c.p.afpFondo + c.p.afpComision))
  const salud = xround(Math.min(imponible, c.topeAfp) * c.p.salud)
  const afcTrabajador = xround(Math.min(imponible, c.topeAfc) * c.tasas.afcTrab)
  const iusc = xround(iuscPorTrabajador(imponible - (afp + salud + afcTrabajador), c.p))
  return imponible + c.noImponible - (afp + salud + afcTrabajador + iusc)
}

// Imponible total que deja el líquido objetivo. El impuesto único hace que el
// líquido no sea lineal en el imponible, así que se busca por bisección (el
// líquido crece con el imponible).
function imponibleParaLiquido(objetivo: number, c: ContextoDespeje): number {
  let lo = 0
  let hi = 2 * objetivo + 1_000_000
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (liquidoPara(mid, c) < objetivo) lo = mid
    else hi = mid
  }
  return xround(hi)
}

export interface RemuneracionResultado {
  inputs: PerfilInputs
  base: number
  gratificacion: number
  imponible: number
  haberes: number
  afp: number
  salud: number
  afcTrabajador: number
  iusc: number
  descuentos: number
  liquido: number
  sis: number
  mutual: number
  afcPatronal: number
  seguroElectrico: number
  seguros: number
  provisionVacaciones: number
  provisionIas: number
  costoCajaMensual: number
  costoLicitacionMensual: number
  costoLicitacionDiarioPlanilla: number
  valorJornada: number
  valorHoraOrdinaria: number
  horaExtra50: number
  costoHoraExtra50: number
  factorK: number
  alertas: string[]
}

export function calcularPerfil(
  inputs: PerfilInputs,
  p: RemuneracionParametros
): RemuneracionResultado {
  const { topeGratificacion, topeAfpSaludClp, topeAfcClp } = topesDerivados(p)
  const tasas = tasasContrato(inputs.tipoContrato, inputs.seguroElectrico, p)
  const bono = xround(inputs.bonoVacacionesAnual / 12)
  const aguinaldoFp = xround(inputs.aguinaldoFiestasPatriasAnual / 12)
  const aguinaldoNav = xround(inputs.aguinaldoNavidadAnual / 12)
  const fijos = bono + aguinaldoFp + aguinaldoNav
  const contexto: ContextoDespeje = {
    p,
    tasas,
    tope: topeGratificacion,
    topeAfp: topeAfpSaludClp,
    topeAfc: topeAfcClp,
    fijos,
    noImponible: xround(inputs.movilizacionMensual) + xround(inputs.colacionMensual),
  }
  const imponibleObjetivo = imponibleParaLiquido(inputs.sueldoLiquido, contexto)
  const { base, gratificacion } = splitBase(imponibleObjetivo - fijos, topeGratificacion)

  const imponible = base + gratificacion + fijos
  const movilizacion = xround(inputs.movilizacionMensual)
  const colacion = xround(inputs.colacionMensual)
  const haberes = imponible + movilizacion + colacion

  // Descuentos del trabajador, con topes en UF
  const imponibleAfp = Math.min(imponible, topeAfpSaludClp)
  const imponibleAfc = Math.min(imponible, topeAfcClp)
  const afp = xround(imponibleAfp * (p.afpFondo + p.afpComision))
  const salud = xround(imponibleAfp * p.salud)
  const afcTrabajador = xround(imponibleAfc * tasas.afcTrab)
  const baseTributable = imponible - (afp + salud + afcTrabajador)
  const iusc = xround(iuscPorTrabajador(baseTributable, p))
  const descuentos = afp + salud + afcTrabajador + iusc
  const liquido = haberes - descuentos

  // Seguros patronales
  const sis = xround(imponibleAfp * p.sis)
  const mutual =
    xround(imponibleAfp * (p.mutualBasica + p.mutualSanna)) +
    xround(imponibleAfp * p.mutualAdicional)
  const afcPatronal = xround(imponibleAfc * tasas.afcPat)
  const seguroElectrico = xround(imponible * tasas.electrico)
  const seguros = sis + mutual + afcPatronal + seguroElectrico

  // Provisiones
  const provisionVacaciones = xround(imponible * p.provisionVacaciones)
  const provisionIas = xround(imponible * p.provisionIas)

  const costoCaja = haberes + seguros
  const costoLicitacion = costoCaja + provisionVacaciones + provisionIas
  const costoLicitacionDiarioPlanilla = xround(costoLicitacion / p.diasBaseMes)
  // Valor que vuelve al precio unitario de la jornada: costo empresa mensual ÷ 20 días
  // trabajados (diasTrabajadosMes). El IUSC entra al total solo con incluirIuscCosto
  // (false por defecto: lo retiene el trabajador). Sin costos fuera de planilla.
  // Diferencia intencional con el motor Python (oficina-de-propuestas, capa2_parametros):
  // allí INCLUIR_IUSC_COSTO = 1 por defecto; aquí el default es 0. Es la única diferencia
  // de criterio entre motores; con INCLUIR_IUSC_COSTO = 0 ambos dan el mismo costo mensual.
  // El divisor 20 no viene del motor (que divide por DIAS_BASE_MES = 30 en su planilla).
  const valorJornada = xround(
    (costoLicitacion + (p.incluirIuscCosto ? iusc : 0)) / p.diasTrabajadosMes
  )

  // Horas extra (Art. 30 y 32 CT): la base es el sueldo base contractual
  const valorHoraOrdinaria = xround(
    (base / p.diasBaseMes) * (p.horasFactorHe / inputs.jornadaSemanal)
  )
  const horaExtra50 = xround(valorHoraOrdinaria * p.factorHoraExtra)
  const tasaCargasHe =
    p.sis + p.mutualBasica + p.mutualSanna + p.mutualAdicional + tasas.afcPat + tasas.electrico
  const costoHoraExtra50 = xround(horaExtra50 * (1 + tasaCargasHe))

  const alertas: string[] = []
  // El ingreso mínimo se compara con el total de haberes (imponibles + no imponibles).
  if (haberes < p.imm) alertas.push(`Total haberes ${haberes} bajo el ingreso mínimo (${p.imm}).`)

  return {
    inputs,
    base,
    gratificacion,
    imponible,
    haberes,
    afp,
    salud,
    afcTrabajador,
    iusc,
    descuentos,
    liquido,
    sis,
    mutual,
    afcPatronal,
    seguroElectrico,
    seguros,
    provisionVacaciones,
    provisionIas,
    costoCajaMensual: costoCaja,
    costoLicitacionMensual: costoLicitacion,
    costoLicitacionDiarioPlanilla,
    valorJornada,
    valorHoraOrdinaria,
    horaExtra50,
    costoHoraExtra50,
    factorK: liquido > 0 ? costoLicitacion / liquido : 0,
    alertas,
  }
}
