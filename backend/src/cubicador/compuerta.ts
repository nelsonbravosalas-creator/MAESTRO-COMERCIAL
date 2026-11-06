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
}

const MAX_SIGUIENTES = 3

export function evaluarCompuerta(perfil: PerfilEntrevista, ficha: Ficha): EstadoCompuerta {
  // "No se" cuenta como respondida: la pregunta se cierra con un supuesto.
  const pendientes = perfil.preguntas.filter(
    p => !ficha.no_sabe.includes(p.clave) && !p.completa(ficha.datos)
  )
  const respondidas = perfil.preguntas.length - pendientes.length
  const requeridas = perfil.todasObligatorias ? perfil.preguntas.length : perfil.minimo
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
