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

type AppHandler = (req: Request, res: Response) => unknown

// Cargar backend/src/app puede fallar en frío (config de entorno incompleta,
// dependencia ausente en el package.json raíz — ver docs/RIESGOS_ACEPTADOS.md
// AC-9.7). Sin este cache el fallo se repetiría en cada invocación; sin el
// try/catch de abajo, Vercel solo puede devolver FUNCTION_INVOCATION_FAILED, que
// no distingue "falta una variable" de un bug real.
let cachedApp: AppHandler | null = null

async function loadApp(): Promise<AppHandler> {
  if (!cachedApp) {
    const { default: pgApp } = await import('../backend/src/app')
    cachedApp = pgApp as unknown as AppHandler
  }
  return cachedApp
}

function describeStartupError(error: unknown): { code: string; detail: string[] } {
  // Se compara por `name` y no con instanceof: importar EnvValidationError desde
  // backend/src/config/env ejecutaría loadEnv() otra vez al cargar el módulo,
  // que es justo el fallo que se intenta reportar.
  if (error instanceof Error && error.name === 'EnvValidationError') {
    const names = (error as Error & { variableNames?: string[] }).variableNames ?? []
    return { code: 'ENV_INVALID', detail: names }
  }
  return { code: 'STARTUP_FAILED', detail: [] }
}

// Vercel requiere un export default que sea un request handler
export default async function handler(req: Request, res: Response) {
  if (HAS_DB) {
    try {
      const app = await loadApp()
      return app(req, res)
    } catch (error) {
      const { code, detail } = describeStartupError(error)
      // Queda en los logs de runtime de Vercel con el motivo exacto.
      // eslint-disable-next-line no-console
      console.error('Fallo al inicializar la API', {
        code,
        variables: detail,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      // Los nombres de las variables solo se devuelven fuera de producción; en
      // producción el detalle vive en los logs, no en una respuesta pública.
      const isProduction = process.env.NODE_ENV === 'production'
      return res.status(503).json({
        error: 'Service unavailable',
        message:
          code === 'ENV_INVALID'
            ? 'La API no arrancó: faltan variables de entorno o son inválidas. Ver los logs de runtime del despliegue.'
            : 'La API no arrancó. Ver los logs de runtime del despliegue.',
        code,
        ...(isProduction || detail.length === 0 ? {} : { variables: detail }),
      })
    }
  }

  if (!unavailableApp) {
    unavailableApp = buildUnavailableApp()
  }
  return unavailableApp(req, res)
}
