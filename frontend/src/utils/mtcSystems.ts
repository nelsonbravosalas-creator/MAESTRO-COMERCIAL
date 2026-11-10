// Dominio de las valorizaciones (sistemas) de una cotización de mantención.
// Funciones puras; no importa el store.
import type {
  CategoryId,
  CostCategory,
  CostItem,
  MasterQuotation,
  MtcConfig,
  MtcConsumableRow,
  MtcConsumables,
  MtcFrequency,
  MtcSchedule,
  MtcSystem,
} from '../types'
import { costeoVenta } from './costeoMath'

type Costeo = { categories: CostCategory[]; items: Record<CategoryId, CostItem[]> }

export const MTC_FREQUENCIES: MtcFrequency[] = [
  'mensual',
  'bimestral',
  'trimestral',
  'cuatrimestral',
  'semestral',
  'anual',
  'especial',
  'unico',
]

export const MTC_FREQUENCY_LABELS: Record<MtcFrequency, string> = {
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  cuatrimestral: 'Cuatrimestral',
  semestral: 'Semestral',
  anual: 'Anual',
  especial: 'Especial',
  unico: 'Único',
}

export const MTC_SCHEDULE_LABELS: Record<MtcSchedule, string> = {
  habil: 'Horario hábil',
  inhabil: 'Horario inhábil',
  continuo: 'Régimen 24x7',
}

const SCHEDULE_PHRASE: Record<MtcSchedule, string> = {
  habil: 'horario hábil',
  inhabil: 'horario inhábil',
  continuo: 'régimen 24x7',
}

const FIXED_VISITS: Record<Exclude<MtcFrequency, 'especial'>, number> = {
  mensual: 12,
  bimestral: 6,
  trimestral: 4,
  cuatrimestral: 3,
  semestral: 2,
  anual: 1,
  unico: 1,
}

const FIXED_INTERVAL: Record<Exclude<MtcFrequency, 'especial'>, string> = {
  mensual: 'cada mes',
  bimestral: 'cada dos (2) meses',
  trimestral: 'cada tres (3) meses',
  cuatrimestral: 'cada cuatro (4) meses',
  semestral: 'cada seis (6) meses',
  anual: 'una vez al año',
  unico: 'una sola vez',
}

// ── Régimen ───────────────────────────────────────────────────

export function clampSpecialMonths(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(12, Math.round(n)))
}

export function visitsFor(frequency: MtcFrequency, specialMonths: number | null): number {
  if (frequency === 'especial') {
    return Math.max(1, Math.round(12 / clampSpecialMonths(specialMonths)))
  }
  return FIXED_VISITS[frequency] ?? 1
}

export function intervalText(frequency: MtcFrequency, specialMonths: number | null): string {
  if (frequency === 'especial') {
    const n = clampSpecialMonths(specialMonths)
    return n === 1 ? 'cada mes' : `cada ${n} meses`
  }
  return FIXED_INTERVAL[frequency] ?? FIXED_INTERVAL.mensual
}

// ── Texto resumido ────────────────────────────────────────────

const DETAIL_SENTENCE =
  'Detalles del servicio se indican desde ítem A) hasta el ítem H) de la presente propuesta.'

export function defaultSummaryText(
  sys: Pick<MtcSystem, 'frequency' | 'special_months' | 'schedule'>
): string {
  const horario = SCHEDULE_PHRASE[sys.schedule] ?? SCHEDULE_PHRASE.habil
  if (sys.frequency === 'unico') {
    return `Servicio de Mantención Preventiva (visita única en ${horario}).\n${DETAIL_SENTENCE}`
  }
  const label = MTC_FREQUENCY_LABELS[sys.frequency] ?? MTC_FREQUENCY_LABELS.mensual
  const interval = intervalText(sys.frequency, sys.special_months)
  return (
    `C/u. Servicio de Mantención Preventiva (visita ${label} en ${horario}).\n` +
    `Cada Servicio, se realiza considerando frecuencia ${label.toLowerCase()} de visita (${interval}), ` +
    `para completar el periodo de Un (1) año. ${DETAIL_SENTENCE}`
  )
}

export function summaryTextOf(sys: MtcSystem): { text: string; edited: boolean } {
  const generated = defaultSummaryText(sys)
  if (sys.summary_text == null || sys.summary_text === generated) {
    return { text: generated, edited: false }
  }
  return { text: sys.summary_text, edited: true }
}

// ── Consumibles ───────────────────────────────────────────────

function nonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

export function consumableLines(
  c: MtcConsumables
): { row: MtcConsumableRow; qty: number; unitPrice: number; total: number }[] {
  const rawMargin = Number.isFinite(c.margin) ? c.margin : 0
  const margin = Math.max(0, Math.min(90, rawMargin))
  return c.rows.map(row => {
    const qty = nonNeg(row.per_module) * nonNeg(row.modules) * nonNeg(row.changes_per_year)
    const unitPrice = Math.round(nonNeg(row.cost) / (1 - margin / 100))
    return { row, qty, unitPrice, total: unitPrice * qty }
  })
}

