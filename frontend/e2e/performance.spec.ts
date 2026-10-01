import { test, expect, openScreen } from './fixtures'

// Rendimiento (fase F7 del plan de diseño): la tabla de distancias y las
// librerías de exportación (docx/html2canvas/jsPDF) se cargan bajo demanda,
// no junto con el resto de la pantalla (verificado por separado a nivel de
// build en scripts/check-bundle-budget.mjs, T-06). Aquí se confirma que el
// comportamiento sigue siendo el mismo para quien usa la app: CP-10.

const PAR_CIUDADES = { a: 'Santiago', b: 'Valparaíso' }

test('Logística: el cálculo de distancia sigue funcionando tras la carga diferida', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openScreen(page, 'Logística')

  // Antes de elegir ciudad, el selector muestra el estado de carga y no se
  // puede operar todavía (la tabla de ~400 kB recién se está pidiendo).
  const destino = page.getByLabel('Ciudad destino')
  const origen = page.getByLabel('Ciudad de origen')
  await expect(destino).toBeEnabled()

  await destino.selectOption(PAR_CIUDADES.a)
  await origen.selectOption(PAR_CIUDADES.b)

  const km = page.locator('.log-km')
  await expect(km).toBeVisible()
  const texto = await km.textContent()
  expect(texto).toMatch(/\d/) // un número de km, no "sin dato"
})

test('Cotizaciones · Costeo: "Cálculo de Distancias" da el mismo km que Logística', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })

  // 1) Referencia: el km que muestra Logística para el mismo par de ciudades.
  await openScreen(page, 'Logística')
  await page.getByLabel('Ciudad destino').selectOption(PAR_CIUDADES.a)
  await page.getByLabel('Ciudad de origen').selectOption(PAR_CIUDADES.b)
  const kmReferencia = (await page.locator('.log-km').textContent())?.match(/[\d.]+/)?.[0]
  expect(kmReferencia).toBeTruthy()

  // 2) Misma consulta desde el selector de "Cálculo de Distancias" en Costeo.
  await openScreen(page, 'Cotizaciones')
  await page.getByRole('button', { name: '+ Nueva', exact: true }).click()
  await page.getByRole('button', { name: 'Costeo', exact: true }).click()

  // "Logística y Operación" arranca colapsada; se expande con su cabecera.
  const acordeon = page.locator('.cost-accordion', { hasText: 'Logística y Operación' })
  await acordeon.locator('.cost-acc-collapse').click()
  await acordeon.getByRole('button', { name: '+ Agregar fila' }).click()

  const fila = acordeon.locator('.cost-items-table tbody tr').last()
  await fila.getByLabel('Descripción').click()
  await page.getByRole('option', { name: 'Cálculo de Distancias' }).click()

  const puntoA = fila.getByLabel('Punto A')
  const puntoB = fila.getByLabel('Punto B')
  await expect(puntoA).toBeEnabled()
  await puntoA.selectOption(PAR_CIUDADES.a)
  await puntoB.selectOption(PAR_CIUDADES.b)

  const cant = fila.locator('td.col-cant input')
  await expect(cant).toHaveValue(kmReferencia!)
})
