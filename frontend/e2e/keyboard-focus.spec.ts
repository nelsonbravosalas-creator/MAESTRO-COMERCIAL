import { test, expect, openScreen, THEMES, fakeProject, mockOneProject } from './fixtures'

// CP-12 (fase F8): con Tab se ve el foco en menú, botones, campos y filas de
// tabla/lista, en los 3 temas. box-shadow es la propiedad que la regla global
// de :focus-visible usa (index.css) — independiente de cualquier "outline:
// none" puntual, que solo anula la propiedad outline, no box-shadow.

function tieneAnilloDeFoco(boxShadow: string, outline: string) {
  return (
    (boxShadow && boxShadow !== 'none') ||
    (outline && outline !== 'none' && !outline.startsWith('rgb(0, 0, 0) none'))
  )
}

for (const theme of THEMES) {
  test(`tema ${theme}: el primer botón del menú muestra foco visible al tabular`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openScreen(page, 'Dashboard')
    // Salir del <select> de tema (o lo que tenga foco tras cargar) y llegar
    // al primer botón real del menú con un Tab conocido: clickear el propio
    // botón activo (Dashboard) ya lo enfoca vía mouse, luego se revisa que
    // :focus-visible también aplique al llegar por teclado (Tab downstream).
    const dashboardBtn = page.locator('.header-nav').getByRole('button', { name: 'Dashboard' })
    await dashboardBtn.focus()
    await page.keyboard.press('Tab')
    const cotizacionesBtn = page
      .locator('.header-nav')
      .getByRole('button', { name: 'Cotizaciones' })
    await expect(cotizacionesBtn).toBeFocused()
    const style = await cotizacionesBtn.evaluate(el => {
      const cs = getComputedStyle(el)
      return { boxShadow: cs.boxShadow, outline: cs.outlineStyle }
    })
    expect(
      tieneAnilloDeFoco(style.boxShadow, style.outline),
      `sin indicador de foco visible: ${JSON.stringify(style)}`
    ).toBe(true)
  })
}

test('Proyectos: una tarjeta de proyecto es enfocable y muestra anillo de foco', async ({
  page,
}) => {
  // Antes de F8 .project-card era un <div onClick> sin tabIndex ni role: ni
  // siquiera se podía llegar a ella con Tab. Ahora es focusable ([tabindex])
  // y cae bajo la regla global :focus-visible de index.css.
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockOneProject(page, fakeProject({ name: 'Proyecto Foco E2E' }))
  await openScreen(page, 'Proyectos')
  const card = page.locator('.project-card', { hasText: 'Proyecto Foco E2E' })
  await expect(card).toHaveAttribute('tabindex', '0')

  // Llegar por Tab real (no .focus() programático: :focus-visible en Chromium
  // solo se activa con navegación de teclado genuina).
  await page.getByRole('button', { name: '+ Nuevo', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(card).toBeFocused()
  const boxShadow = await card.evaluate(el => getComputedStyle(el).boxShadow)
  expect(boxShadow, 'sin indicador de foco visible en la tarjeta de proyecto').not.toBe('none')

  // También operable con teclado: Enter la activa igual que un clic.
  await page.keyboard.press('Enter')
  await expect(card).toHaveClass(/active/)
})
