import AxeBuilder from '@axe-core/playwright'
import { test as base } from '@playwright/test'
import { test, expect, openScreen, SCREENS, THEMES } from './fixtures'

// T-07 (fase F8 del plan de diseño): las 8 pantallas autenticadas + Login,
// en los 3 temas, sin violaciones de nivel "serious" o "critical". Los
// niveles "moderate"/"minor" no bloquean (serían una fase aparte) pero se
// imprimen igual para que no queden invisibles.

function soloGraves(violations: { impact?: string | null }[]) {
  return violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
}

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.use({ theme })

    // test base de Playwright (no el de fixtures.ts): su addInitScript vuelve
    // a poner authToken/user en localStorage en CADA carga, incluido el
    // page.reload() de acá abajo — con él, Login nunca llega a mostrarse.
    base(`Login (tema ${theme}): sin violaciones graves de accesibilidad`, async ({ page }) => {
      await page.addInitScript(t => localStorage.setItem('mc-theme', t), theme)
      await page.goto('/')
      await page.locator('.form-group input').first().waitFor()
      const results = await new AxeBuilder({ page }).analyze()
      expect(soloGraves(results.violations), JSON.stringify(results.violations, null, 2)).toEqual(
        []
      )
    })

    for (const screen of SCREENS) {
      test(`${screen}: sin violaciones graves de accesibilidad`, async ({ page }) => {
        await openScreen(page, screen)
        const results = await new AxeBuilder({ page }).analyze()
        expect(soloGraves(results.violations), JSON.stringify(results.violations, null, 2)).toEqual(
          []
        )
      })
    }
  })
}
