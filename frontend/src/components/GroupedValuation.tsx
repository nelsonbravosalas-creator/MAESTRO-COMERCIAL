import { buildGroupedRows } from '../utils/groupedUnitPrice'
import { fmtCLP } from '../stores/maestro-store'
import type { MasterQuotation } from '../types'

const fmtQty = (n: number) =>
  n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Valorización del estilo "Precio unitario agrupado" (solo vista previa y PDF). */
export function GroupedValuation({
  q,
  mode,
}: {
  q: MasterQuotation
  mode: 'quotation' | 'maintenance'
}) {
  const model = buildGroupedRows(q, mode)

  return (
    <>
      <table className="doc-valuation doc-grouped" data-testid="grouped-valuation">
        <thead>
          <tr>
            <th className="grp-item">Ítem</th>
            <th className="grp-qty">Cant.</th>
            <th>Descripción</th>
            <th className="text-right">Precio Unit.</th>
            <th className="text-right">Precio Total</th>
          </tr>
        </thead>
        <tbody>
          {model.items.map(it => (
            <tr key={it.n} className="doc-grouped-row">
              <td className="grp-item">{it.n}</td>
              <td className="grp-qty">{fmtQty(it.qty)}</td>
              <td>
                <div className="grp-title">{it.title}</div>
                {it.subitems.map(s => (
                  <div key={s.id} className="grp-sub">
                    - {s.desc} ({s.meta})
                  </div>
                ))}
              </td>
              <td className="text-right mono">{fmtCLP.format(it.unitPrice)}</td>
              <td className="text-right mono">{fmtCLP.format(it.total)}</td>
            </tr>
          ))}
          {model.items.length === 0 && (
            <tr>
              <td colSpan={5}>Sin ítems valorizados.</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="doc-subtotal">
            <td colSpan={4}>Precio Neto Total</td>
            <td className="text-right mono">{fmtCLP.format(model.neto)}</td>
          </tr>
          <tr className="doc-iva-row">
            <td colSpan={4}>IVA ({model.ivaPct}%)</td>
            <td className="text-right mono">{fmtCLP.format(model.iva)}</td>
          </tr>
          <tr className="doc-total">
            <td colSpan={4}>Precio Total (con IVA)</td>
            <td className="text-right mono">{fmtCLP.format(model.total)}</td>
          </tr>
        </tfoot>
      </table>
      {model.diff !== 0 && (
        <div className="grouped-diff-notice no-print" role="note">
          Aviso (solo en pantalla): el total de este documento difiere del motor de costeo en{' '}
          {fmtCLP.format(Math.abs(model.diff))} ({model.diff > 0 ? 'mayor' : 'menor'}), por redondeo
          del precio unitario o ítems sin detalle.
        </div>
      )}
    </>
  )
}
