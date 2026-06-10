import { Router, Response } from 'express'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'
import { AuthRequest, authMiddleware } from '../middleware/auth'

interface LoginRequest { email: string; password: string }

const jwtSecret = () => process.env.JWT_SECRET || 'default-secret'
const accessExpiry = () => process.env.JWT_EXPIRY || '8h'
const refreshExpiry = () => process.env.JWT_REFRESH_EXPIRY || '30d'

const signAccessToken = (user: any) =>
  jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    jwtSecret(),
    { expiresIn: accessExpiry() } as jwt.SignOptions
  )

const signRefreshToken = (user: any) =>
  jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, kind: 'refresh' },
    jwtSecret(),
    { expiresIn: refreshExpiry() } as jwt.SignOptions
  )

const safeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  is_active: user.is_active,
  last_login_at: user.last_login_at ?? null,
  created_at: user.created_at,
  updated_at: user.updated_at,
  sync_status: 'synced',
})

export const createAuthRouter = (pool: Pool) => {
  const router = Router()

  router.post('/login', async (req: AuthRequest, res: Response) => {
    try {
      const { email, password } = req.body as LoginRequest
      const normalizedEmail = email?.trim().toLowerCase()
      const allowNoPIN = process.env.ALLOW_NO_PIN === 'true'

      if (!normalizedEmail) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Email es requerido',
        })
      }

      if (!password && !allowNoPIN) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'PIN es requerido',
        })
      }

      const result = await pool.query(
        `SELECT id, email, name, password_hash, role, is_active,
                last_login_at, created_at, updated_at
           FROM users
          WHERE lower(email) = $1
            AND deleted_at IS NULL`,
        [normalizedEmail]
      )

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Correo o PIN inválido',
        })
      }

      const user = result.rows[0]

      if (!user.is_active) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'La cuenta está inactiva',
        })
      }

      let passwordMatch = false
      if (password) {
        passwordMatch = await bcrypt.compare(String(password), user.password_hash)
      } else if (allowNoPIN) {
        passwordMatch = true
      }

      if (!passwordMatch) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Correo o PIN inválido',
        })
      }

      const token = signAccessToken(user)
      const refreshToken = signRefreshToken(user)

      const updated = await pool.query(
        `UPDATE users
            SET last_login_at = NOW()
          WHERE id = $1
          RETURNING id, email, name, role, is_active, last_login_at, created_at, updated_at`,
        [user.id]
      )

      try {
        await pool.query(
          `INSERT INTO sessions (user_id, refresh_token, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
          [user.id, refreshToken]
        )
      } catch (sessionError: any) {
        logger.warn('Could not persist refresh session', {
          userId: user.id,
          error: sessionError.message,
        })
      }

      logger.info('User login successful', { userId: user.id, email: normalizedEmail })

      return res.json({
        token,
        refresh_token: refreshToken,
        expires_in: 8 * 60 * 60,
        expiresIn: 8 * 60 * 60,
        user: safeUser(updated.rows[0] ?? user),
      })
    } catch (error: any) {
      const isDbError =
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('database') ||
        error.message?.includes('connect')

      if (isDbError) {
        logger.error('Database connection error on login', { code: error.code, message: error.message })
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'No se puede conectar a la base de datos. Verifique DATABASE_URL.',
          code: 'DB_CONNECTION_ERROR',
        })
      }

      logger.error('Login endpoint error', { error: error.message, stack: error.stack })
      return res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'No se pudo iniciar sesión' : error.message,
      })
    }
  })

  router.post('/refresh', async (req: AuthRequest, res: Response) => {
    const { refresh_token } = req.body ?? {}
    if (!refresh_token) {
      return res.status(400).json({ error: 'Bad request', message: 'refresh_token requerido' })
    }

    try {
      const decoded = jwt.verify(refresh_token, jwtSecret()) as any
      if (decoded.kind !== 'refresh') {
        return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token inválido' })
      }

      const result = await pool.query(
        `SELECT id, email, name, role, is_active
           FROM users
          WHERE id = $1
            AND deleted_at IS NULL`,
        [decoded.id]
      )

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Usuario inválido' })
      }

      return res.json({
        token: signAccessToken(result.rows[0]),
        expires_in: 8 * 60 * 60,
        expiresIn: 8 * 60 * 60,
      })
    } catch {
      return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token expirado o inválido' })
    }
  })

  router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, email, name, role, is_active,
                last_login_at, created_at, updated_at
           FROM users
          WHERE id = $1
            AND deleted_at IS NULL`,
        [req.user?.id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Not found', message: 'Usuario no encontrado' })
      }

      return res.json(safeUser(result.rows[0]))
    } catch (error: any) {
      logger.error('Get current user error', { error: error.message, userId: req.user?.id })
      return res.status(500).json({ error: 'Internal server error', message: 'No se pudo obtener usuario' })
    }
  })

  return router
}
