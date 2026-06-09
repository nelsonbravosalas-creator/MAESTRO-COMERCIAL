import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { logger } from './utils/logger'
import { createAuthRouter } from './api/auth'
import { createClientsRouter } from './api/clients'
import { createQuotationsRouter } from './api/quotations'
import { createProjectsRouter } from './api/projects'
import { createInvoicesRouter } from './api/invoices'

dotenv.config()

const app: Express = express()
const port = process.env.PORT || 3000

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    timestamp: new Date().toISOString(),
  })
  next()
})

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected',
  })
})

// API Routes
const authRouter = createAuthRouter(pool)
const clientsRouter = createClientsRouter(pool)
const quotationsRouter = createQuotationsRouter(pool)
const projectsRouter = createProjectsRouter(pool)
const invoicesRouter = createInvoicesRouter(pool)

app.use('/api/auth', authRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/quotations', quotationsRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/invoices', invoicesRouter)

// Centralized error handling middleware (FIX BUG #4)
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  })

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString(),
  })
})

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  })
})

// Server startup
pool.connect().then(() => {
  logger.info('Connected to PostgreSQL database')
  app.listen(port, () => {
    logger.info(`BravoCRM API server running on port ${port}`)
    console.log(`🚀 Server is running at http://localhost:${port}`)
  })
}).catch((err) => {
  logger.error('Failed to connect to database:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server')
  await pool.end()
  process.exit(0)
})

export default app
