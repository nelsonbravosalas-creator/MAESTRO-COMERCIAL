#!/usr/bin/env node
// A-16, AC-16.6: falla el build si lo que carga la app ANTES de que el
// usuario haga nada (el entry script + los módulos precargados de index.html)
// supera el presupuesto. Los chunks de cada página (Quotations, Dashboard...)
// quedan fuera de esta cuenta a propósito: son lazy, no bloquean la carga inicial.
//
// T-06 (fase F7 del plan de diseño): además, verifica por el grafo de imports
// del manifest (requiere build.manifest: true en vite.config.ts) que
// src/data/cityDistances.ts — la tabla de distancias entre ciudades, ~400 kB —
// no sea alcanzable desde la carga inicial. Debe cargarse solo bajo demanda
// (hooks/useCityDistances.ts), nunca por un import estático nuevo que la
// arrastre de vuelta al bundle de entrada.
import { readFileSync, existsSync } from 'fs'
import { gzipSync } from 'zlib'
import path from 'path'

const BUDGET_GZIP_BYTES = 350 * 1024
// El chunk de cityDistances se identifica por nombre, no por ruta de origen:
// vite.config.ts lo fuerza a su propio chunk vía manualChunks (name:
// 'city-distances') para que esto sea detectable pase lo que pase con la
// clave que le ponga el manifest (varía según si el módulo solo se referencia
// desde imports dinámicos, o si además hay uno estático nuevo).
const CITY_DISTANCES_CHUNK_NAME = 'city-distances'
const distDir = path.join(process.cwd(), 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')
const manifestPath = path.join(distDir, '.vite', 'manifest.json')

if (!existsSync(indexHtmlPath)) {
  console.error(`No se encontró ${indexHtmlPath} — correr "npm run build" primero.`)
  process.exit(1)
}

const html = readFileSync(indexHtmlPath, 'utf-8')

// Scripts de entrada (type="module" src="...") + módulos precargados
// (rel="modulepreload") son lo único que el navegador descarga antes de que
// React monte y decida qué página lazy pedir.
const scriptSrcs = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map(m => m[1])
const preloadSrcs = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(m => m[1])
const eagerAssets = [...new Set([...scriptSrcs, ...preloadSrcs])].filter(src => src.endsWith('.js'))

if (eagerAssets.length === 0) {
  console.error('No se encontraron scripts de entrada en index.html — algo cambió en el build.')
  process.exit(1)
}

let totalGzip = 0
console.log('Assets cargados de entrada (antes de cualquier lazy import):')
for (const src of eagerAssets) {
  const filePath = path.join(distDir, src.replace(/^\//, ''))
  if (!existsSync(filePath)) {
    console.error(`  ! ${src} referenciado en index.html pero no existe en dist/`)
    process.exit(1)
  }
  const gzipSize = gzipSync(readFileSync(filePath)).length
  totalGzip += gzipSize
  console.log(`  ${src}: ${(gzipSize / 1024).toFixed(1)} kB gzip`)
}

console.log(`\nTotal entrada: ${(totalGzip / 1024).toFixed(1)} kB gzip (presupuesto: ${BUDGET_GZIP_BYTES / 1024} kB)`)

if (totalGzip > BUDGET_GZIP_BYTES) {
  console.error(`\n✖ Excede el presupuesto de bundle inicial (A-16, AC-16.1/16.6).`)
  process.exit(1)
}

console.log('✓ Dentro del presupuesto.')

// ── T-06: cityDistances fuera del grafo de la carga inicial ─────────────────
if (!existsSync(manifestPath)) {
  console.error(
    `\nNo se encontró ${manifestPath}. Falta "build.manifest: true" en vite.config.ts (T-06).`
  )
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
const entry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry)
if (!entry) {
  console.error('\nNo se encontró el entrypoint en manifest.json — ¿cambió la config de build?')
  process.exit(1)
}

// Grafo alcanzable desde el entrypoint por imports ESTÁTICOS únicamente:
// dynamicImports se excluye a propósito (páginas lazy, docxExport, pdfExport,
// cityDistances…), porque eso es justamente lo que no debe cargarse de entrada.
const alcanzable = new Set()
const pila = [entry[0]]
while (pila.length) {
  const key = pila.pop()
  if (alcanzable.has(key)) continue
  alcanzable.add(key)
  for (const dep of manifest[key]?.imports ?? []) pila.push(dep)
}

const cityChunkKey = [...alcanzable].find(k => manifest[k]?.name === CITY_DISTANCES_CHUNK_NAME)
if (cityChunkKey) {
  console.error(
    `\n✖ El chunk "${CITY_DISTANCES_CHUNK_NAME}" (${manifest[cityChunkKey].file}) es alcanzable ` +
      'desde la carga inicial (T-06). cityDistances debe importarse solo con import() dinámico ' +
      '(ver hooks/useCityDistances.ts), no de forma estática.'
  )
  process.exit(1)
}

console.log('✓ T-06: cityDistances queda fuera de la carga inicial.')