// ── Sistemas ──────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sys-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function newMtcSystem(n: number, costeo: Costeo | null): MtcSystem {
  return {
    id: uuid(),
    name: n === 1 ? 'Sistema 1' : 'Subsistema ' + n,
    frequency: 'mensual',
    special_months: null,
    schedule: 'habil',
    currency: 'CLP',
    summary_text: null,
    consumables: { enabled: false, margin: 30, rows: [] },
    categories: costeo ? costeo.categories : null,
    items: costeo ? costeo.items : null,
  }
}

export function ensureMtcConfig(q: MasterQuotation): MtcConfig {
  if (q.mtc_config) return q.mtc_config
  const sys = newMtcSystem(1, null)
  sys.frequency = q.frequency ?? 'mensual'
  sys.currency = q.display_currency ?? 'CLP'
  return { v: 1, summary_mode: false, show_summary_table: false, systems: [sys] }
}

export function systemCosteo(q: MasterQuotation, index: number): Costeo {
  if (index === q.mtc_active_system) return { categories: q.categories, items: q.items }
  const sys = q.mtc_config?.systems[index]
  if (sys && sys.categories && sys.items) {
    return { categories: sys.categories, items: sys.items }
  }
  return { categories: [], items: { mo: [], log: [], mat: [], rep: [], ins: [], mec: [], ele: [] } }
}

export function systemTotals(
  q: MasterQuotation,
  index: number
): {
  visits: number
  isUnique: boolean
  visitNet: number
  yearNet: number
  consumablesNet: number
} {
  const sys = ensureMtcConfig(q).systems[index]
  if (!sys) return { visits: 0, isUnique: false, visitNet: 0, yearNet: 0, consumablesNet: 0 }
  const { categories, items } = systemCosteo(q, index)
  const visits = visitsFor(sys.frequency, sys.special_months)
  const visitNet = costeoVenta(categories, items)
  const consumablesNet = sys.consumables.enabled
    ? consumableLines(sys.consumables).reduce((a, l) => a + l.total, 0)
    : 0
  return {
    visits,
    isUnique: sys.frequency === 'unico',
    visitNet,
    yearNet: visitNet * visits,
    consumablesNet,
  }
}

export function grandSummary(q: MasterQuotation): {
  rows: { label: string; net: number }[]
  net: number
  iva: number
  total: number
} {
  const cfg = ensureMtcConfig(q)
  const rows: { label: string; net: number }[] = []
  cfg.systems.forEach((sys, i) => {
    const t = systemTotals(q, i)
    rows.push({
      label: `Servicio de mantención · ${sys.name} (${t.visits} ${t.visits === 1 ? 'visita' : 'visitas'})`,
      net: t.yearNet,
    })
    if (sys.consumables.enabled) {
      rows.push({ label: `Repuestos consumibles · ${sys.name}`, net: t.consumablesNet })
    }
  })
  const net = rows.reduce((a, r) => a + r.net, 0)
  const iva = (net * q.iva) / 100
  return { rows, net, iva, total: net + iva }
}

// ── Intercambio de costeo activo ──────────────────────────────

export function selectMtcSystem(q: MasterQuotation, index: number): MasterQuotation {
  const cfg = q.mtc_config
  if (!cfg) return q
  const active = q.mtc_active_system
  if (index === active || index < 0 || index >= cfg.systems.length) return q
  const target = cfg.systems[index]
  if (!target.categories || !target.items) return q
  const systems = cfg.systems.map((s, i) => {
    if (i === active) return { ...s, categories: q.categories, items: q.items }
    if (i === index) return { ...s, categories: null, items: null }
    return s
  })
  return {
    ...q,
    categories: target.categories,
    items: target.items,
    mtc_active_system: index,
    mtc_config: { ...cfg, systems },
  }
}

// Vuelve al Sistema 1 en pantalla y deja su casillero en null, listo para serializar.
export function toPersistedQuotation(q: MasterQuotation): MasterQuotation {
  if (!q.mtc_config) return q
  const back = q.mtc_active_system === 0 ? q : selectMtcSystem(q, 0)
  const cfg = back.mtc_config!
  const first = cfg.systems[0]
  if (back.mtc_active_system === 0 && first.categories === null && first.items === null) {
    return back
  }
  return {
    ...back,
    mtc_active_system: 0,
    mtc_config: {
      ...cfg,
      systems: cfg.systems.map((s, i) => (i === 0 ? { ...s, categories: null, items: null } : s)),
    },
  }
}

// Copia régimen, visitas y moneda del Sistema 1 a los campos de la cotización.
export function syncPrimaryMirror(q: MasterQuotation): MasterQuotation {
  const first = q.mtc_config?.systems[0]
  if (!first) return q
  return {
    ...q,
    frequency: first.frequency,
    visits_per_year: visitsFor(first.frequency, first.special_months),
    display_currency: first.currency,
  }
}
