import { z } from 'zod'

export const configKeyParamSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'key debe ser snake_case'),
})

export const configValueSchema = z.object({
  value: z.string().trim().min(1).max(1000),
})
