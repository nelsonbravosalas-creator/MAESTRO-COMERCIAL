// Compuerta del servidor: decide si la cubicacion procede. Funcion pura.
// El LLM puede escribir datos en la ficha, pero nunca decide el resultado.
import type { PerfilEntrevista } from './perfiles'
import type { Ficha } from './types'

export interface EstadoCompuerta {
  respondidas: number
  requeridas: number
  habilitado: boolean
  faltantes: string[]
  siguientes: string[]
  /** Por qué sigue cerrada cuando no basta con contar respuestas. */
  motivo?: string
}

const MAX_SIGUIENTES = 3

export function evaluarCompuerta(perfil: PerfilEntrevista, ficha: Ficha): EstadoCompuerta {
  // "No se" cuenta como respondida: la pregunta se cierra con un supuesto.
  const pendientes = perfil.preguntas.filter(
    p => !ficha.no_sabe.includes(p.clave) && !p.completa(ficha.datos)
  )
  const respondidas = perfil.preguntas.length - pendientes.length
  // `minimo` se ignora cuando todasObligatorias es true.
  const requeridas = perfil.todasObligatorias ? perfil.preguntas.length : perfil.minimo
  // «No sé» cierra la pregunta con un supuesto, pero el servidor no puede
  // comprobar que la persona lo dijo: se exige al menos un dato real.
  const reales = perfil.preguntas.filter(p => p.completa(ficha.datos)).length
  if (reales === 0) {
    const sinDato = perfil.preguntas
    return {
      respondidas,
      requeridas,
      habilitado: false,
      faltantes: sinDato.map(p => p.clave),
      siguientes: [...sinDato]
        .sort((a, b) => b.impacto - a.impacto)
        .slice(0, MAX_SIGUIENTES)
        .map(p => p.texto),
      motivo: 'Falta al menos un dato real de la obra: no basta con marcar «no sé».',
    }
  }
  return {
    respondidas,
    requeridas,
    habilitado: respondidas >= requeridas,
    faltantes: pendientes.map(p => p.clave),
    siguientes: [...pendientes]
      .sort((a, b) => b.impacto - a.impacto)
      .slice(0, MAX_SIGUIENTES)
      .map(p => p.texto),
  }
}
