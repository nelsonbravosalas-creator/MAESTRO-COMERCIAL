import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import '../styles/Quotations.css'
import {
  useMaestro, useActiveQuotation, calcCat, calcTotals, fmtCLP, fmtDecimal,
} from '../stores/maestro-store'
import { CategoryId, QuoteStatus, OperState, CatalogItemUI } from '../types'
import { CatalogAutocomplete } from '../components/CatalogAutocomplete'
import { ApiError } from '../api/api'
import { downloadDocx } from '../utils/docxExport'
import { downloadHtml } from '../utils/htmlExport'
import { CITIES, getDistance } from '../data/cityDistances'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Explica por qué falló saveActive() en vez de dejar que el botón muestre
// solo "offline"/"solo local" sin motivo. Compartido por los 4 botones de
// guardar de este archivo (header, Base, Costeo, Cotización) para que todos
// avisen lo mismo: conflicto de versión (409, ofrece recargar) o cualquier
// otro error (red, validación, sesión) con su mensaje real.
async function reportSaveError(err: unknown, reloadActive: () => Promise<void>) {
  if (err instanceof ApiError && err.status === 409) {
    const shouldReload = window.confirm(
      `${err.message}\n\n¿Recargar la versión del servidor? Perderás tus cambios locales no guardados.`
    )
    if (shouldReload) await reloadActive().catch(() => {})
    return
  }
  window.alert(err instanceof Error ? err.message : 'No se pudo guardar la cotización. Verifica tu conexión.')
}

const STATUS_META: Record<QuoteStatus, { label: string; cls: string }> = {
  Borrador:    { label: 'Borrador',    cls: 'st-borrador'    },
  Emitida:     { label: 'Emitida',     cls: 'st-emitida'     },
  Enviada:     { label: 'Enviada',     cls: 'st-enviada'     },
  Adjudicada:  { label: 'Adjudicada', cls: 'st-adjudicada'  },
  Perdida:     { label: 'Perdida',    cls: 'st-perdida'     },
  Anulada:     { label: 'Anulada',    cls: 'st-anulada'     },
}

const OP_STATES: OperState[] = ['Pendiente de ejecución', 'En ejecución', 'Terminada']

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ── Master List ────────────────────────────────────────────────────────────────

