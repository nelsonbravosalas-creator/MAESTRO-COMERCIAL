import { defineConfig, devices } from '@playwright/test'

// Pruebas e2e de diseño (T-04, T-05, T-07): corren contra el build de producción
// (`vite preview`), nunca contra `vite dev`, que re-empaqueta dependencias en
// caliente y deja pantallas en blanco que no son de la app. La API se simula en
// e2e/fixtures.ts, así que no hace falta backend ni usuarios de prueba.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Más de 4 navegadores en paralelo satura la máquina y vuelve inestables las
  // esperas de "elemento estable"; en CI (2 núcleos) basta con 2.
  workers: process.env.CI ? 2 : 4,
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
    reuseExistingServer: false,
    env: { VITE_API_PROXY: 'http://127.0.0.1:9' },
    timeout: 60_000,
  },
})
