import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

export const createDashboardRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/kpis', async (req: AuthRequest, res) => {
    try {
      const [clients, openQuotes, projects, invoiced, costs, pipeline] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM clients WHERE deleted_at IS NULL'),
        pool.query(
          `SELECT COUNT(*)::int AS count
             FROM quotations
            WHERE status IN ('Emitida', 'Enviada')
              AND kind != 'maintenance'
              AND deleted_at IS NULL`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count
             FROM projects
            WHERE status = 'in_progress'
              AND deleted_at IS NULL`
        ),
        pool.query(
          `SELECT COALESCE(SUM(total_amount), 0) AS total
             FROM invoices
            WHERE status IN ('issued', 'paid')
              AND deleted_at IS NULL`
        ),
        pool.query(
          `SELECT COALESCE(SUM(quantity * unit_price), 0) AS total
             FROM execution_costs`
        ),
        pool.query(
          `SELECT COALESCE(SUM(v.venta_neta), 0) AS total
             FROM v_quotation_totals v
             JOIN quotations q ON q.id = v.quotation_id
            WHERE q.status IN ('Emitida', 'Enviada')
              AND q.kind != 'maintenance'
              AND q.deleted_at IS NULL`
        ),
      ])

      const totalFacturado = Number(invoiced.rows[0].total) || 0
      const totalGasto = Number(costs.rows[0].total) || 0
      const margen = totalFacturado > 0 ? ((totalFacturado - totalGasto) / totalFacturado) * 100 : 0

      logger.info('Dashboard KPIs retrieved', { userId: req.user?.id })

      return res.json({
        kpis: {
          clientes_activos: clients.rows[0].count,
          cotizaciones_abiertas: openQuotes.rows[0].count,
          proyectos_en_curso: projects.rows[0].count,
          total_facturado: Math.round(totalFacturado),
          total_gasto_obra: Math.round(totalGasto),
          margen_bruto_pct: Math.round(margen * 100) / 100,
          pipeline_cotizaciones: Math.round(Number(pipeline.rows[0].total) || 0),
        },
        timestamp: new Date(),
      })
    } catch (error: any) {
      logger.error('Dashboard KPIs error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch KPIs' })
    }
  })

  router.get('/projects-summary', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT p.status,
                COUNT(*)::int AS count,
                COALESCE(AVG(p.progress_pct), 0) AS avg_progress,
                COALESCE(SUM(p.budget), 0) AS total_budget,
                COALESCE(SUM(sp.gasto_real), 0) AS total_spent
           FROM projects p
           LEFT JOIN v_project_spending sp ON sp.project_id = p.id
          WHERE p.deleted_at IS NULL
          GROUP BY p.status`
      )

      return res.json({
        summary: result.rows.map(row => {
          const totalBudget = Number(row.total_budget) || 0
          const totalSpent = Number(row.total_spent) || 0
          return {
            status: row.status,
            count: row.count,
            avg_progress: Number(Number(row.avg_progress).toFixed(2)),
            total_budget: totalBudget,
            total_spent: totalSpent,
            remaining: totalBudget - totalSpent,
          }
        }),
        timestamp: new Date(),
      })
    } catch (error: any) {
      logger.error('Projects summary error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch projects summary' })
    }
  })

  router.get('/client-metrics', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT c.id,
                c.name,
                COUNT(DISTINCT q.id)::int AS quotations,
                COUNT(DISTINCT p.id)::int AS projects,
                COUNT(DISTINCT i.id)::int AS invoices,
                COALESCE(SUM(i.total_amount), 0) AS total_invoiced
           FROM clients c
           LEFT JOIN quotations q ON q.client_id = c.id AND q.deleted_at IS NULL
           LEFT JOIN projects p ON p.client_id = c.id AND p.deleted_at IS NULL
           LEFT JOIN invoices i ON i.client_id = c.id AND i.deleted_at IS NULL
          WHERE c.deleted_at IS NULL
          GROUP BY c.id, c.name
          ORDER BY total_invoiced DESC
          LIMIT 10`
      )

      return res.json({
        metrics: result.rows.map(row => ({
          client_id: row.id,
          client_name: row.name,
          quotations: row.quotations,
          projects: row.projects,
          invoices: row.invoices,
          total_invoiced: Number(row.total_invoiced) || 0,
        })),
        timestamp: new Date(),
      })
    } catch (error: any) {
      logger.error('Client metrics error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch client metrics' })
    }
  })

  router.get('/aging', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(`
        SELECT
          CASE
            WHEN vb.payment_state = 'pagada' THEN 'pagada'
            WHEN vb.due_date IS NULL THEN 'sin_vencimiento'
            WHEN vb.due_date >= CURRENT_DATE THEN 'al_dia'
            WHEN CURRENT_DATE - vb.due_date <= 30 THEN 'vencida_1_30'
            WHEN CURRENT_DATE - vb.due_date <= 60 THEN 'vencida_31_60'
            WHEN CURRENT_DATE - vb.due_date <= 90 THEN 'vencida_61_90'
            ELSE 'vencida_90_mas'
          END AS tramo,
          COUNT(*)::int AS cantidad,
          COALESCE(SUM(vb.balance), 0) AS monto_pendiente,
          COALESCE(SUM(i.total_amount), 0) AS monto_total,
          json_agg(json_build_object(
            'invoice_id', i.id,
            'quotation_id', i.quotation_id,
            'correlative', q.correlative,
            'client_name', c.name,
            'total_amount', i.total_amount,
            'balance', vb.balance,
            'due_date', vb.due_date
          )) AS facturas
        FROM invoices i
        JOIN v_invoice_balance vb ON vb.invoice_id = i.id
        JOIN quotations q ON q.id = i.quotation_id
        JOIN clients c ON c.id = i.client_id
        WHERE i.deleted_at IS NULL AND i.status != 'cancelled'
        GROUP BY tramo
        ORDER BY tramo
      `)
      return res.json({ aging: result.rows, timestamp: new Date() })
    } catch (error: any) {
      logger.error('Dashboard aging error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch aging report' })
    }
  })

  router.get('/cartera', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COALESCE(SUM(t.total_con_iva), 0)                              AS adjudicado_total,
          COALESCE(SUM(t.total_con_iva) - SUM(COALESCE(fi.facturado,0)),0) AS pendiente_facturar,
          COALESCE(SUM(COALESCE(fi.por_cobrar,0)), 0)                    AS facturado_por_cobrar,
          COALESCE(SUM(COALESCE(fi.cobrado_mes,0)), 0)                   AS cobrado_mes
        FROM quotations q
        JOIN v_quotation_totals t ON t.quotation_id = q.id
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(i.total_amount) FILTER (WHERE i.status != 'cancelled'), 0)                AS facturado,
            COALESCE(SUM(vb.balance)     FILTER (WHERE i.status NOT IN ('paid','cancelled')), 0)   AS por_cobrar,
            COALESCE(SUM(ip.amount)      FILTER (
              WHERE ip.paid_at >= date_trunc('month', CURRENT_DATE)
            ), 0) AS cobrado_mes
          FROM invoices i
          LEFT JOIN v_invoice_balance vb ON vb.invoice_id = i.id
          LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
          WHERE i.quotation_id = q.id AND i.deleted_at IS NULL
        ) fi ON true
        WHERE q.status IN ('Adjudicada','Cerrada') AND q.deleted_at IS NULL AND q.kind != 'maintenance'
      `)
      return res.json({ cartera: result.rows[0], timestamp: new Date() })
    } catch (error: any) {
      logger.error('Dashboard cartera error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch cartera report' })
    }
  })

  router.get('/cycle-times', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (sent_at - created_at))/86400)::numeric, 1) AS avg_draft_to_sent,
          ROUND(AVG(EXTRACT(EPOCH FROM (awarded_at - sent_at))/86400)::numeric, 1) AS avg_sent_to_awarded,
          ROUND(AVG(EXTRACT(EPOCH FROM (fi.first_invoice - awarded_at))/86400)::numeric, 1) AS avg_awarded_to_invoice,
          ROUND(AVG(EXTRACT(EPOCH FROM (fp.first_payment - fi.first_invoice))/86400)::numeric, 1) AS avg_invoice_to_paid
        FROM quotations q
        LEFT JOIN LATERAL (
          SELECT MIN(created_at) AS first_invoice FROM invoices WHERE quotation_id = q.id AND deleted_at IS NULL
        ) fi ON true
        LEFT JOIN LATERAL (
          SELECT MIN(ip.paid_at) AS first_payment
          FROM invoice_payments ip
          JOIN invoices i ON i.id = ip.invoice_id
          WHERE i.quotation_id = q.id
        ) fp ON true
        WHERE q.status IN ('Adjudicada','Cerrada')
          AND q.deleted_at IS NULL
          AND q.kind != 'maintenance'
          AND q.sent_at IS NOT NULL
      `)
      return res.json({ cycle_times: result.rows[0], timestamp: new Date() })
    } catch (error: any) {
      logger.error('Dashboard cycle-times error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch cycle times' })
    }
  })

  router.get('/margin-analysis', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(`
        SELECT
          q.id, q.correlative, c.name AS client_name,
          t.costo_neto   AS costo_presupuestado,
          t.venta_neta   AS venta_presupuestada,
          t.beneficio_bruto AS margen_presupuestado,
          ROUND(t.beneficio_bruto / NULLIF(t.venta_neta,0) * 100, 1) AS margen_presupuestado_pct,
          COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS costo_real,
          t.venta_neta - COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS margen_real,
          ROUND((t.venta_neta - COALESCE(SUM(ec.quantity * ec.unit_price), 0)) / NULLIF(t.venta_neta,0) * 100, 1) AS margen_real_pct
        FROM quotations q
        JOIN clients c ON c.id = q.client_id
        JOIN v_quotation_totals t ON t.quotation_id = q.id
        LEFT JOIN projects p ON p.quotation_id = q.id AND p.deleted_at IS NULL
        LEFT JOIN execution_costs ec ON ec.project_id = p.id
        WHERE q.status = 'Cerrada' AND q.deleted_at IS NULL
        GROUP BY q.id, q.correlative, c.name, t.costo_neto, t.venta_neta, t.beneficio_bruto
        ORDER BY (t.beneficio_bruto / NULLIF(t.venta_neta,0) - (t.venta_neta - COALESCE(SUM(ec.quantity * ec.unit_price), 0)) / NULLIF(t.venta_neta,0)) DESC
        LIMIT 20
      `)
      return res.json({ analysis: result.rows, timestamp: new Date() })
    } catch (error: any) {
      logger.error('Dashboard margin-analysis error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch margin analysis' })
    }
  })

  return router
}
