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

  // PUT /:id/costs/:costId — actualizar costo
  router.put('/:id/costs/:costId', async (req, res) => {
    const { id, costId } = req.params
    const { description, quantity, unit_price, category_id } = req.body
    try {
      const result = await pool.query(
        `UPDATE execution_costs SET description=$1, quantity=$2, unit_price=$3, category_id=$4, updated_at=NOW()
         WHERE id=$5 AND project_id=$6 RETURNING *`,
        [description, quantity, unit_price, category_id, costId, id]
      )
      if (!result.rows[0]) return res.status(404).json({ error: 'Cost not found' })
      res.json(result.rows[0])
    } catch (err) {
      logger.error('PUT /projects/:id/costs/:costId', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /:id/assignments
  router.get('/:id/assignments', async (req, res) => {
    const { id } = req.params
    try {
      const result = await pool.query(
        `SELECT pa.*, u.name, u.email FROM project_assignments pa LEFT JOIN users u ON u.id = pa.user_id WHERE pa.project_id = $1`,
        [id]
      )
      res.json(result.rows)
    } catch (err) {
      logger.error('GET /projects/:id/assignments', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /:id/assignments
  router.post('/:id/assignments', async (req, res) => {
    const { id } = req.params
    const { user_id } = req.body
    try {
      const result = await pool.query(
        `INSERT INTO project_assignments (project_id, user_id, assigned_by) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING RETURNING *`,
        [id, user_id, (req as any).user?.id ?? null]
      )
      // If conflict (already exists), fetch existing
      if (!result.rows[0]) {
        const existing = await pool.query(
          `SELECT pa.*, u.name, u.email FROM project_assignments pa LEFT JOIN users u ON u.id = pa.user_id WHERE pa.project_id=$1 AND pa.user_id=$2`,
          [id, user_id]
        )
        return res.json(existing.rows[0])
      }
      // Fetch with user info
      const full = await pool.query(
        `SELECT pa.*, u.name, u.email FROM project_assignments pa LEFT JOIN users u ON u.id = pa.user_id WHERE pa.project_id=$1 AND pa.user_id=$2`,
        [id, user_id]
      )
      res.json(full.rows[0])
    } catch (err) {
      logger.error('POST /projects/:id/assignments', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /:id/assignments/:userId
  router.delete('/:id/assignments/:userId', async (req, res) => {
    const { id, userId } = req.params
    try {
      await pool.query(`DELETE FROM project_assignments WHERE project_id=$1 AND user_id=$2`, [id, userId])
      res.json({ ok: true })
    } catch (err) {
      logger.error('DELETE /projects/:id/assignments/:userId', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── Tasks ──────────────────────────────────────────────────

  router.get('/:id/tasks', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT t.*, u.name AS assignee_name, u.email AS assignee_email
           FROM project_tasks t
           LEFT JOIN users u ON u.id = t.assignee_id
          WHERE t.project_id = $1
          ORDER BY t.sort_order, t.created_at`,
        [req.params.id]
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get tasks error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch tasks' })
    }
  })

  router.post('/:id/tasks', async (req: AuthRequest, res) => {
    try {
      const { name, description, assignee_id, category_id, start_date, end_date, sort_order } = req.body
      if (!name) return res.status(400).json({ error: 'name is required' })
      const result = await pool.query(
        `INSERT INTO project_tasks
          (project_id, name, description, assignee_id, category_id, start_date, end_date, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          req.params.id, name, description || null,
          assignee_id || null, category_id || null,
          start_date || null, end_date || null,
          sort_order ?? 0, req.user?.id ?? null,
        ]
      )
      return res.status(201).json(result.rows[0])
    } catch (error: any) {
      logger.error('Create task error', { error: error.message })
      return res.status(500).json({ error: 'Failed to create task' })
    }
  })

  router.put('/:projectId/tasks/:taskId', async (req: AuthRequest, res) => {
    try {
      const { name, description, assignee_id, category_id, start_date, end_date, progress_pct, status, sort_order } = req.body
      const result = await pool.query(
        `UPDATE project_tasks
            SET name         = COALESCE($1, name),
                description  = $2,
                assignee_id  = $3,
                category_id  = $4,
                start_date   = $5,
                end_date     = $6,
                progress_pct = COALESCE($7, progress_pct),
                status       = COALESCE($8, status),
                sort_order   = COALESCE($9, sort_order),
                updated_at   = NOW()
          WHERE id = $10 AND project_id = $11
          RETURNING *`,
        [
          name || null, description ?? null,
          assignee_id ?? null, category_id ?? null,
          start_date ?? null, end_date ?? null,
          progress_pct != null ? Number(progress_pct) : null,
          status || null,
          sort_order != null ? Number(sort_order) : null,
          req.params.taskId, req.params.projectId,
        ]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update task error', { error: error.message })
      return res.status(500).json({ error: 'Failed to update task' })
    }
  })

  router.delete('/:projectId/tasks/:taskId', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM project_tasks WHERE id = $1 AND project_id = $2 RETURNING id`,
        [req.params.taskId, req.params.projectId]
      )
      if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' })
      return res.json({ message: 'Task deleted' })
    } catch (error: any) {
      logger.error('Delete task error', { error: error.message })
      return res.status(500).json({ error: 'Failed to delete task' })
    }
  })

  return router
}
