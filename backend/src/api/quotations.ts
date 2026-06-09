import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

export const createQuotationsRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // GET all quotations
  router.get('/', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT q.*, c.name as client_name FROM quotations q
         LEFT JOIN clients c ON q.client_id = c.id
         WHERE q.deleted_at IS NULL
         ORDER BY q.created_at DESC`
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get quotations error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch quotations' })
    }
  })

  // GET single quotation with items
  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const quotation = await pool.query(
        `SELECT q.*, c.name as client_name FROM quotations q
         LEFT JOIN clients c ON q.client_id = c.id
         WHERE q.id = $1 AND q.deleted_at IS NULL`,
        [id]
      )

      if (quotation.rows.length === 0) {
        return res.status(404).json({ error: 'Quotation not found' })
      }

      const items = await pool.query(
        'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY created_at',
        [id]
      )

      return res.json({
        ...quotation.rows[0],
        items: items.rows,
      })
    } catch (error: any) {
      logger.error('Get quotation error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch quotation' })
    }
  })

  // POST create quotation
  router.post('/', async (req: AuthRequest, res) => {
    try {
      const { client_id, items } = req.body

      if (!client_id) {
        return res.status(400).json({ error: 'Client ID is required' })
      }

      // Generate quotation number
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM quotations WHERE created_at > NOW() - INTERVAL '1 day'"
      )
      const quotationNumber = `Q-${String(countResult.rows[0].count + 1).padStart(4, '0')}`

      // Calculate totals
      let subtotal = 0
      if (items && Array.isArray(items)) {
        items.forEach((item: any) => {
          subtotal += (item.quantity || 0) * (item.unit_price || 0)
        })
      }
      const tax = subtotal * 0.18 // 18% IGV for Peru
      const total = subtotal + tax

      // Create quotation
      const quotationResult = await pool.query(
        `INSERT INTO quotations (client_id, number, status, subtotal, tax, total, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '30 days')
         RETURNING *`,
        [client_id, quotationNumber, 'draft', subtotal, tax, total]
      )

      const quotationId = quotationResult.rows[0].id

      // Insert items
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const itemTotal = (item.quantity || 0) * (item.unit_price || 0)
          await pool.query(
            `INSERT INTO quotation_items (quotation_id, description, quantity, unit_price, total, cost)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [quotationId, item.description, item.quantity, item.unit_price, itemTotal, item.cost || 0]
          )
        }
      }

      logger.info('Quotation created', {
        quotationId,
        number: quotationNumber,
        clientId: client_id,
        userId: req.user?.id,
      })

      return res.status(201).json(quotationResult.rows[0])
    } catch (error: any) {
      logger.error('Create quotation error', { error: error.message })
      return res.status(500).json({ error: 'Failed to create quotation' })
    }
  })

  // PUT update quotation status
  router.put('/:id/status', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const { status } = req.body

      if (!['draft', 'sent', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' })
      }

      const result = await pool.query(
        `UPDATE quotations SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
        [status, id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Quotation not found' })
      }

      logger.info('Quotation status updated', {
        quotationId: id,
        newStatus: status,
        userId: req.user?.id,
      })

      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update quotation status error', { error: error.message })
      return res.status(500).json({ error: 'Failed to update quotation' })
    }
  })

  // DELETE quotation (soft delete)
  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params

      const result = await pool.query(
        'UPDATE quotations SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
        [id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Quotation not found' })
      }

      logger.info('Quotation deleted', {
        quotationId: id,
        userId: req.user?.id,
      })

      return res.json({ message: 'Quotation deleted successfully' })
    } catch (error: any) {
      logger.error('Delete quotation error', { error: error.message })
      return res.status(500).json({ error: 'Failed to delete quotation' })
    }
  })

  return router
}
