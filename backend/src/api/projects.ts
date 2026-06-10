import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const VALID_STATUS = ['planning', 'in_progress', 'completed', 'paused', 'cancelled']

const normalizeStatus = (status: string | undefined) =>
  VALID_STATUS.includes(status ?? '') ? status : 'planning'

export const createProjectsRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT p.*, c.name AS client_name,
                COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS gasto_real,
                p.budget - COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS saldo
           FROM projects p
           LEFT JOIN clients c ON c.id = p.client_id
           LEFT JOIN execution_costs ec ON ec.project_id = p.id
          WHERE p.deleted_at IS NULL
          GROUP BY p.id, c.name
          ORDER BY p.created_at DESC`
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get projects error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch projects' })
    }
  })

  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT p.*, c.name AS client_name,
                COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS gasto_real,
                p.budget - COALESCE(SUM(ec.quantity * ec.unit_price), 0) AS saldo
           FROM projects p
           LEFT JOIN clients c ON c.id = p.client_id
           LEFT JOIN execution_costs ec ON ec.project_id = p.id
          WHERE p.id = $1
            AND p.deleted_at IS NULL
          GROUP BY p.id, c.name`,
        [req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' })

      const [assignments, costs] = await Promise.all([
        pool.query(
          `SELECT pa.project_id, pa.user_id, pa.assigned_at, pa.assigned_by,
                  u.name, u.email
             FROM project_assignments pa
             LEFT JOIN users u ON u.id = pa.user_id
            WHERE pa.project_id = $1
            ORDER BY pa.assigned_at`,
          [req.params.id]
        ),
        pool.query(
          `SELECT *
             FROM execution_costs
            WHERE project_id = $1
            ORDER BY created_at DESC`,
          [req.params.id]
        ),
      ])

      return res.json({
        ...result.rows[0],
        assignments: assignments.rows,
        costs: costs.rows,
      })
    } catch (error: any) {
      logger.error('Get project error', { error: error.message, projectId: req.params.id })
      return res.status(500).json({ error: 'Failed to fetch project' })
    }
  })

  router.post('/', async (req: AuthRequest, res) => {
    const db = await pool.connect()
    try {
      const { quotation_id, client_id, name, status, start_date, end_date, budget, assigned_to } = req.body
      if (!client_id) return res.status(400).json({ error: 'client_id is required' })

      let resolvedBudget = Number(budget) || 0
      if (quotation_id && resolvedBudget === 0) {
        const quoteTotals = await db.query(
          'SELECT venta_neta FROM v_quotation_totals WHERE quotation_id = $1',
          [quotation_id]
        )
        resolvedBudget = Number(quoteTotals.rows[0]?.venta_neta) || 0
      }

      await db.query('BEGIN')
      const result = await db.query(
        `INSERT INTO projects
          (quotation_id, client_id, name, status, start_date, end_date, budget, progress_pct, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          quotation_id || null,
          client_id,
          name || 'Proyecto sin nombre',
          normalizeStatus(status),
          start_date || null,
          end_date || null,
          resolvedBudget,
          0,
          req.user?.id ?? null,
        ]
      )

      const projectId = result.rows[0].id
      if (Array.isArray(assigned_to)) {
        for (const userId of assigned_to) {
          await db.query(
            `INSERT INTO project_assignments (project_id, user_id, assigned_by)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [projectId, userId, req.user?.id ?? null]
          )
        }
      }

      await db.query('COMMIT')
      return res.status(201).json(result.rows[0])
    } catch (error: any) {
      await db.query('ROLLBACK')
      logger.error('Create project error', { error: error.message, userId: req.user?.id })
      return res.status(500).json({ error: 'Failed to create project' })
    } finally {
      db.release()
    }
  })

  router.put('/:id', async (req: AuthRequest, res) => {
    try {
      const { name, status, start_date, end_date, budget, progress_pct } = req.body
      const result = await pool.query(
        `UPDATE projects
            SET name = COALESCE($1, name),
                status = $2,
                start_date = COALESCE($3, start_date),
                end_date = $4,
                budget = COALESCE($5, budget),
                progress_pct = COALESCE($6, progress_pct),
                updated_at = NOW()
          WHERE id = $7
            AND deleted_at IS NULL
          RETURNING *`,
        [
          name || null,
          normalizeStatus(status),
          start_date || null,
          end_date || null,
          budget != null ? Number(budget) : null,
          progress_pct != null ? Number(progress_pct) : null,
          req.params.id,
        ]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' })
      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update project error', { error: error.message, projectId: req.params.id })
      return res.status(500).json({ error: 'Failed to update project' })
    }
  })

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `UPDATE projects
            SET deleted_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id`,
        [req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' })
      return res.json({ message: 'Project deleted successfully' })
    } catch (error: any) {
      logger.error('Delete project error', { error: error.message, projectId: req.params.id })
      return res.status(500).json({ error: 'Failed to delete project' })
    }
  })

  router.get('/:id/costs', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT *
           FROM execution_costs
          WHERE project_id = $1
          ORDER BY created_at DESC`,
        [req.params.id]
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get project costs error', { error: error.message, projectId: req.params.id })
      return res.status(500).json({ error: 'Failed to fetch project costs' })
    }
  })

  router.post('/:id/costs', async (req: AuthRequest, res) => {
    try {
      const { category_id, description, quantity, unit_price } = req.body
      if (!description) return res.status(400).json({ error: 'description is required' })

      const result = await pool.query(
        `INSERT INTO execution_costs
          (project_id, category_id, description, quantity, unit_price, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          req.params.id,
          category_id || null,
          description,
          Number(quantity) || 1,
          Number(unit_price) || 0,
          req.user?.id ?? null,
        ]
      )

      return res.status(201).json(result.rows[0])
    } catch (error: any) {
      logger.error('Create project cost error', { error: error.message, projectId: req.params.id })
      return res.status(500).json({ error: 'Failed to create project cost' })
    }
  })

  router.delete('/:projectId/costs/:costId', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM execution_costs
          WHERE id = $1
            AND project_id = $2
          RETURNING id`,
        [req.params.costId, req.params.projectId]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Project cost not found' })
      return res.json({ message: 'Project cost deleted successfully' })
    } catch (error: any) {
      logger.error('Delete project cost error', { error: error.message, costId: req.params.costId })
      return res.status(500).json({ error: 'Failed to delete project cost' })
    }
  })

  return router
}
