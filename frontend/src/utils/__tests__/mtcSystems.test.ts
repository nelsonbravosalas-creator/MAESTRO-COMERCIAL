import { describe, it, expect } from 'vitest'
import type {
  CategoryId,
  CostCategory,
  CostItem,
  MasterQuotation,
  MtcConsumableRow,
  MtcSystem,
} from '../../types'
import {
  clampSpecialMonths,
  consumableLines,
  defaultSummaryText,
  ensureMtcConfig,
  grandSummary,
  intervalText,
  newMtcSystem,
  selectMtcSystem,
  summaryTextOf,
  syncPrimaryMirror,
  systemCosteo,
  systemTotals,
  toPersistedQuotation,
  visitsFor,
} from '../mtcSystems'

function cat(id: CategoryId, margin: number): CostCategory {
  return {
    id,
    label: id,
    margin,
    color: '#000',
    showDetails: true,
    showValues: true,
    note: '',
    collapsed: false,
  }
}
function item(id: string, unit: number): CostItem {
  return { id, desc: id, unidad: 'Und', cant: 1, unit, days: 1 }
}
function emptyItems(): Record<CategoryId, CostItem[]> {
  return { mo: [], log: [], mat: [], rep: [], ins: [], mec: [], ele: [] }
}

function makeQ(overrides: Partial<MasterQuotation> = {}): MasterQuotation {
  const base = {
    id: 'q1',
    correlative: 'MTC-001-2026',
    uf: 39000,
    usd: 950,
    iva: 19,
    kind: 'maintenance',
    frequency: 'bimestral',
    visits_per_year: 6,
    display_currency: 'CLP',
    categories: [cat('mo', 35), cat('log', 30)],
    items: { ...emptyItems(), mo: [item('m1', 210000)], log: [item('l1', 49500)] },
    mtc_config: null,
    mtc_active_system: 0,
  } as unknown as MasterQuotation
  return { ...base, ...overrides }
}

const rowA: MtcConsumableRow = {
  id: 'a',
  desc: 'Filtro de Aire',
  unidad: 'c/u',
  per_module: 1,
  modules: 1,
  changes_per_year: 6,
  cost: 11822,
}
const rowB: MtcConsumableRow = {
  id: 'b',
  desc: 'Cilindro Humidificador',
  unidad: 'c/u',
  per_module: 1,
  modules: 1,
  changes_per_year: 2,
  cost: 102525,
}

function baseSys(): MtcSystem {
  return newMtcSystem(1, null)
}

describe('visitsFor / clampSpecialMonths', () => {
  it('visitas por régimen', () => {
    expect(visitsFor('mensual', null)).toBe(12)
    expect(visitsFor('bimestral', null)).toBe(6)
    expect(visitsFor('trimestral', null)).toBe(4)
    expect(visitsFor('cuatrimestral', null)).toBe(3)
    expect(visitsFor('semestral', null)).toBe(2)
    expect(visitsFor('anual', null)).toBe(1)
    expect(visitsFor('unico', null)).toBe(1)
    expect(visitsFor('especial', 5)).toBe(2)
    expect(visitsFor('especial', 12)).toBe(1)
  })
  it('entradas inválidas de meses', () => {
    for (const bad of [null, 0, -3, 2.7, 99, NaN, '' as unknown as number])
      expect(Number.isFinite(visitsFor('especial', bad as number))).toBe(true)
    expect(clampSpecialMonths(0)).toBe(1)
    expect(clampSpecialMonths(99)).toBe(12)
    expect(clampSpecialMonths(2.7)).toBe(3)
  })
})

