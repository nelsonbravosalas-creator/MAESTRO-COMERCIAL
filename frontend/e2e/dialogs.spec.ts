import { writeFile } from 'node:fs/promises'
import { test, expect, openScreen, fakeProject, mockOneProject } from './fixtures'

// Diálogos propios en lugar de alert()/confirm() nativos (fase F8, CP-11).

test('Proyectos: eliminar pide confirmación en un diálogo propio, Esc cancela y Enter confirma', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockOneProject(page, fakeProject())
  await openScreen(page, 'Proyectos')
  await page.locator('.project-card', { hasText: 'Proyecto E2E' }).click()

  const trigger = page.locator('.project-detail-actions').getByRole('button', { name: 'Eliminar' })
  const dialog = page.getByRole('alertdialog')

  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('¿Eliminar este proyecto?')
  // No es el confirm() nativo del navegador: es un elemento de la página,
  // con los botones y colores del tema (estilizable, navegable con Tab).
  await expect(page.locator('.modal-overlay')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.project-card', { hasText: 'Proyecto E2E' })).toBeVisible()

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.project-card', { hasText: 'Proyecto E2E' })).toHaveCount(0)
})

test('Catálogo: importar un JSON inválido muestra un toast, no un alert', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  let dialogAbierto = false
  page.on('dialog', d => {
    dialogAbierto = true
    d.dismiss()
  })

  await openScreen(page, 'Maestro de Precios')
  const tmp = test.info().outputPath('catalogo-invalido.json')
  await writeFile(tmp, '{ esto no es JSON válido')
  await page.getByLabel('Importar catálogo JSON').first().setInputFiles(tmp)

  const toast = page.locator('.ui-toast--error')
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('Archivo JSON inválido')
  expect(dialogAbierto, 'no debe abrirse un alert() nativo').toBe(false)
})
