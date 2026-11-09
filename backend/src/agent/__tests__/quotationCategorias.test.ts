import { describe, it, expect } from 'vitest'
import { CATEGORIAS_LINEA, validarCategoriasMateriales } from '../tools/quotationTool'
import { categoriasConFaltantes } from '../../services/chatbotOps'

describe('F1: categorías que el agente puede proponer', () => {
  it('no ofrece sub ni eq, que la cotización no guarda', () => {
    expect(CATEGORIAS_LINEA).not.toContain('sub')
    expect(CATEGORIAS_LINEA).not.toContain('eq')
  })

  it('rechaza en tiempo de ejecución una categoría inválida (422)', () => {
    expect(() =>
      validarCategoriasMateriales({ materiales: [{ descripcion: 'x', categoria: 'sub' }] })
    ).toThrow(/no existe/)
  })

  it('acepta las siete categorías válidas y las líneas sin categoría', () => {
    expect(() =>
      validarCategoriasMateriales({
        materiales: [
          { descripcion: 'a', categoria: 'mat' },
          { descripcion: 'b', categoria: 'ins' },
          { descripcion: 'c' },
        ],
      })
    ).not.toThrow()
  })
})

describe('F2: categorías faltantes al agregar líneas', () => {
  it('crea la fila de una categoría nueva con margen 30 %', () => {
    const resultado = categoriasConFaltantes(
      [
        { category_id: 'mo', margin_pct: 35 },
        { category_id: 'log', margin_pct: 30 },
      ],
      [{ category_id: 'ins' }]
    )
    const ins = resultado.find(c => c.category_id === 'ins') as { margin_pct: number } | undefined
    expect(ins).toBeDefined()
    expect(ins?.margin_pct).toBe(30)
  })

  it('no toca las filas que ya existen', () => {
    const existentes = [{ category_id: 'mo', margin_pct: 35 }]
    const resultado = categoriasConFaltantes(existentes, [{ category_id: 'mo' }])
    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toBe(existentes[0])
  })

  it('una cotización solo con mo y log recibe filas para mat, mec, ele e ins', () => {
    const resultado = categoriasConFaltantes(
      [{ category_id: 'mo' }, { category_id: 'log' }],
      [
        { category_id: 'mat' },
        { category_id: 'mec' },
        { category_id: 'ele' },
        { category_id: 'ins' },
      ]
    )
    expect(resultado.map(c => c.category_id).sort()).toEqual(
      ['ele', 'ins', 'log', 'mat', 'mec', 'mo'].sort()
    )
  })
})