describe('textos', () => {
  it('texto por defecto', () => {
    expect(
      defaultSummaryText({ frequency: 'bimestral', special_months: null, schedule: 'habil' })
    ).toBe(
      'C/u. Servicio de Mantención Preventiva (visita Bimestral en horario hábil).\n' +
        'Cada Servicio, se realiza considerando frecuencia bimestral de visita (cada dos (2) meses), para completar el periodo de Un (1) año. ' +
        'Detalles del servicio se indican desde ítem A) hasta el ítem H) de la presente propuesta.'
    )
    expect(
      defaultSummaryText({ frequency: 'unico', special_months: null, schedule: 'continuo' })
    ).toBe(
      'Servicio de Mantención Preventiva (visita única en régimen 24x7).\n' +
        'Detalles del servicio se indican desde ítem A) hasta el ítem H) de la presente propuesta.'
    )
    expect(intervalText('especial', 5)).toBe('cada 5 meses')
    expect(intervalText('especial', 1)).toBe('cada mes')
  })
  it('texto editado se conserva', () => {
    const sys = baseSys()
    expect(summaryTextOf({ ...sys, summary_text: null }).edited).toBe(false)
    expect(summaryTextOf({ ...sys, summary_text: defaultSummaryText(sys) }).edited).toBe(false)
    expect(summaryTextOf({ ...sys, summary_text: 'Mi texto' })).toEqual({
      text: 'Mi texto',
      edited: true,
    })
  })
})

describe('consumableLines', () => {
  it('valores de referencia con margen 30', () => {
    const lines = consumableLines({ enabled: true, margin: 30, rows: [rowA, rowB] })
    expect(lines.map(l => [l.qty, l.unitPrice, l.total])).toEqual([
      [6, 16889, 101334],
      [2, 146464, 292928],
    ])
  })
  it('margen fuera de rango queda acotado', () => {
    expect(consumableLines({ enabled: true, margin: 100, rows: [rowA] })[0].unitPrice).toBe(118220)
    expect(consumableLines({ enabled: true, margin: -5, rows: [rowA] })[0].unitPrice).toBe(11822)
  })
  it('cantidades y costos inválidos cuentan como 0', () => {
    const l = consumableLines({
      enabled: true,
      margin: 30,
      rows: [{ ...rowA, cost: NaN, modules: -1 }],
    })[0]
    expect(l.qty).toBe(0)
    expect(l.total).toBe(0)
  })
})

describe('ensureMtcConfig', () => {
  it('crea un sistema desde la cotización', () => {
    const q = makeQ({ frequency: 'trimestral', display_currency: 'UF' })
    const c = ensureMtcConfig(q)
    expect(c.v).toBe(1)
    expect(c.summary_mode).toBe(false)
    expect(c.show_summary_table).toBe(false)
    expect(c.systems).toHaveLength(1)
    const s = c.systems[0]
    expect(s.frequency).toBe('trimestral')
    expect(s.currency).toBe('UF')
    expect(s.schedule).toBe('habil')
    expect(s.summary_text).toBeNull()
    expect(s.consumables.enabled).toBe(false)
    expect(s.categories).toBeNull()
    expect(s.items).toBeNull()
  })
  it('frecuencia nula pasa a mensual', () => {
    expect(ensureMtcConfig(makeQ({ frequency: null })).systems[0].frequency).toBe('mensual')
  })
  it('devuelve la misma referencia si ya existe', () => {
    const cfg = ensureMtcConfig(makeQ())
    const q = makeQ({ mtc_config: cfg })
    expect(ensureMtcConfig(q)).toBe(cfg)
  })
})

describe('systemTotals', () => {
  it('neto por visita, anual y consumibles', () => {
    const q = makeQ()
    const t = systemTotals(q, 0)
    expect(t.visits).toBe(6)
    expect(t.isUnique).toBe(false)
    expect(t.visitNet).toBeCloseTo(210000 / 0.65 + 49500 / 0.7, 2)
    expect(t.yearNet).toBeCloseTo(t.visitNet * 6, 2)
    expect(t.consumablesNet).toBe(0)

    const cfg = ensureMtcConfig(q)
    const withCons = makeQ({
      mtc_config: {
        ...cfg,
        systems: [
          {
            ...cfg.systems[0],
            consumables: { enabled: true, margin: 30, rows: [rowA, rowB] },
          },
        ],
      },
    })
    expect(systemTotals(withCons, 0).consumablesNet).toBe(394262)
  })
})

function twoSystemQ(): MasterQuotation {
  const q = makeQ()
  const cfg = ensureMtcConfig(q)
  const s2: MtcSystem = {
    ...newMtcSystem(2, null),
    categories: [cat('mo', 20)],
    items: { ...emptyItems(), mo: [item('x', 100000)] },
  }
  return makeQ({ mtc_config: { ...cfg, systems: [cfg.systems[0], s2] } })
}

