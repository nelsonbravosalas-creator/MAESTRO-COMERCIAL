// Motor HVAC: integra los calculadores (refrigerante, nitrógeno, HH, dotación)
// en un listado de ítems. El LLM nunca calcula cantidades: solo el código.
// Lo que no se puede calcular se omite y se marca como supuesto crítico.
import { z } from 'zod'
import { httpError } from '../utils/httpError'
import type { Parametros } from './params'
import type { Ficha, ItemListado, ResultadoCubicacion, Supuesto } from './types'
import { calcularRefrigerante, volumenLinea } from './calc/refrigerante'
import type { Linea } from './calc/refrigerante'
import { calcularNitrogeno, presionPrueba } from './calc/nitrogeno'
import { calcularHH, listaTareas } from './calc/horasHombre'
import { sugerirDotacion } from './calc/dotacion'
import { sistemaDe } from './perfiles'

const linea = z.object({
  diametro: z.string().trim().min(1),
  largo_m: z.number().min(0),
})

export const datosHvacSchema = z.object({
  tipo_trabajo: z.enum(['instalacion', 'reparacion', 'mantenimiento']),
  sistema: z.enum(['split', 'multisplit', 'vrf', 'precision', 'camara', 'central']),
  actividad: z.enum(['fuga', 'puesta_a_punto', 'flushing', 'instalacion']).optional(),
  refrigerante: z.string().trim().min(1).optional(),
  metodo: z.enum(['total', 'bombeo']).default('total'),
  carga_placa_kg: z.number().min(0).optional(),
  largo_incluido_m: z.number().min(0).default(0),
  lineas: z.object({ liquido: linea.optional(), gas: linea.optional() }).optional(),
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

const fmt = (n: number, dec = 1) => n.toFixed(dec).replace('.', ',')
const r2 = (n: number) => Math.round(n * 100) / 100

function claveRefrigerante(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, '')
}

type Reglas = [RegExp, string][]

const REGLAS: Record<string, Reglas> = {
  tipo_trabajo: [
    [/repar|arregl/, 'reparacion'],
    [/instal|montaje/, 'instalacion'],
    [/manten|mantenc/, 'mantenimiento'],
  ],
  sistema: [
    [/camara/, 'camara'],
    [/central|rack/, 'central'],
    [/vrf|vrv/, 'vrf'],
    [/multi/, 'multisplit'],
    [/split/, 'split'],
    [/precision/, 'precision'],
  ],
  actividad: [
    [/fuga/, 'fuga'],
    [/puesta|punto/, 'puesta_a_punto'],
    [/flush|limpieza/, 'flushing'],
    [/instal|montaje/, 'instalacion'],
  ],
  metodo: [
    [/bomb|pump/, 'bombeo'],
    [/total|recuper/, 'total'],
  ],
  alcance_prueba: [
    [/tramo/, 'tramo'],
    [/circuito/, 'circuito'],
    [/linea/, 'lineas'],
  ],
}

/** Texto libre -> valor del enum (sin tildes, minúsculas, por contenido). Si no calza, lo deja igual. */
function normalizarEnum(campo: string, valor: string): string {
  const t = sistemaDe(valor).trim()
  for (const [re, canon] of REGLAS[campo]) if (re.test(t)) return canon
  return t.replace(/\s+/g, '_')
}

/** Prepara los datos de la ficha para el esquema: sin nulos ni vacíos, enums normalizados y líneas mapeadas. */
function prepararDatos(datos: Record<string, unknown>): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(datos)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    d[k] = v
  }
  for (const campo of Object.keys(REGLAS)) {
    const v = d[campo]
    if (typeof v === 'string') d[campo] = normalizarEnum(campo, v)
  }
  if (d.lineas === undefined && (d.linea_liquido !== undefined || d.linea_gas !== undefined)) {
    d.lineas = {
      ...(d.linea_liquido !== undefined && { liquido: d.linea_liquido }),
      ...(d.linea_gas !== undefined && { gas: d.linea_gas }),
    }
  }
  return d
}

