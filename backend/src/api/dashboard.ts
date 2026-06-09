import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

export const createDashboardRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // GET dashboard KPIs
  router.get('/kpis', async (req: AuthRequest, res) => {
    try {
      const currentMonth = new Date()
      currentMonth.setDate(1)

      // Total invoiced this month
      const invoicedResult = await pool.query(
        `SELECT COALESCE(SUM(total), 0) as total FROM invoices
         WHERE status IN ('issued', 'paid')
         AND created_at >= $1
         AND deleted_at IS NULL`,
        [currentMonth]
      )

      // Total costs this month
      const costsResult = await pool.query(
        `SELECT COALESCE(SUM(cost), 0) as total FROM execution_costs
         WHERE created_at >= $1`,
        [currentMonth]
      )

      // Projects in progress
      const projectsResult = await pool.query(
        `SELECT COUNT(*) as count FROM projects
         WHERE status = 'in_progress'
         AND deleted_at IS NULL`
      )

      // Pending quotations
      const quotationsResult = await pool.query(
        `SELECT COUNT(*) as count FROM quotations
         WHERE status IN ('draft', 'sent')
         AND deleted_at IS NULL`
      )

      const invoiced = parseFloat(invoicedResult.rows[0].total) || 0
      const costs = parseFloat(costsResult.rows[0].total) || 0
      const margin = invoiced - costs
      const marginPercentage = invoiced > 0 ? (margin / invoiced) * 100 : 0

      logger.info('Dashboard KPIs retrieved', { userId: req.user?.id })

      return res.json({
        kpis: {
          total_invoiced: parseFloat(invoiced.toFixed(2)),
          total_costs: parseFloat(costs.toFixed(2)),
          margin: parseFloat(margin.toFixed(2)),
          margin_percentage: parseFloat(marginPercentage.toFixed(2)),
          projects_in_progress: projectsResult.rows[0].count,
          pending_quotations: quotationsResult.rows[0].count,
        },
        timestamp: new Date(),
      })
    } catch (error: any) {
      logger.error('Dashboard KPIs error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch KPIs' })
    }
  })

  // GET monthly trend (last 12 months)
  router.get('/trends', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT
          DATE_TRUNC('month', i.created_at) as month,
          COALESCE(SUM(i.total), 0) as invoiced,
          COALESCE(SUM(ec.cost), 0) as costs
        FROM invoices i
        LEFT JOIN execution_costs ec ON DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', ec.created_at)
        WHERE i.created_at >= NOW() - INTERVAL '12 months'
        AND i.status IN ('issued', 'paid')
        AND i.deleted_at IS NULL
        GROUP BY month
        ORDER BY month ASC`
      )

      const trends = result.rows.map(row => ({
        month: new Date(row.month).toISOString().substring(0, 7),
        invoiced: parseFloat(row.invoiced) || 0,
        costs: parseFloat(row.costs) || 0,
        margin: (parseFloat(row.invoiced) || 0) - (parseFloat(row.costs) || 0),
      }))

      logger.info('Dashboard trends retrieved', { userId: req.user?.id })

      return res.json({ trends, timestamp: new Date() })
    } catch (error: any) {
      logger.error('Dashboard trends error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch trends' })
    }
  })

  // GET project summary
  router.get('/projects-summary', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT
          status,
          COUNT(*) as count,
          COALESCE(AVG(progress), 0) as avg_progress,
          COALESCE(SUM(budget), 0) as total_budget,
          COALESCE(SUM(spent), 0) as total_spent
        FROM projects
        WHERE deleted_at IS NULL
        GROUP BY status`
      )

      logger.info('Projects summary retrieved', { userId: req.user?.id })

      return res.json({
        summary: result.rows.map(row => ({
          status: row.status,
          count: row.count,
          avg_progress: parseFloat(row.avg_progress.toFixed(2)),
          total_budget: parseFloat(row.total_budget.toFixed(2)),
          total_spent: parseFloat(row.total_spent.toFixed(2)),
          remaining: parseFloat((row.total_budget - row.total_spent).toFixed(2)),
        })),
        timestamp: new Date(),
      })
    } catch (error: any) {
      logger.error('Projects summary error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch projects summary' })
    }
  })

  // GET client metrics
  router.get('/client-metrics', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT
          c.id,
          c.name,
          COUNT(DISTINCT q.id) as quotations,
          COUNT(DISTINCT p.id) as projects,
          COUNT(DISTINCT i.id) as invoices,
          COALESCE(SUM(i.total), 0) as total_invoiced
        FROM clients c
        LEFT JOIN quotations q ON c.id = q.client_id AND q.deleted_at IS NULL
        LEFT JOIN projects p ON c.id = p.client_id AND p.deleted_at IS NULL
        LEFT JOIN invoices i ON c.id = i.client_id AND i.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
        GROUP BY c.id, c.name
        ORDER BY total_invoiced DESC
        LIMIT 10`
      )

      logger.info('Client metrics retrieved', { userId: req.user?.id })

      return res.json({
        metrics: result.rows.map(row => ({
          client_id: row.id,
          client_name: row.name,
          quotations: row.quotations,
          projects: row.projects,
          invoices: row.invoices,
          total_invoiced: parseFloat(row.total_invoiced) || 0,
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
