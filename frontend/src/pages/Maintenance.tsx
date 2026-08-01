import React, { useState, useMemo, useRef, useCallback } from 'react'
import '../styles/Quotations.css'
import '../styles/Maintenance.css'
import {
  useMaestro,
  useActiveQuotation,
  calcTotals,
  fmtCLP,
  fmtDecimal,
  VISITS_PER_YEAR,
  FREQUENCY_LABELS,
} from '../stores/maestro-store'
import { QuoteStatus, MtcFrequency } from '../types'
import {
  STATUS_META,
  fmtDate,
  fmtDateLong,
  reportSaveError,
  TabCosteo,
  EditableList,
} from './Quotations'
import { usePermissions } from '../hooks/usePermissions'
import { downloadDocx } from '../utils/docxExport'
import { downloadHtml } from '../utils/htmlExport'
import { downloadPdfFromElement } from '../utils/pdfExport'
import { buildQuotationValuationRows } from '../utils/quotationRows'

// ── Master List ────────────────────────────────────────────────────────────────

function MaintenanceList({ onEdit }: { onEdit: () => void }) {
  const {
    quotations: allQuotations,
    newDraft,
    loadQuote,
    duplicateQuote,
    createVersion,
    deleteQuote,
    setStatus,
    activeId,
  } = useMaestro()
  // Solo contratos de mantención — las cotizaciones de proyecto viven en su
  // propio listado ("Cotizaciones").
  const quotations = useMemo(
    () => allQuotations.filter(q => q.kind === 'maintenance'),
    [allQuotations]
  )
  const { canDeleteQuotation, canChangeQuotationStatus } = usePermissions()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [confirm, setConfirm] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return quotations
      .filter(x => {
        if (filterStatus !== 'all' && x.status !== filterStatus) return false
        if (!q) return true
        return (
          x.correlative.toLowerCase().includes(q) ||
          x.client_name.toLowerCase().includes(q) ||
          x.ref?.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.correlative.localeCompare(a.correlative))
  }, [quotations, search, filterStatus])

  const handleNew = () => {
    newDraft('maintenance')
    onEdit()
  }
  const handleEdit = (id: string) => {
    loadQuote(id)
    onEdit()
  }

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateQuote(id)
      onEdit()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo duplicar el contrato')
    }
  }

  const handleNewVersion = async (id: string) => {
    try {
      await createVersion(id)
      onEdit()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear la nueva versión')
    }
  }

  const handleDelete = (id: string) => {
    deleteQuote(id)
    setConfirm(null)
  }

  return (
    <div className="q-list">
      <div className="q-list-toolbar">
        <div className="q-toolbar-left">
          <h2 className="q-title">Mantenciones</h2>
          <span className="q-count">
            {filtered.length} / {quotations.length}
          </span>
        </div>
        <div className="q-toolbar-right">
          <input
            className="q-search"
            placeholder="Buscar correlativo, cliente, referencia…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="q-filter"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            {Object.keys(STATUS_META).map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn-primary-sm" onClick={handleNew}>
            + Nuevo Contrato
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="q-empty">
          <p>No hay contratos de mantención{search ? ' que coincidan con la búsqueda' : ''}.</p>
          <button className="btn-primary-sm" onClick={handleNew}>
            Crear primer contrato
          </button>
        </div>
      ) : (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr>
                <th>Correlativo</th>
                <th>Cliente</th>
                <th className="text-right">N° Equipos</th>
                <th>Frecuencia</th>
                <th className="text-right">Valor/Visita</th>
                <th className="text-right">Valor Anual</th>
                <th>Vigencia desde</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => {
                const totals = calcTotals(q)
                const visits = q.visits_per_year ?? (q.frequency ? VISITS_PER_YEAR[q.frequency] : 0)
                const anual = totals.venta * visits
                return (
                  <tr key={q.id} className={q.id === activeId ? 'q-row-active' : ''}>
                    <td>
                      <span className="q-correlative">{q.correlative}</span>
                    </td>
                    <td>
                      <span className="q-client-name">
                        {q.client_name || <em className="q-empty-cell">Sin cliente</em>}
                      </span>
                    </td>
                    <td className="text-right">{q.equipment_count ?? '—'}</td>
                    <td>{q.frequency ? FREQUENCY_LABELS[q.frequency] : '—'}</td>
                    <td className="text-right q-total">{fmtCLP.format(totals.venta)}</td>
                    <td className="text-right q-total">{fmtCLP.format(anual)}</td>
                    <td className="q-date">
                      {q.contract_start_date ? fmtDate(q.contract_start_date) : '—'}
                    </td>
                    <td>
                      <select
                        className={`q-status-sel ${STATUS_META[q.status].cls}`}
                        value={q.status}
                        onChange={e => setStatus(q.id, e.target.value as QuoteStatus)}
                        onClick={e => e.stopPropagation()}
                        disabled={!canChangeQuotationStatus}
                        title={
                          canChangeQuotationStatus ? undefined : 'Tu rol no puede cambiar el estado'
                        }
                      >
                        {Object.keys(STATUS_META).map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="q-row-actions">
                        <button
                          className="btn-icon"
                          title="Editar"
                          onClick={() => handleEdit(q.id)}
                        >
                          ✎
                        </button>
                        <button
                          className="btn-icon"
                          title="Duplicar"
                          onClick={() => handleDuplicate(q.id)}
                        >
                          ⧉
                        </button>
                        <button
                          className="btn-icon btn-icon-version"
                          title="Nueva versión (mismo N°, para reestudiar margen)"
                          onClick={() => handleNewVersion(q.id)}
                        >
                          V+
                        </button>
                        {canDeleteQuotation && (
                          <button
                            className="btn-icon btn-danger"
                            title="Eliminar"
                            onClick={() => setConfirm(q.id)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal-confirm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar contrato de mantención?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <div className="modal-confirm-actions">
              <button className="btn-danger-sm" onClick={() => handleDelete(confirm)}>
                Eliminar
              </button>
              <button className="btn-outline-sm" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Base ──────────────────────────────────────────────────────────────────

function TabBaseMtc() {
  const { clients, patchActive, saveActive, reloadActive } = useMaestro()
  const q = useActiveQuotation()
  const [saving, setSaving] = useState(false)
  if (!q) return null

  const patch = (fields: Partial<typeof q>) => patchActive(fields)

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveActive()
    } catch (err) {
      await reportSaveError(err, reloadActive)
    } finally {
      setSaving(false)
    }
  }

  const visits = q.frequency ? VISITS_PER_YEAR[q.frequency] : (q.visits_per_year ?? 0)

  return (
    <div className="tab-base">
      <div className="base-grid">
        <div className="base-card">
          <div className="base-card-title">Identificación</div>
          <div className="base-row">
            <label>Correlativo</label>
            <span className="q-correlative-large">{q.correlative}</span>
          </div>
          <div className="base-row">
            <label>Fecha cotización</label>
            <input
              type="date"
              value={q.date}
              onChange={e => patch({ date: e.target.value })}
              className="base-input"
            />
          </div>
          <div className="base-row">
            <label>Referencia</label>
            <input
              value={q.ref}
              onChange={e => patch({ ref: e.target.value })}
              className="base-input"
              placeholder="Ref. contrato u obra"
            />
          </div>
          <div className="base-row">
            <label>Usuario final</label>
            <input
              value={q.enduser}
              onChange={e => patch({ enduser: e.target.value })}
              className="base-input"
              placeholder="Empresa usuaria final"
            />
          </div>
          <div className="base-row">
            <label>Estado comercial</label>
            <select
              value={q.status}
              className={`base-input q-status-sel ${STATUS_META[q.status].cls}`}
              onChange={e => patch({ status: e.target.value as QuoteStatus })}
            >
              {Object.keys(STATUS_META).map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="base-card">
          <div className="base-card-title">Cliente</div>
          <div className="base-row">
            <label>Empresa</label>
            <select
              value={q.client_id}
              className="base-input"
              onChange={e => {
                const cl = clients.find(c => c.id === e.target.value)
                patch({
                  client_id: e.target.value,
                  client_name: cl?.name || '',
                  contact: cl?.contact || '',
                })
              }}
            >
              <option value="">— Seleccionar cliente —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="base-row">
            <label>Contacto</label>
            <input
              value={q.contact}
              onChange={e => patch({ contact: e.target.value })}
              className="base-input"
              placeholder="Nombre del contacto"
            />
          </div>
          <div className="base-row">
            <label>RUT</label>
            <span className="base-rut">{clients.find(c => c.id === q.client_id)?.rut || '—'}</span>
          </div>
          <div className="base-row">
            <label>Ciudad</label>
            <span className="base-rut">{clients.find(c => c.id === q.client_id)?.city || '—'}</span>
          </div>
        </div>

        <div className="base-card">
          <div className="base-card-title">Equipos y Frecuencia</div>
          <div className="base-row">
            <label>N° de equipos</label>
            <input
              type="number"
              min="0"
              className="base-input"
              value={q.equipment_count ?? ''}
              onChange={e =>
                patch({
                  equipment_count:
                    e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0),
                })
              }
            />
          </div>
          <div className="base-row">
            <label>Descripción</label>
            <input
              className="base-input"
              value={q.equipment_description ?? ''}
              onChange={e => patch({ equipment_description: e.target.value })}
              placeholder="Ej: Equipos split y VRF de climatización"
            />
          </div>
          <div className="base-row">
            <label>Fecha inicio vigencia</label>
            <input
              type="date"
              value={q.contract_start_date ?? ''}
              onChange={e => patch({ contract_start_date: e.target.value })}
              className="base-input"
            />
          </div>
          <div className="base-row">
            <label>Frecuencia</label>
            <select
              value={q.frequency ?? ''}
              className="base-input"
              onChange={e => {
                const freq = (e.target.value || null) as MtcFrequency | null
                patch({ frequency: freq, visits_per_year: freq ? VISITS_PER_YEAR[freq] : null })
              }}
            >
              <option value="">— Seleccionar —</option>
              {(Object.keys(FREQUENCY_LABELS) as MtcFrequency[]).map(f => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="base-row">
            <label>Visitas / año</label>
            <span className="base-rut">{visits || '—'}</span>
          </div>
        </div>
      </div>

      <div className="base-save-row">
        <button className="btn-save-quote" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar encabezado'}
        </button>
      </div>
    </div>
  )
}

// ── Tab Documento ──────────────────────────────────────────────────────────────

function TabDocumentoMtc() {
  const q = useActiveQuotation()
  const { clients, saveActive, reloadActive, patchActive } = useMaestro()
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingDocx, setLoadingDocx] = useState(false)
  const [loadingPdf, setLoadingPdf] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)

  const sessionUser = useMemo(() => {
    try {
      const u = localStorage.getItem('user')
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  }, [])

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3200)
  }, [])

  if (!q) return null

  const client = clients.find(c => c.id === q.client_id)

  // "Costeo" siempre calcula el valor de UNA visita — el total anual es esa
  // cifra multiplicada por la frecuencia contratada (ver decisión del plan).
  const totals = calcTotals(q)
  const ivaVisita = totals.venta * (q.iva / 100)
  const totalVisitaConIva = totals.venta + ivaVisita

  const visits = q.visits_per_year ?? (q.frequency ? VISITS_PER_YEAR[q.frequency] : 0)
  const netoAnual = totals.venta * visits
  const ivaAnual = netoAnual * (q.iva / 100)
  const totalAnualConIva = netoAnual + ivaAnual
  const enUF = q.uf > 0 ? totalAnualConIva / q.uf : 0
  const enUSD = q.usd > 0 ? totalAnualConIva / q.usd : 0

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveActive()
      showToast('Cambios guardados correctamente')
    } catch (err) {
      await reportSaveError(err, reloadActive)
      showToast('No se pudo guardar en el servidor', false)
    } finally {
      setSaving(false)
    }
  }

  const handleDocx = async () => {
    setLoadingDocx(true)
    try {
      await downloadDocx({
        q,
        client,
        sessionUserName: sessionUser?.name || '—',
        expandedCategoryIds: expandedCats,
      })
      showToast('Documento DOCX generado')
    } catch {
      showToast('Error al generar DOCX', false)
    } finally {
      setLoadingDocx(false)
    }
  }

  const handleHtml = () => {
    try {
      downloadHtml({
        q,
        client,
        sessionUserName: sessionUser?.name || '—',
        expandedCategoryIds: expandedCats,
      })
      showToast('Documento HTML generado')
    } catch {
      showToast('Error al generar HTML', false)
    }
  }

  const handlePdf = async () => {
    if (!docRef.current) return
    setLoadingPdf(true)
    try {
      await downloadPdfFromElement(docRef.current, `Mantencion-${q.correlative}-${q.date}.pdf`)
      showToast('Documento PDF generado')
    } catch {
      showToast('Error al generar PDF', false)
    } finally {
      setLoadingPdf(false)
    }
  }

  const toggleCat = (catId: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(catId) ? next.delete(catId) : next.add(catId)
      return next
    })
  }

  return (
    <div className="tab-coti">
      {toast && (
        <div className={`coti-toast ${toast.ok ? 'coti-toast-ok' : 'coti-toast-err'}`}>
          <span className="coti-toast-icon">{toast.ok ? '✓' : '✕'}</span>
          {toast.msg}
        </div>
      )}

      <div className="coti-toolbar no-print">
        <button className="btn-act btn-act-save" onClick={handleSave} disabled={saving}>
          {saving ? <span className="btn-spinner" /> : <span>💾</span>}
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <div className="coti-toolbar-sep" />
        <button className="btn-act btn-act-docx" onClick={handleDocx} disabled={loadingDocx}>
          {loadingDocx ? <span className="btn-spinner" /> : <span className="btn-act-icon">W</span>}
          {loadingDocx ? 'Generando…' : 'Descargar DOCX'}
        </button>
        <button className="btn-act btn-act-html" onClick={handleHtml}>
          <span className="btn-act-icon">&lt;/&gt;</span>
          Descargar HTML
        </button>
        <button className="btn-act btn-act-print" onClick={handlePdf} disabled={loadingPdf}>
          <span>🖨</span>
          {loadingPdf ? 'Generando...' : 'Descargar PDF'}
        </button>
        <div className="coti-toolbar-sep" />
        <label className="mtc-currency-toggle">
          <input
            type="checkbox"
            checked={q.show_uf_equivalent}
            onChange={e => patchActive({ show_uf_equivalent: e.target.checked })}
          />
          Mostrar UF
        </label>
        <label className="mtc-currency-toggle">
          <input
            type="checkbox"
            checked={q.show_usd_equivalent}
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
              onChange={e => patchActive({ usd: parseFloat(e.target.value) || 0 })}
            />
          </div>
        )}
      </div>

      <div className="coti-doc" ref={docRef}>
        <div className="doc-letterhead">
          <div className="doc-lh-brand">
            <img src="/logo-nbyb.svg" alt="NβyB" className="doc-logo" />
          </div>
          <div className="doc-lh-docinfo">
            <div className="doc-doctype">Cotización de Mantención</div>
            <div className="doc-docnum">{q.correlative}</div>
            <div className="doc-docdate">Fecha: {fmtDateLong(q.date)}</div>
          </div>
        </div>
        <div className="doc-accent-rule" />

        <div className="doc-section-group">
          <div className="doc-group-title">Datos del Cliente</div>
          <table className="doc-client-table">
            <tbody>
              <tr>
                <th>Empresa</th>
                <td>{q.client_name || '—'}</td>
                <th>RUT</th>
                <td>{client?.rut || '—'}</td>
              </tr>
              <tr>
                <th>Contacto</th>
                <td>{q.contact || '—'}</td>
                <th>Cargo</th>
                <td>{client?.cargo || '—'}</td>
              </tr>
              <tr>
                <th>Referencia</th>
                <td colSpan={3}>{q.ref || '—'}</td>
              </tr>
              {q.enduser && (
                <tr>
                  <th>Usuario Final</th>
                  <td colSpan={3}>{q.enduser}</td>
                </tr>
              )}
              <tr className="doc-row-elaborado">
                <th>Elaborado por</th>
                <td colSpan={3}>{sessionUser?.name || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="doc-section">
          <div className="doc-section-title">I. ALCANCE DEL SERVICIO DE MANTENCIÓN</div>
          <EditableList items={q.scope} listKey="scope" />
        </div>

        <div className="doc-section">
          <div className="doc-section-title">II. EQUIPOS CUBIERTOS</div>
          <table className="doc-client-table">
            <tbody>
              <tr>
                <th>N° de equipos</th>
                <td colSpan={3}>{q.equipment_count ?? '—'}</td>
              </tr>
              <tr>
                <th>Descripción</th>
                <td colSpan={3}>{q.equipment_description || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="doc-section">
          <div className="doc-section-title">III. PLAN DE VISITAS</div>
          <table className="doc-client-table">
            <tbody>
              <tr>
                <th>Frecuencia</th>
                <td>{q.frequency ? FREQUENCY_LABELS[q.frequency] : '—'}</td>
                <th>Visitas / año</th>
                <td>{visits || '—'}</td>
              </tr>
              <tr>
                <th>Vigencia</th>
                <td colSpan={3}>
                  {q.contract_start_date
                    ? `Desde ${fmtDateLong(q.contract_start_date)}`
                    : 'A definir'}{' '}
                  · indefinida, con renovación automática salvo aviso de término
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="doc-section">
          <div className="doc-section-title">IV. VALORIZACIÓN</div>

          <div className="doc-group-title">Valor por visita</div>
          <table className="doc-valuation">
            <thead>
              <tr>
                <th className="val-expand no-print" />
                <th className="val-num">N°</th>
                <th>Descripción</th>
                <th className="text-right">Valor Neto CLP</th>
              </tr>
            </thead>
            <tbody>
              {buildQuotationValuationRows(q, expandedCats).map(row => {
                const items = (q.items[row.cat.id] || []).filter(it => it.cant > 0 && it.desc)
                const isOpen = row.details.length > 0
                return (
                  <React.Fragment key={row.cat.id}>
                    <tr className={`doc-valuation-row ${isOpen ? 'doc-row-expanded' : ''}`}>
                      <td className="val-expand no-print">
                        {items.length > 0 && (
                          <label
                            className="doc-expand-toggle"
                            title={isOpen ? 'Ocultar detalle' : 'Ver detalle'}
                          >
                            <input
                              type="checkbox"
                              checked={expandedCats.has(row.cat.id)}
                              onChange={() => toggleCat(row.cat.id)}
                            />
                            <span className="doc-expand-icon">{isOpen ? '▾' : '▸'}</span>
                          </label>
                        )}
                      </td>
                      <td className="val-num">{row.rowNumber}</td>
                      <td>{row.cat.label}</td>
                      <td className="text-right mono">{fmtCLP.format(row.venta)}</td>
                    </tr>
                    {row.details.map(({ item, meta }) => (
                      <tr key={item.id} className="doc-detail-row no-print-detail">
                        <td className="doc-detail-indent" colSpan={2} />
                        <td className="doc-detail-desc" colSpan={2}>
                          <span className="doc-detail-bullet">·</span>
                          <span className="doc-detail-name">{item.desc}</span>
                          <span className="doc-detail-meta">{meta}</span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="doc-subtotal">
                <td colSpan={3}>Subtotal Neto por Visita</td>
                <td className="text-right mono">{fmtCLP.format(totals.venta)}</td>
              </tr>
              <tr className="doc-iva-row">
                <td colSpan={3}>IVA ({q.iva}%)</td>
                <td className="text-right mono">{fmtCLP.format(ivaVisita)}</td>
              </tr>
              <tr className="doc-total">
                <td colSpan={3}>TOTAL POR VISITA CON IVA</td>
                <td className="text-right mono">{fmtCLP.format(totalVisitaConIva)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="doc-group-title mtc-annual-title">
            Valor anual estimado ({visits || 0} visitas/año)
          </div>
          <table className="doc-valuation">
            <tfoot>
              <tr className="doc-subtotal">
                <td colSpan={3}>Subtotal Neto Anual</td>
                <td className="text-right mono">{fmtCLP.format(netoAnual)}</td>
              </tr>
              <tr className="doc-iva-row">
                <td colSpan={3}>IVA ({q.iva}%)</td>
                <td className="text-right mono">{fmtCLP.format(ivaAnual)}</td>
              </tr>
              <tr className="doc-total">
                <td colSpan={3}>TOTAL ANUAL CON IVA</td>
                <td className="text-right mono">{fmtCLP.format(totalAnualConIva)}</td>
              </tr>
              {q.show_uf_equivalent && q.uf > 0 && (
                <tr className="doc-uf">
                  <td colSpan={3}>Equivalente en UF (ref. {fmtCLP.format(q.uf)}/UF)</td>
                  <td className="text-right mono">{enUF.toFixed(2)} UF</td>
                </tr>
              )}
              {q.show_usd_equivalent && q.usd > 0 && (
                <tr className="doc-uf">
                  <td colSpan={3}>Equivalente en USD (ref. {fmtCLP.format(q.usd)}/USD)</td>
                  <td className="text-right mono">US$ {fmtDecimal.format(enUSD)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="doc-section">
          <div className="doc-section-title">V. EXCLUSIONES</div>
          <EditableList items={q.exclusions} listKey="exclusions" />
        </div>

        <div className="doc-section">
          <div className="doc-section-title">VI. CONDICIONES COMERCIALES</div>
          <EditableList items={q.commercial} listKey="commercial" />
        </div>

        <div className="doc-footer">
          <div className="doc-footer-text">
            <p>Esta cotización es válida según las condiciones indicadas en el punto VI.</p>
            <p>
              Ingeniería y Servicios Bravo SPA &nbsp;·&nbsp; RUT: 77.175.319-1 &nbsp;·&nbsp; Tel.
              +56 (9) 90943080
            </p>
          </div>
          <div className="doc-footer-stamp">
            <div className="doc-footer-stamp-line" />
            <p>Firma y Timbre</p>
            <p>Representante Autorizado</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Maintenance ───────────────────────────────────────────────────────────

export const Maintenance: React.FC = () => {
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [activeTab, setActiveTab] = useState<'base' | 'costeo' | 'doc'>('base')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const { unsaved, saveActive, reloadActive } = useMaestro()
  const active = useActiveQuotation()

  const goList = () => {
    if (unsaved) {
      saveActive().catch(err => {
        window.alert(
          `No se pudo sincronizar con el servidor: ${err instanceof Error ? err.message : 'error desconocido'}.\n` +
            'Tus cambios quedaron guardados solo en este navegador.'
        )
      })
    }
    setView('list')
  }

  const goEdit = () => {
    setActiveTab('base')
    setView('edit')
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncStatus('idle')
    try {
      await saveActive()
      setSyncStatus('ok')
    } catch (err) {
      await reportSaveError(err, reloadActive)
      setSyncStatus('err')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }

  return (
    <div className="quotations-root">
      {view === 'list' ? (
        <MaintenanceList onEdit={goEdit} />
      ) : (
        <div className="q-editor">
          <div className="q-editor-header">
            <button type="button" className="btn-back" onClick={goList}>
              ← Listado
            </button>
            <div className="q-editor-title">
              <span className="q-correlative">{active?.correlative ?? '—'}</span>
              <span className="q-editor-client">{active?.client_name || 'Sin cliente'}</span>
              {unsaved && <span className="q-unsaved-dot" title="Cambios sin guardar" />}
            </div>
            <button
              type="button"
              className={`btn-sync${syncing ? ' btn-sync-loading' : ''}${syncStatus === 'ok' ? ' btn-sync-ok' : ''}${syncStatus === 'err' ? ' btn-sync-err' : ''}`}
              onClick={handleSync}
              disabled={syncing}
              title="Forzar sincronización al backend"
            >
              {syncing ? (
                <span className="btn-spinner btn-spinner-sm" />
              ) : syncStatus === 'ok' ? (
                <span>✓</span>
              ) : syncStatus === 'err' ? (
                <span>✕</span>
              ) : (
                <span>⇅</span>
              )}
              {syncing
                ? 'Sincronizando…'
                : syncStatus === 'ok'
                  ? 'Sincronizado'
                  : syncStatus === 'err'
                    ? 'Error al sync'
                    : 'Forzar sync'}
            </button>
            <div className="q-editor-tabs">
              <button
                type="button"
                className={`q-tab ${activeTab === 'base' ? 'q-tab-active' : ''}`}
                onClick={() => setActiveTab('base')}
              >
                Base
              </button>
              <button
                type="button"
                className={`q-tab ${activeTab === 'costeo' ? 'q-tab-active' : ''}`}
                onClick={() => setActiveTab('costeo')}
              >
                Costeo
              </button>
              <button
                type="button"
                className={`q-tab ${activeTab === 'doc' ? 'q-tab-active' : ''}`}
                onClick={() => setActiveTab('doc')}
              >
                Documento
              </button>
            </div>
          </div>

          <div className="q-tab-content">
            {activeTab === 'base' && <TabBaseMtc />}
            {activeTab === 'costeo' && <TabCosteo />}
            {activeTab === 'doc' && <TabDocumentoMtc />}
          </div>
        </div>
      )}
    </div>
  )
}

export default Maintenance
