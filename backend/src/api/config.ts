import { Router } from 'express'
import { Pool } from 'pg'
import { authMiddleware, roleMiddleware, type AuthRequest } from '../middleware/auth'
import { logger } from '../utils/logger'
import { validate } from '../middleware/validate'
import {
  COMPANY_LOGO_KEY,
  companyLogoBodySchema,
  configKeyParamSchema,
  configValueSchema,
} from '../schemas/config'

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

  router.put(
    '/logo',
    roleMiddleware('admin'),
    validate({ body: companyLogoBodySchema }),
    async (req: AuthRequest, res) => {
      try {
        await pool.query(
          `INSERT INTO app_config (key, value, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value,
               updated_at = NOW(),
               updated_by = EXCLUDED.updated_by`,
          [COMPANY_LOGO_KEY, req.body.dataUrl, req.user?.id ?? null]
        )
        return res.json({ key: COMPANY_LOGO_KEY, value: req.body.dataUrl })
      } catch (error: any) {
        logger.error('Update logo error', { error: String(error) })
        return res.status(500).json({ error: 'Failed to update logo' })
      }
    }
  )

  router.delete('/logo', roleMiddleware('admin'), async (_req, res) => {
    try {
      await pool.query('DELETE FROM app_config WHERE key = $1', [COMPANY_LOGO_KEY])
      return res.json({ key: COMPANY_LOGO_KEY, deleted: true })
    } catch (error) {
      logger.error('Delete logo error', { error: String(error) })
      return res.status(500).json({ error: 'Failed to delete logo' })
    }
  })

  router.patch(
    '/:key',
    roleMiddleware('admin'),
    validate({ params: configKeyParamSchema, body: configValueSchema }),
    async (req: any, res) => {
      try {
        const { key } = req.params
        const { value } = req.body

        // El logo solo se cambia por PUT /logo, que valida el formato de imagen.
        if (key === COMPANY_LOGO_KEY) {
          return res.status(400).json({ error: 'Use PUT /api/config/logo' })
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
    }
  )

  return router
}
