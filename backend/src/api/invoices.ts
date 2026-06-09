import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

export const createInvoicesRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // GET all invoices
  router.get('/', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT i.*, c.name as client_name FROM invoices i
         LEFT JOIN clients c ON i.client_id = c.id
         WHERE i.deleted_at IS NULL
         ORDER BY i.created_at DESC`
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get invoices error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch invoices' })
    }
  })

  // GET single invoice with items
  router.get('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const invoice = await pool.query(
        `SELECT i.*, c.name as client_name FROM invoices i
         LEFT JOIN clients c ON i.client_id = c.id
         WHERE i.id = $1 AND i.deleted_at IS NULL`,
        [id]
      )

      if (invoice.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' })
      }

      const items = await pool.query(
        'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at',
        [id]
      )

      return res.json({
        ...invoice.rows[0],
        items: items.rows,
      })
    } catch (error: any) {
      logger.error('Get invoice error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch invoice' })
    }
  })

  // POST create invoice
  router.post('/', async (req: AuthRequest, res) => {
    try {
      const { project_id, client_id, items, payment_condition, due_date } = req.body

      if (!client_id) {
        return res.status(400).json({ error: 'Client ID is required' })
      }

      // Generate invoice number
      const countResult = await pool.query(
        "SELECT COUNT(*) as count FROM invoices WHERE created_at > NOW() - INTERVAL '1 month'"
      )
      const invoiceNumber = `F-${String(countResult.rows[0].count + 1).padStart(6, '0')}`

      // Calculate totals
      let subtotal = 0
      if (items && Array.isArray(items)) {
        items.forEach((item: any) => {
          subtotal += (item.quantity || 0) * (item.unit_price || 0)
        })
      }
      const tax = subtotal * 0.18 // 18% IGV for Peru
      const total = subtotal + tax

      // Create invoice
      const invoiceResult = await pool.query(
        `INSERT INTO invoices (project_id, client_id, number, date, payment_condition, due_date, subtotal, tax, total, status)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [project_id || null, client_id, invoiceNumber, payment_condition || 'cash', due_date, subtotal, tax, total, 'draft']
      )

      const invoiceId = invoiceResult.rows[0].id

      // Insert items
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const itemTotal = (item.quantity || 0) * (item.unit_price || 0)
          await pool.query(
            `INSERT INTO invoice_items (invoice_id, project_item_id, description, quantity, unit_price, total)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [invoiceId, item.project_item_id || null, item.description, item.quantity, item.unit_price, itemTotal]
          )
        }
      }

      logger.info('Invoice created', {
        invoiceId,
        number: invoiceNumber,
        clientId: client_id,
        userId: req.user?.id,
      })

      return res.status(201).json(invoiceResult.rows[0])
    } catch (error: any) {
      logger.error('Create invoice error', { error: error.message })
      return res.status(500).json({ error: 'Failed to create invoice' })
    }
  })

  // PUT update invoice status
  router.put('/:id/status', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params
      const { status, is_factored } = req.body

      if (!['draft', 'issued', 'paid', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' })
      }

      const result = await pool.query(
        `UPDATE invoices SET status = $1, is_factored = $2, updated_at = NOW()
         WHERE id = $3 AND deleted_at IS NULL
         RETURNING *`,
        [status, is_factored || false, id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' })
      }

      logger.info('Invoice status updated', {
        invoiceId: id,
        newStatus: status,
        userId: req.user?.id,
      })

      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update invoice status error', { error: error.message })
      return res.status(500).json({ error: 'Failed to update invoice' })
    }
  })

  // DELETE invoice (soft delete)
  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const { id } = req.params

      const result = await pool.query(
        'UPDATE invoices SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *',
        [id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' })
      }

      logger.info('Invoice deleted', {
        invoiceId: id,
        userId: req.user?.id,
      })

      return res.json({ message: 'Invoice deleted successfully' })
    } catch (error: any) {
      logger.error('Delete invoice error', { error: error.message })
      return res.status(500).json({ error: 'Failed to delete invoice' })
    }
  })

  return router
}
