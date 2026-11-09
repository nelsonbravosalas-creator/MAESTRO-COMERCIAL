// Motor HVAC: integra los calculadores (refrigerante, nitrógeno, HH, dotación)
// en un listado de ítems. El LLM nunca calcula cantidades: solo el código.
import { z } from 'zod'
import { httpError } from '../utils/httpError'
import type { Parametros } from './params'
import type { Ficha, ItemListado, ResultadoCubicacion, Supuesto } from './types'
import { calcularRefrigerante, volumenLinea } from './calc/refrigerante'
import type { EntradaRefrigerante } from './calc/refrigerante'
import { calcularNitrogeno, presionPrueba } from './calc/nitrogeno'
import { calcularHH, listaTareas } from './calc/horasHombre'
import { sugerirDotacion } from './calc/dotacion'

const linea = z.object({
  diametro: z.string().trim().min(1),
  largo_m: z.number().min(0),
})

export const datosHvacSchema = z.object({
  tipo_trabajo: z.enum(['instalacion', 'reparacion', 'mantenimiento']),
  sistema: z.enum(['split', 'multisplit', 'vrf', 'precision', 'camara', 'central']),
  actividad: z.enum(['fuga', 'puesta_a_punto', 'flushing', 'instalacion']).optional(),
  refrigerante: z.string().trim().min(1),
  metodo: z.enum(['total', 'bombeo']).default('total'),
  carga_placa_kg: z.number().min(0).optional(),
  largo_incluido_m: z.number().min(0).default(0),
  lineas: z.object({ liquido: linea, gas: linea.optional() }).optional(),
  volumen_equipos_l: z.number().min(0).optional(),
  alcance_prueba: z.enum(['tramo', 'circuito', 'lineas']).optional(),
  presion_max_placa_barg: z.number().positive().optional(),
  uniones: z.number().int().min(0).optional(),
  reutilizable_kg: z.number().min(0).default(0),
  unidades_interiores: z.number().min(0).optional(),
  unidades_exteriores: z.number().min(0).optional(),
  factor_dificultad: z.number().positive().optional(),
  jornadas_fijadas: z.number().int().positive().optional(),
  tecnicos: z.number().int().min(0).optional(),
  ayudantes: z.number().int().min(0).optional(),
  comuna: z.string().optional(),
  estado_texto: z.string().optional(),
})
export type DatosHvac = z.infer<typeof datosHvacSchema>

/** Volumen supuesto de un tramo abierto (litros) cuando el alcance de la prueba es `tramo`. */
const VOLUMEN_TRAMO_L = 1
const UNIONES_SUPUESTAS = 2

const fmt = (n: number, dec = 1) => n.toFixed(dec).replace('.', ',')
const r2 = (n: number) => Math.round(n * 100) / 100

function sinTildes(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function claveRefrigerante(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '')
}

const CAMPOS_ENUM = ['tipo_trabajo', 'sistema', 'actividad', 'metodo', 'alcance_prueba']

/** Prepara los datos de la ficha para el esquema: sin nulos, enums normalizados y líneas mapeadas. */
function prepararDatos(datos: Record<string, unknown>): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(datos)) {
    if (v !== null && v !== undefined) d[k] = v
  }
  for (const campo of CAMPOS_ENUM) {
    const v = d[campo]
    if (typeof v === 'string') d[campo] = sinTildes(v).trim().replace(/\s+/g, '_')
  }
  if (d.lineas === undefined && d.linea_liquido !== undefined) {
    d.lineas = { liquido: d.linea_liquido, ...(d.linea_gas !== undefined && { gas: d.linea_gas }) }
  }
  return d
}

function parsearDatos(datos: Record<string, unknown>): DatosHvac {
  const r = datosHvacSchema.safeParse(prepararDatos(datos))
  if (r.success) return r.data
  const detalle = r.error.issues
    .map(i => {
      const campo = i.path.length > 0 ? i.path.join('.') : 'datos'
      return i.code === 'invalid_type' && i.input === undefined
        ? `falta el campo "${campo}"`
        : `el campo "${campo}" no es válido`
    })
    .join('; ')
  throw httpError(`Los datos de la ficha HVAC no son válidos: ${detalle}.`, 422)
}

function validarParametros(params: Parametros): void {
  const { min_por_union, barridos_flushing } = params.nitrogeno
  if (typeof min_por_union !== 'number' || !Number.isFinite(min_por_union) || min_por_union < 0) {
    throw httpError('El parámetro de minutos de soldadura por unión no es válido.', 422)
  }
  if (
    typeof barridos_flushing !== 'number' ||
    !Number.isFinite(barridos_flushing) ||
    barridos_flushing < 0
  ) {
    throw httpError('El parámetro de barridos de flushing no es válido.', 422)
  }
  if (
    typeof params.placa_supuesta_kg !== 'number' ||
    !Number.isFinite(params.placa_supuesta_kg) ||
    params.placa_supuesta_kg <= 0
  ) {
    throw httpError('El parámetro de carga de placa supuesta no es válido.', 422)
  }
}

