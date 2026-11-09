// Entrada única al cálculo del cubicador. La compuerta la decide el servidor:
// ni el modelo ni un botón pueden saltársela, todos pasan por `ejecutarCubicacion`.
import type { Pool } from 'pg'
import { httpError } from '../utils/httpError'
import { scrubPii } from '../services/chatbotOps'
import { aplicarAjustes, leerAjustes, podarAjustes } from './ajustes'
import { actualizarBorrador, obtenerBorrador } from './borradores'
import { evaluarCompuerta, type EstadoCompuerta } from './compuerta'
import { cubicar } from './motor'
import { cargarParametros } from './params'
import { PERFILES } from './perfiles'
import { resolverPreciosCatalogo } from './precios'
import type { Borrador, ItemListado, PerfilId, ResultadoCubicacion } from './types'

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

const MAX_VALOR = 300
const MAX_DATOS = 1500
const MAX_RESUMEN = 3000

// Una sola línea y con tope: el texto del usuario no debe poder simular otras secciones del prompt.
function compactar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAX_VALOR)
}

// Resumen de la ficha para el prompt del agente. Pasa por scrubPii (A-21).
export function resumirFicha(borrador: Borrador): string {
  const estado = estadoCubicador(borrador)
  const { ficha } = borrador
  const datos = JSON.stringify(ficha.datos, (_k, v) => (typeof v === 'string' ? compactar(v) : v))
  const lineas = [
    `Borrador de cubicación (perfil ${borrador.perfil}, estado ${borrador.estado}).`,
    `Descripción: ${compactar(ficha.descripcion) || '(sin descripción)'}`,
    `Datos registrados: ${datos.slice(0, MAX_DATOS)}`,
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
  return scrubPii(lineas.join('\n')).slice(0, MAX_RESUMEN)
}

// Copia el precio ya resuelto de un ítem anterior al recalculado. Única fuente de esta
// regla: la usan ajustar_listado y la re-cubicación, para que ninguna borre precios.
export function copiarPrecio(destino: ItemListado, anterior: ItemListado): void {
  destino.precio_unitario = anterior.precio_unitario
  destino.fuente = anterior.fuente
  destino.estado_precio = anterior.estado_precio
  if (anterior.tienda !== undefined) destino.tienda = anterior.tienda
  else delete destino.tienda
  if (anterior.fuente_url !== undefined) destino.fuente_url = anterior.fuente_url
  else delete destino.fuente_url
}

// Conserva los precios de los ítems cuyo `id` y `cantidad` no cambiaron.
export function conservarPrecios(
  nuevos: ItemListado[],
  anteriores: ItemListado[] | undefined,
  fijados: ReadonlySet<string> = new Set()
): ItemListado[] {
  const previos = new Map((anteriores ?? []).map(i => [i.id, i]))
  return nuevos.map(nuevo => {
    const anterior = previos.get(nuevo.id)
    if (!anterior || fijados.has(nuevo.id) || anterior.cantidad !== nuevo.cantidad) return nuevo
    const item = { ...nuevo }
    copiarPrecio(item, anterior)
    return item
  })
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
    throw httpError(compuerta.motivo ?? 'Faltan datos para cubicar.', 422, {
      faltantes: compuerta.faltantes,
      siguientes: compuerta.siguientes,
    })
  }

  const params = await cargarParametros(pool)
  // Los ajustes manuales (ítems quitados, cantidades y precios fijados) se reaplican encima del
  // cálculo; después, en una re-cubicación, se conservan los precios ya resueltos.
  const ajustes = leerAjustes(borrador.ficha.datos.ajustes_listado)
  const motor = cubicar(borrador.perfil, borrador.ficha, params)
  const calculado = aplicarAjustes(motor, ajustes)
  // Los ajustes de ítems que el motor ya no emite se podan: no deben ocultar ni congelar otros.
  const idsMotor = new Set(motor.items.map(i => i.id))
  const podados = podarAjustes(ajustes, idsMotor)
  const resultado: ResultadoCubicacion =
    borrador.estado === 'cubicado' && borrador.resultado
      ? {
          ...calculado,
          items: conservarPrecios(
            calculado.items,
            borrador.resultado.items,
            new Set(Object.keys(ajustes.precios))
          ),
        }
      : calculado
  const actualizado = await actualizarBorrador(
    pool,
    borrador.id,
    userId,
    {
      // F3: el catálogo y la caché se resuelven aquí, no después, para que el listado llegue
      // sin precios pendientes que la cotización rechazaría en el mismo turno.
      resultado: await resolverPreciosCatalogo(pool, resultado),
      estado: 'cubicado',
      ...(podados
        ? {
            ficha: {
              ...borrador.ficha,
              datos: { ...borrador.ficha.datos, ajustes_listado: podados },
            },
          }
        : {}),
    },
    borrador.version
  )
  return estadoCubicador(actualizado)
}
