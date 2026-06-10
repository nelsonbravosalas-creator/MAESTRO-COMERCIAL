import React, { useState, useMemo } from 'react'
import '../styles/Quotations.css'
import {
  useMaestro, useActiveQuotation, calcCat, calcTotals, fmtCLP,
} from '../stores/maestro-store'
import { CategoryId, QuoteStatus, OperState, CatalogItemUI } from '../types'
import { CatalogAutocomplete } from '../components/CatalogAutocomplete'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<QuoteStatus, { label: string; cls: string }> = {
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
    quotations, newDraft, loadQuote, duplicateQuote, deleteQuote,
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
  const handleDuplicate = (id: string) => { duplicateQuote(id); onEdit() }
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
                        value={q.operState}
                        onChange={e => setOperState(q.id, e.target.value as OperState)}
                        onClick={e => e.stopPropagation()}
                      >
                        {OP_STATES.map(s => <option key={s} value={s}>{s.trim() || '—'}</option>)}
                      </select>
                    </td>
                    <td className="text-right q-total">{fmtCLP.format(totals.venta)}</td>
                    <td>
                      <div className="q-row-actions">
                        <button className="btn-icon" title="Editar" onClick={() => handleEdit(q.id)}>✎</button>
                        <button className="btn-icon" title="Duplicar" onClick={() => handleDuplicate(q.id)}>⧉</button>
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
  const { clients, patchActive, saveActive } = useMaestro()
  const q = useActiveQuotation()
  if (!q) return null

  const patch = (fields: Partial<typeof q>) => patchActive(fields)

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
              value={q.operState}
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
        <button className="btn-save-quote" onClick={saveActive}>Guardar encabezado</button>
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
                return (
                  <tr key={item.id}>
                    <td className="col-idx">{i + 1}</td>
                    <td className="col-desc">
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
  const { patchActive, saveActive } = useMaestro()
  const q = useActiveQuotation()
  if (!q) return null

  const cats: CategoryId[] = ['mo', 'log', 'mat', 'rep', 'ins']
  const totals = calcTotals(q)
  const ivaRate = q.iva / 100
  const conIva = totals.venta * (1 + ivaRate)
  const enUF = q.uf > 0 ? totals.venta / q.uf : 0

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
            <strong>{enUF.toFixed(2)} UF</strong>
          </div>
        </div>
        <button type="button" className="btn-save-quote" onClick={saveActive}>Guardar</button>
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
                  <td className="text-right mono">{cat.margin}%</td>
                  <td className="text-right mono">{q.uf > 0 ? (r.venta / q.uf).toFixed(2) : '—'} UF</td>
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
                {totals.venta > 0 ? ((totals.beneficio / totals.venta) * 100).toFixed(1) : 0}%
              </td>
              <td className="text-right mono">{enUF.toFixed(2)} UF</td>
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

function EditableList({ items, listKey }: { items: string[]; listKey: 'scope' | 'exclusions' | 'commercial' }) {
  const { addListItem, removeListItem, patchListItem } = useMaestro()
  return (
    <ul className="doc-list">
      {items.map((item, i) => (
        <li key={i} className="doc-list-item">
          <input
            className="doc-list-input"
            aria-label={`Ítem ${i + 1}`}
            value={item}
            onChange={e => patchListItem(listKey, i, e.target.value)}
          />
          <button type="button" className="btn-icon-sm btn-del-row" onClick={() => removeListItem(listKey, i)}>✕</button>
        </li>
      ))}
      <li>
        <button type="button" className="btn-add-list" onClick={() => addListItem(listKey)}>+ Agregar ítem</button>
      </li>
    </ul>
  )
}

function TabCotizacion() {
  const q = useActiveQuotation()
  const { clients } = useMaestro()
  if (!q) return null

  const client = clients.find(c => c.id === q.client_id)
  const totals = calcTotals(q)
  const iva = totals.venta * (q.iva / 100)
  const conIva = totals.venta + iva
  const enUF = q.uf > 0 ? totals.venta / q.uf : 0

  const handlePrint = () => window.print()

  return (
    <div className="tab-coti">
      <div className="coti-actions no-print">
        <button type="button" className="btn-primary-sm" onClick={handlePrint}>🖨 Imprimir / Exportar PDF</button>
      </div>

      <div className="coti-doc">
        {/* Letterhead */}
        <div className="doc-header">
          <div className="doc-header-brand">
            <div className="doc-brand-name">MAESTRO COMERCIAL</div>
            <div className="doc-brand-tagline">Ingeniería y Servicios Técnicos</div>
          </div>
          <div className="doc-header-meta">
            <div className="doc-correlative">{q.correlative}</div>
            <div className="doc-date">Fecha: {fmtDate(q.date)}</div>
          </div>
        </div>

        {/* Client block */}
        <div className="doc-client-block">
          <table className="doc-client-table">
            <tbody>
              <tr>
                <td className="doc-label">Empresa</td>
                <td>{q.client_name || '—'}</td>
                <td className="doc-label">RUT</td>
                <td>{client?.rut || '—'}</td>
              </tr>
              <tr>
                <td className="doc-label">Contacto</td>
                <td>{q.contact || '—'}</td>
                <td className="doc-label">Cargo</td>
                <td>{client?.cargo || '—'}</td>
              </tr>
              <tr>
                <td className="doc-label">Referencia</td>
                <td colSpan={3}>{q.ref || '—'}</td>
              </tr>
              {q.enduser && (
                <tr>
                  <td className="doc-label">Usuario Final</td>
                  <td colSpan={3}>{q.enduser}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Scope */}
        <div className="doc-section">
          <div className="doc-section-title">I. ALCANCE DE LOS TRABAJOS</div>
          <EditableList items={q.scope} listKey="scope" />
        </div>

        {/* Valuación table */}
        <div className="doc-section">
          <div className="doc-section-title">II. VALORIZACIÓN DE TRABAJOS</div>
          <table className="doc-valuation">
            <thead>
              <tr>
                <th>N°</th>
                <th>Descripción</th>
                <th className="text-right">Valor Neto CLP</th>
              </tr>
            </thead>
            <tbody>
              {q.categories.map((cat, i) => {
                const r = calcCat(cat.id, q.categories, q.items)
                if (r.venta === 0) return null
                return (
                  <tr key={cat.id}>
                    <td>{i + 1}</td>
                    <td>{cat.label}</td>
                    <td className="text-right mono">{fmtCLP.format(r.venta)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="doc-subtotal">
                <td colSpan={2}>Subtotal Neto</td>
                <td className="text-right mono">{fmtCLP.format(totals.venta)}</td>
              </tr>
              <tr>
                <td colSpan={2}>IVA ({q.iva}%)</td>
                <td className="text-right mono">{fmtCLP.format(iva)}</td>
              </tr>
              <tr className="doc-total">
                <td colSpan={2}>TOTAL</td>
                <td className="text-right mono">{fmtCLP.format(conIva)}</td>
              </tr>
              {q.uf > 0 && (
                <tr className="doc-uf">
                  <td colSpan={2}>
                    Equivalente en UF (ref. {fmtCLP.format(q.uf)}/UF)
                  </td>
                  <td className="text-right mono">{enUF.toFixed(2)} UF</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* Exclusions */}
        <div className="doc-section">
          <div className="doc-section-title">III. EXCLUSIONES</div>
          <EditableList items={q.exclusions} listKey="exclusions" />
        </div>

        {/* Commercial conditions */}
        <div className="doc-section">
          <div className="doc-section-title">IV. CONDICIONES COMERCIALES</div>
          <EditableList items={q.commercial} listKey="commercial" />
        </div>

        {/* Footer */}
        <div className="doc-footer">
          <p>Esta cotización es válida según las condiciones indicadas en el punto IV.</p>
          <p>Documento generado por Maestro Comercial · {q.correlative}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main Quotations ────────────────────────────────────────────────────────────

export const Quotations: React.FC = () => {
  const [view, setView] = useState<'list' | 'edit'>('list')
  const { activeTab, setTab, unsaved, saveActive } = useMaestro()
  const active = useActiveQuotation()

  const goList = () => {
    if (unsaved) saveActive()
    setView('list')
  }

  const goEdit = () => setView('edit')

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
