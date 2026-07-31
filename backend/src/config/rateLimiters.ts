import rateLimit, { Options } from 'express-rate-limit'
import type { Request } from 'express'

// Configuración aislada de app.ts (C-04) para poder instanciar limitadores
// equivalentes en tests sin levantar el Pool de Postgres real.
export const apiLimiterOptions: Partial<Options> = {
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
}

export const loginLimiterOptions: Partial<Options> = {
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    `${req.ip}:${String((req.body as any)?.email ?? '').toLowerCase()}`,
  message: { error: 'Too many requests', message: 'Demasiados intentos. Reintente en 15 minutos.' },
}

export const adminSetupLimiterOptions: Partial<Options> = {
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
}

// A-04, AC-4.8: 3 solicitudes de reset por hora por correo.
export const forgotPasswordLimiterOptions: Partial<Options> = {
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    `${req.ip}:${String((req.body as any)?.email ?? '').toLowerCase()}`,
  message: {
    error: 'Too many requests',
    message: 'Demasiadas solicitudes. Reintente en una hora.',
  },
}

export const apiLimiter = () => rateLimit(apiLimiterOptions)
export const loginLimiter = () => rateLimit(loginLimiterOptions)
export const adminSetupLimiter = () => rateLimit(adminSetupLimiterOptions)
export const forgotPasswordLimiter = () => rateLimit(forgotPasswordLimiterOptions)
