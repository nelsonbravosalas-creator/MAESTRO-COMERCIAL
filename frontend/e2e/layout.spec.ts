import { test, expect, openScreen } from './fixtures'
import type { Page } from '@playwright/test'

// T-04 · Layout del header, avisos y móvil (fase F1 del plan de diseño).

const navTops = (page: Page) =>
  page
    .locator('.header-nav .nav-btn')
    .evaluateAll(btns => btns.map(b => Math.round(b.getBoundingClientRect().top)))

for (const width of [1440, 1280]) {
  test(`escritorio ${width}px: el menú ocupa una sola fila dentro del header`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openScreen(page, 'Dashboard')
    expect((await page.locator('.app-header').boundingBox())!.height).toBeLessThanOrEqual(72)
    expect(new Set(await navTops(page)).size).toBe(1)
  })
}

test('1024px: el menú baja a su propia fila, sin partirse', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await openScreen(page, 'Dashboard')
  expect(new Set(await navTops(page)).size).toBe(1)
})

test('--header-h coincide con el alto real del header', async ({ page }) => {
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await openScreen(page, 'Dashboard')
    const { varH, realH } = await page.evaluate(() => ({
      varH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')),
      realH: document.querySelector('.app-header')!.getBoundingClientRect().height,
    }))
    expect(Math.abs(varH - realH), `${width}px`).toBeLessThanOrEqual(1)
  }
})

test('el aviso de Maestro de Precios aparece debajo del header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openScreen(page, 'Maestro de Precios')
  // Fila vacía + Guardar → aviso de validación (no llama a la API).
  await page.getByRole('button', { name: '+ Agregar', exact: true }).first().click()
  await page.getByRole('button', { name: /Guardar/ }).click()
  const toast = page.locator('.cat-toast')
  await expect(toast).toBeVisible()
  const header = (await page.locator('.app-header').boundingBox())!
  expect((await toast.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height)
})

test('móvil 390px: sin desborde horizontal de la página', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const screen of [
    'Dashboard',
    'Cotizaciones',
    'Clientes',
    'Maestro de Precios',
    'Facturas',
  ] as const) {
    await openScreen(page, screen)
    // expect.poll: la pantalla puede tardar un instante en asentar su layout.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
        message: screen,
      })
      .toBeLessThanOrEqual(0)
  }
})

test('móvil 390px: el buscador de Cotizaciones mide al menos 160px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openScreen(page, 'Cotizaciones')
  expect((await page.locator('.q-search').boundingBox())!.width).toBeGreaterThanOrEqual(160)
})

test('Proyectos: Lista, Kanban, Gantt y "+ Nuevo" se ven completos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openScreen(page, 'Proyectos')
  const panel = page.locator('.project-list-panel')
  const botones = {
    Lista: panel.locator('.pj-view-btn', { hasText: 'Lista' }),
    Kanban: panel.locator('.pj-view-btn', { hasText: 'Kanban' }),
    Gantt: panel.locator('.pj-view-btn', { hasText: 'Gantt' }),
    '+ Nuevo': panel.getByRole('button', { name: '+ Nuevo', exact: true }),
  }
  for (const [name, btn] of Object.entries(botones)) {
    const cut = await btn.evaluate(el => {
      const panel = el.closest('.project-list-panel')!.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return r.right > panel.right + 1 || el.scrollWidth > el.clientWidth + 1
    })
    expect(cut, name).toBe(false)
  }
})

test('Dashboard: Tiempo de ciclo separado de la fila de cartera', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openScreen(page, 'Dashboard')
  const gap = await page.evaluate(() => {
    const grids = document.querySelectorAll('.kpi-grid')
    const cartera = grids[grids.length - 1].getBoundingClientRect()
    const ciclo = [...document.querySelectorAll('.chart-title')]
      .find(h => /Tiempo de Ciclo/i.test(h.textContent ?? ''))!
      .closest('.dashboard-card')!
      .getBoundingClientRect()
    return ciclo.top - cartera.bottom
  })
  expect(gap).toBeGreaterThanOrEqual(16)
})
