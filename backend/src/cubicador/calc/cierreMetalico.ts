// Calculadora de reja o cierre metálico. Funciones puras: el LLM nunca calcula
// cantidades. Todos los valores por defecto viven en `params.cierre`.
import { httpError } from '../../utils/httpError'
import type { Cierre, Parametros } from '../params'
import type { ItemListado } from '../types'

export interface PuertaCierre {
  ancho_m: number
  alto_m: number
  hojas: number
}

export interface DatosCierre {
  largo_m: number
  alto_m: number
  puerta: PuertaCierre | null
  tipo: 'reja' | 'solido'
  anclaje: 'empotrado' | 'placa'
  cerradura: 'mecanica' | 'electrica' | 'candado'
  /** Sobrescriben el valor por defecto de los parámetros cuando se indican. */
  separacion_postes_m?: number
  travesanos?: number
  separacion_barrotes_m?: number
  perfil?: string
  barrote?: string
}

export interface GeometriaCierre {
  postes: number
  largo_poste_m: number
  relleno_m: number
  travesanos: number
  m_travesanos: number
  m_marco: number
  m_perfil: number
  m_perfil_merma: number
  tiras: number
  barrotes: number
  largo_barrote_m: number
  m_barrotes: number
  m_barrotes_merma: number
  plancha_m2: number
  plancha_m2_merma: number
  rigid_m: number
  rigid_m_merma: number
  hoyos_m3: number
  area_pintura_m2: number
}

type Regla = [clave: keyof Cierre, min: 'positivo' | 'noNegativo' | 'entero1' | 'texto']

const REGLAS_PARAMS: Regla[] = [
  ['perfil', 'texto'],
  ['barrote', 'texto'],
  ['separacion_postes_m', 'positivo'],
  ['empotrado_m', 'noNegativo'],
  ['travesanos', 'entero1'],
  ['merma_pct', 'noNegativo'],
  ['tira_m', 'positivo'],
  ['hoyo_ancho_m', 'positivo'],
  ['hoyo_largo_m', 'positivo'],
  ['hoyo_prof_m', 'positivo'],
  ['bisagras_por_hoja', 'noNegativo'],
  ['recorte_barrote_m', 'noNegativo'],
  ['separacion_barrotes_m', 'positivo'],
  ['separacion_rigidizadores_m', 'positivo'],
  ['pernos_por_placa', 'noNegativo'],
  ['electrodo_kg_por_m', 'noNegativo'],
  ['m_perfil_por_disco', 'positivo'],
  ['perimetro_perfil_m', 'noNegativo'],
  ['perimetro_barrote_m', 'noNegativo'],
  ['rendimiento_pintura_m2_gal', 'positivo'],
  ['camara_cada_m', 'positivo'],
  ['cable_recorrido_poste_m', 'noNegativo'],
  ['puntos_base_electricista', 'noNegativo'],
  ['caras_pintura', 'noNegativo'],
  ['hh_sold_m_perfil', 'noNegativo'],
  ['hh_sold_barrote', 'noNegativo'],
  ['hh_sold_plancha_m2', 'noNegativo'],
  ['hh_sold_poste', 'noNegativo'],
  ['hh_sold_hoja', 'noNegativo'],
  ['hh_sold_pintura_m2', 'noNegativo'],
  ['hh_ele_m_canalizacion', 'noNegativo'],
  ['hh_ele_punto', 'noNegativo'],
  ['hh_ele_tablero', 'noNegativo'],
  ['hh_ele_pruebas', 'noNegativo'],
]

