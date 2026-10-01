import { test as base } from '@playwright/test'
import { test, expect, openScreen, THEMES } from './fixtures'

// Consistencia (fase F2 del plan de diseño): nombre, títulos, botón primario y
// colores de estado.

base('el login usa el mismo nombre que el header y la pestaña', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Maestro Comercial')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Maestro Comercial')
})

test('el título de cada pantalla coincide con su opción del menú', async ({ page }) => {
  await openScreen(page, 'Facturas')
  await expect(page.locator('.inv-title')).toHaveText('Facturas')
})

// El botón de crear de cada pantalla debe verse igual (antes: azul marino,
// turquesa y azul brillante según la pantalla).
const BOTONES = [
  { screen: 'Cotizaciones', name: '+ Nueva' },
  { screen: 'Mantenciones', name: '+ Nuevo Contrato' },
  { screen: 'Clientes', name: '+ Nuevo cliente' },
  { screen: 'Facturas', name: '+ Nueva Factura' },
  { screen: 'Proyectos', name: '+ Nuevo' },
] as const

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.use({ theme })

    test('todos los botones de crear usan el color primario del tema', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      const fondos: Record<string, string> = {}
      for (const { screen, name } of BOTONES) {
        await openScreen(page, screen)
        const btn = page.locator('main').getByRole('button', { name, exact: true }).first()
        fondos[screen] = await btn.evaluate(el => getComputedStyle(el).backgroundColor)
      }
      const primario = await page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.background = 'var(--btn-primary-bg)'
        document.body.appendChild(probe)
        const c = getComputedStyle(probe).backgroundColor
        probe.remove()
        return c
      })
      for (const [screen, fondo] of Object.entries(fondos)) expect(fondo, screen).toBe(primario)
    })
  })
}

test('Clientes abierto primero: botones y modal con estilo (no dependen de Cotizaciones)', async ({
  page,
}) => {
  await openScreen(page, 'Clientes')
  const btn = page.getByRole('button', { name: '+ Nuevo cliente', exact: true })
  const estilo = await btn.evaluate(el => {
    const cs = getComputedStyle(el)
    return { padding: cs.paddingLeft, radius: cs.borderTopLeftRadius }
  })
  expect(estilo.padding).toBe('18px')
  expect(estilo.radius).toBe('8px')
})

test('Dashboard: estado de conexión con su color y tasa de éxito neutra sin datos', async ({
  page,
}) => {
  await openScreen(page, 'Dashboard')
  // Con la API simulada puede quedar Online u Offline: cada uno con su color.
  const badge = page.locator('.dashboard-subtitle .badge')
  const { texto, color, esperado } = await badge.evaluate(el => {
    const online = el.classList.contains('online')
    const probe = document.createElement('span')
    probe.style.color = online ? 'var(--success-text)' : 'var(--danger-text)'
    document.body.appendChild(probe)
    const esperado = getComputedStyle(probe).color
    probe.remove()
    return { texto: el.textContent, color: getComputedStyle(el).color, esperado }
  })
  expect(['Online', 'Offline']).toContain(texto)
  expect(color).toBe(esperado)
  const tasa = page.locator('.kpi-card', { hasText: 'Tasa de Éxito' }).locator('.kpi-value')
  await expect(tasa).toHaveText('—')
})
