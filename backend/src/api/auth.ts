import { Router, Response } from 'express'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'
import { AuthRequest, authMiddleware } from '../middleware/auth'
import { LoginRequest, LoginResponse, ApiError } from '../../frontend/src/types'

export const createAuthRouter = (pool: Pool) => {
  const router = Router()

  // Login endpoint
  router.post('/login', async (req: AuthRequest, res: Response<LoginResponse | ApiError>) => {
    try {
      const { email, password } = req.body as LoginRequest

      if (!email || !password) {
        logger.warn('Login attempt with missing credentials', { email })
        return res.status(400).json({
          error: 'Bad request',
          message: 'Email and password are required',
          timestamp: new Date(),
        } as any)
      }

      // Get user from database
      const result = await pool.query(
        'SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email]
      )

      if (result.rows.length === 0) {
        logger.warn('Login failed: user not found', { email })
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
          timestamp: new Date(),
        } as any)
      }

      const user = result.rows[0]

      if (!user.is_active) {
        logger.warn('Login attempted for inactive user', { email })
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Account is inactive',
          timestamp: new Date(),
        } as any)
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password_hash)

      if (!passwordMatch) {
        logger.warn('Login failed: incorrect password', { email })
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid email or password',
          timestamp: new Date(),
        } as any)
      }

      // Update last login
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        process.env.JWT_SECRET || 'default-secret',
        {
          expiresIn: process.env.JWT_EXPIRY || '7d',
        }
      )

      logger.info('User login successful', { userId: user.id, email })

      return res.status(200).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          is_active: user.is_active,
          created_at: new Date(),
          updated_at: new Date(),
          sync_status: 'synced',
        },
        expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      })
    } catch (error: any) {
      logger.error('Login endpoint error', {
        error: error.message,
        stack: error.stack,
      })

      return res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Login failed',
        timestamp: new Date(),
      } as any)
    }
  })

  // Register endpoint
  router.post('/register', async (req: AuthRequest, res: Response<LoginResponse | ApiError>) => {
    try {
      const { email, password, name } = req.body

      if (!email || !password || !name) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Email, password, and name are required',
          timestamp: new Date(),
        } as any)
      }

      // Check if user exists
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      )

      if (existingUser.rows.length > 0) {
        logger.warn('Registration failed: user already exists', { email })
        return res.status(409).json({
          error: 'Conflict',
          message: 'User with this email already exists',
          timestamp: new Date(),
        } as any)
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10)

      // Create user
      const result = await pool.query(
        'INSERT INTO users (email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role',
        [email, hashedPassword, name, 'user', true]
      )

      const newUser = result.rows[0]

      // Generate JWT token
      const token = jwt.sign(
        {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
        },
        process.env.JWT_SECRET || 'default-secret',
        {
          expiresIn: process.env.JWT_EXPIRY || '7d',
        }
      )

      logger.info('User registered successfully', { userId: newUser.id, email })

      return res.status(201).json({
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          sync_status: 'synced',
        },
        expiresIn: 7 * 24 * 60 * 60,
      })
    } catch (error: any) {
      logger.error('Register endpoint error', {
        error: error.message,
        stack: error.stack,
      })

      return res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Registration failed',
        timestamp: new Date(),
      } as any)
    }
  })

  // Get current user endpoint
  router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        })
      }

      const result = await pool.query(
        'SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = $1',
        [req.user.id]
      )

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Not found',
          message: 'User not found',
        })
      }

      const user = result.rows[0]
      return res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at,
        sync_status: 'synced',
      })
    } catch (error: any) {
      logger.error('Get current user error', {
        error: error.message,
        userId: req.user?.id,
      })

      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get user',
      })
    }
  })

  return router
}
