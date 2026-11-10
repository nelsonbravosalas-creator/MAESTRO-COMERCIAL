import type { MtcFrequency, MtcSchedule } from '../../types'
import { useActiveQuotation, useMaestro } from '../../stores/maestro-store'
import {
  clampSpecialMonths,
  ensureMtcConfig,
  intervalText,
  MTC_FREQUENCIES,
  MTC_FREQUENCY_LABELS,
  MTC_SCHEDULE_LABELS,
  visitsFor,
} from '../../utils/mtcSystems'
import { MtcConsumablesEditor } from './MtcConsumablesEditor'

export function MtcSystemsPanel({ disabled }: { disabled: boolean }) {
  const quotation = useActiveQuotation()
  const { addMtcSystem, patchMtcConsumables, patchMtcSystem, removeMtcSystem } = useMaestro()

  if (!quotation) return null

  const config = ensureMtcConfig(quotation)

  return (
    <section className="mtc-systems-panel">
      {config.systems.map((system, index) => {
        const prefix = `mtc-system-${index}`
        const visits = visitsFor(system.frequency, system.special_months)

        return (
          <article className="mtc-system-card" key={index}>
            <div className="mtc-system-card__header">
              <h3>Valorización {index + 1}</h3>
              {config.systems.length > 1 && (
                <button type="button" disabled={disabled} onClick={() => removeMtcSystem(index)}>
                  Quitar
                </button>
              )}
            </div>

            <div className="mtc-system-fields">
              <div>
                <label htmlFor={`${prefix}-name`}>Sistema o subsistema</label>
                <input
                  id={`${prefix}-name`}
                  type="text"
                  value={system.name ?? ''}
                  disabled={disabled}
                  onChange={event => patchMtcSystem(index, { name: event.target.value })}
                />
              </div>

              <div>
                <label htmlFor={`${prefix}-frequency`}>Régimen</label>
                <select
                  id={`${prefix}-frequency`}
                  value={system.frequency}
                  disabled={disabled}
                  onChange={event =>
                    patchMtcSystem(index, {
                      frequency: event.target.value as MtcFrequency,
                    })
                  }
                >
                  {MTC_FREQUENCIES.map(frequency => (
                    <option key={frequency} value={frequency}>
                      {MTC_FREQUENCY_LABELS[frequency]}
                    </option>
                  ))}
                </select>
              </div>

              {system.frequency === 'especial' && (
                <div>
                  <label htmlFor={`${prefix}-special-months`}>Cada cuántos meses</label>
                  <input
                    id={`${prefix}-special-months`}
                    type="number"
                    min="1"
                    value={system.special_months ?? ''}
                    disabled={disabled}
                    onChange={event => {
                      patchMtcSystem(index, {
                        special_months: clampSpecialMonths(Number(event.target.value)),
                      })
                    }}
                  />
                </div>
              )}

              <div>
                <label htmlFor={`${prefix}-schedule`}>Horario</label>
                <select
                  id={`${prefix}-schedule`}
                  value={system.schedule}
                  disabled={disabled}
                  onChange={event =>
                    patchMtcSystem(index, {
                      schedule: event.target.value as MtcSchedule,
                    })
                  }
                >
                  {Object.entries(MTC_SCHEDULE_LABELS).map(([schedule, label]) => (
                    <option key={schedule} value={schedule}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${prefix}-currency`}>Moneda de los precios</label>
                <select
                  id={`${prefix}-currency`}
                  value={system.currency}
                  disabled={disabled}
                  onChange={event =>
                    patchMtcSystem(index, {
                      currency: event.target.value as 'CLP' | 'UF' | 'USD',
                    })
                  }
                >
                  <option value="CLP">CLP</option>
                  <option value="UF">UF</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <p className="mtc-system-visits">
              {system.frequency === 'unico'
                ? intervalText(system.frequency, system.special_months)
                : `${visits} visitas al año (${intervalText(system.frequency, system.special_months)}).`}
            </p>

            <div className="mtc-consumables-toggle">
              <input
                id={`${prefix}-consumables-enabled`}
                type="checkbox"
                checked={Boolean(system.consumables.enabled)}
                disabled={disabled}
                onChange={event => patchMtcConsumables(index, { enabled: event.target.checked })}
              />
              <label htmlFor={`${prefix}-consumables-enabled`}>Incluye repuestos consumibles</label>
            </div>

            {system.consumables.enabled && (
              <div className="mtc-consumables-section">
                <label htmlFor={`${prefix}-consumables-margin`}>Margen de consumibles (%)</label>
                <input
                  id={`${prefix}-consumables-margin`}
                  type="number"
                  min="0"
                  value={system.consumables.margin ?? 0}
                  disabled={disabled}
                  onChange={event =>
                    patchMtcConsumables(index, { margin: Number(event.target.value) })
                  }
                />
                <MtcConsumablesEditor systemIndex={index} disabled={disabled} />
              </div>
            )}
          </article>
        )
      })}

      <button type="button" disabled={disabled} onClick={() => addMtcSystem()}>
        Agregar valorización
      </button>
    </section>
  )
}
