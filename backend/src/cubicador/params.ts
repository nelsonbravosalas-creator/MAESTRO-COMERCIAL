// Parametros de calculo del cubicador. Los calculadores son puros y reciben
// `Parametros`; solo `cargarParametros` toca la base de datos.
import type { Pool } from 'pg'
import { logger } from '../utils/logger'

export interface Refrigerante {
  densidad_liquido_kg_l: number
  kg_cilindro: number
  densidad_vapor_kg_l?: number
}

export interface Nitrogeno {
  /** Caudal de purga durante la soldadura, en L/min. */
  caudal_lpm: number
  /** Factor de holgura sobre el total de litros. */
  holgura: number
  min_por_union: number
  /** Volumen de un balón de nitrógeno, en m3. */
  balon_m3: number
  barridos_flushing: number
  presion_barrido_barg: number
  /** Presión de prueba por código de refrigerante; `default` cubre el resto (supuesto). */
  presion_prueba_barg: Record<string, number>
  /** Volumen supuesto (L) de un tramo abierto cuando la prueba es solo del tramo. */
  volumen_tramo_l: number
}

export interface TareaParam {
  descripcion: string
  hh: number
  /** Si está, la tarea escala por unidad: interior, exterior o metro de línea. */
  por?: 'interior' | 'exterior' | 'metro_linea'
}

export interface HorasHombre {
  /** Tareas por actividad (supuestos iniciales, a calibrar). */
  tareas: Record<string, TareaParam[]>
  eficiencia: number
  horas_jornada: number
  /** HH por cada barrido de flushing. */
  hh_barrido: number
}

/** Parámetros del cierre metálico y su acceso eléctrico (valores iniciales, a calibrar). */
export interface Cierre {
  perfil: string
  barrote: string
  separacion_postes_m: number
  empotrado_m: number
  travesanos: number
  merma_pct: number
  tira_m: number
  hoyo_ancho_m: number
  hoyo_largo_m: number
  hoyo_prof_m: number
  bisagras_por_hoja: number
  recorte_barrote_m: number
  separacion_barrotes_m: number
  separacion_rigidizadores_m: number
  pernos_por_placa: number
  electrodo_kg_por_m: number
  m_perfil_por_disco: number
  perimetro_perfil_m: number
  perimetro_barrote_m: number
  rendimiento_pintura_m2_gal: number
  camara_cada_m: number
  cable_recorrido_poste_m: number
  /** Puntos eléctricos base del acceso (chapa y fuente de poder). */
  puntos_base_electricista: number
  /** Caras pintadas de la plancha del cierre sólido. */
  caras_pintura: number
  /** Rendimientos del soldador (HH), iniciales. */
  hh_sold_m_perfil: number
  hh_sold_barrote: number
  hh_sold_plancha_m2: number
  hh_sold_poste: number
  hh_sold_hoja: number
  hh_sold_pintura_m2: number
  /** Rendimientos del electricista (HH), iniciales. */
  hh_ele_m_canalizacion: number
  hh_ele_punto: number
  hh_ele_tablero: number
  hh_ele_pruebas: number
}

// Interfaz extensible: las tareas siguientes agregan claves (cierre...).
export interface Parametros {
  /** Diametro interior del cobre en mm, por medida nominal. */
  cobre: Record<string, number>
  refrigerantes: Record<string, Refrigerante>
  merma_pct: number
  bombeo: { tramo: number; merma: number; holgura: number }
  nitrogeno: Nitrogeno
  hh: HorasHombre
  /** Carga de placa supuesta (kg) cuando no se conoce; se registra como supuesto crítico. */
  placa_supuesta_kg: number
  /** Cierre metálico y acceso eléctrico. */
  cierre: Cierre
  soldadura: { /** Uniones soldadas que se asumen si no se indican. */ uniones_supuestas: number }
}

