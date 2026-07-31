import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRY: z.string().default('8h'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  ADMIN_SETUP_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS es requerido (lista separada por comas)'),
  LOG_LEVEL: z.string().default('info'),
  PORT: z.string().default('3000'),
})

export type Env = z.infer<typeof envSchema>

// Recibe una fuente inyectable para poder probarla sin depender de process.env global.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Configuración de entorno inválida:', parsed.error.flatten().fieldErrors)
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
