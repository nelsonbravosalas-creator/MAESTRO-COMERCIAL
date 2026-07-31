import { defineConfig } from 'vitest/config'

// Valores dummy pero válidos para que config/env.ts (validación fail-fast) no aborte
// el proceso al cargarse durante los tests. 'test-secret' coincide con el JWT_SECRET
// que ya usan los tests existentes para firmar tokens de prueba.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/bravocrm_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    },
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/db/seed.ts', 'src/server.ts', 'src/server-dev.ts'],
      // Umbral honesto sobre TODO backend/src (real ~32-34% al fijarlo, 2026-07-30):
      // rutas como catalog/config/invoices/projects/dashboard aún no tienen tests.
      // Subir el número está bien; bajarlo requiere justificar por qué el cambio redujo
      // la cobertura, no solo "hacer pasar el build".
      thresholds: { statements: 30, branches: 25, functions: 30, lines: 30 },
    },
  },
})
