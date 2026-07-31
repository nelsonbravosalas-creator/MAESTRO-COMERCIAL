import { Router, Response } from 'express'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { logger } from '../utils/logger'
import { AuthRequest, authMiddleware } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { env } from '../config/env'
import {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas/auth'
import { getMailer } from '../services/mailer'
import { validatePasswordPolicy } from '../utils/passwordPolicy'
import { maskEmail } from '../utils/maskPii'

const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_MINUTES = 30
const REFRESH_TOKEN_DAYS = 30
const RESET_TOKEN_MINUTES = 15

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

// jti aleatorio: sin esto, dos tokens firmados con el mismo payload dentro del
// mismo segundo (iat con granularidad de segundos) son bit a bit idénticos —
// rompe la rotación de A-02 y dificulta la trazabilidad de tokens individuales.
const signAccessToken = (user: any) =>
  jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, jti: crypto.randomUUID() },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY } as jwt.SignOptions
  )

const signRefreshToken = (user: any) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      kind: 'refresh',
      jti: crypto.randomUUID(),
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRY } as jwt.SignOptions
  )

// jwt.sign no expone directamente los segundos de vida; se derivan del propio
// token para que expires_in en la respuesta nunca quede desincronizado de
// env.JWT_EXPIRY (AC-2.6 exige acceso corto, y este número es lo que consume
// el frontend para saber cuándo refrescar).
const expiresInSeconds = (token: string): number => {
  const decoded = jwt.decode(token) as { iat?: number; exp?: number } | null
  if (!decoded?.iat || !decoded?.exp) return 0
  return decoded.exp - decoded.iat
}

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

  router.post(
    '/login',
    validate({ body: loginSchema }),
    async (req: AuthRequest, res: Response) => {
      try {
        const { email, password } = req.body as { email: string; password: string }
        const normalizedEmail = email // ya viene trim+lowercase del esquema

        const result = await pool.query(
          `SELECT id, email, name, password_hash, role, is_active,
                last_login_at, failed_login_attempts, locked_until,
                created_at, updated_at
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

        if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
          logger.warn('Login blocked: account locked', { userId: user.id, email: normalizedEmail })
          return res.status(423).json({
            error: 'Locked',
            message: `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intente nuevamente en ${LOCKOUT_MINUTES} minutos.`,
          })
        }

        const passwordMatch = await bcrypt.compare(String(password), user.password_hash)

        if (!passwordMatch) {
          const attempts = (user.failed_login_attempts ?? 0) + 1
          const lockNow = attempts >= MAX_FAILED_ATTEMPTS
          await pool.query(
            `UPDATE users
              SET failed_login_attempts = $2,
                  locked_until = CASE WHEN $3 THEN NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes' ELSE locked_until END
            WHERE id = $1`,
            [user.id, attempts, lockNow]
          )
          if (lockNow) {
            logger.warn('Account locked after repeated failed logins', {
              userId: user.id,
              email: normalizedEmail,
            })
          }
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Correo o PIN inválido',
          })
        }

        const token = signAccessToken(user)
        const refreshToken = signRefreshToken(user)

        // A-02, AC-2.8: si la sesión no se puede persistir, no se entregan tokens.
        // Un refresh token que nadie puede revocar (porque no quedó registrado)
        // es peor que no tener sesión.
        try {
          await pool.query(
            `INSERT INTO sessions (user_id, refresh_token_hash, ip_address, user_agent, expires_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${REFRESH_TOKEN_DAYS} days')`,
            [user.id, hashToken(refreshToken), req.ip ?? null, req.headers['user-agent'] ?? null]
          )
        } catch (sessionError: any) {
          logger.error('Could not persist refresh session — aborting login', {
            userId: user.id,
            error: sessionError.message,
          })
          return res.status(503).json({
            error: 'Service unavailable',
            message: 'No se pudo iniciar sesión. Intente nuevamente.',
          })
        }

        const updated = await pool.query(
          `UPDATE users
            SET last_login_at = NOW(),
                failed_login_attempts = 0,
                locked_until = NULL
          WHERE id = $1
          RETURNING id, email, name, role, is_active, last_login_at, created_at, updated_at`,
          [user.id]
        )

        logger.info('User login successful', { userId: user.id, email: maskEmail(normalizedEmail) })

        return res.json({
          token,
          refresh_token: refreshToken,
          expires_in: expiresInSeconds(token),
          expiresIn: expiresInSeconds(token),
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
          logger.error('Database connection error on login', {
            code: error.code,
            message: error.message,
          })
          return res.status(503).json({
            error: 'Service unavailable',
            message: 'No se puede conectar a la base de datos. Verifique DATABASE_URL.',
            code: 'DB_CONNECTION_ERROR',
          })
        }

        logger.error('Login endpoint error', { error: error.message, stack: error.stack })
        return res.status(500).json({
          error: 'Internal server error',
          message: env.NODE_ENV === 'production' ? 'No se pudo iniciar sesión' : error.message,
        })
      }
    }
  )

  // A-02: rotación con detección de reuso. Cada refresh exitoso revoca la
  // sesión actual y crea una nueva; si llega un refresh token que YA fue
  // rotado (su sesión está revocada), es señal de robo — se revocan TODAS
  // las sesiones del usuario.
  router.post(
    '/refresh',
    validate({ body: refreshSchema }),
    async (req: AuthRequest, res: Response) => {
      const { refresh_token } = req.body as { refresh_token: string }
      const db = await pool.connect()

      try {
        let decoded: any
        try {
          decoded = jwt.verify(refresh_token, env.JWT_SECRET)
        } catch {
          return res
            .status(401)
            .json({ error: 'Unauthorized', message: 'Refresh token expirado o inválido' })
        }
        if (decoded.kind !== 'refresh') {
          return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token inválido' })
        }

        const tokenHash = hashToken(refresh_token)
        const session = await db.query(
          `SELECT s.id, s.user_id, s.revoked_at, s.expires_at,
                u.id AS uid, u.email, u.name, u.role, u.is_active
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.refresh_token_hash = $1
            AND u.deleted_at IS NULL`,
          [tokenHash]
        )

        if (session.rows.length === 0) {
          return res.status(401).json({ error: 'Unauthorized', message: 'Sesión no encontrada' })
        }

        const row = session.rows[0]

        if (row.revoked_at) {
          // Reuso de un token ya rotado (o de logout): posible robo. Se revoca
          // todo lo que tenga el usuario, no solo esta sesión.
          await db.query(
            'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
            [row.user_id]
          )
          logger.error('Refresh token reuse detected — all sessions revoked', {
            userId: row.user_id,
          })
          return res.status(401).json({ error: 'Unauthorized', message: 'Sesión inválida' })
        }

        if (new Date(row.expires_at).getTime() <= Date.now()) {
          return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token expirado' })
        }

        if (!row.is_active) {
          return res.status(401).json({ error: 'Unauthorized', message: 'Usuario inválido' })
        }

        const user = { id: row.uid, email: row.email, name: row.name, role: row.role }
        const newAccessToken = signAccessToken(user)
        const newRefreshToken = signRefreshToken(user)

        await db.query('BEGIN')
        await db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [row.id])
        await db.query(
          `INSERT INTO sessions (user_id, refresh_token_hash, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${REFRESH_TOKEN_DAYS} days')`,
          [user.id, hashToken(newRefreshToken), req.ip ?? null, req.headers['user-agent'] ?? null]
        )
        await db.query('COMMIT')

        return res.json({
          token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_in: expiresInSeconds(newAccessToken),
          expiresIn: expiresInSeconds(newAccessToken),
        })
      } catch (error: any) {
        await db.query('ROLLBACK').catch(() => {})
        logger.error('Refresh endpoint error', { error: error.message })
        return res
          .status(401)
          .json({ error: 'Unauthorized', message: 'Refresh token expirado o inválido' })
      } finally {
        db.release()
      }
    }
  )

  // A-02, AC-2.5: revoca solo la sesión asociada al refresh token entregado.
  router.post(
    '/logout',
    validate({ body: refreshSchema }),
    async (req: AuthRequest, res: Response) => {
      try {
        const { refresh_token } = req.body as { refresh_token: string }
        await pool.query(
          `UPDATE sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
          [hashToken(refresh_token)]
        )
        return res.status(204).send()
      } catch (error: any) {
        logger.error('Logout error', { error: error.message })
        return res
          .status(500)
          .json({ error: 'Internal server error', message: 'No se pudo cerrar sesión' })
      }
    }
  )

  // A-02, AC-2.6: revoca todas las sesiones del usuario autenticado.
  router.post('/logout-all', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await pool.query(
        `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [req.user?.id]
      )
      logger.info('All sessions revoked for user', { userId: req.user?.id })
      return res.status(204).send()
    } catch (error: any) {
      logger.error('Logout-all error', { error: error.message, userId: req.user?.id })
      return res
        .status(500)
        .json({ error: 'Internal server error', message: 'No se pudo cerrar las sesiones' })
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
      return res
        .status(500)
        .json({ error: 'Internal server error', message: 'No se pudo obtener usuario' })
    }
  })

  // A-04, AC-4.1: siempre responde 202, exista o no el correo — evita que un
  // atacante use este endpoint para enumerar cuentas registradas. Para que el
  // tiempo de respuesta no delate la diferencia, se hace un trabajo equivalente
  // en ambas ramas (una consulta + un hash), no un return temprano.
  router.post(
    '/forgot-password',
    validate({ body: forgotPasswordSchema }),
    async (req: AuthRequest, res: Response) => {
      const { email } = req.body as { email: string }
      try {
        const result = await pool.query(
          `SELECT id, name FROM users WHERE lower(email) = $1 AND deleted_at IS NULL AND is_active = true`,
          [email]
        )

        const rawToken = crypto.randomBytes(32).toString('hex')
        const tokenHash = hashToken(rawToken)

        if (result.rows.length > 0) {
          const user = result.rows[0]
          // AC-4.4: pedir un token nuevo invalida los anteriores del mismo usuario.
          await pool.query(
            `UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
            [user.id]
          )
          await pool.query(
            `INSERT INTO password_resets (user_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '${RESET_TOKEN_MINUTES} minutes')`,
            [user.id, tokenHash]
          )

          const resetUrl = `${env.FRONTEND_PUBLIC_URL}/reset-password?token=${rawToken}`
          await getMailer().send({
            to: email,
            subject: 'Recuperar contraseña — BravoCRM',
            html: `<p>Hola ${user.name},</p><p>Para restablecer tu contraseña, entra a este enlace (vence en ${RESET_TOKEN_MINUTES} minutos):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si no fuiste tú, ignora este correo.</p>`,
            text: `Para restablecer tu contraseña entra a: ${resetUrl} (vence en ${RESET_TOKEN_MINUTES} minutos)`,
          })
          logger.info('Password reset requested', { userId: user.id, email: maskEmail(email) })
        } else {
          // Rama "no existe": mismo costo aproximado (hash) sin tocar la tabla real.
          await bcrypt.hash(tokenHash, 4)
          logger.info('Password reset requested for unknown email', { email: maskEmail(email) })
        }

        return res.status(202).json({
          message: 'Si el correo existe, se envió un enlace de recuperación.',
        })
      } catch (error: any) {
        logger.error('Forgot-password error', { error: error.message })
        // Igual 202: no revelar errores internos a través de este endpoint público.
        return res
          .status(202)
          .json({ message: 'Si el correo existe, se envió un enlace de recuperación.' })
      }
    }
  )

  router.post(
    '/reset-password',
    validate({ body: resetPasswordSchema }),
    async (req: AuthRequest, res: Response) => {
      const { token, password } = req.body as { token: string; password: string }
      try {
        const policy = validatePasswordPolicy(password)
        if (!policy.valid) {
          return res.status(400).json({ error: 'Bad request', message: policy.message })
        }

        const tokenHash = hashToken(token)
        const result = await pool.query(
          `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at, u.email, u.name
           FROM password_resets pr
           JOIN users u ON u.id = pr.user_id
          WHERE pr.token_hash = $1
            AND u.deleted_at IS NULL`,
          [tokenHash]
        )

        if (result.rows.length === 0) {
          return res.status(400).json({ error: 'Bad request', message: 'Token inválido' })
        }

        const row = result.rows[0]
        // AC-4.3: de un solo uso y con expiración — ambas condiciones dan el mismo 400
        // genérico para no filtrar cuál de las dos fue la causa.
        if (row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
          return res
            .status(400)
            .json({ error: 'Bad request', message: 'Token inválido o expirado' })
        }

        const passwordHash = await bcrypt.hash(password, 10)

        await pool.query('BEGIN')
        await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [row.id])
        await pool.query(
          `UPDATE users
            SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
          WHERE id = $2`,
          [passwordHash, row.user_id]
        )
        // AC-4.5: todas las sesiones previas quedan revocadas.
        await pool.query(
          'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [row.user_id]
        )
        await pool.query('COMMIT')

        await getMailer().send({
          to: row.email,
          subject: 'Tu contraseña fue cambiada — BravoCRM',
          html: `<p>Hola ${row.name},</p><p>Tu contraseña se cambió recientemente. Si no fuiste tú, contacta al administrador de inmediato.</p>`,
          text: 'Tu contraseña se cambió recientemente. Si no fuiste tú, contacta al administrador de inmediato.',
        })

        logger.info('Password reset completed', { userId: row.user_id })
        return res.status(200).json({ message: 'Contraseña actualizada' })
      } catch (error: any) {
        await pool.query('ROLLBACK').catch(() => {})
        logger.error('Reset-password error', { error: error.message })
        return res
          .status(500)
          .json({ error: 'Internal server error', message: 'No se pudo restablecer la contraseña' })
      }
    }
  )

  router.post(
    '/change-password',
    authMiddleware,
    validate({ body: changePasswordSchema }),
    async (req: AuthRequest, res: Response) => {
      const { current_password, new_password } = req.body as {
        current_password: string
        new_password: string
      }
      try {
        const policy = validatePasswordPolicy(new_password)
        if (!policy.valid) {
          return res.status(400).json({ error: 'Bad request', message: policy.message })
        }

        const result = await pool.query(
          'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
          [req.user?.id]
        )
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Not found', message: 'Usuario no encontrado' })
        }

        const match = await bcrypt.compare(current_password, result.rows[0].password_hash)
        if (!match) {
          return res
            .status(401)
            .json({ error: 'Unauthorized', message: 'Contraseña actual incorrecta' })
        }

        const passwordHash = await bcrypt.hash(new_password, 10)
        await pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
          passwordHash,
          req.user?.id,
        ])
        // Simplificación intencional: revoca TODAS las sesiones (incluida la que
        // originó este cambio), no solo "las demás" — más simple y más seguro que
        // intentar distinguir cuál sesión es "la actual" desde un access token
        // stateless. El cliente vuelve a loguearse con la contraseña nueva.
        await pool.query(
          'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [req.user?.id]
        )

        logger.info('Password changed by user', { userId: req.user?.id })
        return res.status(200).json({ message: 'Contraseña actualizada' })
      } catch (error: any) {
        logger.error('Change-password error', { error: error.message, userId: req.user?.id })
        return res
          .status(500)
          .json({ error: 'Internal server error', message: 'No se pudo cambiar la contraseña' })
      }
    }
  )

  return router
}
