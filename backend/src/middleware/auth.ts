import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
    role: string
  }
}

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as {
      id: string
      email: string
      name: string
      role: string
    }

    // Properly assign user to request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    }

    logger.info('User authenticated', { userId: req.user.id, email: req.user.email })
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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as {
        id: string
        email: string
        name: string
        role: string
      }
      req.user = decoded
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
