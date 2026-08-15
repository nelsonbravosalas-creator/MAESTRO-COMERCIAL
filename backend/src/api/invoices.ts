import { Router } from 'express'
import { Pool } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest, roleMiddleware } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { uuidParams } from '../schemas/common'
import {
  invoiceCreateSchema,
  invoiceStatusSchema,
  invoiceFollowUpSchema,
  invoiceListQuerySchema,
  paymentCreateSchema,
  factoringUpsertSchema,
  TERM_DAYS,
} from '../schemas/invoices'

// Calcula el vencimiento a partir de la condición de pago. Si el usuario manda
// due_date explícita manda esa: puede haber acuerdos fuera de las condiciones
// estándar y el dato del usuario nunca se sobreescribe.
function resolveDueDate(
  date: string,
  paymentTerm: keyof typeof TERM_DAYS | null | undefined,
  explicit: string | null | undefined
): string | null {
  if (explicit) return explicit
  if (!paymentTerm) return null
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + TERM_DAYS[paymentTerm])
  return d.toISOString().slice(0, 10)
}

export const createInvoicesRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // Saldo y estado de cobranza salen de v_invoice_balance: se calculan a partir
  // de los pagos registrados, nunca se guardan en la factura (ver migración
  // 0007). Por eso el listado siempre hace JOIN contra la vista.
  const SELECT_WITH_BALANCE = `
    SELECT i.*,
           c.name AS client_name,
           b.paid_amount,
           b.credited_amount,
           b.balance,
           b.days_overdue,
           b.payment_state,
           f.id       AS factoring_id,
           f.company  AS factoring_company,
           f.type     AS factoring_type,
           f.status   AS factoring_status,
           qt.correlative AS quotation_correlative
      FROM invoices i
      LEFT JOIN clients c           ON c.id = i.client_id
      LEFT JOIN v_invoice_balance b ON b.invoice_id = i.id
      LEFT JOIN invoice_factoring f ON f.invoice_id = i.id
      LEFT JOIN quotations qt       ON qt.id = i.quotation_id`

  // A-11: tope duro de filas (paginación real pendiente, ver docs/RIESGOS_ACEPTADOS.md).
  router.get('/', validate({ query: invoiceListQuerySchema }), async (req: AuthRequest, res) => {
    try {
      const { limit, state, client_id } = req.query as unknown as {
        limit: number
        state?: string
        client_id?: string
      }

      const where: string[] = ['i.deleted_at IS NULL']
      const params: unknown[] = []
      if (state) {
        params.push(state)
        where.push(`b.payment_state = $${params.length}`)
      }
      if (client_id) {
        params.push(client_id)
        where.push(`i.client_id = $${params.length}`)
      }
      params.push(limit)

      const result = await pool.query(
        `${SELECT_WITH_BALANCE}
          WHERE ${where.join(' AND ')}
          ORDER BY i.date DESC, i.created_at DESC
          LIMIT $${params.length}`,
        params
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get invoices error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch invoices' })
    }
  })

  // Totales para el panel de cobranza: cuánto hay vencido, por vencer y por
  // cobrar en total. Se agrega en SQL en vez de sumar en el cliente para que no
  // dependa del tope de filas del listado.
  router.get('/summary', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(`
        SELECT b.payment_state,
               COUNT(*)::int          AS count,
               COALESCE(SUM(b.balance), 0) AS balance
          FROM v_invoice_balance b
          JOIN invoices i ON i.id = b.invoice_id
         WHERE i.deleted_at IS NULL
           AND i.doc_type <> 'nota_credito'
         GROUP BY b.payment_state`)

      const byState: Record<string, { count: number; balance: number }> = {}
      let totalOutstanding = 0
      for (const r of result.rows) {
        byState[r.payment_state] = { count: r.count, balance: Number(r.balance) }
        if (!['pagada', 'anulada'].includes(r.payment_state)) {
          totalOutstanding += Number(r.balance)
        }
      }
      return res.json({ by_state: byState, total_outstanding: totalOutstanding })
    } catch (error: any) {
      logger.error('Get invoice summary error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch invoice summary' })
    }
  })

  router.get('/:id', validate({ params: uuidParams('id') }), async (req: AuthRequest, res) => {
    try {
      const invoice = await pool.query(
        `${SELECT_WITH_BALANCE} WHERE i.id = $1 AND i.deleted_at IS NULL`,
        [req.params.id]
      )

      if (invoice.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' })

      const [items, payments, factoring] = await Promise.all([
        pool.query(
          `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order, created_at`,
          [req.params.id]
        ),
        pool.query(
          `SELECT p.*, u.name AS created_by_name
             FROM invoice_payments p
             LEFT JOIN users u ON u.id = p.created_by
            WHERE p.invoice_id = $1
            ORDER BY p.paid_at DESC, p.created_at DESC`,
          [req.params.id]
        ),
        pool.query(`SELECT * FROM invoice_factoring WHERE invoice_id = $1`, [req.params.id]),
      ])

      return res.json({
        ...invoice.rows[0],
        items: items.rows,
        payments: payments.rows,
        factoring: factoring.rows[0] ?? null,
      })
    } catch (error: any) {
      logger.error('Get invoice error', { error: error.message, invoiceId: req.params.id })
      return res.status(500).json({ error: 'Failed to fetch invoice' })
    }
  })

  router.post('/', validate({ body: invoiceCreateSchema }), async (req: AuthRequest, res) => {
    const db = await pool.connect()
    try {
      const {
        project_id,
        quotation_id,
        client_id,
        number,
        date,
        payment_term,
        due_date,
        doc_type,
        credits_invoice_id,
        observations,
        follow_up_date,
        items,
      } = req.body

      let netAmount = 0
      const lineItems = Array.isArray(items) ? items : []
      for (const item of lineItems) {
        netAmount += (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
      }

      const config = await db.query("SELECT value FROM app_config WHERE key = 'iva_pct'")
      const ivaPct = Number(config.rows[0]?.value) || 19
      // La factura exenta no lleva IVA — el tipo de documento manda sobre la
      // configuración global.
      const taxAmount = doc_type === 'factura_exenta' ? 0 : netAmount * (ivaPct / 100)
      const totalAmount = netAmount + taxAmount
      const invoiceNumber = number || `F-${String(Date.now()).slice(-6)}`
      const invoiceDate = date || new Date().toISOString().slice(0, 10)
      const term = payment_term || 'dias_30'

      await db.query('BEGIN')
      const invoice = await db.query(
        `INSERT INTO invoices
          (project_id, quotation_id, client_id, number, date, payment_term, due_date,
           net_amount, tax_amount, total_amount, status, doc_type,
           credits_invoice_id, observations, follow_up_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          project_id || null,
          quotation_id || null,
          client_id,
          invoiceNumber,
          invoiceDate,
          term,
          resolveDueDate(invoiceDate, term, due_date),
          netAmount,
          taxAmount,
          totalAmount,
          doc_type || 'factura_afecta',
          credits_invoice_id || null,
          observations || null,
          follow_up_date || null,
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

  // ── Seguimiento de cobranza ────────────────────────────────────────────
  router.patch(
    '/:id/follow-up',
    validate({ params: uuidParams('id'), body: invoiceFollowUpSchema }),
    async (req: AuthRequest, res) => {
      try {
        const { observations, follow_up_date, due_date, payment_term } = req.body
        const result = await pool.query(
          `UPDATE invoices
              SET observations   = COALESCE($1, observations),
                  follow_up_date = COALESCE($2, follow_up_date),
                  due_date       = COALESCE($3, due_date),
                  payment_term   = COALESCE($4, payment_term),
                  updated_at     = NOW()
            WHERE id = $5 AND deleted_at IS NULL
            RETURNING *`,
          [
            observations ?? null,
            follow_up_date ?? null,
            due_date ?? null,
            payment_term ?? null,
            req.params.id,
          ]
        )
        if (result.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' })
        return res.json(result.rows[0])
      } catch (error: any) {
        logger.error('Update invoice follow-up error', {
          error: error.message,
          invoiceId: req.params.id,
        })
        return res.status(500).json({ error: 'Failed to update invoice follow-up' })
      }
    }
  )

  // ── Pagos ──────────────────────────────────────────────────────────────
  router.get(
    '/:id/payments',
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      try {
        const result = await pool.query(
          `SELECT p.*, u.name AS created_by_name
             FROM invoice_payments p
             LEFT JOIN users u ON u.id = p.created_by
            WHERE p.invoice_id = $1
            ORDER BY p.paid_at DESC, p.created_at DESC`,
          [req.params.id]
        )
        return res.json(result.rows)
      } catch (error: any) {
        logger.error('Get payments error', { error: error.message, invoiceId: req.params.id })
        return res.status(500).json({ error: 'Failed to fetch payments' })
      }
    }
  )

  router.post(
    '/:id/payments',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('id'), body: paymentCreateSchema }),
    async (req: AuthRequest, res) => {
      try {
        const { paid_at, amount, method, reference, observations } = req.body

        const invoice = await pool.query(
          `SELECT i.id, b.balance
             FROM invoices i
             LEFT JOIN v_invoice_balance b ON b.invoice_id = i.id
            WHERE i.id = $1 AND i.deleted_at IS NULL`,
          [req.params.id]
        )
        if (invoice.rows.length === 0) return res.status(404).json({ error: 'Invoice not found' })

        // Un abono mayor al saldo casi siempre es un error de tipeo. Se rechaza
        // con el saldo real para que el usuario pueda corregir, en vez de dejar
        // la factura con saldo negativo.
        const balance = Number(invoice.rows[0].balance ?? 0)
        if (Number(amount) > balance + 0.01) {
          return res.status(400).json({
            error: 'Payment exceeds balance',
            message: `El abono ($${Number(amount).toLocaleString('es-CL')}) supera el saldo pendiente ($${balance.toLocaleString('es-CL')}).`,
            balance,
          })
        }

        const result = await pool.query(
          `INSERT INTO invoice_payments
            (invoice_id, paid_at, amount, method, reference, observations, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            req.params.id,
            paid_at || new Date().toISOString().slice(0, 10),
            amount,
            method || 'transferencia',
            reference || null,
            observations || null,
            req.user?.id ?? null,
          ]
        )

        // `status` sigue siendo el estado del documento; el estado de cobranza
        // lo deriva la vista. Se marca 'paid' solo cuando el saldo llega a cero
        // para que ambos cuenten la misma historia.
        const after = await pool.query(
          `SELECT balance FROM v_invoice_balance WHERE invoice_id = $1`,
          [req.params.id]
        )
        if (Number(after.rows[0]?.balance ?? 1) <= 0) {
          await pool.query(
            `UPDATE invoices SET status = 'paid', updated_at = NOW()
              WHERE id = $1 AND status <> 'cancelled'`,
            [req.params.id]
          )
        }

        return res.status(201).json(result.rows[0])
      } catch (error: any) {
        logger.error('Create payment error', { error: error.message, invoiceId: req.params.id })
        return res.status(500).json({ error: 'Failed to register payment' })
      }
    }
  )

  router.delete(
    '/payments/:paymentId',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('paymentId') }),
    async (req: AuthRequest, res) => {
      try {
        const result = await pool.query(
          `DELETE FROM invoice_payments WHERE id = $1 RETURNING invoice_id`,
          [req.params.paymentId]
        )
        if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' })

        // Al revertir un abono la factura deja de estar pagada.
        await pool.query(
          `UPDATE invoices i
              SET status = 'issued', updated_at = NOW()
             FROM v_invoice_balance b
            WHERE i.id = $1 AND b.invoice_id = i.id
              AND b.balance > 0 AND i.status = 'paid'`,
          [result.rows[0].invoice_id]
        )
        return res.json({ message: 'Payment deleted successfully' })
      } catch (error: any) {
        logger.error('Delete payment error', { error: error.message })
        return res.status(500).json({ error: 'Failed to delete payment' })
      }
    }
  )

  // ── Factoring / confirming ─────────────────────────────────────────────
  router.put(
    '/:id/factoring',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('id'), body: factoringUpsertSchema }),
    async (req: AuthRequest, res) => {
      const db = await pool.connect()
      try {
        const b = req.body
        await db.query('BEGIN')

        const invoice = await db.query(
          `SELECT id FROM invoices WHERE id = $1 AND deleted_at IS NULL`,
          [req.params.id]
        )
        if (invoice.rows.length === 0) {
          await db.query('ROLLBACK')
          return res.status(404).json({ error: 'Invoice not found' })
        }

        const result = await db.query(
          `INSERT INTO invoice_factoring
            (invoice_id, type, company, ceded_at, advance_amount, rate_pct,
             cost_amount, expected_settle_at, settled_at, status, observations, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (invoice_id) DO UPDATE SET
             type = EXCLUDED.type,
             company = EXCLUDED.company,
             ceded_at = EXCLUDED.ceded_at,
             advance_amount = EXCLUDED.advance_amount,
             rate_pct = EXCLUDED.rate_pct,
             cost_amount = EXCLUDED.cost_amount,
             expected_settle_at = EXCLUDED.expected_settle_at,
             settled_at = EXCLUDED.settled_at,
             status = EXCLUDED.status,
             observations = EXCLUDED.observations,
             updated_at = NOW()
           RETURNING *`,
          [
            req.params.id,
            b.type || 'factoring',
            b.company,
            b.ceded_at || new Date().toISOString().slice(0, 10),
            b.advance_amount ?? 0,
            b.rate_pct ?? null,
            b.cost_amount ?? 0,
            b.expected_settle_at || null,
            b.settled_at || null,
            b.status || 'cedida',
            b.observations || null,
            req.user?.id ?? null,
          ]
        )

        // is_factored queda como bandera de conveniencia para listados; la
        // verdad vive en invoice_factoring.
        await db.query(`UPDATE invoices SET is_factored = true, updated_at = NOW() WHERE id = $1`, [
          req.params.id,
        ])

        await db.query('COMMIT')
        return res.json(result.rows[0])
      } catch (error: any) {
        await db.query('ROLLBACK')
        logger.error('Upsert factoring error', { error: error.message, invoiceId: req.params.id })
        return res.status(500).json({ error: 'Failed to save factoring' })
      } finally {
        db.release()
      }
    }
  )

  router.delete(
    '/:id/factoring',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      const db = await pool.connect()
      try {
        await db.query('BEGIN')
        const result = await db.query(
          `DELETE FROM invoice_factoring WHERE invoice_id = $1 RETURNING id`,
          [req.params.id]
        )
        if (result.rows.length === 0) {
          await db.query('ROLLBACK')
          return res.status(404).json({ error: 'Factoring not found' })
        }
        await db.query(
          `UPDATE invoices SET is_factored = false, updated_at = NOW() WHERE id = $1`,
          [req.params.id]
        )
        await db.query('COMMIT')
        return res.json({ message: 'Factoring deleted successfully' })
      } catch (error: any) {
        await db.query('ROLLBACK')
        logger.error('Delete factoring error', { error: error.message })
        return res.status(500).json({ error: 'Failed to delete factoring' })
      } finally {
        db.release()
      }
    }
  )

  // ── Estado del documento ───────────────────────────────────────────────
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
