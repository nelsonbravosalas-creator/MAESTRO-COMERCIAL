import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

export const createDashboardRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/kpis', async (req: AuthRequest, res) => {
    try {
      const [
        clients,
        openQuotes,
        projects,
        invoiced,
        costs,
        pipeline,
      ] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM clients WHERE deleted_at IS NULL'),
        pool.query(
          `SELECT COUNT(*)::int AS count
             FROM quotations
            WHERE status IN ('Emitida', 'Enviada')
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
              AND q.deleted_at IS NULL`
        ),
      ])

      const totalFacturado = Number(invoiced.rows[0].total) || 0
      const totalGasto = Number(costs.rows[0].total) || 0
      const margen = totalFacturado > 0
        ? ((totalFacturado - totalGasto) / totalFacturado) * 100
        : 0

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

  return router
}
