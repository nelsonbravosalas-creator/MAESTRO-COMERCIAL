import { useActiveQuotation, useMaestro } from '../../stores/maestro-store'
import { buildMtcDocument } from '../../utils/mtcDocument'
import { systemTotals } from '../../utils/mtcSystems'

export function MtcValuationSection({
  expandedCats,
  onToggleCat,
  disabled = false,
}: {
  expandedCats: Set<string>
  onToggleCat: (catId: string) => void
  disabled?: boolean
}) {
  const q = useActiveQuotation()
  const { patchMtcSystem } = useMaestro()

  if (!q) {
    return null
  }

  const model = buildMtcDocument(q, expandedCats)
  const single = model.blocks.length === 1 ? model.blocks[0] : null
  const yearTotalClp = (() => {
    const yearNet = single && !single.isUnique ? systemTotals(q, 0).yearNet : 0
    const net = Number.isFinite(yearNet) ? yearNet : 0
    const iva = Number.isFinite(q.iva) ? q.iva : 0
    return net + (net * iva) / 100
  })()
  const refClp = (value: number) => Math.round(value).toLocaleString('es-CL')
  const equivalentRows = (colSpan: number) => {
    if (!single || single.isUnique) return null
    const showUf = q.show_uf_equivalent && q.uf > 0 && single.currencyCode !== 'UF'
    const showUsd = q.show_usd_equivalent && q.usd > 0 && single.currencyCode !== 'USD'
    return (
      <>
        {showUf && (
          <tr className="doc-uf">
            <td colSpan={colSpan}>Equivalente en UF (ref. ${refClp(q.uf)}/UF)</td>
            <td>{(yearTotalClp / q.uf).toFixed(2)} UF</td>
          </tr>
        )}
        {showUsd && (
          <tr className="doc-usd">
            <td colSpan={colSpan}>Equivalente en USD (ref. ${refClp(q.usd)}/USD)</td>
            <td>
              US${' '}
              {(yearTotalClp / q.usd).toLocaleString('es-CL', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </td>
          </tr>
        )}
      </>
    )
  }
  const totalClass = (index: number) => {
    if (index === 0) return 'doc-subtotal'
    if (index === 1) return 'doc-iva-row'
    return 'doc-total'
  }

  return (
    <>
      {model.blocks.map(block => (
        <section key={block.index}>
          <div className="doc-group-title">{block.title}</div>
          <p>{block.currencyNote}</p>

          {!model.summaryMode ? (
            <table className="doc-valuation">
              <tbody>
                {block.detailRows.map(row => (
                  <tr key={row.catId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={expandedCats.has(row.catId)}
                        onChange={() => onToggleCat(row.catId)}
                      />
                    </td>
                    <td>{row.label}</td>
                    <td>{row.amount}</td>
                  </tr>
                ))}
                {block.visitTotals.map((row, index) => (
                  <tr key={row.label} className={totalClass(index)}>
                    <td colSpan={2}>{row.label}</td>
                    <td>{row.amount}</td>
                  </tr>
                ))}
                {!block.isUnique &&
                  block.annualTotals.map((row, index) => (
                    <tr key={row.label} className={totalClass(index)}>
                      <td colSpan={2}>{row.label}</td>
                      <td>{row.amount}</td>
                    </tr>
                  ))}
                {equivalentRows(2)}
              </tbody>
            </table>
          ) : (
            <table className="doc-valuation">
              <thead>
                <tr>
                  <th>Ítem</th>
                  <th>Cant.</th>
                  <th>Descripción</th>
                  <th>Precio unit.</th>
                  <th>Precio total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{block.summaryRow.item}</td>
                  <td>{block.summaryRow.qty}</td>
                  <td>
                    <textarea
                      className="mtc-summary-input"
                      aria-label="Texto de la descripción del servicio"
                      disabled={disabled}
                      value={block.summaryRow.text}
                      onChange={e =>
                        patchMtcSystem(block.index, {
                          summary_text: e.target.value,
                        })
                      }
                      rows={6}
                    />
                    <div className="print-only" style={{ whiteSpace: 'pre-line' }}>
                      {block.summaryRow.text}
                    </div>
                    {block.summaryRow.edited && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => patchMtcSystem(block.index, { summary_text: null })}
                      >
                        Restablecer texto
                      </button>
                    )}
                  </td>
                  <td>{block.summaryRow.unit}</td>
                  <td>{block.summaryRow.total}</td>
                </tr>
                {block.summaryTotals.map((row, index) => (
                  <tr key={row.label} className={totalClass(index)}>
                    <td colSpan={4}>{row.label}</td>
                    <td>{row.amount}</td>
                  </tr>
                ))}
                {equivalentRows(4)}
              </tbody>
            </table>
          )}

          {block.consumables !== null && (
            <>
              <div className="doc-group-title">Repuestos consumibles</div>
              <table className="doc-valuation">
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th>Descripción</th>
                    <th>Un.</th>
                    <th>Por módulo</th>
                    <th>Módulos</th>
                    <th>Cambios/año</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {block.consumables.schedule.map(row => (
                    <tr key={row.n}>
                      <td>{row.n}</td>
                      <td>{row.desc}</td>
                      <td>{row.unidad}</td>
                      <td>{row.perModule}</td>
                      <td>{row.modules}</td>
                      <td>{row.changes}</td>
                      <td>{row.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="doc-valuation">
                <thead>
                  <tr>
                    <th>Ítem</th>
                    <th>Cant.</th>
                    <th>Descripción</th>
                    <th>Precio unit.</th>
                    <th>Precio total</th>
                  </tr>
                </thead>
                <tbody>
                  {block.consumables.priced.map(row => (
                    <tr key={row.n}>
                      <td>{row.n}</td>
                      <td>{row.qty}</td>
                      <td>{row.desc}</td>
                      <td>{row.unit}</td>
                      <td>{row.total}</td>
                    </tr>
                  ))}
                  {block.consumables.totals.map((row, index) => (
                    <tr key={row.label} className={totalClass(index)}>
                      <td colSpan={4}>{row.label}</td>
                      <td>{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      ))}

      {model.grand !== null && (
        <section>
          <div className="doc-group-title">Resumen de valores anuales</div>
          <table className="doc-valuation">
            <tbody>
              {model.grand.rows.map(row => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.amount}</td>
                </tr>
              ))}
              {model.grand.totals.map((row, index) => (
                <tr key={row.label} className={totalClass(index)}>
                  <td>{row.label}</td>
                  <td>{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
