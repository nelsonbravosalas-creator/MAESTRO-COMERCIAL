import { z } from 'zod'

export const uuid = z.string().uuid('Debe ser un UUID válido')

// Genera un esquema de params { <name1>: uuid, <name2>: uuid, ... } — usado en
// rutas como /:id o /:projectId/tasks/:taskId para que un id malformado
// devuelva 400 en vez de un 500 (Postgres rechaza el cast a uuid).
export const uuidParams = (...names: string[]) =>
  z.object(Object.fromEntries(names.map(n => [n, uuid])))

export const money = z.coerce.number().finite().nonnegative().max(1_000_000_000_000)
export const positiveInt = z.coerce.number().int().positive()
export const nonNegativeNumber = z.coerce.number().finite().nonnegative()

export const nonEmptyStr = (max = 255) => z.string().trim().min(1).max(max)
export const optionalStr = (max = 255) => z.string().trim().max(max).nullish()
export const isoDateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha inválida (YYYY-MM-DD)')

// A-11: paginación keyset. limit=5000 (o cualquier valor > 200) se rechaza con
// 400 en vez de intentar traer una cantidad de filas sin acotar.
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
})

// Para listados que todavía no tienen cursor real pero sí necesitan un tope
// duro de filas (evita el riesgo de "SELECT * sin LIMIT" mientras se agrega
// paginación completa a cada uno).
export const capLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(500),
})