export const PARAMETROS_BASE: Parametros = {
  cobre: { '1/4': 4.75, '3/8': 7.92, '1/2': 11.1, '5/8': 14.28, '3/4': 17.45, '7/8': 20.6 },
  refrigerantes: {
    'R-410A': { densidad_liquido_kg_l: 1.06, kg_cilindro: 11.3 },
    'R-404A': { densidad_liquido_kg_l: 1.045, kg_cilindro: 10.9, densidad_vapor_kg_l: 0.0195 },
    // validar contra ficha del fabricante
    'R-32': { densidad_liquido_kg_l: 0.96, kg_cilindro: 9 },
    // validar contra ficha del fabricante
    'R-134a': { densidad_liquido_kg_l: 1.21, kg_cilindro: 13.6 },
    // validar contra ficha del fabricante
    'R-407C': { densidad_liquido_kg_l: 1.13, kg_cilindro: 11.3 },
    // validar contra ficha del fabricante
    'R-22': { densidad_liquido_kg_l: 1.19, kg_cilindro: 13.6 },
  },
  merma_pct: 5,
  placa_supuesta_kg: 4.0,
  // Valores iniciales del cierre metálico, a calibrar con el taller.
  cierre: {
    perfil: '40x40x2',
    barrote: '20x20',
    separacion_postes_m: 2,
    empotrado_m: 0.6,
    travesanos: 3,
    merma_pct: 10,
    tira_m: 6,
    hoyo_ancho_m: 0.3,
    hoyo_largo_m: 0.3,
    hoyo_prof_m: 0.6,
    bisagras_por_hoja: 3,
    recorte_barrote_m: 0.6,
    separacion_barrotes_m: 0.12,
    separacion_rigidizadores_m: 1,
    pernos_por_placa: 4,
    electrodo_kg_por_m: 0.04,
    m_perfil_por_disco: 8,
    perimetro_perfil_m: 0.16,
    perimetro_barrote_m: 0.08,
    rendimiento_pintura_m2_gal: 12,
    camara_cada_m: 12,
    cable_recorrido_poste_m: 7.5,
    puntos_base_electricista: 2,
    caras_pintura: 2,
    // Rendimientos iniciales de soldador y electricista (HH), a calibrar.
    hh_sold_m_perfil: 0.3,
    hh_sold_barrote: 0.1,
    hh_sold_plancha_m2: 0.4,
    hh_sold_poste: 1.5,
    hh_sold_hoja: 2,
    hh_sold_pintura_m2: 0.15,
    hh_ele_m_canalizacion: 0.5,
    hh_ele_punto: 1.5,
    hh_ele_tablero: 2,
    hh_ele_pruebas: 2,
  },
  soldadura: { uniones_supuestas: 2 },
  bombeo: { tramo: 0.2, merma: 0.3, holgura: 0.5 },
  nitrogeno: {
    caudal_lpm: 3,
    holgura: 1.3,
    min_por_union: 15,
    balon_m3: 6,
    barridos_flushing: 3,
    presion_barrido_barg: 5,
    // 37,9 barg = los 550 psi de la plantilla; el resto es un supuesto crítico.
    presion_prueba_barg: { 'R-410A': 37.9, 'R-32': 37.9, default: 9 },
    volumen_tramo_l: 1,
  },
  hh: {
    eficiencia: 0.85,
    horas_jornada: 8,
    hh_barrido: 2,
    // Valores iniciales de los diseños, a calibrar.
    tareas: {
      reparacion_fuga: [
        { descripcion: 'Diagnóstico', hh: 6 },
        { descripcion: 'Recuperación de refrigerante', hh: 3 },
        { descripcion: 'Presurización', hh: 8 },
        { descripcion: 'Soldadura y filtro', hh: 8 },
        { descripcion: 'Vacío', hh: 4 },
        { descripcion: 'Control de estanqueidad', hh: 2 },
        { descripcion: 'Recarga y puesta en marcha', hh: 4 },
        { descripcion: 'Informe', hh: 2 },
      ],
      puesta_a_punto: [
        { descripcion: 'Revisión', hh: 3 },
        { descripcion: 'Recuperación de refrigerante', hh: 2 },
        { descripcion: 'Filtro', hh: 3 },
        { descripcion: 'Prueba', hh: 1.5 },
        { descripcion: 'Vacío', hh: 3 },
        { descripcion: 'Carga', hh: 2 },
        { descripcion: 'Ajuste de válvula', hh: 4 },
        { descripcion: 'Puesta en marcha e informe', hh: 3 },
      ],
      instalacion: [
        { descripcion: 'Unidades interiores', hh: 2, por: 'interior' },
        { descripcion: 'Unidades exteriores', hh: 3, por: 'exterior' },
        { descripcion: 'Línea frigorífica', hh: 0.4, por: 'metro_linea' },
        { descripcion: 'Vacío', hh: 3 },
        { descripcion: 'Puesta en marcha', hh: 2 },
        { descripcion: 'Informe', hh: 1 },
      ],
    },
  },
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Mezcla generica: por cada clave, objeto sobre objeto (superficial); otro valor reemplaza. */
export function mezclarParametros(
  base: Parametros,
  filas: { clave: string; valor: unknown }[]
): Parametros {
  const out: Record<string, unknown> = { ...base }
  for (const { clave, valor } of filas) {
    const actual = out[clave]
    if (esObjeto(actual)) {
      // Una fila que no es objeto no puede corromper la base: se ignora.
      if (esObjeto(valor)) out[clave] = { ...actual, ...valor }
    } else if (typeof actual === 'number') {
      if (typeof valor === 'number' && Number.isFinite(valor)) out[clave] = valor
    } else {
      out[clave] = valor
    }
  }
  return out as unknown as Parametros
}

export async function cargarParametros(pool: Pool): Promise<Parametros> {
  try {
    const r = await pool.query('SELECT clave, valor FROM cubicador_parametros')
    return mezclarParametros(PARAMETROS_BASE, r.rows as { clave: string; valor: unknown }[])
  } catch (err) {
    logger.error('cubicador: no se pudieron cargar los parámetros, se usa la base', {
      error: err instanceof Error ? err.message : String(err),
    })
    return PARAMETROS_BASE
  }
}