function QuotationsList({ onEdit }: { onEdit: () => void }) {
  const {
    quotations, newDraft, loadQuote, duplicateQuote, createVersion, deleteQuote,
    setStatus, setOperState, activeId,
  } = useMaestro()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [confirm, setConfirm] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return quotations
      .filter(x => {
        if (filterStatus !== 'all' && x.status !== filterStatus) return false
        if (!q) return true
        return x.correlative.toLowerCase().includes(q)
            || x.client_name.toLowerCase().includes(q)
            || x.ref?.toLowerCase().includes(q)
      })
      .sort((a, b) => b.correlative.localeCompare(a.correlative))
  }, [quotations, search, filterStatus])

  const handleNew = () => { newDraft(); onEdit() }
  const handleEdit = (id: string) => { loadQuote(id); onEdit() }

  // duplicateQuote/createVersion ya no crean una copia local "zombie" si el
  // backend rechaza el correlativo — si fallan, no hay nada que editar.
  const handleDuplicate = async (id: string) => {
    try {
      await duplicateQuote(id)
      onEdit()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo duplicar la cotización')
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

  const handleDelete = (id: string) => { deleteQuote(id); setConfirm(null) }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(quotations, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `maestro-cotizaciones-${new Date().toISOString().slice(0,10)}.json`; a.click()
  }

  return (
    <div className="q-list">
      {/* Toolbar */}
      <div className="q-list-toolbar">
        <div className="q-toolbar-left">
          <h2 className="q-title">Cotizaciones</h2>
          <span className="q-count">{filtered.length} / {quotations.length}</span>
        </div>
        <div className="q-toolbar-right">
          <input
            className="q-search"
            placeholder="Buscar correlativo, cliente, referencia…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="q-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">Todos los estados</option>
            {Object.keys(STATUS_META).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn-outline-sm" onClick={handleExport} title="Exportar JSON">
            ↓ Export
          </button>
          <button className="btn-primary-sm" onClick={handleNew}>
            + Nueva
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="q-empty">
          <p>No hay cotizaciones{search ? ' que coincidan con la búsqueda' : ''}.</p>
          <button className="btn-primary-sm" onClick={handleNew}>Crear primera cotización</button>
        </div>
      ) : (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr>
                <th>Correlativo</th>
                <th>Cliente</th>
                <th>Referencia</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Op. Estado</th>
                <th className="text-right">Neto CLP</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => {
                const totals = calcTotals(q)
                const venta = totals.venta > 0 ? totals.venta : (q.total ?? 0)
                return (
                  <tr key={q.id} className={q.id === activeId ? 'q-row-active' : ''}>
                    <td>
                      <span className="q-correlative">{q.correlative}</span>
                    </td>
                    <td>
                      <span className="q-client-name">{q.client_name || <em className="q-empty-cell">Sin cliente</em>}</span>
                    </td>
                    <td>
                      <span className="q-ref">{q.ref || '—'}</span>
                    </td>
                    <td className="q-date">{fmtDate(q.date)}</td>
                    <td>
                      <select
                        className={`q-status-sel ${STATUS_META[q.status].cls}`}
                        value={q.status}
                        onChange={e => setStatus(q.id, e.target.value as QuoteStatus)}
                        onClick={e => e.stopPropagation()}
                      >
                        {Object.keys(STATUS_META).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="q-opstate-sel"
                        value={q.operState ?? ''}
                        onChange={e => setOperState(q.id, e.target.value as OperState)}
                        onClick={e => e.stopPropagation()}
                      >
                        {OP_STATES.map(s => <option key={s} value={s}>{s.trim() || '—'}</option>)}
                      </select>
                    </td>
                    <td className="text-right q-total">{fmtCLP.format(venta)}</td>
                    <td>
                      <div className="q-row-actions">
                        <button className="btn-icon" title="Editar" onClick={() => handleEdit(q.id)}>✎</button>
                        <button className="btn-icon" title="Duplicar" onClick={() => handleDuplicate(q.id)}>⧉</button>
                        <button
                          className="btn-icon btn-icon-version"
                          title="Nueva versión (mismo N°, para reestudiar margen)"
                          onClick={() => handleNewVersion(q.id)}
                        >
                          V+
                        </button>
                        <button className="btn-icon btn-danger" title="Eliminar" onClick={() => setConfirm(q.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirm && (
        <div className="modal-overlay" onClick={() => setConfirm(null)}>
          <div className="modal-confirm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar cotización?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <div className="modal-confirm-actions">
              <button className="btn-danger-sm" onClick={() => handleDelete(confirm)}>Eliminar</button>
              <button className="btn-outline-sm" onClick={() => setConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tab Base ──────────────────────────────────────────────────────────────────

function TabBase() {
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

  return (
    <div className="tab-base">
      <div className="base-grid">
        {/* Correlativo + fecha */}
        <div className="base-card">
          <div className="base-card-title">Identificación</div>
          <div className="base-row">
            <label>Correlativo</label>
            <span className="q-correlative-large">{q.correlative}</span>
          </div>
          <div className="base-row">
            <label>Fecha</label>
            <input type="date" value={q.date} onChange={e => patch({ date: e.target.value })} className="base-input" />
          </div>
          <div className="base-row">
            <label>Referencia obra</label>
            <input value={q.ref} onChange={e => patch({ ref: e.target.value })} className="base-input" placeholder="Ref. proyecto u obra" />
          </div>
          <div className="base-row">
            <label>Usuario final</label>
            <input value={q.enduser} onChange={e => patch({ enduser: e.target.value })} className="base-input" placeholder="Empresa usuaria final" />
          </div>
        </div>

        {/* Cliente */}
        <div className="base-card">
          <div className="base-card-title">Cliente</div>
          <div className="base-row">
            <label>Empresa</label>
            <select
              value={q.client_id}
              className="base-input"
              onChange={e => {
                const cl = clients.find(c => c.id === e.target.value)
                patch({ client_id: e.target.value, client_name: cl?.name || '', contact: cl?.contact || '' })
              }}
            >
              <option value="">— Seleccionar cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="base-row">
            <label>Contacto</label>
            <input value={q.contact} onChange={e => patch({ contact: e.target.value })} className="base-input" placeholder="Nombre del contacto" />
          </div>
          <div className="base-row">
            <label>RUT</label>
            <span className="base-rut">
              {clients.find(c => c.id === q.client_id)?.rut || '—'}
            </span>
          </div>
          <div className="base-row">
            <label>Ciudad</label>
            <span className="base-rut">
              {clients.find(c => c.id === q.client_id)?.city || '—'}
            </span>
          </div>
        </div>

        {/* Estado */}
        <div className="base-card">
          <div className="base-card-title">Estado</div>
          <div className="base-row">
            <label>Estado comercial</label>
            <select
              value={q.status}
              className={`base-input q-status-sel ${STATUS_META[q.status].cls}`}
              onChange={e => patch({ status: e.target.value as QuoteStatus })}
            >
              {Object.keys(STATUS_META).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="base-row">
            <label>Estado operativo</label>
            <select
              value={q.operState ?? ''}
              className="base-input"
              onChange={e => patch({ operState: e.target.value as OperState })}
            >
              {OP_STATES.map(s => <option key={s} value={s}>{s.trim() || '—'}</option>)}
            </select>
          </div>
          <div className="base-row">
            <label>UF referencia</label>
            <input type="number" value={q.uf} onChange={e => patch({ uf: parseFloat(e.target.value) || 0 })} className="base-input" />
          </div>
          <div className="base-row">
            <label>IVA %</label>
            <input type="number" value={q.iva} onChange={e => patch({ iva: parseFloat(e.target.value) || 19 })} className="base-input" min="0" max="100" />
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

// ── Tab Costeo ─────────────────────────────────────────────────────────────────

function CosteoRow({ catId }: { catId: CategoryId }) {
  const { addItem, removeItem, patchItem, setCatMargin, toggleCat } = useMaestro()
  const q = useActiveQuotation()
  if (!q) return null

  const cat = q.categories.find(c => c.id === catId)!
  const items = q.items[catId] || []
  const { costo, venta, beneficio } = calcCat(catId, q.categories, q.items)
  const isMO = catId === 'mo'

  return (
    <div className="cost-accordion" style={{ '--cat-color': cat.color } as React.CSSProperties}>
      {/* Accordion header */}
      <div className="cost-acc-header" style={{ background: cat.color }}>
        <button
          className="cost-acc-collapse"
          onClick={() => toggleCat(catId, 'collapsed')}
          aria-label={cat.collapsed ? 'Expandir' : 'Colapsar'}
        >
          {cat.collapsed ? '▶' : '▼'}
        </button>
        <span className="cost-acc-label">{cat.label}</span>
        <div className="cost-acc-margin">
          <span>Margen</span>
          <input
            type="number"
            className="cost-margin-input"
            value={cat.margin}
            min={0} max={99}
            onChange={e => setCatMargin(catId, parseFloat(e.target.value) || 0)}
            onClick={e => e.stopPropagation()}
          />
          <span>%</span>
        </div>
        <div className="cost-acc-totals">
          <span className="cost-acc-stat">
            <em>Costo</em> {fmtCLP.format(costo)}
          </span>
          <span className="cost-acc-stat">
            <em>Venta</em> {fmtCLP.format(venta)}
          </span>
          <span className="cost-acc-stat">
            <em>Margen $</em> {fmtCLP.format(beneficio)}
          </span>
        </div>
      </div>

      {/* Accordion body */}
      {!cat.collapsed && (
        <div className="cost-acc-body">
          <table className="cost-items-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-desc">Descripción</th>
                <th className="col-unit">Unidad</th>
                <th className="col-cant">Cant.</th>
                {isMO && <th className="col-days">Días</th>}
                <th className="col-price">Precio Unit. CLP</th>
                <th className="col-total">Total CLP</th>
                <th className="col-del"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const rowTotal = item.cant * (item.days ?? 1) * item.unit
                const isDistCalc = item.desc === 'Cálculo de Distancias'
                return (
                  <tr key={item.id}>
                    <td className="col-idx">{i + 1}</td>
                    <td className="col-desc">
                      {isDistCalc ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <select
                            className="cost-item-input"
                            value={item.puntoA ?? ''}
                            onChange={e => {
                              patchItem(catId, i, 'puntoA', e.target.value)
                              const dist = getDistance(e.target.value, item.puntoB ?? '')
                              if (dist !== null) patchItem(catId, i, 'cant', String(dist))
                            }}
                            aria-label="Punto A"
                            style={{ flex: 1 }}
                          >
                            <option value="">Punto A…</option>
                            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>→</span>
                          <select
                            className="cost-item-input"
                            value={item.puntoB ?? ''}
                            onChange={e => {
                              patchItem(catId, i, 'puntoB', e.target.value)
                              const dist = getDistance(item.puntoA ?? '', e.target.value)
                              if (dist !== null) patchItem(catId, i, 'cant', String(dist))
                            }}
                            aria-label="Punto B"
                            style={{ flex: 1 }}
                          >
                            <option value="">Punto B…</option>
                            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ) : (
                        <CatalogAutocomplete
                          catId={catId}
                          value={item.desc}
                          onChange={val => patchItem(catId, i, 'desc', val)}
                          onSelect={(sel: CatalogItemUI) => {
                            patchItem(catId, i, 'desc',   sel.desc)
                            patchItem(catId, i, 'unidad', sel.unidad)
                            patchItem(catId, i, 'unit',   sel.price)
                          }}
                        />
                      )}
                    </td>
                    <td className="col-unit">
                      <input
                        className="cost-item-input cost-item-sm"
                        value={item.unidad}
                        onChange={e => patchItem(catId, i, 'unidad', e.target.value)}
                        aria-label="Unidad"
                      />
                    </td>
                    <td className="col-cant">
                      <input
                        type="number"
                        className="cost-item-input cost-item-num"
                        value={item.cant || ''}
                        onChange={e => patchItem(catId, i, 'cant', e.target.value)}
                        min="0"
                        placeholder="0"
                      />
                    </td>
                    {isMO && (
                      <td className="col-days">
                        <input
                          type="number"
                          className="cost-item-input cost-item-num"
                          value={item.days ?? 1}
                          onChange={e => patchItem(catId, i, 'days', e.target.value)}
                          min="1"
                        />
                      </td>
                    )}
                    <td className="col-price">
                      <input
                        type="number"
                        className="cost-item-input cost-item-num"
                        value={item.unit || ''}
                        onChange={e => patchItem(catId, i, 'unit', e.target.value)}
                        min="0"
                        placeholder="0"
                      />
                    </td>
                    <td className="col-total">
                      <span className="cost-row-total">{fmtCLP.format(rowTotal)}</span>
                    </td>
                    <td className="col-del">
                      <button className="btn-icon-sm btn-del-row" onClick={() => removeItem(catId, i)} title="Eliminar fila">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button className="btn-add-row" onClick={() => addItem(catId)}>
            + Agregar fila
          </button>
        </div>
      )}
    </div>
  )
}

function TabCosteo() {
  const { patchActive, saveActive, reloadActive } = useMaestro()
  const q = useActiveQuotation()
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'ok' | 'offline'>('idle')

  if (!q) return null

  const cats: CategoryId[] = ['mo', 'log', 'mat', 'rep', 'ins']
  const totals = calcTotals(q)
  const ivaRate = q.iva / 100
  const conIva = totals.venta * (1 + ivaRate)
  const enUF = q.uf > 0 ? totals.venta / q.uf : 0

  const handleSave = async () => {
    setSaveState('saving')
    try {
      await saveActive()
      setSaveState('ok')
    } catch (err) {
      await reportSaveError(err, reloadActive)
      setSaveState('offline')
    } finally {
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  const saveLabel =
    saveState === 'saving' ? 'Guardando…' :
    saveState === 'ok'     ? '✓ Guardado' :
    saveState === 'offline'? '⚠ Solo local' :
    'Guardar'

  return (
    <div className="tab-costeo">
      {/* Config strip */}
      <div className="costeo-config">
        <div className="costeo-config-field">
          <label>UF Referencia</label>
          <div className="costeo-config-input-wrap">
            <span className="config-prefix">$</span>
            <input
              type="number"
              value={q.uf}
              onChange={e => patchActive({ uf: parseFloat(e.target.value) || 0 })}
              className="costeo-config-input"
            />
          </div>
        </div>
        <div className="costeo-config-field">
          <label>IVA</label>
          <div className="costeo-config-input-wrap">
            <input
              type="number"
              aria-label="IVA %"
              value={q.iva}
              onChange={e => patchActive({ iva: parseFloat(e.target.value) || 19 })}
              className="costeo-config-input costeo-config-sm"
              min="0" max="100"
            />
            <span className="config-suffix">%</span>
          </div>
        </div>
        <div className="costeo-summary-strip">
          <div className="costeo-kpi">
            <em>Costo Total</em>
            <strong>{fmtCLP.format(totals.costo)}</strong>
          </div>
          <div className="costeo-kpi highlight">
            <em>Venta Neta</em>
            <strong>{fmtCLP.format(totals.venta)}</strong>
          </div>
          <div className="costeo-kpi">
            <em>Beneficio</em>
            <strong>{fmtCLP.format(totals.beneficio)}</strong>
          </div>
          <div className="costeo-kpi">
            <em>Con IVA</em>
            <strong>{fmtCLP.format(conIva)}</strong>
          </div>
          <div className="costeo-kpi">
            <em>En UF</em>
            <strong>{fmtDecimal.format(enUF)} UF</strong>
          </div>
        </div>
        <button
          type="button"
          className={`btn-save-quote${saveState === 'ok' ? ' btn-save-ok' : saveState === 'offline' ? ' btn-save-warn' : ''}`}
          onClick={handleSave}
          disabled={saveState === 'saving'}
        >
          {saveLabel}
        </button>
      </div>

      {/* Summary table */}
      <div className="costeo-summary-table">
        <table>
          <thead>
            <tr>
              <th>Categoría</th>
              <th className="text-right">Costo Neto</th>
              <th className="text-right">Venta Neta</th>
              <th className="text-right">Beneficio</th>
              <th className="text-right">Margen %</th>
              <th className="text-right">En UF</th>
            </tr>
          </thead>
          <tbody>
            {q.categories.map(cat => {
              const r = calcCat(cat.id, q.categories, q.items)
              return (
                <tr key={cat.id}>
                  <td>
                    <span className="cat-dot" style={{ background: cat.color }}></span>
                    {cat.label}
                  </td>
                  <td className="text-right mono">{fmtCLP.format(r.costo)}</td>
                  <td className="text-right mono">{fmtCLP.format(r.venta)}</td>
                  <td className="text-right mono">{fmtCLP.format(r.beneficio)}</td>
                  <td className="text-right mono">{fmtDecimal.format(cat.margin)}%</td>
                  <td className="text-right mono">{q.uf > 0 ? fmtDecimal.format(r.venta / q.uf) : '—'} UF</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="summary-total-row">
              <td>TOTAL</td>
              <td className="text-right mono">{fmtCLP.format(totals.costo)}</td>
              <td className="text-right mono">{fmtCLP.format(totals.venta)}</td>
              <td className="text-right mono">{fmtCLP.format(totals.beneficio)}</td>
              <td className="text-right mono">
                {totals.venta > 0 ? fmtDecimal.format((totals.beneficio / totals.venta) * 100) : 0}%
              </td>
              <td className="text-right mono">{fmtDecimal.format(enUF)} UF</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Category accordions */}
      <div className="cost-accordions">
        {cats.map(c => <CosteoRow key={c} catId={c} />)}
      </div>
    </div>
  )
}

// ── Tab Cotización (Document) ──────────────────────────────────────────────────

function AutoTextarea({ value, onChange, ariaLabel }: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { resize() }, [value, resize])

  return (
    <textarea
      ref={ref}
      className="doc-list-textarea"
      aria-label={ariaLabel}
      value={value}
      rows={1}
      onChange={e => onChange(e.target.value)}
      onInput={resize}
    />
  )
}

function EditableList({ items, listKey }: { items: string[]; listKey: 'scope' | 'exclusions' | 'commercial' }) {
  const { addListItem, removeListItem, patchListItem } = useMaestro()
  return (
    <ol className="doc-list">
      {items.map((item, i) => (
        <li key={i} className="doc-list-item">
          <span className="doc-list-num">{i + 1}.</span>
          <AutoTextarea
            ariaLabel={`Ítem ${i + 1}`}
            value={item}
            onChange={v => patchListItem(listKey, i, v)}
          />
          <button type="button" className="btn-icon-sm btn-del-row" onClick={() => removeListItem(listKey, i)}>✕</button>
        </li>
      ))}
      <li className="doc-list-add">
        <button type="button" className="btn-add-list" onClick={() => addListItem(listKey)}>+ Agregar ítem</button>
      </li>
    </ol>
  )
}

const fmtDateLong = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

function TabCotizacion() {
  const q = useActiveQuotation()
  const { clients, saveActive, reloadActive } = useMaestro()
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [toast, setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingDocx, setLoadingDocx] = useState(false)

  const sessionUser = useMemo(() => {
    try { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null }
    catch { return null }
  }, [])

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3200)
  }, [])

  if (!q) return null

  const client = clients.find(c => c.id === q.client_id)
  const totals = calcTotals(q)
  const iva    = totals.venta * (q.iva / 100)
  const conIva = totals.venta + iva
  const enUF   = q.uf > 0 ? totals.venta / q.uf : 0

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
      await downloadDocx({ q, client, sessionUserName: sessionUser?.name || '—' })
      showToast('Documento DOCX generado')
    } catch { showToast('Error al generar DOCX', false) }
    finally { setLoadingDocx(false) }
  }

  const handleHtml = () => {
    try {
      downloadHtml({ q, client, sessionUserName: sessionUser?.name || '—' })
      showToast('Documento HTML generado')
    } catch { showToast('Error al generar HTML', false) }
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

      {/* Toast notification */}
      {toast && (
        <div className={`coti-toast ${toast.ok ? 'coti-toast-ok' : 'coti-toast-err'}`}>
          <span className="coti-toast-icon">{toast.ok ? '✓' : '✕'}</span>
          {toast.msg}
        </div>
      )}

      {/* Action toolbar */}
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
        <button className="btn-act btn-act-print" onClick={() => window.print()}>
          <span>🖨</span>
          Imprimir / PDF
        </button>
      </div>

      {/* ── Document (letter format) ── */}
      <div className="coti-doc">

        {/* Letterhead */}
        <div className="doc-letterhead">
          <div className="doc-lh-brand">
            <img src="/logo-nbyb.svg" alt="NβyB" className="doc-logo" />
          </div>
          <div className="doc-lh-docinfo">
            <div className="doc-doctype">Cotización de Servicios</div>
            <div className="doc-docnum">{q.correlative}</div>
            <div className="doc-docdate">Fecha: {fmtDateLong(q.date)}</div>
          </div>
        </div>
        <div className="doc-accent-rule" />

        {/* Client block */}
        <div className="doc-section-group">
          <div className="doc-group-title">Datos del Cliente</div>
          <table className="doc-client-table">
            <tbody>
              <tr>
                <th>Empresa</th><td>{q.client_name || '—'}</td>
                <th>RUT</th>   <td>{client?.rut || '—'}</td>
              </tr>
              <tr>
                <th>Contacto</th><td>{q.contact || '—'}</td>
                <th>Cargo</th>  <td>{client?.cargo || '—'}</td>
              </tr>
              <tr>
                <th>Referencia</th><td colSpan={3}>{q.ref || '—'}</td>
              </tr>
              {q.enduser && (
                <tr>
                  <th>Usuario Final</th><td colSpan={3}>{q.enduser}</td>
                </tr>
              )}
              <tr className="doc-row-elaborado">
                <th>Elaborado por</th><td colSpan={3}>{sessionUser?.name || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* I. Scope */}
        <div className="doc-section">
          <div className="doc-section-title">I. ALCANCE DE LOS TRABAJOS</div>
          <EditableList items={q.scope} listKey="scope" />
        </div>

        {/* II. Valuation */}
        <div className="doc-section">
          <div className="doc-section-title">II. VALORIZACIÓN DE TRABAJOS</div>
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
              {q.categories.map((cat, i) => {
                const r     = calcCat(cat.id, q.categories, q.items)
                if (r.venta === 0) return null
                const items  = (q.items[cat.id] || []).filter(it => it.cant > 0 && it.desc)
                const isOpen = expandedCats.has(cat.id)
                return (
                  <React.Fragment key={cat.id}>
                    <tr className={`doc-valuation-row ${isOpen ? 'doc-row-expanded' : ''}`}>
                      <td className="val-expand no-print">
                        {items.length > 0 && (
                          <label className="doc-expand-toggle" title={isOpen ? 'Ocultar detalle' : 'Ver detalle'}>
                            <input type="checkbox" checked={isOpen} onChange={() => toggleCat(cat.id)} />
                            <span className="doc-expand-icon">{isOpen ? '▾' : '▸'}</span>
                          </label>
                        )}
                      </td>
                      <td className="val-num">{i + 1}</td>
                      <td>{cat.label}</td>
                      <td className="text-right mono">{fmtCLP.format(r.venta)}</td>
                    </tr>
                    {/* Detalle expandido: solo descripción, cantidad y unidad —
                        sin valores unitarios ni totales de línea. */}
                    {isOpen && items.map(item => (
                      <tr key={item.id} className="doc-detail-row no-print-detail">
                        <td className="doc-detail-indent" colSpan={2} />
                        <td className="doc-detail-desc" colSpan={2}>
                          <span className="doc-detail-bullet">·</span>
                          <span className="doc-detail-name">{item.desc}</span>
                          <span className="doc-detail-meta">
                            {item.cant} {item.unidad}{item.days && item.days > 1 ? ` × ${item.days} días` : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="doc-subtotal">
                <td colSpan={3}>Subtotal Neto</td>
                <td className="text-right mono">{fmtCLP.format(totals.venta)}</td>
              </tr>
              <tr className="doc-iva-row">
                <td colSpan={3}>IVA ({q.iva}%)</td>
                <td className="text-right mono">{fmtCLP.format(iva)}</td>
              </tr>
              <tr className="doc-total">
                <td colSpan={3}>TOTAL CON IVA</td>
                <td className="text-right mono">{fmtCLP.format(conIva)}</td>
              </tr>
              {q.uf > 0 && (
                <tr className="doc-uf">
                  <td colSpan={3}>Equivalente en UF (ref. {fmtCLP.format(q.uf)}/UF)</td>
                  <td className="text-right mono">{enUF.toFixed(2)} UF</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* III. Exclusions */}
        <div className="doc-section">
          <div className="doc-section-title">III. EXCLUSIONES</div>
          <EditableList items={q.exclusions} listKey="exclusions" />
        </div>

        {/* IV. Commercial */}
        <div className="doc-section">
          <div className="doc-section-title">IV. CONDICIONES COMERCIALES</div>
          <EditableList items={q.commercial} listKey="commercial" />
        </div>

        {/* Footer */}
        <div className="doc-footer">
          <div className="doc-footer-text">
            <p>Esta cotización es válida según las condiciones indicadas en el punto IV.</p>
            <p>Ingeniería y Servicios Bravo SPA &nbsp;·&nbsp; RUT: 77.175.319-1 &nbsp;·&nbsp; Tel. +56 (9) 90943080</p>
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

// ── Main Quotations ────────────────────────────────────────────────────────────

export const Quotations: React.FC = () => {
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const { activeTab, setTab, unsaved, saveActive, reloadActive } = useMaestro()
  const active = useActiveQuotation()

  const goList = () => {
    // Fire-and-forget: no bloqueamos la navegación, pero si falla (p.ej. sin
    // cliente asignado, o red caída) el usuario debe enterarse — "unsaved"
    // queda en true y el punto naranja sigue visible al reabrir esta cotización.
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

  const goEdit = () => setView('edit')

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
        <QuotationsList onEdit={goEdit} />
      ) : (
        <div className="q-editor">
          {/* Editor header */}
          <div className="q-editor-header">
            <button type="button" className="btn-back" onClick={goList}>← Listado</button>
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
              {syncing ? 'Sincronizando…' : syncStatus === 'ok' ? 'Sincronizado' : syncStatus === 'err' ? 'Error al sync' : 'Forzar sync'}
            </button>
            <div className="q-editor-tabs">
              <button type="button"
                className={`q-tab ${activeTab === 'base' ? 'q-tab-active' : ''}`}
                onClick={() => setTab('base')}
              >
                Base
              </button>
              <button type="button"
                className={`q-tab ${activeTab === 'costeo' ? 'q-tab-active' : ''}`}
                onClick={() => setTab('costeo')}
              >
                Costeo
              </button>
              <button type="button"
                className={`q-tab ${activeTab === 'coti' ? 'q-tab-active' : ''}`}
                onClick={() => setTab('coti')}
              >
                Cotización
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div className="q-tab-content">
            {activeTab === 'base'   && <TabBase />}
            {activeTab === 'costeo' && <TabCosteo />}
            {activeTab === 'coti'   && <TabCotizacion />}
          </div>
        </div>
      )}
    </div>
  )
}

export default Quotations
