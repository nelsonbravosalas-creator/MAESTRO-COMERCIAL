import { ZodSchema } from 'zod'
import { Request, Response, NextFunction } from 'express'

export interface ValidationSpec {
  body?: ZodSchema
  params?: ZodSchema
  query?: ZodSchema
}

// A-01: valida y sanea body/params/query contra esquemas zod. Los campos no
// declarados en el esquema se descartan (no llegan a la capa de datos), y todo
// error de validación responde 400 con detalle de campo — nunca un 500 genérico
// disparado por un CHECK de Postgres.
export const validate =
  (schema: ValidationSpec) => (req: Request, res: Response, next: NextFunction) => {
    for (const key of ['body', 'params', 'query'] as const) {
      const s = schema[key]
      if (!s) continue
      const result = s.safeParse(req[key])
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'La solicitud no cumple el formato esperado.',
          details: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        })
      }
      req[key] = result.data as never
    }
    next()
  }
