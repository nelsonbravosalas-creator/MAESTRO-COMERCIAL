import { Router } from 'express'
import { Pool } from 'pg'
import { authMiddleware, roleMiddleware } from '../middleware/auth'
import { logger } from '../utils/logger'

export const createConfigRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  router.get('/', async (_req, res) => {
    try {
      const result = await pool.query('SELECT key, value FROM app_config ORDER BY key')
      const config: Record<string, string> = {}
      for (const row of result.rows) config[row.key] = row.value
      return res.json(config)
    } catch (error: any) {
      logger.error('Get config error', { error: error.message })
      return res.status(500).json({ error: 'Failed to fetch config' })
    }
  })

  router.patch('/:key', roleMiddleware('admin'), async (req: any, res) => {
    try {
      const { key } = req.params
      const { value } = req.body
      if (value === undefined || value === null) {
        return res.status(400).json({ error: 'value is required' })
      }

      const result = await pool.query(
        `INSERT INTO app_config (key, value, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               updated_at = NOW(),
               updated_by = EXCLUDED.updated_by
         RETURNING key, value`,
        [key, String(value), req.user?.id ?? null]
      )

      return res.json(result.rows[0])
    } catch (error: any) {
      logger.error('Update config error', { error: error.message, key: req.params.key })
      return res.status(500).json({ error: 'Failed to update config' })
    }
  })

  return router
}
