import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { uuidParams, capLimitQuerySchema } from '../schemas/common'
import { invoiceCreateSchema, invoiceStatusSchema } from '../schemas/invoices'

const VALID_STATUS = ['draft', 'issued', 'paid', 'cancelled']
const VALID_PAYMENT = ['cash', 'credit', 'partial']

export const createInvoicesRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // A-11: tope duro de filas (paginación real pendiente, ver docs/RIESGOS_ACEPTADOS.md).
  router.get('/', validate({ query: capLimitQuerySchema }), async (req: AuthRequest, res) => {
    try {
      const { limit } = req.query as unknown as { limit: number }
      const result = await pool.query(
        `SELECT i.*, c.name AS client_name
           FROM invoices i
           LEFT JOIN clients c ON c.id = i.client_id
          WHERE i.deleted_at IS NULL
          ORDER BY i.date DESC, i.created_at DESC
          LIMIT $1`,
        [limit]
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get invoices error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch invoices' })
    }
  })

  router.get('/:id', validate({ params: uuidParams('id') }), async (req: AuthRequest, res) => {
    try {
      const invoice = await pool.query(
        `SELECT i.*, c.name AS client_name
           FROM invoices i
           LEFT JOIN clients c ON c.id = i.client_id
          WHERE i.id = $1
            AND i.deleted_at IS NULL`,
        [req.params.id]
      )

      if (invoice.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' })

      const items = await pool.query(
        `SELECT *
           FROM invoice_items
          WHERE invoice_id = $1
          ORDER BY sort_order, created_at`,
        [req.params.id]
      )

      return res.json({ ...invoice.rows[0], items: items.rows })
    } catch (error: any) {
      logger.error('Get invoice error', { error: error.message, invoiceId: req.params.id })
      return res.status(500).json({ error: 'Failed to fetch invoice' })
    }
  })

  router.post('/', validate({ body: invoiceCreateSchema }), async (req: AuthRequest, res) => {
    const db = await pool.connect()
    try {
      const { project_id, client_id, number, date, payment_cond, due_date, items } = req.body

      let netAmount = 0
      const lineItems = Array.isArray(items) ? items : []
      for (const item of lineItems) {
        netAmount += (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
      }

      const config = await db.query("SELECT value FROM app_config WHERE key = 'iva_pct'")
      const ivaPct = Number(config.rows[0]?.value) || 19
      const taxAmount = netAmount * (ivaPct / 100)
      const totalAmount = netAmount + taxAmount
      const invoiceNumber = number || `F-${String(Date.now()).slice(-6)}`

      await db.query('BEGIN')
      const invoice = await db.query(
        `INSERT INTO invoices
          (project_id, client_id, number, date, payment_cond, due_date,
           net_amount, tax_amount, total_amount, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
         RETURNING *`,
        [
          project_id || null,
          client_id,
          invoiceNumber,
          date || new Date().toISOString().slice(0, 10),
          VALID_PAYMENT.includes(payment_cond) ? payment_cond : 'credit',
          due_date || null,
          netAmount,
          taxAmount,
          totalAmount,
          req.user?.id ?? null,
        ]
      )

      for (const [idx, item] of lineItems.entries()) {
        if (!item.description) continue
        await db.query(
          `INSERT INTO invoice_items
            (invoice_id, quotation_line_item_id, description, quantity, unit_price, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            invoice.rows[0].id,
            item.quotation_line_item_id || null,
            item.description,
            Number(item.quantity) || 1,
            Number(item.unit_price) || 0,
            Number(item.sort_order ?? idx),
          ]
        )
      }

      await db.query('COMMIT')
      return res.status(201).json(invoice.rows[0])
    } catch (error: any) {
      await db.query('ROLLBACK')
      logger.error('Create invoice error', { error: error.message, userId: req.user?.id })
      if (error.code === '23505')
        return res.status(409).json({ error: 'Invoice number already exists' })
      return res.status(500).json({ error: 'Failed to create invoice' })
    } finally {
      db.release()
    }
  })

  const updateStatus = async (req: AuthRequest, res: any) => {
    try {
      const { status, is_factored } = req.body

      const result = await pool.query(
        `UPDATE invoices
            SET status = $1,
                is_factored = COALESCE($2, is_factored),
                updated_at = NOW()
          WHERE id = $3
            AND deleted_at IS NULL
          RETURNING *`,
        [status, is_factored, req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' })
      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update invoice status error', {
        error: error.message,
        invoiceId: req.params.id,
      })
      return res.status(500).json({ error: 'Failed to update invoice status' })
    }
  }

  const statusValidation = validate({ params: uuidParams('id'), body: invoiceStatusSchema })
  router.patch('/:id/status', roleMiddleware('admin', 'manager'), statusValidation, updateStatus)
  router.put('/:id/status', roleMiddleware('admin', 'manager'), statusValidation, updateStatus)

  router.delete(
    '/:id',
    roleMiddleware('admin'),
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      try {
        const result = await pool.query(
          `UPDATE invoices
            SET deleted_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id`,
          [req.params.id]
        )

        if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' })
        return res.json({ message: 'Invoice deleted successfully' })
      } catch (error: any) {
        logger.error('Delete invoice error', { error: error.message, invoiceId: req.params.id })
        return res.status(500).json({ error: 'Failed to delete invoice' })
      }
    }
  )

  return router
}
