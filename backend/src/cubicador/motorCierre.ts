// Motor del cierre metálico: integra la reja, el acceso eléctrico y la dotación
// en un listado de ítems. El LLM nunca calcula cantidades: solo el código.
// Lo que no se puede calcular se omite y se marca como supuesto crítico.
import { z } from 'zod'
import { httpError } from '../utils/httpError'
import type { Parametros } from './params'
import type { Ficha, ItemListado, ResultadoCubicacion, Supuesto } from './types'
import {
  calcularCierre,
  fmt,
  hhSoldador,
  item,
  validarParametrosCierre,
} from './calc/cierreMetalico'
import type { DatosCierre } from './calc/cierreMetalico'
import { calcularAcceso, hhElectricista } from './calc/accesoElectrico'
import type { Canalizacion, DatosAcceso } from './calc/accesoElectrico'
import { sugerirDotacion } from './calc/dotacion'
import type { ResultadoDotacion } from './calc/dotacion'
import { sistemaDe } from './perfiles'

const positivo = z.number().positive()

const puertaSchema = z.object({
  ancho_m: positivo,
  alto_m: positivo,
  hojas: z.number().int().min(1).default(1),
})

const medidasSchema = z.object({
  largo_m: positivo.max(500),
  alto_m: positivo.max(20),
  puerta: puertaSchema.optional(),
})

export const datosCierreSchema = z.object({
  medidas: medidasSchema.optional(),
  tipo_cierre: z.enum(['reja', 'solido']).optional(),
  anclaje: z.enum(['empotrado', 'placa']).optional(),
  cerradura: z.enum(['mecanica', 'electrica', 'candado']).optional(),
  chapa_electrica: z.boolean().optional(),
  separacion_postes_m: positivo.optional(),
  travesanos: z.number().int().min(1).optional(),
  separacion_barrotes_m: positivo.optional(),
  perfil: z.string().trim().min(1).optional(),
  barrote: z.string().trim().min(1).optional(),
  distancia_tablero_m: positivo.optional(),
  canalizacion: z.enum(['enterrada', 'sobrepuesta', 'aerea']).optional(),
  control_acceso: z.string().optional(),
  comuna: z.string().optional(),
})
export type DatosCierreFicha = z.infer<typeof datosCierreSchema>

type Reglas = [RegExp, string][]

// Orden importa: "placa/pernos/muro" gana sobre "hormigón" ("sobre sardinel de hormigón").
const REGLAS: Record<string, Reglas> = {
  tipo_cierre: [
    // Un portón (corredero, abatible, cortina) no se cubica como reja aunque tenga barrotes (F6).
    [/porton|correder|corrediz|abatibl|cortina|enrollabl/, 'no_soportado'],
    [/solid|plancha|ciego|macizo/, 'solido'],
    [/reja|barrote|baranda|enrejado/, 'reja'],
  ],
  anclaje: [
    [/placa|perno|muro|albanil|sardinel|existente|metalic/, 'placa'],
    [/empotr|hormig|fundac|hoyo|dado/, 'empotrado'],
  ],
  cerradura: [
    [/electric|electroiman|magnet/, 'electrica'],
    [/candado/, 'candado'],
    [/mecanic|embutir|llave|cerrojo|manual/, 'mecanica'],
  ],
  canalizacion: [
    [/enterr|subterr|zanja/, 'enterrada'],
    [/sobrepu|vista|bandeja|muro|embutid/, 'sobrepuesta'],
    [/aere/, 'aerea'],
  ],
}

function normalizarEnum(campo: string, valor: string): string {
  const t = sistemaDe(valor).trim()
  // "sin chapa eléctrica", "no eléctrica": la negación de lo eléctrico es mecánica.
  if (campo === 'cerradura' && /\b(sin|no)\b(\s+\w+){0,2}\s+electric/.test(t)) return 'mecanica'
  // "sin candado" dice que NO hay candado: no debe leerse como candado (F6). Si además se
  // menciona lo eléctrico, prevalece lo eléctrico ("chapa eléctrica, sin candado").
  if (
    campo === 'cerradura' &&
    /\b(sin|no)\b(\s+\w+){0,2}\s+candado/.test(t) &&
    !/electric|electroiman|magnet/.test(t)
  )
    return 'mecanica'
  for (const [re, canon] of REGLAS[campo]) if (re.test(t)) return canon
  return t.replace(/\s+/g, '_')
}

