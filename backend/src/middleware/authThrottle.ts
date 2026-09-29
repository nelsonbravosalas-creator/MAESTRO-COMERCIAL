import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { Pool } from 'pg'
import { logger } from '../utils/logger'

const motivo = (error: unknown) => (error instanceof Error ? error.message : String(error))

export interface AuthThrottleOptions {
  /** Prefijo del bucket. Separa el conteo de /login del de /forgot-password. */
  name: string
  /** Duración de la ventana fija, en minutos. */
  windowMinutes: number
  /** Intentos permitidos dentro de la ventana antes de responder 429. */
  max: number
  /** Qué identifica al que intenta: IP sola, o IP + correo. */
  keyGenerator: (req: Request) => string
  /**
   * Qué respuestas suman al contador. Es explícito y sin default a propósito:
   * /login falla con 401, pero /forgot-password responde 200 siempre (para no
   * filtrar qué correos existen), así que ahí hay que contar todo intento.
   */
  countWhen: (statusCode: number) => boolean
  /** Cuerpo del 429. */
  message: { error: string; message: string }
}

/**
 * Límite de intentos con estado en Postgres, compartido por todas las
 * instancias serverless.
 *
 * No reemplaza a `express-rate-limit`: se registra junto a él. El limitador en
 * memoria corta un pico en la misma instancia sin tocar la base de datos; este
 * es el respaldo que hace que el límite sea global en vez de por instancia
 * (ver la migración 0019 para el porqué).
 *
 * **Falla abierta.** Si la consulta al contador falla, la petición pasa. El
 * login consulta la tabla `users` de todas formas: si Postgres no responde, el
 * login ya está caído y convertir eso además en un 429 masivo no protege de
 * nada. El bloqueo de cuenta de api/auth.ts (10 intentos → 30 min, también en
 * base de datos) sigue siendo el piso que no depende de este middleware.
 */
export const createAuthThrottle = (pool: Pool, opts: AuthThrottleOptions): RequestHandler => {
  const { name, windowMinutes, max, keyGenerator, countWhen, message } = opts

  return async (req: Request, res: Response, next: NextFunction) => {
    const bucketKey = `${name}:${keyGenerator(req)}`

    try {
      const { rows } = await pool.query(
        `SELECT attempt_count,
                CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(mins => $2) - NOW())))::int
                  AS retry_after
           FROM auth_throttle
          WHERE bucket_key = $1
            AND window_start > NOW() - make_interval(mins => $2)`,
        [bucketKey, windowMinutes]
      )

      const current = rows[0]
      if (current && current.attempt_count >= max) {
        logger.warn('Auth throttle: límite global alcanzado', {
          bucket: name,
          ip: req.ip,
          attempts: current.attempt_count,
        })
        res.setHeader('Retry-After', String(Math.max(1, current.retry_after ?? windowMinutes * 60)))
        return res.status(429).json(message)
      }
    } catch (error) {
      logger.error('Auth throttle: no se pudo leer el contador, se deja pasar', {
        bucket: name,
        error: motivo(error),
      })
      return next()
    }

    // El conteo va en 'finish' porque el resultado del intento solo se conoce
    // cuando el handler ya respondió. Es fire-and-forget: la respuesta ya salió
    // y un fallo al contar no puede propagarse a nadie, solo registrarse.
    res.on('finish', () => {
      if (!countWhen(res.statusCode)) return

      // Una sola sentencia atómica: dos intentos concurrentes no pueden leer
      // el mismo contador y escribir el mismo +1. El CASE reinicia la ventana
      // cuando ya venció, en vez de necesitar un DELETE previo.
      pool
        .query(
          `INSERT INTO auth_throttle (bucket_key, window_start, attempt_count)
           VALUES ($1, NOW(), 1)
           ON CONFLICT (bucket_key) DO UPDATE
              SET attempt_count = CASE
                    WHEN auth_throttle.window_start > NOW() - make_interval(mins => $2)
                    THEN auth_throttle.attempt_count + 1
                    ELSE 1
                  END,
                  window_start = CASE
                    WHEN auth_throttle.window_start > NOW() - make_interval(mins => $2)
                    THEN auth_throttle.window_start
                    ELSE NOW()
                  END`,
          [bucketKey, windowMinutes]
        )
        .catch((error: unknown) =>
          logger.error('Auth throttle: no se pudo registrar el intento', {
            bucket: name,
            error: motivo(error),
          })
        )
    })

    next()
  }
}

/** Normaliza el correo del body igual que `loginLimiterOptions` en config/rateLimiters.ts. */
export const ipAndEmailKey = (req: Request) =>
  `${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`

export const ipKey = (req: Request) => String(req.ip)
