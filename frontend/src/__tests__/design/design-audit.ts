// Auditoría de diseño compartida por las pruebas de guarda (T-01, T-02, T-03).
// Corre en Node (Vitest): lee los fuentes del frontend directamente del disco.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

export const SRC = resolve(__dirname, '../..')
export const BASELINE_PATH = join(__dirname, 'design-baseline.json')

export interface DesignBaseline {
  cssHardcodedColors: Record<string, number>
  tsxInlineColors: Record<string, number>
}

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, ext, out)
    else if (full.endsWith(ext)) out.push(full)
  }
  return out
}

const rel = (f: string) => relative(SRC, f).split(sep).join('/')

// Un color fijo = #hex o rgb()/rgba() con números literales. rgba(var(--x-rgb), a)
// usa un token del tema y no cuenta. Los comentarios CSS se ignoran.
const HEX = /#[0-9a-fA-F]{3,8}\b/g
const RGB_LITERAL = /rgba?\(\s*(?!var\()[^)]*\)/g

export function countCssColors(css: string): number {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return (sinComentarios.match(HEX)?.length ?? 0) + (sinComentarios.match(RGB_LITERAL)?.length ?? 0)
}

// index.css es la única hoja que define colores: ahí viven los tokens de los 3 temas.
export function cssColorCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const f of walk(SRC, '.css')) {
    const r = rel(f)
    if (r === 'index.css') continue
    counts[r] = countCssColors(readFileSync(f, 'utf-8'))
  }
  return counts
}

// Colores escritos como string en el TSX de pantallas y componentes ('#1e293b').
const TSX_HEX = /['"`]#[0-9a-fA-F]{3,8}['"`]/g

export function tsxColorCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const dir of ['pages', 'components', 'App.tsx']) {
    const full = join(SRC, dir)
    const files = dir.endsWith('.tsx') ? [full] : walk(full, '.tsx')
    for (const f of files) counts[rel(f)] = readFileSync(f, 'utf-8').match(TSX_HEX)?.length ?? 0
  }
  return counts
}

// ── Tokens por tema (T-03) ─────────────────────────────────────────
export type ThemeName = 'dark' | 'light' | 'cyberpunk'

export function themeTokens(theme: ThemeName): Record<string, string> {
  const css = readFileSync(join(SRC, 'index.css'), 'utf-8')
  const head = `[data-theme="${theme}"] {`
  const start = css.indexOf(head)
  const block = css.slice(start, css.indexOf('\n}', start))
  const tokens: Record<string, string> = {}
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim()
  return tokens
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map(c => c + c).join('')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(fgHex: string, bgHex: string): number {
  const a = luminance(hexToRgb(fgHex))
  const b = luminance(hexToRgb(bgHex))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
