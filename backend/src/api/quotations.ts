import { Router } from 'express'
import { Pool, PoolClient } from 'pg'
import { logger } from '../utils/logger'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const VALID_STATUSES = ['Borrador', 'Emitida', 'Enviada', 'Perdida', 'Adjudicada', 'Anulada']
const VALID_OPER_STATES = ['Pendiente de ejecución', 'En ejecución', 'Terminada']
const CATEGORY_IDS = ['mo', 'log', 'mat', 'rep', 'ins']

const normalizeStatus = (status: string | undefined) =>
  VALID_STATUSES.includes(status ?? '') ? status : 'Borrador'

const normalizeOperState = (state: string | undefined | null) =>
  state && VALID_OPER_STATES.includes(state) ? state : null

const paramString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value ?? ''

const quotationSelect = `
  SELECT q.*, c.name AS client_name, cc.name AS contact_name
    FROM quotations q
    LEFT JOIN clients c ON c.id = q.client_id
    LEFT JOIN client_contacts cc ON cc.id = q.contact_id
`

const totalsFor = async (db: Pool | PoolClient, quotationId: string) => {
  const result = await db.query('SELECT * FROM v_quotation_totals WHERE quotation_id = $1', [quotationId])
  const totals = result.rows[0] ?? {
    quotation_id: quotationId,
    costo_neto: 0,
    venta_neta: 0,
    beneficio_bruto: 0,
  }

  const venta = Number(totals.venta_neta) || 0
  const ivaPct = Number(totals.iva_pct) || 19
  return {
    ...totals,
    iva_monto: venta * (ivaPct / 100),
    total_con_iva: venta * (1 + ivaPct / 100),
  }
}

const fullQuotation = async (db: Pool | PoolClient, quotationId: string) => {
  const quotation = await db.query(
    `${quotationSelect}
      WHERE q.id = $1
        AND q.deleted_at IS NULL`,
    [quotationId]
  )

  if (quotation.rows.length === 0) return null

  const [categories, lineItems, terms, totals] = await Promise.all([
    db.query('SELECT * FROM quotation_categories WHERE quotation_id = $1 ORDER BY sort_order', [quotationId]),
    db.query('SELECT * FROM quotation_line_items WHERE quotation_id = $1 ORDER BY sort_order, created_at', [quotationId]),
    db.query('SELECT * FROM quotation_terms WHERE quotation_id = $1 ORDER BY sort_order', [quotationId]),
    totalsFor(db, quotationId),
  ])

  return {
    ...quotation.rows[0],
    categories: categories.rows,
    line_items: lineItems.rows,
    terms: terms.rows,
    totals,
  }
}

