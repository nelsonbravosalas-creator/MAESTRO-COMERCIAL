import { CatalogAutocomplete } from '../../components/CatalogAutocomplete'
import { useActiveQuotation, useMaestro } from '../../stores/maestro-store'
import { consumableLines, ensureMtcConfig } from '../../utils/mtcSystems'

const numberValue = (value: string) => Number(value) || 0
const money = (value: number) => `$${Math.round(value || 0).toLocaleString('es-CL')}`

export function MtcConsumablesEditor({
  systemIndex,
  disabled,
}: {
  systemIndex: number
  disabled: boolean
}) {
  const quotation = useActiveQuotation()
  const { addMtcConsumableRow, patchMtcConsumableRow, removeMtcConsumableRow } = useMaestro()

  if (!quotation) return null

  const consumables = ensureMtcConfig(quotation).systems[systemIndex]?.consumables
  if (!consumables) return null

  const linesById = new Map(consumableLines(consumables).map(line => [line.row.id, line]))

  return (
    <div className="mtc-consumables-editor">
      <table>
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Un.</th>
            <th>Por módulo</th>
            <th>Módulos</th>
            <th>Cambios/año</th>
            <th>Cant. total</th>
            <th>Costo unit.</th>
            <th>Precio unit.</th>
            <th>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {consumables.rows.map(row => {
            const line = linesById.get(row.id)
            return (
              <tr key={row.id}>
                <td>
                  <CatalogAutocomplete
                    catId="rep"
                    value={row.desc ?? ''}
                    onChange={desc => patchMtcConsumableRow(systemIndex, row.id, { desc })}
                    onSelect={item =>
                      patchMtcConsumableRow(systemIndex, row.id, {
                        desc: item.desc,
                        unidad: item.unidad,
                        cost: item.price,
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="Unidad"
                    value={row.unidad ?? ''}
                    disabled={disabled}
                    onChange={event =>
                      patchMtcConsumableRow(systemIndex, row.id, { unidad: event.target.value })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="Por módulo"
                    type="number"
                    value={row.per_module ?? 0}
                    disabled={disabled}
                    onChange={event =>
                      patchMtcConsumableRow(systemIndex, row.id, {
                        per_module: numberValue(event.target.value),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="Módulos"
                    type="number"
                    value={row.modules ?? 0}
                    disabled={disabled}
                    onChange={event =>
                      patchMtcConsumableRow(systemIndex, row.id, {
                        modules: numberValue(event.target.value),
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="Cambios/año"
                    type="number"
                    value={row.changes_per_year ?? 0}
                    disabled={disabled}
                    onChange={event =>
                      patchMtcConsumableRow(systemIndex, row.id, {
                        changes_per_year: numberValue(event.target.value),
                      })
                    }
                  />
                </td>
                <td>{line?.qty ?? 0}</td>
                <td>
                  <input
                    aria-label="Costo unitario"
                    type="number"
                    value={row.cost ?? 0}
                    disabled={disabled}
                    onChange={event =>
                      patchMtcConsumableRow(systemIndex, row.id, {
                        cost: numberValue(event.target.value),
                      })
                    }
                  />
                </td>
                <td>{money(line?.unitPrice ?? 0)}</td>
                <td>{money(line?.total ?? 0)}</td>
                <td>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeMtcConsumableRow(systemIndex, row.id)}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button type="button" disabled={disabled} onClick={() => addMtcConsumableRow(systemIndex)}>
        Agregar repuesto
      </button>
    </div>
  )
}
