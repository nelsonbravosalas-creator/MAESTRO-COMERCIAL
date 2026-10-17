import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { recordGraphFacts } from './chatbotGraph'

export interface TraceLineItem {
  description: string
  quantity: number
  unitPrice?: number
  days?: number
  category?: string
}

export interface QuotationDelta {
  added: TraceLineItem[]
  removed: TraceLineItem[]
  modified: Array<{
    description: string
    originalQty: number
    updatedQty: number
    diffQty: number
  }>
  totalOriginal: number
  totalUpdated: number
  ratioChange: number
}

export interface LearningTracePayload {
  quotationId: string
  agentRunId?: string | null
  clientId?: string | null
  clientName?: string | null
  comuna?: string | null
  originalItems: TraceLineItem[]
  updatedItems: TraceLineItem[]
  userId?: string | null
}

export interface LearningObservation {
  quotationId: string
  delta: QuotationDelta
  learnedInsights: string[]
  recorded: boolean
}

function normalizeDesc(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Calcula la diferencia entre lo que el bot generó y lo que el usuario humano
 * guardó finalmente (Directriz Learning Loop de OpenJarvis).
 */
export function computeQuotationDelta(
  originalItems: TraceLineItem[],
  updatedItems: TraceLineItem[]
): QuotationDelta {
  const origMap = new Map<string, TraceLineItem>()
  for (const item of originalItems) {
    origMap.set(normalizeDesc(item.description), item)
  }

  const updatedMap = new Map<string, TraceLineItem>()
  for (const item of updatedItems) {
    updatedMap.set(normalizeDesc(item.description), item)
  }

  const added: TraceLineItem[] = []
  const modified: QuotationDelta['modified'] = []

  for (const [normKey, upItem] of updatedMap.entries()) {
    const orig = origMap.get(normKey)
    if (!orig) {
      added.push(upItem)
    } else if (Number(orig.quantity) !== Number(upItem.quantity)) {
      modified.push({
        description: upItem.description,
        originalQty: Number(orig.quantity),
        updatedQty: Number(upItem.quantity),
        diffQty: Number(upItem.quantity) - Number(orig.quantity),
      })
    }
  }

  const removed: TraceLineItem[] = []
  for (const [normKey, origItem] of origMap.entries()) {
    if (!updatedMap.has(normKey)) {
      removed.push(origItem)
    }
  }

  const totalOriginal = originalItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0
  )
  const totalUpdated = updatedItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0
  )
  const ratioChange = totalOriginal > 0 ? (totalUpdated - totalOriginal) / totalOriginal : 0

  return {
    added,
    removed,
    modified,
    totalOriginal,
    totalUpdated,
    ratioChange,
  }
}

/**
 * Registra trazas de retroalimentación en el grafo de conocimiento para mejorar
 * las futuras cotizaciones automáticas del agente sin intervención manual.
 */
export async function recordLearningFeedback(
  pool: Pool,
  payload: LearningTracePayload
): Promise<LearningObservation> {
  const delta = computeQuotationDelta(payload.originalItems, payload.updatedItems)
  const learnedInsights: string[] = []

  // Si no hay diferencias significativas, no hay aprendizaje que extraer
  if (delta.added.length === 0 && delta.modified.length === 0 && delta.removed.length === 0) {
    return {
      quotationId: payload.quotationId,
      delta,
      learnedInsights: ['Cotización aprobada sin modificaciones por el usuario'],
      recorded: false,
    }
  }

  try {
    // Si el humano agregó materiales o partidas específicas, registrar su presencia
    // en el grafo asociado a este cliente/faena (respetando A-21: solo nombres de materiales)
    const newMaterials = delta.added.map(a => a.description)
    if (newMaterials.length > 0 && payload.clientId) {
      await recordGraphFacts(pool, {
        intent: 'modificar_cotizacion',
        clientId: payload.clientId,
        clientName: payload.clientName,
        comuna: payload.comuna,
        materiales: newMaterials,
        quotationId: payload.quotationId,
      })
      learnedInsights.push(
        `Se asociaron ${newMaterials.length} insumos agregados por el usuario al perfil del cliente`
      )
    }

    if (delta.modified.length > 0) {
      learnedInsights.push(
        `Se detectaron ${delta.modified.length} ajustes en cantidades/días por corrección humana`
      )
    }

    logger.info('Learning trace recorded', {
      quotationId: payload.quotationId,
      agentRunId: payload.agentRunId,
      addedItemsCount: delta.added.length,
      modifiedItemsCount: delta.modified.length,
      ratioChange: delta.ratioChange,
    })

    return {
      quotationId: payload.quotationId,
      delta,
      learnedInsights,
      recorded: true,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.warn('Fallo no fatal al registrar traza de aprendizaje', { error: msg })
    return {
      quotationId: payload.quotationId,
      delta,
      learnedInsights: [`Error al persistir traza: ${msg}`],
      recorded: false,
    }
  }
}
