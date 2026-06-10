import { Router } from 'express'
import { Pool } from 'pg'
import { authMiddleware, roleMiddleware } from '../middleware/auth'
import { logger } from '../utils/logger'

const CATEGORIES = ['mo', 'log', 'mat', 'rep', 'ins']

const groupedCatalog = (rows: any[]) => {
  const grouped: Record<string, any[]> = { mo: [], log: [], mat: [], rep: [], ins: [] }
  for (const row of rows) {
    if (grouped[row.category_id]) grouped[row.category_id].push(row)
  }
  return grouped
}

export const createCatalogRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/', async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, category_id, description, unit_name, unit_price, is_active, sort_order,
                created_at, updated_at
           FROM catalog_items
          WHERE is_active = true
          ORDER BY category_id, sort_order, description`
      )
      return res.json(groupedCatalog(result.rows))
    } catch (error: any) {
      logger.error('Get catalog error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch catalog' })
    }
  })

  router.get('/:category_id', async (req, res) => {
    try {
      if (!CATEGORIES.includes(req.params.category_id)) {
        return res.status(400).json({ error: 'Invalid category_id' })
      }

      const result = await pool.query(
        `SELECT id, category_id, description, unit_name, unit_price, is_active, sort_order,
                created_at, updated_at
           FROM catalog_items
          WHERE category_id = $1
            AND is_active = true
          ORDER BY sort_order, description`,
        [req.params.category_id]
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get catalog category error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch catalog category' })
    }
  })

  router.post('/', roleMiddleware('admin', 'manager'), async (req, res) => {
    try {
      const { category_id, description, unit_name, unit_price, sort_order } = req.body
      if (!CATEGORIES.includes(category_id) || !description || !unit_name) {
        return res.status(400).json({ error: 'category_id, description and unit_name are required' })
      }

      const result = await pool.query(
        `INSERT INTO catalog_items (category_id, description, unit_name, unit_price, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [category_id, description, unit_name, Number(unit_price) || 0, Number(sort_order) || 0]
      )

      return res.status(201).json(result.rows[0])
    } catch (error: any) {
      logger.error('Create catalog item error', { error: error.message })
      return res.status(500).json({ error: 'Failed to create catalog item' })
    }
  })

  router.put('/:id', roleMiddleware('admin', 'manager'), async (req, res) => {
    try {
      const { category_id, description, unit_name, unit_price, sort_order } = req.body
      if (!CATEGORIES.includes(category_id) || !description || !unit_name) {
        return res.status(400).json({ error: 'category_id, description and unit_name are required' })
      }

      const result = await pool.query(
        `UPDATE catalog_items
            SET category_id = $1,
                description = $2,
                unit_name = $3,
                unit_price = $4,
                sort_order = $5,
                updated_at = NOW()
          WHERE id = $6
          RETURNING *`,
        [category_id, description, unit_name, Number(unit_price) || 0, Number(sort_order) || 0, req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Catalog item not found' })
      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update catalog item error', { error: error.message, id: req.params.id })
      return res.status(500).json({ error: 'Failed to update catalog item' })
    }
  })

  router.delete('/:id', roleMiddleware('admin'), async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE catalog_items
            SET is_active = false,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id`,
        [req.params.id]
      )

      if (result.rows.length === 0) return res.status(404).json({ error: 'Catalog item not found' })
      return res.json({ message: 'Catalog item deactivated' })
    } catch (error: any) {
      logger.error('Delete catalog item error', { error: error.message, id: req.params.id })
      return res.status(500).json({ error: 'Failed to delete catalog item' })
    }
  })

  return router
}