function numeroDe(s: string): number {
  return Number(s.replace(',', '.'))
}

interface MedidasTexto {
  medidas: { largo_m: number; alto_m: number }
  /** Sin palabras clave: se tomó "N x M" como ancho x alto. */
  supuestoOrden: boolean
  /** El texto mencionaba una puerta, que no se interpreta desde texto libre. */
  puertaIgnorada: boolean
}

const UNIDAD = /^(mtrs|mts|mtr|mt|metros|metro|m)?\b\s*(de\s+)?/

/**
 * "8 x 3 m", "8 por 3", "8 m de largo por 3 m de alto", "8 metros de ancho y 3 de alto".
 * Devuelve null si el texto no se entiende (las medidas se tratan como desconocidas).
 */
function medidasDeTexto(texto: string): MedidasTexto | null {
  let t = sistemaDe(texto)
  const corte = t.search(/puerta|porton|acceso/)
  const puertaIgnorada = corte >= 0
  if (corte >= 0) t = t.slice(0, corte)
  const nums = [...t.matchAll(/\d+(?:[.,]\d+)?/g)]
  if (nums.length !== 2) return null
  const etiqueta = (i: number): 'largo' | 'alto' | null => {
    const fin = nums[i].index + nums[i][0].length
    const despues = t.slice(fin, nums[i + 1]?.index ?? t.length)
    const antes = t.slice(i === 0 ? 0 : nums[i - 1].index + nums[i - 1][0].length, nums[i].index)
    const lab = (s: string): 'largo' | 'alto' | null =>
      /^(largo|ancho|long|longitud)/.test(s) ? 'largo' : /^(alto|altura)/.test(s) ? 'alto' : null
    const d1 = despues.trim().replace(UNIDAD, '')
    const a1 = /(largo|ancho|longitud|long|alto|altura)\s*(de|:|=)?\s*$/.exec(antes)
    return (a1 ? lab(a1[1]) : null) ?? lab(d1)
  }
  const l0 = etiqueta(0)
  const l1 = etiqueta(1)
  const v0 = numeroDe(nums[0][0])
  const v1 = numeroDe(nums[1][0])
  if (!(v0 > 0 && v1 > 0)) return null
  // Sin separador explícito ("56 912345678" no es 56 × 912345678): las medidas son desconocidas (F6).
  const entre = t
    .slice(nums[0].index + nums[0][0].length, nums[1].index)
    .replace(/\b(mtrs|mts|mtr|mt|metros|metro|m)\b/g, ' ')
    .trim()
  if (l0 === null && l1 === null) {
    if (!/^(x|×|\*|por|y)$/.test(entre)) return null
    return dentroDeLimites({ largo_m: v0, alto_m: v1 }, true, puertaIgnorada)
  }
  if (l0 !== null && l0 === l1) return null
  const primeroLargo = l0 === 'largo' || l1 === 'alto'
  return dentroDeLimites(
    primeroLargo ? { largo_m: v0, alto_m: v1 } : { largo_m: v1, alto_m: v0 },
    false,
    puertaIgnorada
  )
}

// Cotas razonables para un cierre: más allá, el texto se trata como medidas desconocidas (F6).
const LARGO_MAX_M = 500
const ALTO_MAX_M = 20

function dentroDeLimites(
  medidas: { largo_m: number; alto_m: number },
  supuestoOrden: boolean,
  puertaIgnorada: boolean
): MedidasTexto | null {
  if (medidas.largo_m > LARGO_MAX_M || medidas.alto_m > ALTO_MAX_M) return null
  return { medidas, supuestoOrden, puertaIgnorada }
}

