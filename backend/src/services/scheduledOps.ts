import { Pool } from 'pg'
import { logger } from '../utils/logger'

export interface MorningBriefingAlert {
  type: 'expiring_quotation' | 'pending_oc' | 'pending_invoice'
  severity: 'low' | 'medium' | 'high'
  title: string
  detail: string
  quotationId?: string
  correlative?: string
}

export interface MorningBriefingResult {
  date: string
  totalAlerts: number
  expiringQuotations: Array<{
    id: string
    correlative: string
    clientName: string
    validUntil: string
    totalClp: number
    daysRemaining: number
  }>
  awardedMissingOc: Array<{
    id: string
    correlative: string
    clientName: string
    totalClp: number
  }>
  pendingBilling: Array<{
    id: string
    correlative: string
    clientName: string
    remainingBalanceClp: number
  }>
  alerts: MorningBriefingAlert[]
  executiveSummary: string
}

/**
 * Operación Proactiva de OpenJarvis (Scheduled Ops / Morning Brief):
 * Recopila diariamente a primera hora o bajo demanda el estado de la cartera
 * comercial: cotizaciones por vencer, OCs faltantes y saldos pendientes.
 */
export async function generateMorningBriefing(pool: Pool): Promise<MorningBriefingResult> {
  const today = new Date().toISOString().slice(0, 10)

  // 1. Cotizaciones enviadas que vencen en los próximos 7 días
  const expiringRes = await pool
    .query<{
      id: string
      correlative: string
      client_name: string | null
      valid_until: string
      total: string | number
    }>(
      `SELECT q.id, q.correlative, c.name as client_name, q.valid_until, q.total
         FROM quotations q
         LEFT JOIN clientes c ON c.id = q.client_id
        WHERE q.status = 'Enviada'
          AND q.valid_until IS NOT NULL
          AND q.valid_until::date <= (CURRENT_DATE + INTERVAL '7 days')
          AND q.valid_until::date >= CURRENT_DATE
          AND q.deleted_at IS NULL
        ORDER BY q.valid_until ASC
        LIMIT 10`
    )
    .catch(err => {
      logger.error('Error al consultar cotizaciones por vencer para briefing', {
        error: String(err),
      })
      return { rows: [] }
    })

  // 2. Cotizaciones adjudicadas sin número de Orden de Compra (OC)
  const missingOcRes = await pool
    .query<{
      id: string
      correlative: string
      client_name: string | null
      total: string | number
    }>(
      `SELECT q.id, q.correlative, c.name as client_name, q.total
         FROM quotations q
         LEFT JOIN clientes c ON c.id = q.client_id
        WHERE q.status = 'Adjudicada'
          AND (q.oc_number IS NULL OR TRIM(q.oc_number) = '')
          AND q.deleted_at IS NULL
        ORDER BY q.created_at DESC
        LIMIT 10`
    )
    .catch(err => {
      logger.error('Error al consultar cotizaciones adjudicadas sin OC', {
        error: String(err),
      })
      return { rows: [] }
    })

  // 3. Cotizaciones adjudicadas con saldo por facturar
  const pendingBillingRes = await pool
    .query<{
      id: string
      correlative: string
      client_name: string | null
      total_con_iva: string | number
      invoiced_total: string | number
    }>(
      `SELECT q.id, q.correlative, c.name as client_name, q.total_con_iva, q.invoiced_total
         FROM quotations q
         LEFT JOIN clientes c ON c.id = q.client_id
        WHERE q.status = 'Adjudicada'
          AND (COALESCE(q.total_con_iva, 0) - COALESCE(q.invoiced_total, 0)) > 1000
          AND q.deleted_at IS NULL
        ORDER BY q.created_at DESC
        LIMIT 10`
    )
    .catch(err => {
      logger.error('Error al consultar facturación pendiente para briefing', {
        error: String(err),
      })
      return { rows: [] }
    })

  const alerts: MorningBriefingAlert[] = []

  const expiringQuotations = expiringRes.rows.map(r => {
    const validDate = new Date(r.valid_until)
    const diffDays = Math.ceil((validDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    const item = {
      id: r.id,
      correlative: r.correlative,
      clientName: r.client_name || 'Cliente sin nombre',
      validUntil: String(r.valid_until),
      totalClp: Math.round(Number(r.total) || 0),
      daysRemaining: Math.max(0, diffDays),
    }

    alerts.push({
      type: 'expiring_quotation',
      severity: diffDays <= 2 ? 'high' : 'medium',
      title: `Cotización ${r.correlative} por vencer`,
      detail: `${item.clientName} tiene oferta de $${item.totalClp.toLocaleString('es-CL')} que vence en ${item.daysRemaining} día(s).`,
      quotationId: r.id,
      correlative: r.correlative,
    })

    return item
  })

  const awardedMissingOc = missingOcRes.rows.map(r => {
    const item = {
      id: r.id,
      correlative: r.correlative,
      clientName: r.client_name || 'Cliente sin nombre',
      totalClp: Math.round(Number(r.total) || 0),
    }

    alerts.push({
      type: 'pending_oc',
      severity: 'high',
      title: `Falta registrar OC para ${r.correlative}`,
      detail: `La cotización de ${item.clientName} fue adjudicada pero aún no se registra el folio de la Orden de Compra.`,
      quotationId: r.id,
      correlative: r.correlative,
    })

    return item
  })

  const pendingBilling = pendingBillingRes.rows.map(r => {
    const remaining = Math.round((Number(r.total_con_iva) || 0) - (Number(r.invoiced_total) || 0))
    const item = {
      id: r.id,
      correlative: r.correlative,
      clientName: r.client_name || 'Cliente sin nombre',
      remainingBalanceClp: remaining,
    }

    alerts.push({
      type: 'pending_invoice',
      severity: 'medium',
      title: `Saldo por facturar en ${r.correlative}`,
      detail: `Resta emitir factura por saldo de $${remaining.toLocaleString('es-CL')} para ${item.clientName}.`,
      quotationId: r.id,
      correlative: r.correlative,
    })

    return item
  })

  const totalAlerts = alerts.length
  let executiveSummary = `Buenos días. Tienes ${totalAlerts} asunto(s) comercial(es) prioritario(s) hoy:`
  if (expiringQuotations.length > 0) {
    executiveSummary += `\n• ${expiringQuotations.length} cotización(es) próxima(s) a vencer.`
  }
  if (awardedMissingOc.length > 0) {
    executiveSummary += `\n• ${awardedMissingOc.length} cotización(es) adjudicada(s) sin Orden de Compra.`
  }
  if (pendingBilling.length > 0) {
    executiveSummary += `\n• ${pendingBilling.length} cotización(es) con saldo pendiente de facturar.`
  }
  if (totalAlerts === 0) {
    executiveSummary =
      'Buenos días. No hay alertas críticas ni cotizaciones vencidas pendientes hoy. Todo al día.'
  }

  return {
    date: today,
    totalAlerts,
    expiringQuotations,
    awardedMissingOc,
    pendingBilling,
    alerts,
    executiveSummary,
  }
}