const replaceChildren = async (db: PoolClient, quotationId: string, body: any) => {
  await db.query('DELETE FROM quotation_terms WHERE quotation_id = $1', [quotationId])
  await db.query('DELETE FROM quotation_line_items WHERE quotation_id = $1', [quotationId])
  await db.query('DELETE FROM quotation_categories WHERE quotation_id = $1', [quotationId])

  if (Array.isArray(body.categories)) {
    for (const [idx, category] of body.categories.entries()) {
      if (!CATEGORY_IDS.includes(category.category_id)) continue
      await db.query(
        `INSERT INTO quotation_categories
          (quotation_id, category_id, label, margin_pct, color, note, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          quotationId,
          category.category_id,
          category.label || category.category_id,
          Number(category.margin_pct) || 0,
          category.color || null,
          category.note || null,
          Number(category.sort_order ?? idx),
        ]
      )
    }
  }

  if (Array.isArray(body.line_items)) {
    for (const [idx, item] of body.line_items.entries()) {
      if (!CATEGORY_IDS.includes(item.category_id) || !item.description) continue
      await db.query(
        `INSERT INTO quotation_line_items
          (quotation_id, category_id, catalog_item_id, description, unit_name,
           quantity, days, unit_price, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          quotationId,
          item.category_id,
          item.catalog_item_id || null,
          item.description,
          item.unit_name || 'Und',
          Number(item.quantity) || 0,
          Math.max(1, Number(item.days) || 1),
          Number(item.unit_price) || 0,
          Number(item.sort_order ?? idx),
        ]
      )
    }
  }

  if (Array.isArray(body.terms)) {
    for (const [idx, term] of body.terms.entries()) {
      if (!['scope', 'exclusion', 'commercial'].includes(term.term_type) || !term.content) continue
      await db.query(
        `INSERT INTO quotation_terms (quotation_id, term_type, content, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [quotationId, term.term_type, term.content, Number(term.sort_order ?? idx)]
      )
    }
  }
}

export const createQuotationsRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/', async (_req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `${quotationSelect}
          LEFT JOIN v_quotation_totals vt ON vt.quotation_id = q.id
          WHERE q.deleted_at IS NULL
          ORDER BY q.created_at DESC`
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get quotations error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch quotations' })
    }
  })

  router.get('/:id', async (req: AuthRequest, res) => {
    const quotationId = paramString(req.params.id)
    try {
      const quotation = await fullQuotation(pool, quotationId)
      if (!quotation) return res.status(404).json({ error: 'Quotation not found' })
      return res.json(quotation)
    } catch (error: any) {
      logger.error('Get quotation error', { error: error.message, quotationId })
      return res.status(500).json({ error: 'Failed to fetch quotation' })
    }
  })

  router.post('/', async (req: AuthRequest, res) => {
    const db = await pool.connect()
    try {
      const body = req.body
      if (!body.client_id) return res.status(400).json({ error: 'client_id is required' })
      if (!body.correlative) return res.status(400).json({ error: 'correlative is required' })

      await db.query('BEGIN')
      const result = await db.query(
        `INSERT INTO quotations
          (correlative, client_id, contact_id, enduser, ref, date, valid_until,
           status, oper_state, uf_value, iva_pct, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          body.correlative,
          body.client_id,
          body.contact_id || null,
          body.enduser || null,
          body.ref || null,
          body.date || new Date().toISOString().slice(0, 10),
          body.valid_until || null,
          normalizeStatus(body.status),
          normalizeOperState(body.oper_state),
          Number(body.uf_value) || 0,
          Number(body.iva_pct) || 19,
          body.notes || null,
          req.user?.id ?? null,
        ]
      )

      await replaceChildren(db, result.rows[0].id, body)
      await db.query('COMMIT')

      const created = await fullQuotation(pool, result.rows[0].id)
      return res.status(201).json(created)
    } catch (error: any) {
      await db.query('ROLLBACK')
      logger.error('Create quotation error', { error: error.message, userId: req.user?.id })
      if (error.code === '23505') return res.status(409).json({ error: 'Quotation correlative already exists' })
      return res.status(500).json({ error: 'Failed to create quotation' })
    } finally {
      db.release()
    }
  })

  router.put('/:id', async (req: AuthRequest, res) => {
    const db = await pool.connect()
    const quotationId = paramString(req.params.id)
    try {
      const body = req.body
      if (!body.client_id) return res.status(400).json({ error: 'client_id is required' })

      await db.query('BEGIN')
      const result = await db.query(
        `UPDATE quotations
            SET correlative = $1,
                client_id = $2,
                contact_id = $3,
                enduser = $4,
                ref = $5,
                date = $6,
                valid_until = $7,
                status = $8,
                oper_state = $9,
                uf_value = $10,
                iva_pct = $11,
                notes = $12,
                updated_at = NOW()
          WHERE id = $13
            AND deleted_at IS NULL
          RETURNING *`,
        [
          body.correlative,
          body.client_id,
          body.contact_id || null,
          body.enduser || null,
          body.ref || null,
          body.date || new Date().toISOString().slice(0, 10),
          body.valid_until || null,
          normalizeStatus(body.status),
          normalizeOperState(body.oper_state),
          Number(body.uf_value) || 0,
          Number(body.iva_pct) || 19,
          body.notes || null,
          quotationId,
        ]
      )

      if (result.rows.length === 0) {
        await db.query('ROLLBACK')
        return res.status(404).json({ error: 'Quotation not found' })
      }

      await replaceChildren(db, quotationId, body)
      await db.query('COMMIT')

      return res.json(await fullQuotation(pool, quotationId))
    } catch (error: any) {
      await db.query('ROLLBACK')
      logger.error('Update quotation error', { error: error.message, quotationId })
      if (error.code === '23505') return res.status(409).json({ error: 'Quotation correlative already exists' })
      return res.status(500).json({ error: 'Failed to update quotation' })
    } finally {
      db.release()
    }
  })

  const updateStatus = async (req: AuthRequest, res: any) => {
    const quotationId = paramString(req.params.id)
    try {
      const { status, oper_state } = req.body
      const result = await pool.query(
        `UPDATE quotations
            SET status = $1,
                oper_state = COALESCE($2, oper_state),
                updated_at = NOW()
          WHERE id = $3
            AND deleted_at IS NULL
          RETURNING id, status, oper_state`,
        [normalizeStatus(status), normalizeOperState(oper_state), quotationId]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Quotation not found' })

      // Auto-create project when status becomes 'Adjudicada'
      if (normalizeStatus(status) === 'Adjudicada') {
        try {
          const qRow = await pool.query(
            `SELECT q.client_id, q.correlative, c.name AS client_name FROM quotations q LEFT JOIN clients c ON c.id = q.client_id WHERE q.id = $1`,
            [quotationId]
          )
          if (qRow.rows[0]) {
            const { client_id, correlative, client_name } = qRow.rows[0]
            // Check if a project for this quotation already exists
            const existing = await pool.query(
              `SELECT id FROM projects WHERE quotation_id = $1 AND deleted_at IS NULL LIMIT 1`,
              [quotationId]
            )
            if (existing.rows.length === 0) {
              const totals = await totalsFor(pool, quotationId)
              await pool.query(
                `INSERT INTO projects (quotation_id, client_id, name, status, budget, progress_pct, created_by)
                 VALUES ($1, $2, $3, 'planning', $4, 0, $5)`,
                [quotationId, client_id, `Proyecto ${correlative} — ${client_name ?? ''}`, Number(totals.venta_neta) || 0, null]
              )
            }
          }
        } catch (autoErr) {
          logger.error('Auto-create project on Adjudicada error', autoErr)
          // Non-fatal: don't break the status update response
        }
      }

      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update quotation status error', { error: error.message, quotationId })
      return res.status(500).json({ error: 'Failed to update quotation status' })
    }
  }

  router.patch('/:id/status', updateStatus)
  router.put('/:id/status', updateStatus)

  router.post('/:id/duplicate', async (req: AuthRequest, res) => {
    const db = await pool.connect()
    const quotationId = paramString(req.params.id)
    try {
      const source = await fullQuotation(pool, quotationId)
      if (!source) return res.status(404).json({ error: 'Quotation not found' })
      if (!req.body.correlative) return res.status(400).json({ error: 'correlative is required' })

      await db.query('BEGIN')
      const inserted = await db.query(
        `INSERT INTO quotations
          (correlative, client_id, contact_id, enduser, ref, date, valid_until,
           status, oper_state, uf_value, iva_pct, notes, version, created_by)
         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          req.body.correlative,
          source.client_id,
          source.contact_id,
          source.enduser,
          source.ref,
          source.valid_until,
          'Borrador',
          source.oper_state,
          source.uf_value,
          source.iva_pct,
          source.notes,
          Number(source.version || 1) + 1,
          req.user?.id ?? null,
        ]
      )

      await replaceChildren(db, inserted.rows[0].id, source)
      await db.query('COMMIT')

      return res.status(201).json(await fullQuotation(pool, inserted.rows[0].id))
    } catch (error: any) {
      await db.query('ROLLBACK')
      logger.error('Duplicate quotation error', { error: error.message, quotationId })
      if (error.code === '23505') return res.status(409).json({ error: 'Quotation correlative already exists' })
      return res.status(500).json({ error: 'Failed to duplicate quotation' })
    } finally {
      db.release()
    }
  })

  router.delete('/:id', async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `UPDATE quotations
            SET deleted_at = NOW()
          WHERE id = $1
            AND deleted_at IS NULL
          RETURNING id`,
        [req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Quotation not found' })
      return res.json({ message: 'Quotation deleted successfully' })
    } catch (error: any) {
      logger.error('Delete quotation error', { error: error.message, quotationId: req.params.id })
      return res.status(500).json({ error: 'Failed to delete quotation' })
    }
  })

  return router
}
