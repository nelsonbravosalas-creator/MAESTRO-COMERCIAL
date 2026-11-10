import { useActiveQuotation, useMaestro } from '../../stores/maestro-store'
import { ensureMtcConfig } from '../../utils/mtcSystems'

export function MtcSystemTabs() {
  const quotation = useActiveQuotation()
  const { selectMtcSystem } = useMaestro()

  if (!quotation) return null

  const config = ensureMtcConfig(quotation)
  if (config.systems.length <= 1) return null

  return (
    <div className="mtc-system-tabs" role="group" aria-label="Sistemas">
      {config.systems.map((system, index) => (
        <button
          key={index}
          type="button"
          aria-pressed={quotation.mtc_active_system === index}
          onClick={() => selectMtcSystem(index)}
        >
          {system.name || `Valorización ${index + 1}`}
        </button>
      ))}
    </div>
  )
}