function conAlias(obj: Record<string, unknown>, alias: Record<string, string>) {
  const o: Record<string, unknown> = { ...obj }
  for (const [de, a] of Object.entries(alias)) {
    if (o[a] === undefined && o[de] !== undefined) o[a] = o[de]
    delete o[de]
  }
  return o
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Prepara los datos de la ficha: sin nulos ni vacíos, sin lo que el usuario no sabe, enums normalizados. */
interface Extras {
  /** Tipo de cierre que el motor no cubica (portón corredero, cortina...). */
  tipoNoSoportado?: string
  medidasSupuestoOrden: boolean
  medidasIlegibles: boolean
  puertaIgnorada: boolean
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor === 'boolean') return valor
  const invalido = () =>
    httpError(
      `Los datos de la ficha del cierre metálico no son válidos: el campo "${campo}" no es válido (valores válidos: true, false, sí, no, eléctrica, mecánica).`,
      422
    )
  if (typeof valor !== 'string') throw invalido()
  const t = sistemaDe(valor).trim()
  if (/^(si|true|yes|verdadero)$/.test(t)) return true
  if (/^(no|false|falso)$/.test(t)) return false
  if (/\b(sin|no)\b(\s+\w+){0,2}\s+electric/.test(t) || /^mecanic/.test(t)) return false
  if (/electric/.test(t)) return true
  throw invalido()
}

function prepararDatos(ficha: Ficha): { d: Record<string, unknown>; extras: Extras } {
  const extras: Extras = {
    medidasSupuestoOrden: false,
    medidasIlegibles: false,
    puertaIgnorada: false,
  }
  const d: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(ficha.datos)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (ficha.no_sabe.includes(k)) continue
    d[k] = v
  }
  for (const campo of Object.keys(REGLAS)) {
    const v = d[campo]
    if (typeof v === 'string') d[campo] = normalizarEnum(campo, v)
  }
  if (typeof d.tipo_cierre === 'string' && !['reja', 'solido'].includes(d.tipo_cierre)) {
    extras.tipoNoSoportado = String(ficha.datos.tipo_cierre)
    delete d.tipo_cierre
  }
  if (d.chapa_electrica !== undefined)
    d.chapa_electrica = booleano(d.chapa_electrica, 'chapa_electrica')
  if (Array.isArray(d.control_acceso) && d.control_acceso.every(x => typeof x === 'string')) {
    d.control_acceso = d.control_acceso.join(' ')
  }
  if (d.control_acceso !== undefined && typeof d.control_acceso !== 'string') {
    throw httpError(
      'Los datos de la ficha del cierre metálico no son válidos: el campo "control_acceso" debe ser un texto (por ejemplo, "botón adentro y citófono afuera").',
      422
    )
  }
  if (typeof d.medidas === 'string') {
    const m = medidasDeTexto(d.medidas)
    if (m) {
      d.medidas = m.medidas
      extras.medidasSupuestoOrden = m.supuestoOrden
      extras.puertaIgnorada = m.puertaIgnorada
    } else {
      delete d.medidas
      extras.medidasIlegibles = true
    }
  }
  if (esObjeto(d.medidas)) {
    const m = conAlias(d.medidas, { largo: 'largo_m', alto: 'alto_m' })
    const puerta = m.puerta ?? d.puerta
    if (esObjeto(puerta)) {
      m.puerta = conAlias(puerta, { ancho: 'ancho_m', alto: 'alto_m' })
    }
    d.medidas = m
  }
  delete d.puerta
  return { d, extras }
}

function valorEn(obj: unknown, ruta: PropertyKey[]): unknown {
  let actual = obj
  for (const k of ruta) {
    if (typeof actual !== 'object' || actual === null) return undefined
    actual = (actual as Record<PropertyKey, unknown>)[k]
  }
  return actual
}

