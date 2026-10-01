import { test as base, expect, type Page } from '@playwright/test'

export type Theme = 'dark' | 'light' | 'cyberpunk'
export const THEMES: Theme[] = ['dark', 'light', 'cyberpunk']

// Pantallas del menú principal, con el texto exacto de su botón.
export const SCREENS = [
  'Dashboard',
  'Cotizaciones',
  'Mantenciones',
  'Clientes',
  'Maestro de Precios',
  'Proyectos',
  'Logística',
  'Facturas',
] as const
export type Screen = (typeof SCREENS)[number]

// Respuestas vacías con la forma que espera el Dashboard (objetos, no listas).
const DASHBOARD_VACIO: Record<string, unknown> = {
  '/api/dashboard/kpis': {},
  '/api/dashboard/aging': { aging: [], timestamp: '2026-01-01T00:00:00Z' },
  '/api/dashboard/cartera': {
    cartera: {
      adjudicado_total: 0,
      pendiente_facturar: 0,
      facturado_por_cobrar: 0,
      cobrado_mes: 0,
    },
    timestamp: '2026-01-01T00:00:00Z',
  },
  '/api/dashboard/cycle-times': { cycle_times: {}, timestamp: '2026-01-01T00:00:00Z' },
  '/api/dashboard/margin-analysis': { analysis: [], timestamp: '2026-01-01T00:00:00Z' },
}

// Sesión simulada + API simulada: cada GET responde vacío. Las pantallas se
// revisan en su estado vacío, que es igual en cualquier entorno.
export const test = base.extend<{ theme: Theme }>({
  theme: ['dark', { option: true }],
  page: async ({ page, theme }, provide) => {
    await page.addInitScript(t => {
      localStorage.setItem('authToken', 'e2e-token')
      localStorage.setItem(
        'user',
        JSON.stringify({ id: 'e2e', name: 'QA e2e', email: 'qa@example.test', role: 'admin' })
      )
      localStorage.setItem('mc-theme', t)
    }, theme)
    // context.route (no page.route): index.html registra un Service Worker y en
    // Chromium solo el contexto intercepta también lo que pide el SW.
    await page.context().route('**/api/**', route => {
      if (route.request().method() !== 'GET') return route.fulfill({ status: 200, json: {} })
      const path = new URL(route.request().url()).pathname
      const dashboard = DASHBOARD_VACIO[path]
      if (dashboard) return route.fulfill({ status: 200, json: dashboard })
      return route.fulfill({ status: 200, json: [] })
    })
    await provide(page)
  },
})

export { expect }

export async function openScreen(page: Page, screen: Screen) {
  if (!page.url().startsWith('http')) await page.goto('/')
  await page.locator('.header-nav').getByRole('button', { name: screen, exact: true }).click()
  await page.locator('main.app-main').waitFor()
  // Deja terminar la carga diferida de la pantalla (lazy import).
  await page.waitForLoadState('networkidle')
}
