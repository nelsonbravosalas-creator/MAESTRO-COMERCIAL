import { randomUUID } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export interface RequestWithId extends Request {
  requestId: string
  log: typeof logger
}

// C-08: correlaciona cada log de una petición con su respuesta. El id viaja de
// vuelta en `x-request-id` para que el reporte de un usuario ("me falló a las 10:32")
// se pueda cruzar con las líneas de log exactas de esa petición.
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const request = req as RequestWithId
  request.requestId = (req.headers['x-request-id'] as string) || randomUUID()
  request.log = logger.child({ requestId: request.requestId })
  res.setHeader('x-request-id', request.requestId)
  next()
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const request = req as RequestWithId
  const start = Date.now()
  res.on('finish', () => {
    const log = request.log ?? logger
    log.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip,
    })
  })
  next()
}