function parsearDatos(ficha: Ficha): { d: DatosCierreFicha; extras: Extras } {
  const { d: prep, extras } = prepararDatos(ficha)
  const r = datosCierreSchema.safeParse(prep)
  if (r.success) return { d: r.data, extras }
  const detalle = r.error.issues
    .map(i => {
      const campo = i.path.length > 0 ? i.path.join('.') : 'datos'
      if (i.code === 'invalid_value') {
        return `el campo "${campo}" no es válido (valores válidos: ${i.values.join(', ')})`
      }
      if (valorEn(prep, i.path) === undefined) return `falta el campo "${campo}"`
      if (i.code === 'invalid_type' || i.code === 'too_small') {
        return `el campo "${campo}" no es válido (debe ser un número mayor que cero)`
      }
      return `el campo "${campo}" no es válido`
    })
    .join('; ')
  throw httpError(`Los datos de la ficha del cierre metálico no son válidos: ${detalle}.`, 422)
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** HH cotizadas repartidas entre técnico y ayudante; el ayudante toma el resto. */
function itemsHH(
  prefijo: string,
  tecnico: string,
  ayudante: string,
  dot: ResultadoDotacion
): ItemListado[] {
  const formula = `${fmt(dot.hh_cotizadas)} HH cotizadas: ${dot.personas} personas × ${dot.dias} jornadas`
  const hhTecnico = r2(dot.hh_cotizadas / dot.personas)
  const hhAyudante = r2(dot.hh_cotizadas - hhTecnico)
  return [
    item(`${prefijo}-tecnico`, 'mo', tecnico, 'Hora', hhTecnico, formula),
    item(`${prefijo}-ayudante`, 'mo', ayudante, 'Hora', hhAyudante, formula),
  ]
}

export function motorCierre(ficha: Ficha, params: Parametros): ResultadoCubicacion {
  const { d, extras } = parsearDatos(ficha)
  validarParametrosCierre(params)
  const c = params.cierre

  const supuestos: Supuesto[] = [...ficha.supuestos]
  const agregarSupuesto = (s: Supuesto) => {
    if (!supuestos.some(x => x.clave === s.clave)) supuestos.push(s)
  }
  const advertencias: string[] = []

  // Datos que el usuario no sabe o no dijo: se usa el valor por defecto y se marca.
  const tipo = d.tipo_cierre ?? 'reja'
  if (extras.tipoNoSoportado !== undefined) {
    agregarSupuesto({
      clave: 'tipo_cierre',
      texto: `El tipo de cierre indicado ("${extras.tipoNoSoportado}") no lo cubica esta calculadora: se cubicó como reja con barrotes.`,
      critico: true,
    })
    advertencias.push(
      'Los portones corredizos, abatibles y las cortinas enrollables (rieles, ruedas, motor) no se cubican con esta calculadora; se cubicó la reja fija como aproximación.'
    )
  } else if (d.tipo_cierre === undefined) {
    agregarSupuesto({
      clave: 'tipo_cierre',
      texto: 'Se asumió un cierre de reja con barrotes porque no se indicó el tipo de cierre.',
      critico: true,
    })
  }
  const anclaje = d.anclaje ?? 'empotrado'
  if (d.anclaje === undefined) {
    agregarSupuesto({
      clave: 'anclaje',
      texto: 'Se asumieron postes empotrados en hormigón porque no se conoce el anclaje.',
      critico: true,
    })
  }
  let cerradura = d.cerradura ?? 'mecanica'
  if (d.cerradura === undefined && d.chapa_electrica !== true) {
    agregarSupuesto({
      clave: 'cerradura',
      texto: 'Se asumió una chapa mecánica porque no se conoce la cerradura.',
      critico: true,
    })
  }
  if (d.chapa_electrica === true) {
    if (d.cerradura === 'mecanica' || d.cerradura === 'candado') {
      advertencias.push(
        'La ficha indica una cerradura no eléctrica y también chapa eléctrica: se cubicó la chapa eléctrica.'
      )
    }
    cerradura = 'electrica'
  }
  if (cerradura === 'candado') {
    agregarSupuesto({
      clave: 'candado',
      texto: 'La cerradura es un candado: no se incluye en la cubicación.',
      critico: false,
    })
    advertencias.push('El candado no se incluye en la cubicación; no se agregó ninguna chapa.')
  }

  const items: ItemListado[] = []
  let datosCierre: DatosCierre | null = null
  let hojasAcceso = 1

  if (d.medidas === undefined) {
    agregarSupuesto({
      clave: 'medidas',
      texto:
        'Se desconocen las medidas del cierre: no se cubicaron perfiles, barrotes ni fundaciones; deben medirse en terreno.',
      critico: true,
    })
    advertencias.push('No se cubicó la reja porque se desconocen sus medidas (largo y alto).')
    if (extras.medidasIlegibles) {
      advertencias.push(
        'No se entendieron las medidas indicadas: indique el ancho y el alto del cierre en metros (por ejemplo, 8 x 3 m).'
      )
    }
  } else {
    if (extras.medidasSupuestoOrden) {
      agregarSupuesto({
        clave: 'medidas_orden',
        texto: 'Se interpretó el texto de medidas como ancho x alto.',
        critico: false,
      })
    }
    if (extras.puertaIgnorada) {
      advertencias.push(
        'El texto de medidas menciona una puerta, que no se interpreta desde texto libre: indíquela con sus medidas para cubicarla.'
      )
    }
    const { largo_m, alto_m, puerta } = d.medidas
    if (puerta) {
      if (puerta.ancho_m >= largo_m) {
        throw httpError(
          'Los datos de la ficha del cierre metálico no son válidos: el campo "medidas.puerta.ancho_m" debe ser menor que el largo del cierre.',
          422
        )
      }
      if (puerta.alto_m > alto_m) {
        throw httpError(
          'Los datos de la ficha del cierre metálico no son válidos: el campo "medidas.puerta.alto_m" no puede superar el alto del cierre.',
          422
        )
      }
    }
    if (tipo === 'reja' && alto_m <= c.recorte_barrote_m) {
      throw httpError(
        `Los datos de la ficha del cierre metálico no son válidos: el campo "medidas.alto_m" debe ser mayor que ${fmt(c.recorte_barrote_m)} m.`,
        422
      )
    }
    datosCierre = {
      largo_m,
      alto_m,
      puerta: puerta ?? null,
      tipo,
      anclaje,
      cerradura,
      separacion_postes_m: d.separacion_postes_m,
      travesanos: d.travesanos,
      separacion_barrotes_m: d.separacion_barrotes_m,
      perfil: d.perfil,
      barrote: d.barrote,
    }
    items.push(...calcularCierre(datosCierre, params))
    hojasAcceso = puerta?.hojas ?? 0

    // Valores por defecto realmente usados.
    if (d.separacion_postes_m === undefined) {
      agregarSupuesto({
        clave: 'separacion_postes',
        texto: `Postes cada ${fmt(c.separacion_postes_m)} m.`,
        critico: false,
      })
    }
    agregarSupuesto({
      clave: 'travesanos',
      texto: `${d.travesanos ?? c.travesanos} travesaños entre postes.`,
      critico: false,
    })
    if (anclaje === 'empotrado') {
      agregarSupuesto({
        clave: 'empotrado',
        texto: `Postes empotrados ${fmt(c.empotrado_m)} m, en hoyos de ${fmt(c.hoyo_ancho_m)} × ${fmt(c.hoyo_largo_m)} × ${fmt(c.hoyo_prof_m)} m.`,
        critico: false,
      })
    }
    agregarSupuesto({
      clave: 'merma',
      texto: `Merma de ${fmt(c.merma_pct)} % y perfiles en tiras de ${fmt(c.tira_m)} m.`,
      critico: false,
    })
    if (tipo === 'reja') {
      agregarSupuesto({
        clave: 'barrotes',
        texto: `Barrotes cada ${fmt(d.separacion_barrotes_m ?? c.separacion_barrotes_m)} m, recortados ${fmt(c.recorte_barrote_m)} m respecto del alto.`,
        critico: false,
      })
    } else {
      advertencias.push(
        'Cierre sólido: la plancha recibe mucho más viento que los barrotes; los rigidizadores son un supuesto y no hay cálculo estructural.'
      )
    }
    if (puerta) {
      agregarSupuesto({
        clave: 'bisagras',
        texto: `${c.bisagras_por_hoja} bisagras por hoja de puerta.`,
        critico: false,
      })
    }
    agregarSupuesto({
      clave: 'insumos',
      texto: `Insumos estimados con rendimientos iniciales: ${fmt(c.electrodo_kg_por_m)} kg de electrodos por metro de perfil, un disco cada ${fmt(c.m_perfil_por_disco)} m y ${fmt(c.rendimiento_pintura_m2_gal)} m² por galón de pintura.`,
      critico: false,
    })
    if (!puerta && cerradura === 'electrica') {
      advertencias.push(
        'La chapa es eléctrica pero el cierre no tiene puerta: no se cubicó el acceso eléctrico.'
      )
    }
  }

  // Acceso eléctrico: solo con chapa eléctrica.
  let datosAcceso: DatosAcceso | null = null
  if (cerradura === 'electrica' && hojasAcceso > 0) {
    if (d.medidas === undefined) {
      agregarSupuesto({
        clave: 'hojas_acceso',
        texto: 'Se asumió una hoja de puerta con chapa eléctrica porque se desconocen las medidas.',
        critico: true,
      })
    }
    let canalizacion: Canalizacion | undefined = d.canalizacion
    if (d.distancia_tablero_m === undefined) {
      agregarSupuesto({
        clave: 'distancia_tablero',
        texto:
          'Se desconoce la distancia al tablero: no se cubicaron cable, cañería ni cámaras de la alimentación; deben medirse en terreno.',
        critico: true,
      })
      advertencias.push(
        'No se cubicó la alimentación de la chapa eléctrica: se desconoce la distancia al tablero.'
      )
    } else if (canalizacion === undefined) {
      canalizacion = 'enterrada'
      agregarSupuesto({
        clave: 'canalizacion',
        texto: 'Se asumió canalización enterrada porque no se indicó cómo corre el cable.',
        critico: true,
      })
    }
    const ctrl = sistemaDe(d.control_acceso)
    datosAcceso = {
      hojas: hojasAcceso,
      distancia_tablero_m: d.distancia_tablero_m,
      canalizacion,
      citofono: ctrl.includes('citofon'),
      boton: /boton|pulsador/.test(ctrl),
    }
    items.push(...calcularAcceso(datosAcceso, params))
    agregarSupuesto({
      clave: 'alimentacion',
      texto:
        'Alimentación y respaldo de la chapa eléctrica supuestos: una fuente con batería, un circuito dedicado con automático y diferencial; confirmar el consumo y la reserva del tablero.',
      critico: true,
    })
    agregarSupuesto({
      clave: 'acceso_defaults',
      texto: `Cable con ${fmt(c.cable_recorrido_poste_m)} m de recorrido por el poste y una cámara de registro cada ${fmt(c.camara_cada_m)} m en tramo enterrado.`,
      critico: false,
    })
    advertencias.push(
      'La parte eléctrica del acceso debe ser declarada por un instalador eléctrico autorizado; ese trámite no está incluido en esta cubicación.'
    )
  }

  // Mano de obra: soldador y electricista, cada uno con su dotación.
  const dots: ResultadoDotacion[] = []
  if (datosCierre) {
    const dot = sugerirDotacion({ hh: hhSoldador(datosCierre, params) }, params)
    advertencias.push(...dot.advertencias)
    dots.push(dot)
    items.push(...itemsHH('cierre-hh-soldador', 'Soldador / armador', 'Ayudante de soldador', dot))
  }
  if (datosAcceso) {
    const dot = sugerirDotacion({ hh: hhElectricista(datosAcceso, params) }, params)
    advertencias.push(...dot.advertencias)
    dots.push(dot)
    items.push(
      ...itemsHH('acceso-hh-electricista', 'Electricista', 'Ayudante de electricista', dot)
    )
  }

  // Las cuadrillas trabajan una después de otra (el cableado va tras soldar y pintar).
  const dotacion =
    dots.length === 0
      ? null
      : {
          personas: Math.max(...dots.map(x => x.personas)),
          dias: dots.reduce((s, x) => s + x.dias, 0),
          hh_calculadas: r2(dots.reduce((s, x) => s + x.hh_calculadas, 0)),
          hh_cotizadas: r2(dots.reduce((s, x) => s + x.hh_cotizadas, 0)),
          holgura_hh: r2(dots.reduce((s, x) => s + x.holgura_hh, 0)),
        }

  return { items, supuestos, advertencias, dotacion }
}
