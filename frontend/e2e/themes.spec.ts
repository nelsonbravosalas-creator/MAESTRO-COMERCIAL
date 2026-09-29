import { test, expect, openScreen, THEMES, type Screen } from './fixtures'

// T-05 · Cada pantalla respeta el tema elegido (fases F3 a F5 del plan de diseño).
// Revisa todos los bloques grandes y opacos dentro de <main>: en tema oscuro y
// cyberpunk deben ser oscuros, en tema claro deben ser claros. Antes, varias
// pantallas mostraban un bloque blanco en tema oscuro (y al revés en claro).

// Pantallas ya migradas a tokens; cada fase agrega las suyas.
export const MIGRADAS: Screen[] = [
  'Maestro de Precios',
  'Clientes',
  'Logística',
  'Facturas',
  'Proyectos',
]

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
              // La hoja carta de la cotización es "papel": blanca en cualquier tema.
              if (el.closest('.coti-doc')) return null
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

// El editor de cotizaciones (pestañas Base, Costeo y Cotización) es la vista más
// grande: se revisa aparte, creando una cotización nueva en memoria.
for (const theme of THEMES) {
  test.describe(`tema ${theme} · editor de cotizaciones`, () => {
    test.use({ theme })

    test('Base, Costeo y Cotización siguen el tema (la hoja carta queda blanca)', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openScreen(page, 'Cotizaciones')
      await page.getByRole('button', { name: '+ Nueva', exact: true }).click()
      for (const tab of ['Base', 'Costeo', 'Cotización']) {
        await page.getByRole('button', { name: tab, exact: true }).click()
        await page.waitForTimeout(300)
        const { fuera, papel } = await page.evaluate(t => {
          const lum = (rgb: number[]) => {
            const lin = (c: number) => {
              const s = c / 255
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
          }
          const bgLum = (el: Element) => {
            const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)
            if (!m || parseFloat(m[3] ?? '1') < 0.9) return null
            return lum([+m[0], +m[1], +m[2]])
          }
          const area = innerWidth * innerHeight
          const fuera = [...document.querySelectorAll('main *')]
            .filter(el => {
              const r = el.getBoundingClientRect()
              if (r.width * r.height < area * 0.04) return false
              if ((el as HTMLElement).style.background || el.closest('.coti-doc')) return false
              const l = bgLum(el)
              if (l === null) return false
              return t === 'light' ? l < 0.6 : l > 0.25
            })
            .map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`)
          const doc = document.querySelector('.coti-doc')
          return { fuera, papel: doc ? bgLum(doc) : null }
        }, theme)
        expect(fuera, `${tab}: bloques que no siguen el tema`).toEqual([])
        if (tab === 'Cotización') expect(papel, 'la hoja carta es blanca').toBeGreaterThan(0.9)
      }
    })
  })
}
