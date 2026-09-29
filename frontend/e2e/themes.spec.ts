import { test, expect, openScreen, THEMES, type Screen } from './fixtures'

// T-05 · Cada pantalla respeta el tema elegido (fases F3 a F5 del plan de diseño).
// Revisa todos los bloques grandes y opacos dentro de <main>: en tema oscuro y
// cyberpunk deben ser oscuros, en tema claro deben ser claros. Antes, varias
// pantallas mostraban un bloque blanco en tema oscuro (y al revés en claro).

// Pantallas ya migradas a tokens; cada fase agrega las suyas.
export const MIGRADAS: Screen[] = ['Maestro de Precios', 'Clientes', 'Logística']

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.use({ theme })

    for (const screen of MIGRADAS) {
      test(`${screen}: los bloques grandes siguen el tema`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await openScreen(page, screen)
        const bloques = await page.evaluate(() => {
          const lum = (rgb: number[]) => {
            const lin = (c: number) => {
              const s = c / 255
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
          }
          const area = innerWidth * innerHeight
          return [...document.querySelectorAll('main *')]
            .map(el => {
              const r = el.getBoundingClientRect()
              const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)
              if (!m || r.width * r.height < area * 0.04) return null
              // Colores de identidad puestos inline (franja de cada categoría del
              // catálogo) son datos, no superficies del tema.
              if ((el as HTMLElement).style.background || (el as HTMLElement).style.backgroundColor)
                return null
              const [red, g, b, a = '1'] = m
              if (parseFloat(a) < 0.9) return null
              return {
                el: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`,
                lum: +lum([+red, +g, +b]).toFixed(3),
              }
            })
            .filter(Boolean) as { el: string; lum: number }[]
        })
        const fuera =
          theme === 'light' ? bloques.filter(b => b.lum < 0.6) : bloques.filter(b => b.lum > 0.25)
        expect(fuera, `bloques que no siguen el tema ${theme}`).toEqual([])
      })
    }
  })
}
