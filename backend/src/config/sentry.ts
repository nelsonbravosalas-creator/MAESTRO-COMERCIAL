import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger'

// C-08: Sentry es opcional a propósito. Sin SENTRY_DSN, captureException() es un
// no-op y el resto de la app funciona igual (dev local, tests, CI sin secretos).
const dsn = process.env.SENTRY_DSN

let initialized = false

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version,
    tracesSampleRate: 0.1,
  })
  initialized = true
  logger.info('Sentry inicializado')
}

export function captureException(err: Error, context?: Record<string, unknown>) {
  if (!initialized) return
  Sentry.captureException(err, { extra: context })
}

export const sentryEnabled = initialized
