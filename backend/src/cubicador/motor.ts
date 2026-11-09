// Despacho del cubicador por perfil. Cada perfil tiene su motor de cálculo.
import { httpError } from '../utils/httpError'
import type { Parametros } from './params'
import type { Ficha, PerfilId, ResultadoCubicacion } from './types'
import { motorHvac } from './motorHvac'

export function cubicar(perfil: PerfilId, ficha: Ficha, params: Parametros): ResultadoCubicacion {
  switch (perfil) {
    case 'hvac':
      return motorHvac(ficha, params)
    case 'cierre_metalico':
      // La Tarea 10 conecta el motor de cierre metálico.
      throw httpError('El cubicador de cierre metálico aún no está implementado.', 422)
    default:
      throw httpError(`Perfil desconocido: ${String(perfil)}.`, 422)
  }
}
