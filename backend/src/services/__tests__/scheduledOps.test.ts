import { describe, it, expect, vi } from 'vitest'
import { generateMorningBriefing } from '../scheduledOps'
import type { Pool } from 'pg'

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Scheduled Ops (OpenJarvis Primitives): generateMorningBriefing', () => {
  it('retorna resumen limpio cuando no hay alertas comerciales', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool

    const briefing = await generateMorningBriefing(mockPool)

    expect(briefing.totalAlerts).toBe(0)
    expect(briefing.expiringQuotations).toHaveLength(0)
    expect(briefing.awardedMissingOc).toHaveLength(0)
    expect(briefing.pendingBilling).toHaveLength(0)
    expect(briefing.executiveSummary).toContain('No hay alertas críticas')
  })

  it('detecta cotizaciones por vencer y clasifica severidad', async () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const mockPool = {
      query: vi
        .fn()
        // 1. Expiring quotations
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'q-exp-1',
              correlative: 'COT-2026-001',
              client_name: 'Metro S.A.',
              valid_until: futureDate,
              total: 1500000,
            },
          ],
        })
        // 2. Missing OC
        .mockResolvedValueOnce({ rows: [] })
        // 3. Pending billing
        .mockResolvedValueOnce({ rows: [] }),
    } as unknown as Pool

    const briefing = await generateMorningBriefing(mockPool)

    expect(briefing.totalAlerts).toBe(1)
    expect(briefing.expiringQuotations).toHaveLength(1)
    expect(briefing.expiringQuotations[0].correlative).toBe('COT-2026-001')
    expect(briefing.alerts[0].type).toBe('expiring_quotation')
    expect(briefing.alerts[0].severity).toBe('high')
    expect(briefing.executiveSummary).toContain('1 cotización(es) próxima(s) a vencer')
  })

  it('detecta cotizaciones adjudicadas sin OC y pendientes de facturación', async () => {
    const mockPool = {
      query: vi
        .fn()
        // 1. Expiring quotations
        .mockResolvedValueOnce({ rows: [] })
        // 2. Missing OC
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'q-oc-1',
              correlative: 'COT-2026-088',
              client_name: 'Mall Plaza',
              total: 4200000,
            },
          ],
        })
        // 3. Pending billing
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'q-bill-1',
              correlative: 'COT-2026-050',
              client_name: 'Clínica Alemana',
              total_con_iva: 5000000,
              invoiced_total: 2000000,
            },
          ],
        }),
    } as unknown as Pool

    const briefing = await generateMorningBriefing(mockPool)

    expect(briefing.totalAlerts).toBe(2)
    expect(briefing.awardedMissingOc).toHaveLength(1)
    expect(briefing.pendingBilling).toHaveLength(1)
    expect(briefing.pendingBilling[0].remainingBalanceClp).toBe(3000000)

    const ocAlert = briefing.alerts.find(a => a.type === 'pending_oc')
    const billAlert = briefing.alerts.find(a => a.type === 'pending_invoice')

    expect(ocAlert?.severity).toBe('high')
    expect(ocAlert?.title).toContain('COT-2026-088')
    expect(billAlert?.severity).toBe('medium')
    expect(billAlert?.detail).toContain('$3.000.000')
    expect(briefing.executiveSummary).toContain(
      '1 cotización(es) adjudicada(s) sin Orden de Compra'
    )
    expect(briefing.executiveSummary).toContain('1 cotización(es) con saldo pendiente')
  })

  it('maneja errores de consulta en la BD degradando elegantemente', async () => {
    const mockPool = {
      query: vi.fn().mockRejectedValue(new Error('DB Connection reset')),
    } as unknown as Pool

    const briefing = await generateMorningBriefing(mockPool)

    expect(briefing.totalAlerts).toBe(0)
    expect(briefing.expiringQuotations).toEqual([])
    expect(briefing.executiveSummary).toContain('No hay alertas críticas')
  })
})
