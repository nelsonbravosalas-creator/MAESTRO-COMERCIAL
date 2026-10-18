import { describe, it, expect, vi } from 'vitest'
import { Pool } from 'pg'
import { AgentContext } from '../types'
import {
  analizarWinLossClienteTool,
  prepararSeguimientoCotizacionTool,
} from '../tools/followUpTool'

function buildContext(pool: Pool, quotationId?: string): AgentContext {
  return {
    pool,
    userId: 'user-followup-1',
    instruction: 'analizar seguimiento',
    quotationId: quotationId ?? null,
    recentTurns: [],
    graphContext: '',
    runId: 'run-followup-test',
    model: 'gemini-3.6-flash',
  }
}

describe('followUpTool — Inteligencia Win/Loss y Seguimiento Human-in-the-Loop', () => {
  it('recomienda perfil_margen_recomendado competitivo cuando existen pérdidas por precio o competidor', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM clients')) {
        return { rows: [{ id: 'c-1', name: 'Agrosuper S.A.' }] }
      }
      if (sql.includes("FILTER (WHERE status = 'Adjudicada')")) {
        return {
          rows: [{ adjudicadas: '1', perdidas: '2', enviadas: '1' }],
        }
      }
      if (sql.includes("status = 'Perdida'")) {
        return {
          rows: [
            {
              correlative: 'SYM-010-2026',
              loss_reason: 'Precio alto frente a presupuesto',
              loss_competitor: 'ClimaSur',
              total: 4500000,
            },
          ],
        }
      }
      return { rows: [] }
    })

    const pool = { query } as unknown as Pool
    const res = await analizarWinLossClienteTool.execute(
      { cliente_nombre: 'Agrosuper' },
      buildContext(pool)
    )

    expect(res.output.encontrado).toBe(true)
    expect(res.output.perfil_margen_recomendado).toBe('competitivo')
    expect(res.output.competidores_detectados).toEqual(['ClimaSur'])
    const resumen = res.output.resumen as { tasa_conversion_pct: number }
    expect(resumen.tasa_conversion_pct).toBe(33)
  })

  it('recomienda perfil_margen_recomendado estandar cuando el cliente tiene alta tasa de conversión y sin pérdidas por precio', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM clients')) {
        return { rows: [{ id: 'c-2', name: 'Enel Distribución' }] }
      }
      if (sql.includes("FILTER (WHERE status = 'Adjudicada')")) {
        return {
          rows: [{ adjudicadas: '4', perdidas: '0', enviadas: '1' }],
        }
      }
      if (sql.includes("status = 'Perdida'")) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const pool = { query } as unknown as Pool
    const res = await analizarWinLossClienteTool.execute(
      { cliente_nombre: 'Enel' },
      buildContext(pool)
    )

    expect(res.output.encontrado).toBe(true)
    expect(res.output.perfil_margen_recomendado).toBe('estandar')
    const resumen = res.output.resumen as { tasa_conversion_pct: number }
    expect(resumen.tasa_conversion_pct).toBe(100)
  })

  it('genera borrador de seguimiento con requiere_aprobacion_humana=true sin exponer PII (A-21)', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM quotations q')) {
        return {
          rows: [
            {
              id: 'q-500',
              correlative: 'SYM-500-2026',
              ref: 'Mantención Chiller Central',
              status: 'Enviada',
              valid_until: '2026-11-15',
              total: 2850000,
              client_name: 'Clínica Alemana',
            },
          ],
        }
      }
      return { rows: [] }
    })

    const pool = { query } as unknown as Pool
    const res = await prepararSeguimientoCotizacionTool.execute(
      { tono: 'tecnico' },
      buildContext(pool, 'q-500')
    )

    expect(res.output.encontrado).toBe(true)
    expect(res.output.requiere_aprobacion_humana).toBe(true)
    const borrador = res.output.borrador as {
      asunto: string
      mensaje_texto: string
      puntos_clave: string[]
    }
    expect(borrador.asunto).toContain('SYM-500-2026')
    expect(borrador.mensaje_texto).toContain('Clínica Alemana')
    expect(borrador.puntos_clave.length).toBeGreaterThan(0)
    expect(res.output.rut).toBeUndefined()
    expect(res.output.email).toBeUndefined()
  })

  it('maneja correctamente una cotización inexistente en prepararSeguimientoCotizacionTool', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const pool = { query } as unknown as Pool

    const res = await prepararSeguimientoCotizacionTool.execute(
      { quotation_id: 'q-inexistente' },
      buildContext(pool)
    )

    expect(res.output.encontrado).toBe(false)
    expect(res.summary).toContain('no encontrada')
  })
})
