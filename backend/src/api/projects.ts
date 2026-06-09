import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

export const createProjectsRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // GET all projects
  router.get('/', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT p.*, c.name as client_name FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         WHERE p.deleted_at IS NULL
         ORDER BY p.created_at DESC`
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get projects error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch projects' })
    }
  })

  // GET single project
  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const result = await pool.query(
        `SELECT p.*, c.name as client_name FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' })
      }

      // Get assigned users
      const assignments = await pool.query(
        `SELECT u.id, u.name, u.email FROM project_assignments pa
         LEFT JOIN users u ON pa.user_id = u.id
         WHERE pa.project_id = $1`,
        [id]
      )

      return res.json({
        ...result.rows[0],
        assigned_users: assignments.rows,
      })
    } catch (error: any) {
      logger.error('Get project error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch project' })
    }
  })

  // POST create project from quotation
  router.post('/', async (req: AuthRequest, res) => {
    try {
      const { quotation_id, name, client_id, start_date, assigned_to } = req.body

      if (!client_id) {
        return res.status(400).json({ error: 'Client ID is required' })
      }

      // Get quotation to get budget
      let budget = 0
      if (quotation_id) {
        const quotResult = await pool.query(
          'SELECT total FROM quotations WHERE id = $1',
          [quotation_id]
        )
        if (quotResult.rows.length > 0) {
          budget = quotResult.rows[0].total
        }
      }

      const result = await pool.query(
        `INSERT INTO projects (quotation_id, client_id, name, status, start_date, budget)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [quotation_id || null, client_id, name, 'planning', start_date || new Date(), budget]
      )

      const projectId = result.rows[0].id

      // Assign users if provided
      if (assigned_to && Array.isArray(assigned_to)) {
        for (const userId of assigned_to) {
          await pool.query(
            'INSERT INTO project_assignments (project_id, user_id) VALUES ($1, $2)',
            [projectId, userId]
          )
        }
      }

      logger.info('Project created', {
        projectId,
        name,
        clientId: client_id,
        userId: req.user?.id,
      })

      return res.status(201).json(result.rows[0])
    } catch (error: any) {
      logger.error('Create project error', { error: error.message })
      return res.status(500).json({ error: 'Failed to create project' })
    }
  })

  // PUT update project
  router.put('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const { name, status, progress, spent, end_date } = req.body

      const result = await pool.query(
        `UPDATE projects SET name = $1, status = $2, progress = $3, spent = $4, end_date = $5, updated_at = NOW()
         WHERE id = $6 AND deleted_at IS NULL
         RETURNING *`,
        [name, status, progress || 0, spent || 0, end_date, id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' })
      }

      logger.info('Project updated', {
        projectId: id,
        name,
        status,
        userId: req.user?.id,
      })

      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update project error', { error: error.message })
      return res.status(500).json({ error: 'Failed to update project' })
    }
  })

  // DELETE project (soft delete)
  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params

      const result = await pool.query(
        'UPDATE projects SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
        [id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' })
      }

      logger.info('Project deleted', {
        projectId: id,
        userId: req.user?.id,
      })

      return res.json({ message: 'Project deleted successfully' })
    } catch (error: any) {
      logger.error('Delete project error', { error: error.message })
      return res.status(500).json({ error: 'Failed to delete project' })
    }
  })

  return router
}
