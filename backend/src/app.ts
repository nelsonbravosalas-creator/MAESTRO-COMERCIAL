import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { createAuthRouter }       from './api/auth'
import { createClientsRouter }    from './api/clients'
import { createQuotationsRouter } from './api/quotations'
import { createProjectsRouter }   from './api/projects'
import { createInvoicesRouter }   from './api/invoices'
import { createDashboardRouter }  from './api/dashboard'

dotenv.config()

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

const app: Express = express()

app.use(cors({
  origin: (_origin, callback) => callback(null, true),
  credentials: true,
}))
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: 'postgresql' })
})

app.use('/api/auth',       createAuthRouter(pool))
app.use('/api/clients',    createClientsRouter(pool))
app.use('/api/quotations', createQuotationsRouter(pool))
app.use('/api/projects',   createProjectsRouter(pool))
app.use('/api/invoices',   createInvoicesRouter(pool))
app.use('/api/dashboard',  createDashboardRouter(pool))

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message)
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  })
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

export default app
