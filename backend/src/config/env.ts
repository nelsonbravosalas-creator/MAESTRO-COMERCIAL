import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  // A-02, AC-2.6: access tokens de vida corta — logout-all revoca sesiones en la
  // tabla `sessions`, pero un JWT de acceso es stateless (no se puede invalidar
  // en el acto). 1h acota la ventana de exposición de un token robado.
  JWT_EXPIRY: z.string().default('1h'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  ADMIN_SETUP_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS es requerido (lista separada por comas)'),
  LOG_LEVEL: z.string().default('info'),
  PORT: z.string().default('3000'),
  FRONTEND_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
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
