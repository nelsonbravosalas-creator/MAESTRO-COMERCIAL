import type React from 'react'
import { useActiveQuotation } from '../../stores/maestro-store'
import { formatMtcMoney } from '../../utils/mtcMoney'
import { grandSummary } from '../../utils/mtcSystems'

export function MtcDocumentSide(): React.ReactElement | null {
  const q = useActiveQuotation()

  if (!q) {
    return null
  }

  const summary = grandSummary(q)
  const moneyContext = { uf: q.uf, usd: q.usd }

  return (
    <aside className="mtcd-side">
      <div className="mtcd-brand">Ingeniería y Servicios Bravo SpA</div>

      <h1 className="mtcd-title">Cotización de Mantención</h1>

      <div className="mtcd-meta">
        <div className="mtcd-field">
          <span className="mtcd-lab">N° de documento</span>
          <span className="mtcd-value">{q.correlative}</span>
        </div>
        <div className="mtcd-field">
          <span className="mtcd-lab">Fecha</span>
          <span className="mtcd-value">{q.date}</span>
        </div>
        <div className="mtcd-field">
          <span className="mtcd-lab">Cliente</span>
          <span className="mtcd-value">{q.client_name || '—'}</span>
        </div>
        <div className="mtcd-field">
          <span className="mtcd-lab">Referencia</span>
          <span className="mtcd-value">{q.ref || '—'}</span>
        </div>
      </div>

      <div className="mtcd-side-total">
        <span className="mtcd-lab">Total anual con IVA</span>
        <span className="mtcd-total">{formatMtcMoney(summary.total, moneyContext, 'CLP')}</span>
      </div>
    </aside>
  )
}