describe('selectMtcSystem / toPersistedQuotation', () => {
  it('intercambia el costeo', () => {
    const q = twoSystemQ()
    const r = selectMtcSystem(q, 1)
    expect(r.categories).toBe(q.mtc_config!.systems[1].categories)
    expect(r.items).toBe(q.mtc_config!.systems[1].items)
    expect(r.mtc_config!.systems[1].categories).toBeNull()
    expect(r.mtc_config!.systems[1].items).toBeNull()
    expect(r.mtc_config!.systems[0].categories).toBe(q.categories)
    expect(r.mtc_config!.systems[0].items).toBe(q.items)
    expect(r.mtc_active_system).toBe(1)
    expect(systemCosteo(r, 1).categories).toBe(r.categories)
    expect(systemCosteo(r, 0).categories).toBe(q.categories)
  })
  it('mismo índice o fuera de rango devuelve el mismo objeto', () => {
    const q = twoSystemQ()
    expect(selectMtcSystem(q, 0)).toBe(q)
    expect(selectMtcSystem(q, 5)).toBe(q)
    expect(selectMtcSystem(q, -1)).toBe(q)
  })
  it('ida y vuelta', () => {
    const q = twoSystemQ()
    const p = toPersistedQuotation(selectMtcSystem(q, 1))
    expect(p.mtc_active_system).toBe(0)
    expect(p.categories).toEqual(q.categories)
    expect(p.items).toEqual(q.items)
    expect(p.mtc_config!.systems[0].categories).toBeNull()
    expect(p.mtc_config!.systems[0].items).toBeNull()
    expect(p.mtc_config!.systems[1].categories).toEqual(q.mtc_config!.systems[1].categories)
    expect(p.mtc_config!.systems[1].items).toEqual(q.mtc_config!.systems[1].items)
  })
})

describe('inmutabilidad', () => {
  it('selectMtcSystem y toPersistedQuotation no mutan la entrada', () => {
    const q = twoSystemQ()
    const snapshot = structuredClone(q)
    const sel = selectMtcSystem(q, 1)
    expect(q).toEqual(snapshot)
    const selSnapshot = structuredClone(sel)
    toPersistedQuotation(sel)
    expect(sel).toEqual(selSnapshot)
    toPersistedQuotation(q)
    expect(q).toEqual(snapshot)
  })
})

describe('syncPrimaryMirror', () => {
  it('copia régimen y moneda del sistema 1', () => {
    const q = twoSystemQ()
    const cfg = q.mtc_config!
    const q2 = makeQ({
      mtc_config: {
        ...cfg,
        systems: [
          { ...cfg.systems[0], frequency: 'especial', special_months: 5, currency: 'USD' },
          cfg.systems[1],
        ],
      },
    })
    const r = syncPrimaryMirror(q2)
    expect(r.frequency).toBe('especial')
    expect(r.visits_per_year).toBe(2)
    expect(r.display_currency).toBe('USD')
  })
})

describe('grandSummary', () => {
  it('suma servicios y consumibles de todos los sistemas', () => {
    const q = twoSystemQ()
    const cfg = q.mtc_config!
    const q2 = makeQ({
      mtc_config: {
        ...cfg,
        systems: [
          cfg.systems[0],
          {
            ...cfg.systems[1],
            frequency: 'unico',
            consumables: { enabled: true, margin: 30, rows: [rowA, rowB] },
          },
        ],
      },
    })
    const g = grandSummary(q2)
    expect(g.rows).toHaveLength(3)
    expect(g.rows[0].label).toBe(`Servicio de mantención · ${cfg.systems[0].name} (6 visitas)`)
    expect(g.rows[1].label).toBe(`Servicio de mantención · ${cfg.systems[1].name} (1 visita)`)
    expect(g.rows[2].label).toBe(`Repuestos consumibles · ${cfg.systems[1].name}`)
    expect(g.net).toBeCloseTo(
      g.rows.reduce((a, r) => a + r.net, 0),
      2
    )
    expect(g.iva).toBeCloseTo(g.net * 0.19, 2)
    expect(g.total).toBeCloseTo(g.net + g.iva, 2)
  })
})
