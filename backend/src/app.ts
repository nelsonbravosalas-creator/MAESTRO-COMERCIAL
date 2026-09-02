import express, { Express, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import bodyParser from 'body-parser'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { env } from './config/env'
import { logger } from './utils/logger'
import { buildCorsOptions } from './config/cors'
import {
  apiLimiter,
  loginLimiter,
  adminSetupLimiter,
  forgotPasswordLimiter,
} from './config/rateLimiters'
import { createAuthThrottle, ipAndEmailKey, ipKey } from './middleware/authThrottle'
import { requestIdMiddleware, requestLoggingMiddleware } from './middleware/requestId'
import { captureException } from './config/sentry'
import { createAuthRouter } from './api/auth'
import { createAdminRouter } from './api/admin'
import { createConfigRouter } from './api/config'
import { createCatalogRouter } from './api/catalog'
import { createElectricalCatalogRouter } from './api/electrical-catalog'
import { createClientsRouter } from './api/clients'
import { createQuotationsRouter } from './api/quotations'
import { createProjectsRouter } from './api/projects'
import { createInvoicesRouter } from './api/invoices'
import { createDashboardRouter } from './api/dashboard'

dotenv.config()

// A-05: Neon firma sus certificados con una CA pública (confiada por el store
// por defecto de Node), así que basta con NO desactivar la validación —
// `rejectUnauthorized: false` aceptaba cualquier certificado, cifrando la
// conexión pero sin autenticar al servidor (abierto a MITM).
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // A-17: sin esto, una consulta lenta puede retener una conexión indefinidamente
  // en un entorno con pool tan chico (max: 5) y muchas invocaciones serverless
  // concurrentes — ver docs/RIESGOS_ACEPTADOS.md para la discusión completa.
  statement_timeout: 10_000,
})

const app: Express = express()

// Vercel/proxies entregan la IP real en X-Forwarded-For; sin esto, express-rate-limit
// y req.ip verían siempre la IP del proxy, no la del cliente.
app.set('trust proxy', 1)

app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: false, // el CSP del frontend (SPA estática) se define en Vercel/index.html
  })
)

const allowedOrigins = env.ALLOWED_ORIGINS.split(',')
  .map(o => o.trim())
  .filter(Boolean)
// Frontend y API viven en el mismo deployment de Vercel, pero cada deployment
// (incluida producción) recibe además una URL única autogenerada distinta del
// dominio estable configurado en ALLOWED_ORIGINS. VERCEL_URL la provee la
// plataforma misma (no es input de usuario), así que confiar en ella no abre
// la allowlist a orígenes arbitrarios.
if (process.env.VERCEL_URL) allowedOrigins.push(`https://${process.env.VERCEL_URL}`)
app.use(cors(buildCorsOptions(allowedOrigins)))

app.use(requestIdMiddleware)
app.use(requestLoggingMiddleware)

// El parser de mayor límite se registra primero y solo para su ruta: body-parser
// marca el body como ya parseado y el parser general (más abajo) lo respeta sin
// reprocesarlo ni aplicarle el límite de 256kb.
app.use('/api/quotations/import', bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.json({ limit: '256kb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '256kb' }))

app.use('/api', apiLimiter())
app.use('/api/auth/login', loginLimiter())
app.use('/api/admin/setup', adminSetupLimiter())
app.use('/api/auth/forgot-password', forgotPasswordLimiter())

// Los limitadores de arriba guardan su estado en el MemoryStore de CADA
// instancia serverless, así que "5 intentos por 15 minutos" era en realidad
// 5 × (instancias tibias) — y ese número lo elige la plataforma según la
// carga, que es justo lo que sube durante un ataque. Los de abajo respaldan
// cada uno con el contador compartido en Postgres (migración 0019): el de
// memoria corta el pico local sin tocar la base de datos, este hace que el
// tope sea global. Van después del body parser porque leen req.body.email.
app.use(
  '/api/auth/login',
  createAuthThrottle(pool, {
    name: 'login',
    windowMinutes: 15,
    max: 5,
    keyGenerator: ipAndEmailKey,
    countWhen: status => status === 401 || status === 423,
    message: {
      error: 'Too many requests',
      message: 'Demasiados intentos. Reintente en 15 minutos.',
    },
  })
)

// Un segundo bucket por IP sola. Sin él, rotar el correo en cada intento
// (password spraying contra muchas cuentas) esquiva el bucket de arriba por
// completo: cada correo estrena su propio contador y nunca llega a 5.
app.use(
  '/api/auth/login',
  createAuthThrottle(pool, {
    name: 'login-ip',
    windowMinutes: 15,
    max: 20,
    keyGenerator: ipKey,
    countWhen: status => status === 401 || status === 423,
    message: {
      error: 'Too many requests',
      message: 'Demasiados intentos fallidos desde esta conexión. Reintente en 15 minutos.',
    },
  })
)

app.use(
  '/api/auth/forgot-password',
  createAuthThrottle(pool, {
    name: 'forgot-password',
    windowMinutes: 60,
    max: 3,
    keyGenerator: ipAndEmailKey,
    // Responde 200 tanto si el correo existe como si no (para no filtrar qué
    // cuentas hay), así que contar solo los fallos no contaría nunca nada.
    countWhen: () => true,
    message: {
      error: 'Too many requests',
      message: 'Demasiadas solicitudes. Reintente en una hora.',
    },
  })
)

app.use(
  '/api/admin/setup',
  createAuthThrottle(pool, {
    name: 'admin-setup',
    windowMinutes: 60,
    max: 3,
    keyGenerator: ipKey,
    countWhen: () => true,
    message: {
      error: 'Too many requests',
      message: 'Demasiados intentos. Reintente en una hora.',
    },
  })
)

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: 'postgresql', db: 'ok' })
  } catch (error: any) {
    logger.error('Health check: database unreachable', { error: error.message })
    res
      .status(503)
      .json({ status: 'degraded', timestamp: new Date().toISOString(), db: 'unreachable' })
  }
})

app.use('/api/auth', createAuthRouter(pool))
app.use('/api/admin', createAdminRouter(pool))
app.use('/api/config', createConfigRouter(pool))
app.use('/api/catalog', createCatalogRouter(pool))
app.use('/api/electrical-catalog', createElectricalCatalogRouter(pool))
app.use('/api/clients', createClientsRouter(pool))
app.use('/api/quotations', createQuotationsRouter(pool))
app.use('/api/projects', createProjectsRouter(pool))
app.use('/api/invoices', createInvoicesRouter(pool))
app.use('/api/dashboard', createDashboardRouter(pool))

// 404: rutas no encontradas. Debe ir antes del manejador de errores (Express solo
// reenvía aquí en el flujo normal; los errores saltan directo al handler de abajo).
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// Manejador de errores centralizado: siempre al final de la cadena.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as any).requestId
  const log = (req as any).log ?? logger
  log.error('Unhandled error', { message: err.message, stack: err.stack, requestId })
  captureException(err, { requestId, path: req.path, method: req.method })
  res.status(500).json({
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId,
  })
})

export default app
