import { describe, it, expect, vi } from 'vitest'
import {
  computeQuotationDelta,
  recordLearningFeedback,
  type TraceLineItem,
} from '../learningTraces'
import type { Pool } from 'pg'

vi.mock('../chatbotGraph', () => ({
  recordGraphFacts: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Learning Loop (OpenJarvis Primitives): computeQuotationDelta', () => {
  it('detecta partidas añadidas por el humano', () => {
    const original: TraceLineItem[] = [
      { description: 'Técnico HVAC', quantity: 2, unitPrice: 45000 },
    ]
    const updated: TraceLineItem[] = [
      { description: 'Técnico HVAC', quantity: 2, unitPrice: 45000 },
      { description: 'Viático Faena', quantity: 1, unitPrice: 35000 },
    ]

    const delta = computeQuotationDelta(original, updated)
    expect(delta.added).toHaveLength(1)
    expect(delta.added[0].description).toBe('Viático Faena')
    expect(delta.removed).toHaveLength(0)
    expect(delta.modified).toHaveLength(0)
    expect(delta.totalOriginal).toBe(90000)
    expect(delta.totalUpdated).toBe(125000)
    expect(delta.ratioChange).toBeCloseTo((125000 - 90000) / 90000)
  })

  it('detecta modificaciones de cantidades y eliminaciones', () => {
    const original: TraceLineItem[] = [
      { description: 'Técnico HVAC', quantity: 2, unitPrice: 45000 },
      { description: 'Andamios 2 Cuerpos', quantity: 1, unitPrice: 60000 },
    ]
    const updated: TraceLineItem[] = [
      { description: 'Técnico HVAC', quantity: 4, unitPrice: 45000 }, // aumentó cantidad
    ]

    const delta = computeQuotationDelta(original, updated)
    expect(delta.added).toHaveLength(0)
    expect(delta.removed).toHaveLength(1)
    expect(delta.removed[0].description).toBe('Andamios 2 Cuerpos')
    expect(delta.modified).toEqual([
      {
        description: 'Técnico HVAC',
        originalQty: 2,
        updatedQty: 4,
        diffQty: 2,
      },
    ])
  })

  it('retorna sin diferencias si ambas listas son equivalentes', () => {
    const original: TraceLineItem[] = [
      { description: 'Técnico HVAC', quantity: 2, unitPrice: 45000 },
    ]
    const updated: TraceLineItem[] = [
      { description: 'técnico hvac ', quantity: 2, unitPrice: 45000 }, // normalizado con espacios/mayúsculas
    ]

    const delta = computeQuotationDelta(original, updated)
    expect(delta.added).toHaveLength(0)
    expect(delta.removed).toHaveLength(0)
    expect(delta.modified).toHaveLength(0)
  })
})

describe('Learning Loop: recordLearningFeedback', () => {
  const fakePool = {} as unknown as Pool

  it('retorna recorded=false si no hubo cambios humanos en la cotización', async () => {
    const res = await recordLearningFeedback(fakePool, {
      quotationId: 'q-100',
      originalItems: [{ description: 'Item 1', quantity: 1 }],
      updatedItems: [{ description: 'Item 1', quantity: 1 }],
    })

    expect(res.recorded).toBe(false)
    expect(res.learnedInsights[0]).toContain('sin modificaciones')
  })

  it('extrae observaciones de aprendizaje y actualiza el grafo cuando hay cambios', async () => {
    const res = await recordLearningFeedback(fakePool, {
      quotationId: 'q-200',
      agentRunId: 'run-99',
      clientId: 'c-enel',
      clientName: 'Enel Generación',
      comuna: 'Renca',
      originalItems: [{ description: 'Técnico', quantity: 2, unitPrice: 50000 }],
      updatedItems: [
        { description: 'Técnico', quantity: 3, unitPrice: 50000 },
        { description: 'Nitrógeno Alta Pureza', quantity: 1, unitPrice: 25000 },
      ],
    })

    expect(res.recorded).toBe(true)
    expect(res.delta.added).toHaveLength(1)
    expect(res.delta.modified).toHaveLength(1)
    expect(res.learnedInsights.some(i => i.includes('insumos agregados'))).toBe(true)
  })
})
