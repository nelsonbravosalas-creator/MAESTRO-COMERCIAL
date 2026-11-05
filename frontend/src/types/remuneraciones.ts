// Calculadora de remuneraciones (Mano de Obra). Espejo de los tipos del backend
// (backend/src/schemas/remuneraciones.ts y backend/src/services/remuneraciones.ts):
// el cálculo vive en el servidor, aquí solo se tipan las respuestas.

export type TipoContrato = 'Indefinido' | 'Plazo Fijo'

// Lo que se ingresa por perfil.
export interface PerfilInputs {
  sueldoLiquido: number
  tipoContrato: TipoContrato
  jornadaSemanal: number
  seguroElectrico: boolean
  colacionMensual: number
  movilizacionMensual: number
  bonoVacacionesAnual: number
  aguinaldoFiestasPatriasAnual: number
  aguinaldoNavidadAnual: number
}

export interface IuscTramo {
  hasta: number | null
  tasa: number
  rebajaUtm: number
}

// Parámetros legales y de dotación, con los nombres de las hojas
// Leyes_Sociales y Dotacion. Personal. Las tasas van como fracción (0,07 = 7 %).
export interface RemuneracionParametros {
  imm: number
  uf: number
  utm: number
  topeAfpSaludSisUf: number
  topeAfcUf: number
  gratificacionTopeImm: number
  diasBaseMes: number
  diasTrabajadosMes: number
  horasFactorHe: number
  factorHoraExtra: number
  afpFondo: number
  afpComision: number
  salud: number
  afcTrabajadorIndefinido: number
  afcTrabajadorPlazoFijo: number
  sis: number
  mutualBasica: number
  mutualSanna: number
  mutualAdicional: number
  afcPatronalIndefCic: number
  afcPatronalIndefFcs: number
  afcPatronalPlazoFijo: number
  seguroElectrico: number
  provisionVacaciones: number
  provisionIas: number
  movilizacionDiaria: number
  diasMovilizacion: number
  colacionDiaria: number
  diasColacion: number
  bonoVacacionesAnual: number
  aguinaldoFiestasPatriasAnual: number
  aguinaldoNavidadAnual: number
  incluirIuscCosto: boolean
  iuscTramos: IuscTramo[]
}

export interface RemuneracionTopes {
  topeGratificacion: number
  topeAfpSaludClp: number
  topeAfcClp: number
}

export interface RemuneracionParametrosResponse {
  parametrosId: string | null
  params: RemuneracionParametros
  topes: RemuneracionTopes
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

// Perfil guardado (una fila de remuneraciones_perfiles).
export interface PerfilGuardado {
  catalog_item_id: string
  inputs: PerfilInputs
  resultado: RemuneracionResultado
  costo_diario: number
  updated_at: string
}

export interface RecalculoItem {
  catalogItemId: string
  precioAnterior: number
  precioNuevo: number
}
