import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'
import { env } from '../config/env'
import { maskEmail } from '../utils/maskPii'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
    role: string
  }
}

interface TokenPayload {
  id: string
  email: string
  name: string
  role: string
  kind?: string
}

// Un refresh token (30 días) está firmado con el mismo JWT_SECRET que un access
// token, así que pasaba `jwt.verify` sin objeción y servía como Bearer en
// cualquier endpoint protegido: la ventana de 1h que env.JWT_EXPIRY justifica
// explícitamente se convertía en 30 días. El claim `kind` es lo único que los
// distingue (api/auth.ts firma 'access' y 'refresh'), y hasta ahora nadie lo
// miraba fuera de POST /api/auth/refresh.
//
// Se rechaza por lista negra ("cualquier kind que no sea access") en vez de
// exigir `kind === 'access'` a propósito: los access tokens emitidos ANTES de
// este cambio no llevan el claim, y exigirlo devolvería 401 a todas las
// sesiones vivas de golpe. Pasada una ventana de env.JWT_EXPIRY desde el
// despliegue ya no queda ninguno de esos, y este chequeo puede endurecerse a
// la forma estricta (ver docs/ADR_TOKEN_STORAGE.md).
const isAccessToken = (decoded: TokenPayload) =>
  decoded.kind === undefined || decoded.kind === 'access'

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader) {
      logger.warn('Missing authorization header', { url: req.url })
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header required',
      })
    }

    const token = authHeader.replace('Bearer ', '')

    if (!token) {
      logger.warn('Missing token in authorization header', { url: req.url })
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token required',
      })
    }

    // FIX BUG #1: Proper JWT validation with try-catch
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload

    if (!isAccessToken(decoded)) {
      // Mismo cuerpo que la rama de JsonWebTokenError: que la respuesta no le
      // confirme a quien prueba tokens cuál de los dos motivos falló.
      logger.warn('Non-access token presented as Bearer', { url: req.url, kind: decoded.kind })
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed',
      })
    }

    // Properly assign user to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    }

    logger.info('User authenticated', { userId: req.user.id, email: maskEmail(req.user.email) })
    next()
  } catch (error: any) {
    logger.error('JWT verification failed', {
      error: error.message,
      url: req.url,
    })

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again',
      })
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed',
      })
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication failed',
    })
  }
}

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload
      // Mismo criterio que authMiddleware: un refresh token no autentica a
      // nadie. Acá no se responde 401 (la ruta es opcional), simplemente la
      // petición sigue como anónima.
      if (isAccessToken(decoded)) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
        }
      } else {
        logger.warn('Non-access token ignored in optionalAuth', { url: req.url })
      }
    }
  } catch (error: any) {
    logger.debug('Optional auth failed', { error: error.message })
  }

  next()
}

export const roleMiddleware = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      })
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        role: req.user.role,
        requiredRoles: roles,
        url: req.url,
      })

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      })
    }

    next()
  }
}