function valorEn(obj: unknown, ruta: PropertyKey[]): unknown {
  let actual = obj
  for (const k of ruta) {
    if (typeof actual !== 'object' || actual === null) return undefined
    actual = (actual as Record<PropertyKey, unknown>)[k]
  }
  return actual
}

function parsearDatos(datos: Record<string, unknown>): DatosHvac {
  const prep = prepararDatos(datos)
  const r = datosHvacSchema.safeParse(prep)
  if (r.success) return r.data
  const detalle = r.error.issues
    .map(i => {
      const campo = i.path.length > 0 ? i.path.join('.') : 'datos'
      // Zod 4 no expone `input` en el issue: se mira el valor en los datos preparados.
      if (valorEn(prep, i.path) === undefined) {
        return `falta el campo "${campo}"`
      }
      if (i.code === 'invalid_value') {
        return `el campo "${campo}" no es válido (valores válidos: ${i.values.join(', ')})`
      }
      return `el campo "${campo}" no es válido`
    })
    .join('; ')
  throw httpError(`Los datos de la ficha HVAC no son válidos: ${detalle}.`, 422)
}

function positivo(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
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
  if (!positivo(params.placa_supuesta_kg)) {
    throw httpError('El parámetro de carga de placa supuesta no es válido.', 422)
  }
  const u = params.soldadura?.uniones_supuestas
  if (typeof u !== 'number' || !Number.isInteger(u) || u < 0) {
    throw httpError('El parámetro de uniones supuestas no es válido.', 422)
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
  const t = sistemaDe(estado)
  return t.includes('quemad') || t.includes('acido')
}

/** "r 404 a", "R404A", "404a" -> clave de los parámetros; si no calza, el texto original. */
function canonRefrigerante(texto: string, params: Parametros): string {
  const claves = Object.keys(params.refrigerantes)
  const buscado = claveRefrigerante(texto)
  return (
    claves.find(k => claveRefrigerante(k) === buscado) ??
    claves.find(k => claveRefrigerante(k) === `R${buscado}`) ??
    texto
  )
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
  const refrigerante =
    d.refrigerante !== undefined ? canonRefrigerante(d.refrigerante, params) : undefined

  const supuestos: Supuesto[] = [...ficha.supuestos]
  const agregarSupuesto = (s: Supuesto) => {
    if (!supuestos.some(x => x.clave === s.clave)) supuestos.push(s)
  }
  const advertencias: string[] = refrigerante ? advertenciasRefrigerante(refrigerante) : []

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

  // Líneas: lo que falta no aporta carga ni volumen, y se marca como crítico.
  const liquido = d.lineas?.liquido
  const gas = d.lineas?.gas
  const lineasUsadas = d.metodo === 'total' || alcance !== 'tramo'
  if ((!liquido || !gas) && lineasUsadas) {
    agregarSupuesto({
      clave: 'lineas',
      texto:
        'Se desconoce el largo y el diámetro de las líneas de refrigerante (o de una de ellas): no se sumó carga ni volumen por esas líneas; deben medirse en terreno.',
      critico: true,
    })
  }

  let refItem: ItemListado | null = null
  if (refrigerante === undefined) {
    agregarSupuesto({
      clave: 'refrigerante',
      texto:
        'El refrigerante es desconocido: no se cubicó el gas ni el nitrógeno de la prueba; debe leerse en la placa del equipo.',
      critico: true,
    })
    advertencias.push(
      'No se cubicó el gas refrigerante ni el nitrógeno de prueba porque se desconoce el refrigerante.'
    )
  } else {
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
    const sinLargo = (): Linea => ({ diametro: Object.keys(params.cobre)[0], largo_m: 0 })
    const ref = calcularRefrigerante(
      {
        tipo_trabajo: esInstalacion ? 'instalacion' : d.tipo_trabajo,
        sistema: d.sistema,
        refrigerante,
        metodo: d.metodo,
        carga_placa_kg: placa,
        largo_incluido_m: d.largo_incluido_m,
        lineas: { liquido: liquido ?? sinLargo(), gas: gas ?? sinLargo() },
        reutilizable_kg: reutilizable,
      },
      params
    )
    advertencias.push(...ref.advertencias)
    if (ref.kg > 0) {
      refItem = item(
        'hvac-refrigerante',
        'ins',
        `Refrigerante ${refrigerante}`,
        'kg',
        ref.kg,
        ref.formula
      )
    }
  }

  let uniones = d.uniones
  if (uniones === undefined) {
    uniones = params.soldadura.uniones_supuestas
    agregarSupuesto({
      clave: 'uniones',
      texto: `Se asumieron ${uniones} uniones soldadas porque no se indicó la cantidad.`,
      critico: esInstalacion,
    })
  }

  // Nitrógeno: depende de la presión de prueba, que depende del refrigerante.
  const barridos = flushing ? params.nitrogeno.barridos_flushing : 0
  let n2Item: ItemListado | null = null
  if (refrigerante !== undefined) {
    let volumen: number | undefined
    if (alcance === 'tramo') {
      const v = params.nitrogeno.volumen_tramo_l
      if (!positivo(v)) throw httpError('El parámetro de volumen del tramo no es válido.', 422)
      volumen = v
      agregarSupuesto({
        clave: 'volumen_tramo',
        texto: `Se asumió ${fmt(v)} L de volumen en el tramo abierto.`,
        critico: false,
      })
    } else {
      let suma = 0
      let conocido = false
      for (const l of [liquido, gas]) {
        if (l) {
          suma += volumenLinea(l.diametro, l.largo_m, params)
          conocido = true
        }
      }
      if (alcance === 'circuito' && d.volumen_equipos_l !== undefined) {
        suma += d.volumen_equipos_l
        conocido = true
      }
      if (conocido) volumen = suma
    }
    if (volumen === undefined) {
      agregarSupuesto({
        clave: 'nitrogeno_volumen',
        texto:
          'No se pudo establecer el volumen a presurizar (faltan las líneas y el volumen de los equipos): el nitrógeno cubica solo la purga de soldadura, sin la prueba de presión.',
        critico: true,
      })
    }
    const presion = presionPrueba(refrigerante, params)
    if (presion.supuesto) {
      agregarSupuesto({
        clave: 'presion_prueba',
        texto: `Se usó la presión de prueba genérica de ${fmt(presion.barg, 0)} barg para ${refrigerante}; debe confirmarse con el fabricante.`,
        critico: false,
      })
    }
    const n2 = calcularNitrogeno(
      {
        volumen_l: volumen ?? 0,
        presion_barg: presion.barg,
        presion_max_placa_barg: d.presion_max_placa_barg,
        minutos_soldadura: uniones * params.nitrogeno.min_por_union,
        barridos,
      },
      params
    )
    advertencias.push(...n2.advertencias)
    if (n2.m3 > 0) {
      // El nitrógeno se compra por balón entero: la cantidad son los balones y el cálculo en m³
      // queda visible en la fórmula.
      const balonM3 = params.nitrogeno.balon_m3
      const formulaN2 = `${n2.formula} → ${n2.balones} ${n2.balones === 1 ? 'balón' : 'balones'} de ${fmt(balonM3, 0)} m³`
      n2Item = item(
        'hvac-nitrogeno',
        'ins',
        'Nitrógeno N2 Industrial',
        'Rec',
        n2.balones,
        formulaN2
      )
    } else {
      agregarSupuesto({
        clave: 'nitrogeno_omitido',
        texto: 'No se cubicó nitrógeno: no hay volumen que presurizar ni uniones que soldar.',
        critico: true,
      })
    }
  }

  const claveTareas =
    actividad === 'fuga' || actividad === 'flushing' ? 'reparacion_fuga' : actividad
  const tareas = listaTareas(
    {
      actividad: claveTareas,
      unidades_interiores: d.unidades_interiores,
      unidades_exteriores: d.unidades_exteriores,
      largo_linea_m: liquido?.largo_m,
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

  const items: ItemListado[] = []
  if (refItem) items.push(refItem)
  if (n2Item) items.push(n2Item)
  if (!esInstalacion) {
    const diam = liquido?.diametro.replace(/["”″']/g, '').trim()
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
