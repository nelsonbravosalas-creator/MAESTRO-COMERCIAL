import { useActiveQuotation, useMaestro } from '../../stores/maestro-store'
import { ensureMtcConfig } from '../../utils/mtcSystems'

export function MtcDocumentToolbar({ disabled }: { disabled: boolean }) {
  const q = useActiveQuotation()
  const { patchMtc, patchActive } = useMaestro()

  if (!q) return null

  const config = ensureMtcConfig(q)
  const singleSystem = config.systems.length === 1

  return (
    <>
      <label className="mtc-currency-toggle">
        <input
          type="checkbox"
          checked={Boolean(config.summary_mode)}
          disabled={disabled}
          onChange={e => patchMtc({ summary_mode: e.target.checked })}
        />
        Presentación resumida
      </label>
      <label className="mtc-currency-toggle">
        <input
          type="checkbox"
          checked={Boolean(config.show_summary_table)}
          disabled={disabled}
          onChange={e => patchMtc({ show_summary_table: e.target.checked })}
        />
        Cuadro resumen final
      </label>
      {singleSystem && (
        <>
          <label className="mtc-currency-toggle">
            <input
              type="checkbox"
              checked={q.show_uf_equivalent}
              disabled={disabled}
              onChange={e => patchActive({ show_uf_equivalent: e.target.checked })}
            />
            Mostrar UF
          </label>
          <label className="mtc-currency-toggle">
            <input
              type="checkbox"
              checked={q.show_usd_equivalent}
              disabled={disabled}
              onChange={e => patchActive({ show_usd_equivalent: e.target.checked })}
            />
            Mostrar USD
          </label>
          {q.show_usd_equivalent && (
            <div className="mtc-usd-input">
              <span>USD ref. $</span>
              <input
                type="number"
                min="0"
                value={q.usd || ''}
                disabled={disabled}
                onChange={e => patchActive({ usd: parseFloat(e.target.value) || 0 })}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}
