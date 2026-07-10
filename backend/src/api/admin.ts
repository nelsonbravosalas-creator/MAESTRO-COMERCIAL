import { Router, Request, Response } from 'express'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { logger } from '../utils/logger'

// Compara en tiempo constante para evitar timing attacks sobre el secret
const secretMatches = (provided: string, expected: string) => {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export const createAdminRouter = (pool: Pool) => {
  const router = Router()

  // Endpoint sin JWT a propósito: sirve para crear/promover el primer admin
  // cuando todavía no hay ninguna sesión válida. Se protege con ADMIN_SETUP_SECRET.
  router.post('/setup', async (req: Request, res: Response) => {
    try {
      const setupSecret = process.env.ADMIN_SETUP_SECRET

      if (!setupSecret) {
        logger.warn('Admin setup attempted but ADMIN_SETUP_SECRET is not configured')
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'ADMIN_SETUP_SECRET no está configurado en el servidor',
        })
      }

      const { secret, email, password, name } = req.body ?? {}

      if (!secret || !secretMatches(String(secret), setupSecret)) {
        logger.warn('Admin setup: invalid secret', { ip: req.ip })
        return res.status(401).json({ error: 'Unauthorized', message: 'Secret inválido' })
      }

      const normalizedEmail = String(email ?? '').trim().toLowerCase()
      if (!normalizedEmail) {
        return res.status(400).json({ error: 'Bad request', message: 'Email es requerido' })
      }
      if (!password || String(password).length < 4) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'password/PIN de al menos 4 caracteres es requerido',
        })
      }

      const passwordHash = await bcrypt.hash(String(password), 10)
      const finalName = String(name ?? '').trim() || normalizedEmail.split('@')[0]

      const existing = await pool.query(
        'SELECT id FROM users WHERE lower(email) = $1 AND deleted_at IS NULL',
        [normalizedEmail]
      )

      let user
      if (existing.rows.length > 0) {
        const updated = await pool.query(
          `UPDATE users
              SET password_hash = $1,
                  name = $2,
                  role = 'admin',
                  is_active = true,
                  updated_at = NOW()
            WHERE id = $3
            RETURNING id, email, name, role, is_active, created_at, updated_at`,
          [passwordHash, finalName, existing.rows[0].id]
        )
        user = updated.rows[0]
        logger.info('Admin setup: promoted existing user to admin', {
          userId: user.id,
          email: normalizedEmail,
        })
      } else {
        const inserted = await pool.query(
          `INSERT INTO users (email, password_hash, name, role, is_active)
           VALUES ($1, $2, $3, 'admin', true)
           RETURNING id, email, name, role, is_active, created_at, updated_at`,
          [normalizedEmail, passwordHash, finalName]
        )
        user = inserted.rows[0]
        logger.info('Admin setup: created new admin user', {
          userId: user.id,
          email: normalizedEmail,
        })
      }

      return res.json({ ok: true, user })
    } catch (error: any) {
      logger.error('Admin setup error', { error: error.message })
      return res.status(500).json({ error: 'Internal server error', message: 'No se pudo completar el setup' })
    }
  })

  return router
}