/** Valida con `Number.isFinite` los parámetros del cierre que se consumen. */
export function validarParametrosCierre(params: Parametros): void {
  const c = params.cierre as unknown as Record<string, unknown> | undefined
  if (typeof c !== 'object' || c === null) {
    throw httpError('Faltan los parámetros del cierre metálico.', 422)
  }
  for (const [clave, regla] of REGLAS_PARAMS) {
    const v = c[clave]
    const ok =
      regla === 'texto'
        ? typeof v === 'string' && v.trim() !== ''
        : typeof v === 'number' &&
          Number.isFinite(v) &&
          (regla === 'positivo'
            ? v > 0
            : regla === 'noNegativo'
              ? v >= 0
              : Number.isInteger(v) && v >= 1)
    if (!ok) throw httpError(`El parámetro de cierre "${clave}" no es válido.`, 422)
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100
/** Redondea a 6 decimales para que el punto flotante no sume una unidad de más al techo. */
const techo = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e6)
export const fmt = (n: number) => String(r2(n)).replace('.', ',')

export function item(
  id: string,
  categoria: ItemListado['categoria'],
  descripcion: string,
  unidad: string,
  cantidad: number,
  formula: string
): ItemListado {
  return {
    id,
    categoria,
    descripcion,
    unidad,
    cantidad,
    dias: 1,
    formula,
    precio_unitario: null,
    fuente: null,
    estado_precio: 'pendiente',
  }
}

export function geometriaCierre(d: DatosCierre, params: Parametros): GeometriaCierre {
  validarParametrosCierre(params)
  const c = params.cierre
  const sepPostes = d.separacion_postes_m ?? c.separacion_postes_m
  const nTrav = d.travesanos ?? c.travesanos
  const sepBarrotes = d.separacion_barrotes_m ?? c.separacion_barrotes_m
  const merma = 1 + c.merma_pct / 100

  const postes = techo(d.largo_m / sepPostes) + 1
  const largoPoste = d.alto_m + (d.anclaje === 'empotrado' ? c.empotrado_m : 0)
  const relleno = d.largo_m - (d.puerta?.ancho_m ?? 0)
  const mTrav = nTrav * relleno
  const mMarco = d.puerta ? 2 * d.puerta.alto_m + 3 * d.puerta.ancho_m : 0
  const mPerfil = postes * largoPoste + mTrav + mMarco

  const reja = d.tipo === 'reja'
  const barrotes = reja ? techo(relleno / sepBarrotes) : 0
  const largoBarrote = reja ? Math.max(0, d.alto_m - c.recorte_barrote_m) : 0
  const mBarrotes = barrotes * largoBarrote

  const planchaM2 = reja ? 0 : relleno * d.alto_m
  const filasRigid = reja ? 0 : techo(d.alto_m / c.separacion_rigidizadores_m)
  const rigidM = filasRigid * relleno

  const area =
    (mPerfil + rigidM) * c.perimetro_perfil_m +
    mBarrotes * c.perimetro_barrote_m +
    planchaM2 * c.caras_pintura

  return {
    postes,
    largo_poste_m: largoPoste,
    relleno_m: relleno,
    travesanos: nTrav,
    m_travesanos: mTrav,
    m_marco: mMarco,
    m_perfil: mPerfil,
    m_perfil_merma: mPerfil * merma,
    tiras: techo((mPerfil * merma) / c.tira_m),
    barrotes,
    largo_barrote_m: largoBarrote,
    m_barrotes: mBarrotes,
    m_barrotes_merma: mBarrotes * merma,
    plancha_m2: planchaM2,
    plancha_m2_merma: planchaM2 * merma,
    rigid_m: rigidM,
    rigid_m_merma: rigidM * merma,
    hoyos_m3:
      d.anclaje === 'empotrado' ? postes * c.hoyo_ancho_m * c.hoyo_largo_m * c.hoyo_prof_m : 0,
    area_pintura_m2: area,
  }
}

/** HH del soldador/armador, con los rendimientos iniciales de los parámetros. */
export function hhSoldador(d: DatosCierre, params: Parametros): number {
  const g = geometriaCierre(d, params)
  const c = params.cierre
  return (
    g.m_perfil * c.hh_sold_m_perfil +
    g.rigid_m * c.hh_sold_m_perfil +
    g.barrotes * c.hh_sold_barrote +
    g.plancha_m2 * c.hh_sold_plancha_m2 +
    g.postes * c.hh_sold_poste +
    (d.puerta?.hojas ?? 0) * c.hh_sold_hoja +
    g.area_pintura_m2 * c.hh_sold_pintura_m2
  )
}

export function calcularCierre(d: DatosCierre, params: Parametros): ItemListado[] {
  const g = geometriaCierre(d, params)
  const c = params.cierre
  const perfil = d.perfil ?? c.perfil
  const barrote = d.barrote ?? c.barrote
  const items: ItemListado[] = []

  const partes = [
    `${g.postes} postes de ${fmt(g.largo_poste_m)} m`,
    `${g.travesanos} travesaños de ${fmt(g.relleno_m)} m`,
  ]
  if (d.puerta) partes.push(`marco de puerta ${fmt(g.m_marco)} m`)
  items.push(
    item(
      'cierre-perfil',
      'mec',
      `Perfil cuadrado ${perfil} (postes, travesaños${d.puerta ? ' y marco de puerta' : ''})`,
      'tira',
      g.tiras,
      `${partes.join(' + ')} = ${fmt(g.m_perfil)} m; con merma ${fmt(c.merma_pct)} % = ${fmt(g.m_perfil_merma)} m; ${g.tiras} tiras de ${fmt(c.tira_m)} m`
    )
  )

  if (d.tipo === 'reja') {
    items.push(
      item(
        'cierre-barrotes',
        'mec',
        `Barrotes ${barrote} (relleno)`,
        'm',
        r2(g.m_barrotes_merma),
        `${g.barrotes} barrotes de ${fmt(g.largo_barrote_m)} m = ${fmt(g.m_barrotes)} m; con merma ${fmt(c.merma_pct)} % = ${fmt(g.m_barrotes_merma)} m`
      )
    )
  } else {
    items.push(
      item(
        'cierre-plancha',
        'mec',
        'Plancha de cierre sólido (reemplaza los barrotes)',
        'm2',
        r2(g.plancha_m2_merma),
        `${fmt(g.relleno_m)} m × ${fmt(d.alto_m)} m = ${fmt(g.plancha_m2)} m²; con merma ${fmt(c.merma_pct)} % = ${fmt(g.plancha_m2_merma)} m²`
      ),
      item(
        'cierre-rigidizadores',
        'mec',
        `Rigidizadores (perfil de refuerzo ${perfil})`,
        'm',
        r2(g.rigid_m_merma),
        `${techo(d.alto_m / c.separacion_rigidizadores_m)} filas × ${fmt(g.relleno_m)} m = ${fmt(g.rigid_m)} m; con merma ${fmt(c.merma_pct)} % = ${fmt(g.rigid_m_merma)} m`
      )
    )
  }

  if (d.puerta) {
    const n = d.puerta.hojas * c.bisagras_por_hoja
    if (n > 0) {
      items.push(
        item(
          'cierre-bisagras',
          'mec',
          'Bisagras de puerta',
          'Un',
          n,
          `${c.bisagras_por_hoja} bisagras por hoja × ${d.puerta.hojas} hoja(s) = ${n}`
        )
      )
    }
    if (d.cerradura === 'mecanica') {
      items.push(
        item(
          'cierre-chapa-mecanica',
          'mec',
          'Chapa mecánica para puerta',
          'Un',
          d.puerta.hojas,
          `1 por hoja × ${d.puerta.hojas} hoja(s)`
        )
      )
    }
  }

  if (d.anclaje === 'empotrado') {
    items.push(
      item(
        'cierre-hormigon',
        'mat',
        'Hormigón para fundaciones',
        'm3',
        r2(g.hoyos_m3),
        `${g.postes} hoyos de ${fmt(c.hoyo_ancho_m)} × ${fmt(c.hoyo_largo_m)} × ${fmt(c.hoyo_prof_m)} m = ${fmt(g.hoyos_m3)} m³`
      )
    )
  } else {
    items.push(
      item(
        'cierre-placas',
        'mec',
        'Placas base para postes',
        'Un',
        g.postes,
        `1 placa por poste × ${g.postes} postes`
      ),
      item(
        'cierre-pernos',
        'mec',
        'Pernos de anclaje',
        'Un',
        g.postes * c.pernos_por_placa,
        `${c.pernos_por_placa} pernos por placa × ${g.postes} placas`
      )
    )
  }

  const electrodos = techo(g.m_perfil * c.electrodo_kg_por_m)
  const discos = techo(g.m_perfil / c.m_perfil_por_disco)
  const galones = techo(g.area_pintura_m2 / c.rendimiento_pintura_m2_gal)
  items.push(
    item(
      'cierre-electrodos',
      'ins',
      'Electrodos para soldadura',
      'kg',
      electrodos,
      `${fmt(g.m_perfil)} m de perfil × ${fmt(c.electrodo_kg_por_m)} kg/m, al entero superior`
    ),
    item(
      'cierre-discos',
      'ins',
      'Discos de corte y desbaste',
      'Un',
      discos,
      `${fmt(g.m_perfil)} m de perfil ÷ ${fmt(c.m_perfil_por_disco)} m por disco, al entero superior`
    ),
    item(
      'cierre-anticorrosivo',
      'ins',
      'Anticorrosivo',
      'gal',
      galones,
      `${fmt(g.area_pintura_m2)} m² ÷ ${fmt(c.rendimiento_pintura_m2_gal)} m²/gal, al entero superior`
    ),
    item(
      'cierre-esmalte',
      'ins',
      'Esmalte',
      'gal',
      galones,
      `${fmt(g.area_pintura_m2)} m² ÷ ${fmt(c.rendimiento_pintura_m2_gal)} m²/gal, al entero superior`
    )
  )
  return items
}
