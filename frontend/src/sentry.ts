import * as Sentry from '@sentry/react'

// C-08: opcional a propósito. Sin VITE_SENTRY_DSN no se inicializa nada; el resto
// de la app (dev local, tests, build sin secretos) funciona igual.
const dsn = import.meta.env.VITE_SENTRY_DSN

export const sentryEnabled = Boolean(dsn)

export function initSentry() {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}
