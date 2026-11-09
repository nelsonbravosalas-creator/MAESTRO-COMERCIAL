import { Router } from 'express'
import type { Pool } from 'pg'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { createAuthThrottle } from '../middleware/authThrottle'
import { validate } from '../middleware/validate'
import { uuidParams } from '../schemas/common'
import { ejecutarCubicacion } from '../cubicador/ejecutar'
import { asHttpError } from '../utils/httpError'
import { logger } from '../utils/logger'

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Entrada HTTP del botón «Cubicar». No llama a ningún LLM: el cálculo y la
 * compuerta viven en `ejecutarCubicacion`, que es la misma ruta que usa el agente.
 * Se monta en /api/chatbot/cubicador, antes del router del chatbot.
 */
export const createCubicadorRouter = (pool: Pool) => {
  const router = Router()
  router.use(authMiddleware)

  // Mismo límite por usuario que el chat (5 por minuto), con bucket propio.
  const cubicarThrottle = createAuthThrottle(pool, {
    name: 'cubicador',
    windowMinutes: 1,
    max: 5,
    keyGenerator: req => (req as AuthRequest).user?.id ?? req.ip ?? 'anon',
    countWhen: () => true,
    message: {
      error: 'Too many requests',
      message: 'Demasiadas solicitudes de cubicación. Reintente en un minuto.',
    },
  })

  router.post(
    '/:id/cubicar',
    cubicarThrottle,
    validate({ params: uuidParams('id') }),
    async (req: AuthRequest, res) => {
      const userId = req.user?.id
      if (!userId) return res.status(401).json({ error: 'No autenticado' })
      try {
        const estado = await ejecutarCubicacion(pool, req.params.id, userId)
        return res.json(estado)
      } catch (error) {
        const err = asHttpError(error)
        if (err.status === 422) {
          return res.status(422).json({ error: err.message, motivo: err.message, ...err.payload })
        }
        if (err.status && err.status >= 400 && err.status < 500) {
          return res.status(err.status).json({ error: err.message })
        }
        logger.error('Cubicador: error al cubicar desde el botón', {
          error: errorMessage(error),
          userId,
        })
        return res.status(500).json({ error: 'No se pudo cubicar. Intente de nuevo.' })
      }
    }
  )

  return router
}
