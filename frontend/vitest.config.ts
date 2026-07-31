import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/main.tsx', 'src/vite-env.d.ts'],
      // Umbral honesto, no aspiracional: la suite real (2026-07-30) cubre ~4% del
      // frontend completo (1 store de 1 archivo, sin páginas ni componentes). Antes de
      // subir este número hay que escribir tests, no solo bajar la exigencia del build.
      thresholds: { statements: 3, branches: 2, functions: 3, lines: 3 },
    },
  },
})
