// Despacho del cubicador por perfil. Cada perfil tiene su motor de cálculo.
import { httpError } from '../utils/httpError'
import type { Parametros } from './params'
import type { Ficha, PerfilId, ResultadoCubicacion } from './types'
import { motorHvac } from './motorHvac'
import { motorCierre } from './motorCierre'

export function cubicar(perfil: PerfilId, ficha: Ficha, params: Parametros): ResultadoCubicacion {
  switch (perfil) {
    case 'hvac':
      return motorHvac(ficha, params)
    case 'cierre_metalico':
      return motorCierre(ficha, params)
    default:
      throw httpError(`Perfil desconocido: ${String(perfil)}.`, 422)
  }
}
