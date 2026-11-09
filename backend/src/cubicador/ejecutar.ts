// Entrada única al cálculo del cubicador. La compuerta la decide el servidor:
// ni el modelo ni un botón pueden saltársela, todos pasan por `ejecutarCubicacion`.
import type { Pool } from 'pg'
import { httpError } from '../utils/httpError'
import { scrubPii } from '../services/chatbotOps'
import { actualizarBorrador, obtenerBorrador } from './borradores'
import { evaluarCompuerta, type EstadoCompuerta } from './compuerta'
import { cubicar } from './motor'
import { cargarParametros } from './params'
import { PERFILES } from './perfiles'
import type { Borrador, PerfilId, ResultadoCubicacion } from './types'

export interface EstadoCubicador {
  borrador_id: string
  perfil: PerfilId
  estado: Borrador['estado']
  compuerta: EstadoCompuerta
  datos_completos: number
  datos_totales: number
  resultado: ResultadoCubicacion | null
  precios_pendientes: number
}

export function estadoCubicador(borrador: Borrador): EstadoCubicador {
  const perfil = PERFILES[borrador.perfil]
  const compuerta = evaluarCompuerta(perfil, borrador.ficha)
  return {
    borrador_id: borrador.id,
    perfil: borrador.perfil,
    estado: borrador.estado,
    compuerta,
    datos_completos: compuerta.respondidas,
    datos_totales: perfil.preguntas.length,
    resultado: borrador.resultado,
    precios_pendientes:
      borrador.resultado?.items.filter(i => i.estado_precio === 'pendiente').length ?? 0,
  }
}

// Resumen de la ficha para el prompt del agente. Pasa por scrubPii (A-21).
export function resumirFicha(borrador: Borrador): string {
  const estado = estadoCubicador(borrador)
  const { ficha } = borrador
  const lineas = [
    `Borrador de cubicación (perfil ${borrador.perfil}, estado ${borrador.estado}).`,
    `Descripción: ${ficha.descripcion || '(sin descripción)'}`,
    `Datos registrados: ${JSON.stringify(ficha.datos)}`,
    `Preguntas marcadas «no sé»: ${ficha.no_sabe.length ? ficha.no_sabe.join(', ') : 'ninguna'}`,
    `Compuerta: ${estado.compuerta.respondidas} de ${estado.compuerta.requeridas} respuestas requeridas (${
      estado.compuerta.habilitado ? 'abierta' : 'cerrada'
    }).`,
  ]
  if (estado.compuerta.siguientes.length) {
    lineas.push(`Siguientes preguntas: ${estado.compuerta.siguientes.join(' | ')}`)
  }
  if (borrador.resultado) {
    lineas.push(
      `Listado calculado: ${borrador.resultado.items.length} ítems, ${estado.precios_pendientes} con precio pendiente.`
    )
  }
  return scrubPii(lineas.join('\n'))
}

export async function ejecutarCubicacion(
  pool: Pool,
  borradorId: string,
  userId: string
): Promise<EstadoCubicador> {
  const borrador = await obtenerBorrador(pool, borradorId, userId)
  if (!borrador) throw httpError('Borrador no encontrado', 404)
  if (borrador.estado === 'ingresado' || borrador.estado === 'cancelado') {
    throw httpError(`El borrador ya está ${borrador.estado}.`, 409)
  }

  const compuerta = evaluarCompuerta(PERFILES[borrador.perfil], borrador.ficha)
  if (!compuerta.habilitado) {
    throw httpError('Faltan datos para cubicar.', 422, {
      faltantes: compuerta.faltantes,
      siguientes: compuerta.siguientes,
    })
  }

  const params = await cargarParametros(pool)
  const resultado = cubicar(borrador.perfil, borrador.ficha, params)
  const actualizado = await actualizarBorrador(
    pool,
    borrador.id,
    userId,
    { resultado, estado: 'cubicado' },
    borrador.version
  )
  return estadoCubicador(actualizado)
}
