import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  BASELINE_PATH,
  contrast,
  cssColorCounts,
  themeTokens,
  tsxColorCounts,
  type DesignBaseline,
  type ThemeName,
} from './design-audit'

// Trinquete: el conteo de colores fijos por archivo solo puede bajar. Cuando un PR
// migra una hoja a tokens, el baseline se baja en el mismo PR:
//   UPDATE_DESIGN_BASELINE=1 npx vitest run src/__tests__/design
const baseline: DesignBaseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))

if (process.env.UPDATE_DESIGN_BASELINE) {
  const sorted = (o: Record<string, number>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  const next: DesignBaseline = {
    cssHardcodedColors: sorted(cssColorCounts()),
    tsxInlineColors: sorted(tsxColorCounts()),
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
}

function ratchet(actual: Record<string, number>, allowed: Record<string, number>) {
  const subieron = Object.entries(actual)
    .filter(([f, n]) => n > (allowed[f] ?? 0))
    .map(([f, n]) => `${f}: ${n} (máximo ${allowed[f] ?? 0})`)
  const bajaronSinActualizar = Object.entries(actual)
    .filter(([f, n]) => n < (allowed[f] ?? 0))
    .map(([f, n]) => `${f}: ${n} (baseline ${allowed[f]})`)
  return { subieron, bajaronSinActualizar }
}

describe('T-01 · colores fijos en CSS (fuera de index.css)', () => {
  it('ningún archivo supera su baseline: usar var(--token)', () => {
    expect(ratchet(cssColorCounts(), baseline.cssHardcodedColors).subieron).toEqual([])
  })
  it('el baseline está al día cuando un archivo bajó su conteo', () => {
    expect(ratchet(cssColorCounts(), baseline.cssHardcodedColors).bajaronSinActualizar).toEqual([])
  })
})

describe('T-02 · colores inline en TSX de pantallas y componentes', () => {
  it('ningún archivo supera su baseline', () => {
    expect(ratchet(tsxColorCounts(), baseline.tsxInlineColors).subieron).toEqual([])
  })
  it('el baseline está al día cuando un archivo bajó su conteo', () => {
    expect(ratchet(tsxColorCounts(), baseline.tsxInlineColors).bajaronSinActualizar).toEqual([])
  })
})

// T-03: pares texto/fondo que usan las pantallas. WCAG AA = 4,5:1 para texto normal.
const PARES: [string, string][] = [
  ['--text', '--bg'],
  ['--text', '--surface'],
  ['--text', '--surface-muted'],
  ['--text', '--surface-strong'],
  ['--text-secondary', '--surface'],
  ['--text-muted', '--surface'],
  ['--text-muted', '--surface-strong'],
  ['--primary-text', '--surface'],
  ['--success-text', '--surface'],
  ['--warning-text', '--surface'],
  ['--danger-text', '--surface'],
  ['--info-text', '--surface'],
  ['--violet-text', '--surface'],
  ['--on-accent', '--primary'],
]
const THEMES: ThemeName[] = ['dark', 'light', 'cyberpunk']

describe('T-03 · contraste de los tokens de texto', () => {
  for (const theme of THEMES) {
    it(`tema ${theme}: todos los pares ≥ 4,5:1`, () => {
      const t = themeTokens(theme)
      const bajos = PARES.filter(([fg, bg]) => contrast(t[fg], t[bg]) < 4.5).map(
        ([fg, bg]) => `${fg} sobre ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}:1`
      )
      expect(bajos).toEqual([])
    })
  }
})
