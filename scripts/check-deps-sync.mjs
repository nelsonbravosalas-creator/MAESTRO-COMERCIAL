#!/usr/bin/env node
// AC-9.7: la función serverless api/index.ts importa backend/src/app.ts, pero
// Vercel resuelve sus dependencias contra el package.json RAÍZ — nunca instala
// backend/package.json. La duplicación es deliberada (ver docs/RIESGOS_ACEPTADOS.md);
// lo que no puede pasar es que las dos listas se desincronicen, porque entonces
// producción corre sobre versiones que ningún test ejecutó jamás.
//
// Esto ya ocurrió: la raíz llegó a tener express@5 y body-parser@2 mientras el
// backend y toda la suite de tests corrían sobre express@4 y body-parser@1.
//
// Uso: node scripts/check-deps-sync.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const read = p => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'))
const rootPkg = read('package.json')
const backendPkg = read('backend/package.json')

const rootDeps = rootPkg.dependencies ?? {}
const backendDeps = backendPkg.dependencies ?? {}

const missing = []
const mismatched = []

for (const [name, backendRange] of Object.entries(backendDeps)) {
  const rootRange = rootDeps[name]
  if (rootRange === undefined) {
    missing.push({ name, backendRange })
  } else if (rootRange !== backendRange) {
    mismatched.push({ name, backendRange, rootRange })
  }
}

if (missing.length === 0 && mismatched.length === 0) {
  console.log(
    `✓ Dependencias sincronizadas: ${Object.keys(backendDeps).length} de backend/package.json presentes en la raíz con el mismo rango.`
  )
  process.exit(0)
}

console.error('✗ package.json raíz desincronizado con backend/package.json\n')

for (const { name, backendRange } of missing) {
  console.error(`  FALTA EN LA RAÍZ  ${name}@${backendRange}`)
  console.error(`      → en Vercel esto es "Cannot find module '${name}'" en runtime.`)
}

for (const { name, backendRange, rootRange } of mismatched) {
  console.error(`  RANGO DISTINTO    ${name}: backend ${backendRange} vs raíz ${rootRange}`)
  console.error('      → producción correría sobre una versión que los tests nunca ejecutan.')
}

console.error(
  '\nCorregir copiando los rangos de backend/package.json a "dependencies" de package.json' +
    ' y corriendo `npm install` en la raíz. Contexto: docs/RIESGOS_ACEPTADOS.md (AC-9.7).'
)
process.exit(1)
