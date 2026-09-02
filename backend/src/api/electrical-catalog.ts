import { Router } from 'express'
import { Pool } from 'pg'
import { authMiddleware, roleMiddleware } from '../middleware/auth'
import { logger } from '../utils/logger'
import { validate } from '../middleware/validate'
import { uuidParams } from '../schemas/common'
import { electricalCatalogItemSchema } from '../schemas/catalog'

// Catálogo de "Materiales Eléctricos" — mismo patrón CRUD que catalog.ts,
// pero sobre su propia tabla (electrical_catalog_items, sin category_id).
export const createElectricalCatalogRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/', async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, description, unit_name, unit_price, is_active, sort_order,
                created_at, updated_at
           FROM electrical_catalog_items
          WHERE is_active = true
          ORDER BY sort_order, description`
      )
      return res.json(result.rows)
    } catch (error: any) {
      logger.error('Get electrical catalog error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch electrical catalog' })
    }
  })

  router.post(
    '/',
    roleMiddleware('admin', 'manager'),
    validate({ body: electricalCatalogItemSchema }),
    async (req, res) => {
      try {
        const { description, unit_name, unit_price, sort_order } = req.body

        const result = await pool.query(
          `INSERT INTO electrical_catalog_items (description, unit_name, unit_price, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
          [description, unit_name, Number(unit_price) || 0, Number(sort_order) || 0]
        )

        return res.status(201).json(result.rows[0])
      } catch (error: any) {
        logger.error('Create electrical catalog item error', { error: error.message })
        return res.status(500).json({ error: 'Failed to create electrical catalog item' })
      }
    }
  )

  router.put(
    '/:id',
    roleMiddleware('admin', 'manager'),
    validate({ params: uuidParams('id'), body: electricalCatalogItemSchema }),
    async (req, res) => {
      try {
        const { description, unit_name, unit_price, sort_order } = req.body

        const result = await pool.query(
          `UPDATE electrical_catalog_items
            SET description = $1,
                unit_name = $2,
                unit_price = $3,
                sort_order = $4,
                updated_at = NOW()
          WHERE id = $5
          RETURNING *`,
          [description, unit_name, Number(unit_price) || 0, Number(sort_order) || 0, req.params.id]
        )

        if (result.rows.length === 0)
          return res.status(404).json({ error: 'Electrical catalog item not found' })
        return res.json(result.rows[0])
      } catch (error: any) {
        logger.error('Update electrical catalog item error', {
          error: error.message,
          id: req.params.id,
        })
        return res.status(500).json({ error: 'Failed to update electrical catalog item' })
      }
    }
  )

  router.delete(
    '/:id',
    roleMiddleware('admin'),
    validate({ params: uuidParams('id') }),
    async (req, res) => {
      try {
        const result = await pool.query(
          `UPDATE electrical_catalog_items
            SET is_active = false,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id`,
          [req.params.id]
        )

        if (result.rows.length === 0)
          return res.status(404).json({ error: 'Electrical catalog item not found' })
        return res.json({ message: 'Electrical catalog item deactivated' })
      } catch (error: any) {
        logger.error('Delete electrical catalog item error', {
          error: error.message,
          id: req.params.id,
        })
        return res.status(500).json({ error: 'Failed to delete electrical catalog item' })
      }
    }
  )

  return router
}
