import type { Request, Response } from 'express'
import express from 'express'

const HAS_DB = Boolean(process.env.DATABASE_URL)

let unavailableApp: express.Express | null = null

// Sin DATABASE_URL la API no puede autenticar contra datos reales: responde 503
// en vez de aceptar cualquier credencial contra una lista hardcodeada.
function buildUnavailableApp(): express.Express {
  const app = express()
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(503).json({ status: 'degraded', mode: 'no-db', timestamp: new Date().toISOString() })
  })
  app.use((_req: Request, res: Response) => {
    res.status(503).json({
      error: 'Service unavailable',
      message: 'DATABASE_URL no configurado en este entorno.',
      code: 'DB_NOT_CONFIGURED',
    })
  })
  return app
}

// Vercel requiere un export default que sea un request handler
export default async function handler(req: Request, res: Response) {
  if (HAS_DB) {
    // Lazy load del app PostgreSQL para evitar que pg.Pool falle cuando no hay DATABASE_URL
    const { default: pgApp } = await import('../backend/src/app')
    return pgApp(req, res)
  }

  if (!unavailableApp) {
    unavailableApp = buildUnavailableApp()
  }
  return unavailableApp(req, res)
}
