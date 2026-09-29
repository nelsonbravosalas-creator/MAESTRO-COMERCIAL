import { test, expect, openScreen } from './fixtures'

// UX del Maestro de Precios (fase F6 del plan de diseño).

test.describe('Maestro de Precios', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openScreen(page, 'Maestro de Precios')
  })

  test('una sola columna de precio: se edita como número y se ve con formato CLP', async ({
    page,
  }) => {
    const seccion = page.locator('.cat-section').first()
    await seccion.getByRole('button', { name: '+ Agregar', exact: true }).click()
    await expect(seccion.locator('thead th')).not.toContainText(['Formato CLP'])

    const precio = seccion.getByLabel('Precio unitario').last()
    await precio.click()
    await precio.fill('150.000') // formato chileno: el punto separa miles
    await precio.blur()
    await expect(precio).toHaveValue('$150.000')
    await precio.click()
    await expect(precio).toHaveValue('150000')
  })

  test('cada categoría tiene un solo botón para agregar ítems', async ({ page }) => {
    const secciones = page.locator('.cat-section')
    const total = await secciones.count()
    expect(total).toBe(7)
    for (let i = 0; i < total; i++) {
      await expect(secciones.nth(i).getByRole('button', { name: /Agregar/ })).toHaveCount(1)
    }
  })

  test('la pestaña activa se lee con el color de texto del tema', async ({ page }) => {
    for (const abbr of ['MO', 'ELE']) {
      const tab = page.locator('.catalogo-tab', { hasText: abbr })
      await tab.click()
      const texto = await page.evaluate(() => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--text)'
        document.body.appendChild(probe)
        const t = getComputedStyle(probe).color
        probe.remove()
        return t
      })
      // expect.poll: la pestaña anima su color (transition) al activarse.
      await expect
        .poll(() => tab.evaluate(el => getComputedStyle(el).color), { message: abbr })
        .toBe(texto)
    }
  })

  test('al guardar con una fila incompleta, esa fila queda marcada y enfocada', async ({
    page,
  }) => {
    const seccion = page.locator('.cat-section').first()
    await seccion.getByRole('button', { name: '+ Agregar', exact: true }).click()
    await page.getByRole('button', { name: /Guardar/ }).click()

    const fila = seccion.locator('.cat-row').last()
    await expect(fila).toHaveClass(/cat-row--error/)
    await expect(fila.getByLabel('Descripción')).toBeFocused()

    await fila.getByLabel('Descripción').fill('Supervisor')
    await expect(fila).not.toHaveClass(/cat-row--error/)
  })
})

test('móvil 390px: precio y botón de borrar caben sin desplazar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openScreen(page, 'Maestro de Precios')
  const seccion = page.locator('.cat-section').first()
  await seccion.getByRole('button', { name: '+ Agregar', exact: true }).click()
  const fila = seccion.locator('.cat-row').last()
  for (const el of [fila.getByLabel('Precio unitario'), fila.getByTitle('Eliminar ítem')]) {
    const box = (await el.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
})
