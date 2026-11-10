import type {
  MasterQuotation,
  MtcConfig,
  MtcConsumableRow,
  MtcConsumables,
  MtcSystem,
} from '../types'
import { ensureMtcConfig, newMtcSystem, selectMtcSystem, syncPrimaryMirror } from './mtcSystems'

type Costeo = NonNullable<Parameters<typeof newMtcSystem>[1]>

type MtcSystemFields = Partial<
  Pick<
    MtcSystem,
    'name' | 'frequency' | 'special_months' | 'schedule' | 'currency' | 'summary_text'
  >
>

type MtcConfigFields = Partial<Pick<MtcConfig, 'summary_mode' | 'show_summary_table'>>
type MtcConsumablesFields = Partial<Pick<MtcConsumables, 'enabled' | 'margin'>>

function withMtcConfig(q: MasterQuotation): MasterQuotation {
  const config = ensureMtcConfig(q)
  return q.mtc_config === config ? q : { ...q, mtc_config: config }
}

function updateSystem(
  q: MasterQuotation,
  index: number,
  update: (system: MtcSystem) => MtcSystem
): MasterQuotation {
  const base = withMtcConfig(q)
  const config = base.mtc_config!

  if (index < 0 || index >= config.systems.length) return base

  const next: MasterQuotation = {
    ...base,
    mtc_config: {
      ...config,
      systems: config.systems.map((system, systemIndex) =>
        systemIndex === index ? update(system) : system
      ),
    },
  }

  return index === 0 ? syncPrimaryMirror(next) : next
}

export function addMtcSystemQ(q: MasterQuotation, costeo: Costeo): MasterQuotation {
  const base = withMtcConfig(q)
  const config = base.mtc_config!

  if (config.systems.length >= 12) return base

  const n = config.systems.length + 1
  const system = {
    ...newMtcSystem(n, costeo),
    name: `Subsistema ${n}`,
  }

  return {
    ...base,
    mtc_config: {
      ...config,
      systems: [...config.systems, system],
    },
  }
}

export function removeMtcSystemQ(q: MasterQuotation, index: number): MasterQuotation {
  const base = withMtcConfig(q)
  const config = base.mtc_config!

  if (config.systems.length <= 1 || index < 0 || index >= config.systems.length) return base

  const active = base.mtc_active_system
  const selected = active === index ? selectMtcSystem(base, index === 0 ? 1 : 0) : base
  const selectedConfig = selected.mtc_config!
  const nextActive = active === index ? 0 : active > index ? active - 1 : active

  const next: MasterQuotation = {
    ...selected,
    mtc_active_system: nextActive,
    mtc_config: {
      ...selectedConfig,
      systems: selectedConfig.systems.filter((_, systemIndex) => systemIndex !== index),
    },
  }

  return index === 0 ? syncPrimaryMirror(next) : next
}

export function patchMtcSystemQ(
  q: MasterQuotation,
  index: number,
  fields: MtcSystemFields
): MasterQuotation {
  return updateSystem(q, index, system => ({ ...system, ...fields }))
}

export function patchMtcConfigQ(q: MasterQuotation, fields: MtcConfigFields): MasterQuotation {
  const base = withMtcConfig(q)
  const config = base.mtc_config!

  return {
    ...base,
    mtc_config: { ...config, ...fields },
  }
}

export function patchMtcConsumablesQ(
  q: MasterQuotation,
  index: number,
  fields: MtcConsumablesFields
): MasterQuotation {
  return updateSystem(q, index, system => ({
    ...system,
    consumables: {
      ...system.consumables,
      ...fields,
      ...(fields.margin === undefined ? {} : { margin: Math.min(90, Math.max(0, fields.margin)) }),
    },
  }))
}

export function addMtcConsumableRowQ(
  q: MasterQuotation,
  index: number,
  seed: Partial<MtcConsumableRow> = {}
): MasterQuotation {
  return updateSystem(q, index, system => {
    const row = {
      ...seed,
      id: seed.id ?? crypto.randomUUID(),
    } as MtcConsumableRow

    return {
      ...system,
      consumables: {
        ...system.consumables,
        rows: [...system.consumables.rows, row],
      },
    }
  })
}

export function patchMtcConsumableRowQ(
  q: MasterQuotation,
  index: number,
  rowId: string,
  fields: Partial<MtcConsumableRow>
): MasterQuotation {
  return updateSystem(q, index, system => ({
    ...system,
    consumables: {
      ...system.consumables,
      rows: system.consumables.rows.map(row => (row.id === rowId ? { ...row, ...fields } : row)),
    },
  }))
}

export function removeMtcConsumableRowQ(
  q: MasterQuotation,
  index: number,
  rowId: string
): MasterQuotation {
  return updateSystem(q, index, system => ({
    ...system,
    consumables: {
      ...system.consumables,
      rows: system.consumables.rows.filter(row => row.id !== rowId),
    },
  }))
}
