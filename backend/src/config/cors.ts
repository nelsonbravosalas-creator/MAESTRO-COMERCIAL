import type { CorsOptions } from 'cors'

export type CorsOriginCallback = (err: Error | null, allow?: boolean) => void

// Aislado de app.ts para poder probarlo sin construir un Pool de Postgres ni un
// servidor HTTP real (C-03: allowlist explícita en vez de "cualquier origen").
export function buildCorsOriginChecker(allowedOrigins: string[]) {
  return (origin: string | undefined, callback: CorsOriginCallback) => {
    if (!origin) return callback(null, true) // curl, health checks, apps sin navegador
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error(`Origen no permitido: ${origin}`))
  }
}

export function buildCorsOptions(allowedOrigins: string[]): CorsOptions {
  return {
    origin: buildCorsOriginChecker(allowedOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    maxAge: 86400,
  }
}
