import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

export const createClientsRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // GET all clients
  router.get('/', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY created_at DESC'
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get clients error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch clients' })
    }
  })

  // GET single client
  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const result = await pool.query(
        'SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL',
        [id]
      )
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' })
      }
      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Get client error', { error: error.message, clientId: req.params.id })
      return res.status(500).json({ error: 'Failed to fetch client' })
    }
  })

  // POST create client
  router.post('/', async (req: AuthRequest, res) => {
    try {
      const { name, email, phone, address, ruc } = req.body

      if (!name) {
        return res.status(400).json({ error: 'Name is required' })
      }

      const result = await pool.query(
        `INSERT INTO clients (name, email, phone, address, ruc)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, email, phone, address, ruc]
      )

      logger.info('Client created', {
        clientId: result.rows[0].id,
        name,
        email,
        userId: req.user?.id,
      })

      return res.status(201).json(result.rows[0])
    } catch (error: any) {
      logger.error('Create client error', { error: error.message, userId: req.user?.id })
      return res.status(500).json({ error: 'Failed to create client' })
    }
  })

  // PUT update client
  router.put('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const { name, email, phone, address, ruc } = req.body

      if (!name) {
        return res.status(400).json({ error: 'Name is required' })
      }

      const result = await pool.query(
        `UPDATE clients SET name = $1, email = $2, phone = $3, address = $4, ruc = $5, updated_at = NOW()
         WHERE id = $6 AND deleted_at IS NULL
         RETURNING *`,
        [name, email, phone, address, ruc, id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' })
      }

      logger.info('Client updated', {
        clientId: id,
        name,
        userId: req.user?.id,
      })

      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update client error', { error: error.message, clientId: req.params.id })
      return res.status(500).json({ error: 'Failed to update client' })
    }
  })

  // DELETE client (soft delete)
  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params

      const result = await pool.query(
        'UPDATE clients SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
        [id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' })
      }

      logger.info('Client deleted', {
        clientId: id,
        userId: req.user?.id,
      })

      return res.json({ message: 'Client deleted successfully' })
    } catch (error: any) {
      logger.error('Delete client error', { error: error.message, clientId: req.params.id })
      return res.status(500).json({ error: 'Failed to delete client' })
    }
  })

  return router
}
