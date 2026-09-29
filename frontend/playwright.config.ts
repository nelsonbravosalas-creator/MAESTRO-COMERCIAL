import { defineConfig, devices } from '@playwright/test'

// Pruebas e2e de diseño (T-04, T-05, T-07): corren contra el build de producción
// (`vite preview`), nunca contra `vite dev`, que re-empaqueta dependencias en
// caliente y deja pantallas en blanco que no son de la app. La API se simula en
// e2e/fixtures.ts, así que no hace falta backend ni usuarios de prueba.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
