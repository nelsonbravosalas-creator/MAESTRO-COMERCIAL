import { useActiveQuotation, useMaestro } from '../../stores/maestro-store'
import { buildMtcDocument } from '../../utils/mtcDocument'

export function MtcValuationSection({
  expandedCats,
  onToggleCat,
}: {
  expandedCats: Set<string>
  onToggleCat: (catId: string) => void
}) {
  const q = useActiveQuotation()
  const { patchMtcSystem } = useMaestro()

  if (!q) {
    return null
  }

  const model = buildMtcDocument(q, expandedCats)
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
                      aria-label="Texto de la descripción del servicio"
                      value={block.summaryRow.text}
                      onChange={e =>
                        patchMtcSystem(block.index, {
                          summary_text: e.target.value,
                        })
                      }
                      rows={6}
                    />
                    {block.summaryRow.edited && (
                      <button
                        type="button"
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
