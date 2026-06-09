import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import winston from 'winston'

dotenv.config()

// Logger configuration (FIX BUG #4)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'bravocrm-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
})

const app: Express = express()
const port = process.env.PORT || 3000

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

// Middleware
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

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
