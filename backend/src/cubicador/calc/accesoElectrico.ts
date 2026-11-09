// Calculadora del acceso eléctrico del cierre (chapa eléctrica, alimentación,
// canalización, protecciones y control de acceso). Funciones puras. La
// tramitación SEC no se cubica: solo se advierte en el motor.
import type { Parametros } from '../params'
import type { ItemListado } from '../types'
import { fmt, item, validarParametrosCierre } from './cierreMetalico'

export type Canalizacion = 'enterrada' | 'sobrepuesta' | 'aerea'

export interface DatosAcceso {
  /** Hojas de puerta con chapa eléctrica. */
  hojas: number
  /** Distancia al tablero; si no se conoce se omiten cable y canalización. */
  distancia_tablero_m?: number
  canalizacion?: Canalizacion
  citofono?: boolean
  boton?: boolean
}

const techo = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e6)

export function calcularAcceso(d: DatosAcceso, params: Parametros): ItemListado[] {
  validarParametrosCierre(params)
  const c = params.cierre
  const items: ItemListado[] = []

  items.push(
    item(
      'acceso-chapa-electrica',
      'ele',
      'Chapa eléctrica para puerta',
      'Un',
      d.hojas,
      `1 por hoja de puerta × ${d.hojas} hoja(s)`
    ),
    item(
      'acceso-fuente-poder',
      'ele',
      'Fuente de poder con batería de respaldo',
      'Un',
      1,
      '1 fuente para la chapa y el control de acceso'
    )
  )

  if (d.distancia_tablero_m !== undefined) {
    const merma = 1 + c.merma_pct / 100
    const base = d.distancia_tablero_m + c.cable_recorrido_poste_m
    const cable = techo(base * merma)
    items.push(
      item(
        'acceso-cable',
        'ele',
        'Cable de alimentación',
        'm',
        cable,
        `(${fmt(d.distancia_tablero_m)} m al tablero + ${fmt(c.cable_recorrido_poste_m)} m de recorrido por el poste) × ${fmt(merma)} de merma = ${fmt(base * merma)} m, al entero superior`
      )
    )
    const canal = d.canalizacion ?? 'enterrada'
    if (canal !== 'aerea') {
      items.push(
        item(
          'acceso-caneria',
          'ele',
          canal === 'enterrada' ? 'Cañería para tramo enterrado' : 'Cañería sobrepuesta',
          'm',
          d.distancia_tablero_m,
          `${fmt(d.distancia_tablero_m)} m de ${canal === 'enterrada' ? 'tramo enterrado' : 'recorrido sobrepuesto'}`
        )
      )
    }
    if (canal === 'enterrada') {
      const camaras = Math.floor(Math.round((d.distancia_tablero_m / c.camara_cada_m) * 1e6) / 1e6)
      if (camaras > 0) {
        items.push(
          item(
            'acceso-camaras',
            'ele',
            'Cámaras de registro',
            'Un',
            camaras,
            `una cámara cada ${fmt(c.camara_cada_m)} m: ${fmt(d.distancia_tablero_m)} m ÷ ${fmt(c.camara_cada_m)} m = ${camaras}`
          )
        )
      }
    }
  }

  if (d.citofono) {
    items.push(item('acceso-citofono', 'ele', 'Citófono exterior', 'Un', 1, '1 equipo exterior'))
  }
  if (d.boton) {
    items.push(
      item(
        'acceso-boton',
        'ele',
        'Botón de salida (pulsador interior)',
        'Un',
        1,
        '1 pulsador interior'
      )
    )
  }

  items.push(
    item(
      'acceso-automatico',
      'ele',
      'Automático dedicado',
      'Un',
      1,
      '1 circuito dedicado para el acceso'
    ),
    item(
      'acceso-diferencial',
      'ele',
      'Diferencial dedicado',
      'Un',
      1,
      '1 diferencial para el circuito del acceso'
    )
  )
  return items
}

/** HH del electricista, con los rendimientos iniciales de los parámetros. */
export function hhElectricista(d: DatosAcceso, params: Parametros): number {
  validarParametrosCierre(params)
  const c = params.cierre
  const puntos = c.puntos_base_electricista + (d.citofono ? 1 : 0) + (d.boton ? 1 : 0)
  const metros =
    d.distancia_tablero_m !== undefined && d.canalizacion !== 'aerea' ? d.distancia_tablero_m : 0
  return (
    metros * c.hh_ele_m_canalizacion + puntos * c.hh_ele_punto + c.hh_ele_tablero + c.hh_ele_pruebas
  )
}
