#!/usr/bin/env node
// A-16, AC-16.6: falla el build si lo que carga la app ANTES de que el
// usuario haga nada (el entry script + los módulos precargados de index.html)
// supera el presupuesto. Los chunks de cada página (Quotations, Dashboard...)
// quedan fuera de esta cuenta a propósito: son lazy, no bloquean la carga inicial.
import { readFileSync, existsSync } from 'fs'
import { gzipSync } from 'zlib'
import path from 'path'

const BUDGET_GZIP_BYTES = 350 * 1024
const distDir = path.join(process.cwd(), 'dist')
const indexHtmlPath = path.join(distDir, 'index.html')

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