function advertenciasRefrigerante(refrigerante: string): string[] {
  const k = claveRefrigerante(refrigerante)
  if (k === 'R404A') {
    return [
      'R-404A: refrigerante de alto potencial de calentamiento global; verificar su disponibilidad y precio.',
    ]
  }
  if (k === 'R22') {
    return [
      'R-22: refrigerante descontinuado; verificar su disponibilidad y evaluar un retrofit antes de cotizar.',
    ]
  }
  if (k === 'R32') {
    return [
      'R-32: refrigerante inflamable (A2L); verificar la carga máxima permitida según el tamaño del local y eliminar fuentes de ignición. La carga máxima no se calcula aquí.',
    ]
  }
  return []
}

function hayQuemado(estado: string | undefined): boolean {
  if (!estado) return false
  const t = sinTildes(estado)
  return t.includes('quemad') || t.includes('acido')
}

function item(
  id: string,
  categoria: ItemListado['categoria'],
  descripcion: string,
  unidad: string,
  cantidad: number,
  formula: string,
  dias = 1
): ItemListado {
  return {
    id,
    categoria,
    descripcion,
    unidad,
    cantidad,
    dias,
    formula,
    precio_unitario: null,
    fuente: null,
    estado_precio: 'pendiente',
  }
}

export function motorHvac(ficha: Ficha, params: Parametros): ResultadoCubicacion {
  const d = parsearDatos(ficha.datos)
  if (d.tipo_trabajo === 'mantenimiento') {
    throw httpError(
      'El mantenimiento aún no se cubica con este motor; use la herramienta cubicar_especificacion_hvac.',
      422
    )
  }
  validarParametros(params)

  const esInstalacion = d.tipo_trabajo === 'instalacion' || d.actividad === 'instalacion'
  const quemado = hayQuemado(d.estado_texto)
  const actividad = d.actividad ?? (esInstalacion ? 'instalacion' : 'fuga')
  const flushing = actividad === 'flushing' || quemado
  const alcance =
    d.alcance_prueba ??
    (actividad === 'puesta_a_punto' ? 'tramo' : actividad === 'instalacion' ? 'lineas' : 'circuito')

  const supuestos: Supuesto[] = [...ficha.supuestos]
  const agregarSupuesto = (s: Supuesto) => {
    if (!supuestos.some(x => x.clave === s.clave)) supuestos.push(s)
  }
  const advertencias: string[] = [...advertenciasRefrigerante(d.refrigerante)]

  // Refrigerante a reutilizar: con compresor quemado se asume gas nuevo.
  let reutilizable = d.reutilizable_kg
  if (quemado) {
    if (reutilizable > 0) {
      advertencias.push(
        `Compresor quemado o aceite ácido: se asume refrigerante nuevo, por eso el refrigerante reutilizable indicado (${fmt(reutilizable)} kg) se dejó en 0.`
      )
    }
    reutilizable = 0
  }

  // Carga de placa: si no se conoce, se usa el supuesto y se marca crítico.
  let placa = d.carga_placa_kg
  if (d.metodo === 'total' && !esInstalacion && !(placa !== undefined && placa > 0)) {
    placa = params.placa_supuesta_kg
    agregarSupuesto({
      clave: 'carga_placa_kg',
      texto: `Se asumió una carga de placa de ${fmt(placa)} kg porque no se conoce; debe leerse en la placa del equipo en terreno.`,
      critico: true,
    })
  }

  const ref = calcularRefrigerante(
    {
      tipo_trabajo: esInstalacion ? 'instalacion' : d.tipo_trabajo,
      sistema: d.sistema,
      refrigerante: d.refrigerante,
      metodo: d.metodo,
      carga_placa_kg: placa,
      largo_incluido_m: d.largo_incluido_m,
      lineas: d.lineas as EntradaRefrigerante['lineas'],
      reutilizable_kg: reutilizable,
    },
    params
  )
  advertencias.push(...ref.advertencias)

  // Volumen a presurizar según el alcance de la prueba.
  let volumen: number
  if (alcance === 'tramo') {
    volumen = VOLUMEN_TRAMO_L
  } else {
    if (!d.lineas) {
      throw httpError(
        'Faltan las líneas de refrigerante (diámetro y largo) para calcular el nitrógeno.',
        422
      )
    }
    volumen = volumenLinea(d.lineas.liquido.diametro, d.lineas.liquido.largo_m, params)
    if (d.lineas.gas) volumen += volumenLinea(d.lineas.gas.diametro, d.lineas.gas.largo_m, params)
    if (alcance === 'circuito') volumen += d.volumen_equipos_l ?? 0
  }

  const presion = presionPrueba(d.refrigerante, params)
  if (presion.supuesto) {
    agregarSupuesto({
      clave: 'presion_prueba',
      texto: `Se usó la presión de prueba genérica de ${fmt(presion.barg, 0)} barg para ${d.refrigerante}; debe confirmarse con el fabricante.`,
      critico: false,
    })
  }

  let uniones = d.uniones
  if (uniones === undefined) {
    uniones = UNIONES_SUPUESTAS
    agregarSupuesto({
      clave: 'uniones',
      texto: `Se asumieron ${UNIONES_SUPUESTAS} uniones soldadas porque no se indicó la cantidad.`,
      critico: false,
    })
  }

  const barridos = flushing ? params.nitrogeno.barridos_flushing : 0
  const n2 = calcularNitrogeno(
    {
      volumen_l: volumen,
      presion_barg: presion.barg,
      presion_max_placa_barg: d.presion_max_placa_barg,
      minutos_soldadura: uniones * params.nitrogeno.min_por_union,
      barridos,
    },
    params
  )
  advertencias.push(...n2.advertencias)

  const claveTareas =
    actividad === 'fuga' || actividad === 'flushing' ? 'reparacion_fuga' : actividad
  const tareas = listaTareas(
    {
      actividad: claveTareas,
      unidades_interiores: d.unidades_interiores,
      unidades_exteriores: d.unidades_exteriores,
      largo_linea_m: d.lineas?.liquido.largo_m,
      barridos,
    },
    params
  )
  const hh = calcularHH(tareas, d.factor_dificultad ?? 1)
  const tecnicos = d.tecnicos ?? 1
  const ayudantes = d.ayudantes ?? 1
  const dot = sugerirDotacion(
    { hh: hh.total, tecnicos, ayudantes, jornadas_fijadas: d.jornadas_fijadas },
    params
  )
  advertencias.push(...dot.advertencias)

  const nombreRef =
    Object.keys(params.refrigerantes).find(
      k => claveRefrigerante(k) === claveRefrigerante(d.refrigerante)
    ) ?? d.refrigerante

  const items: ItemListado[] = []
  if (ref.kg > 0) {
    items.push(
      item('hvac-refrigerante', 'ins', `Gas Refrigerante ${nombreRef}`, 'kg', ref.kg, ref.formula)
    )
  }
  items.push(item('hvac-nitrogeno', 'ins', 'Nitrógeno N2 Industrial', 'm3', n2.m3, n2.formula))
  if (!esInstalacion) {
    const diam = d.lineas?.liquido.diametro.replace(/["”″']/g, '').trim()
    items.push(
      item(
        'hvac-filtro-secador',
        'rep',
        diam ? `Filtro deshidratador ${diam}" soldable` : 'Filtro deshidratador soldable',
        'Un',
        1,
        '1 filtro por circuito reparado'
      )
    )
  }
  if (uniones > 0) {
    items.push(
      item(
        'hvac-soldadura',
        'ins',
        'Soldadura Plata 15% + Oxígeno/Acetileno',
        'Unión',
        uniones,
        `${uniones} uniones soldadas`
      )
    )
  }
  if (flushing) {
    items.push(
      item(
        'hvac-aceite',
        'ins',
        'Aceite POE de reposición (flushing)',
        'Un',
        1,
        '1 reposición de aceite por circuito'
      ),
      item(
        'hvac-filtro-limpieza',
        'rep',
        'Filtro de limpieza antiácido (flushing)',
        'Un',
        1,
        '1 filtro de limpieza por circuito'
      )
    )
  }

  // HH cotizadas repartidas por rol; los ayudantes toman el resto.
  const formulaHH = `${fmt(dot.hh_cotizadas)} HH cotizadas: ${dot.personas} personas × ${dot.dias} jornadas`
  const hhTecnicos = r2((dot.hh_cotizadas * tecnicos) / dot.personas)
  const hhAyudantes = r2(dot.hh_cotizadas - hhTecnicos)
  if (tecnicos > 0) {
    items.push(
      item('hvac-hh-tecnico', 'mo', 'Técnico Especializado HVAC', 'Hora', hhTecnicos, formulaHH)
    )
  }
  if (ayudantes > 0) {
    items.push(
      item('hvac-hh-ayudante', 'mo', 'Ayudante Técnico HVAC', 'Hora', hhAyudantes, formulaHH)
    )
  }

  return {
    items,
    supuestos,
    advertencias,
    dotacion: {
      personas: dot.personas,
      dias: dot.dias,
      hh_calculadas: dot.hh_calculadas,
      hh_cotizadas: dot.hh_cotizadas,
      holgura_hh: dot.holgura_hh,
    },
  }
}
