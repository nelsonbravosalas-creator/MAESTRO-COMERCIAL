import { Pool } from 'pg'
import { getCurrentRule, isComunaEnSantiago } from './chatbotRules'

export interface AutoLineItemsParams {
  dias: number
  dotacion: number
  comuna?: string | null
}

export interface ImportLinea {
  category_id: string
  descripcion: string
  unidad: string
  cantidad: number
  dias: number
  precio_unitario: number
}

/**
 * El LLM nunca calcula montos — solo extrae `dias`/`dotacion`/`comuna` de la
 * instrucción del usuario. Este motor determinista hace la aritmética y
 * decide "fuera de Santiago" contra la regla editable por chat
 * (`comunas_region_metropolitana`), para que una multiplicación alucinada
 * por el modelo no termine en una cotización real.
 */
export async function buildAutoLineItems(
  pool: Pool,
  params: AutoLineItemsParams
): Promise<ImportLinea[]> {
  const { dias, dotacion, comuna } = params
  if (!Number.isFinite(dias) || !Number.isFinite(dotacion) || dias < 1 || dotacion < 1) return []

  const items: ImportLinea[] = []

  const colacion = await getCurrentRule<number>(pool, 'tarifa_colacion_diaria')
  if (colacion && Number(colacion.value) > 0) {
    items.push({
      category_id: 'mo',
      descripcion: `Colacion (${dotacion} personas x ${dias} dias)`,
      unidad: 'persona/dia',
      cantidad: dotacion,
      dias,
      precio_unitario: Number(colacion.value),
    })
  }

  if (comuna) {
    const enSantiago = await isComunaEnSantiago(pool, comuna)
    if (enSantiago === false) {
      const bono = await getCurrentRule<number>(pool, 'tarifa_bonificacion_desplazamiento_diaria')
      if (bono && Number(bono.value) > 0) {
        items.push({
          category_id: 'mo',
          descripcion: `Bonificacion desplazamiento fuera de Santiago - ${comuna} (${dotacion} x ${dias})`,
          unidad: 'persona/dia',
          cantidad: dotacion,
          dias,
          precio_unitario: Number(bono.value),
        })
      }
    }
  }

  return items
}

/**
 * Items que el usuario describió a mano (ej. "necesito 10 codos de cobre")
 * en vez de dejarlos salir del motor de alimentación/bonificación. El LLM no
 * calcula montos, y tampoco se le pide una cantidad real — así que estos
 * items SIEMPRE quedan con cantidad=1/precio=0 como placeholder a completar
 * en el formulario. Extraído de chatbot.ts (estaba duplicado entre
 * crear_cotizacion y modificar_cotizacion) — el caller es responsable de
 * avisarle al usuario que estos items necesitan precio manual.
 */
export function buildManualLineItems(itemsMencionados: string[] | null | undefined): ImportLinea[] {
  return (itemsMencionados ?? []).map(desc => ({
    category_id: 'mat',
    descripcion: desc,
    unidad: 'Und',
    cantidad: 1,
    dias: 1,
    precio_unitario: 0,
  }))
}
