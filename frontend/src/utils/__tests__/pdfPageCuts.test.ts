import { describe, expect, it } from 'vitest'
import { computePageCuts } from '../pdfPageCuts'

describe('computePageCuts', () => {
  it('devuelve una sola página si el documento cabe', () => {
    expect(computePageCuts([], 500, 1000)).toEqual([{ start: 0, end: 500 }])
  })

  it('no devuelve nada para un documento vacío', () => {
    expect(computePageCuts([], 0, 1000)).toEqual([])
  })

  it('sube el corte al inicio de un bloque que quedaría partido', () => {
    const blocks = [
      { top: 0, bottom: 400 },
      { top: 400, bottom: 900 },
      { top: 900, bottom: 1300 },
    ]
    const slices = computePageCuts(blocks, 1300, 1000)
    // El bloque 400-900 cabe completo en la primera página; el 900-1300 se va a la segunda.
    expect(slices).toEqual([
      { start: 0, end: 900 },
      { start: 900, end: 1300 },
    ])
  })

  it('no mueve el corte si cae justo entre bloques', () => {
    const blocks = [
      { top: 0, bottom: 500 },
      { top: 500, bottom: 1000 },
      { top: 1000, bottom: 1500 },
    ]
    expect(computePageCuts(blocks, 1500, 1000)).toEqual([
      { start: 0, end: 1000 },
      { start: 1000, end: 1500 },
    ])
  })

  it('no deja un título huérfano al final de la página', () => {
    const blocks = [
      { top: 0, bottom: 700 },
      { top: 700, bottom: 780, keepWithNext: true },
      { top: 780, bottom: 1400 },
    ]
    expect(computePageCuts(blocks, 1400, 1000)).toEqual([
      { start: 0, end: 700 },
      { start: 700, end: 1400 },
    ])
  })

  it('corta en el límite si un bloque es más alto que una página', () => {
    const blocks = [{ top: 0, bottom: 2500 }]
    expect(computePageCuts(blocks, 2500, 1000)).toEqual([
      { start: 0, end: 1000 },
      { start: 1000, end: 2000 },
      { start: 2000, end: 2500 },
    ])
  })

  it('cubre todo el documento sin huecos ni solapes', () => {
    const blocks = Array.from({ length: 40 }, (_, i) => ({ top: i * 130, bottom: i * 130 + 120 }))
    const total = 40 * 130
    const slices = computePageCuts(blocks, total, 800)
    expect(slices[0].start).toBe(0)
    expect(slices[slices.length - 1].end).toBe(total)
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].start).toBe(slices[i - 1].end)
    }
  })
})
