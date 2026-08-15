import React, { useState, useEffect, useCallback, useMemo } from 'react'
import '../styles/Invoices.css'
import {
  api,
  ApiError,
  type Invoice,
  type InvoiceDetail,
  type InvoicePayment as Payment,
  type InvoicePaymentState as PaymentState,
  type InvoiceSummary,
} from '../api/api'
import { usePermissions } from '../hooks/usePermissions'

// ── Helpers ───────────────────────────────────────────────────────────────────

const clp = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}`

const fecha = (v: string | null | undefined) =>
  v ? v.slice(0, 10).split('-').reverse().join('-') : '—'

const ESTADO_LABEL: Record<PaymentState, string> = {
  al_dia: 'Al día',
  por_vencer: 'Por vencer',
  vencida: 'Vencida',
  parcial: 'Pago parcial',
  parcial_vencida: 'Parcial vencida',
  pagada: 'Pagada',
  anulada: 'Anulada',
}

const METODOS = [
  ['transferencia', 'Transferencia'],
  ['cheque', 'Cheque'],
  ['efectivo', 'Efectivo'],
  ['tarjeta', 'Tarjeta'],
  ['otro', 'Otro'],
] as const

const hoy = () => new Date().toISOString().slice(0, 10)

// ── Modal de gestión de una factura ───────────────────────────────────────────

interface DetalleProps {
  invoiceId: string
  onClose: () => void
  onChanged: () => void
}

function DetalleFactura({ invoiceId, onClose, onChanged }: DetalleProps) {
  const { canChangeInvoiceStatus } = usePermissions()
  const [cargando, setCargando] = useState(true)
  const [inv, setInv] = useState<InvoiceDetail | null>(null)
  const [pagos, setPagos] = useState<Payment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Formulario de abono
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('transferencia')
  const [fechaPago, setFechaPago] = useState(hoy())
  const [referencia, setReferencia] = useState('')

  // Seguimiento
  const [observaciones, setObservaciones] = useState('')
  const [fechaSeguimiento, setFechaSeguimiento] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await api.getInvoice(invoiceId)
      setInv(data)
      setPagos(data.payments ?? [])
      setObservaciones(data.observations ?? '')
      setFechaSeguimiento(data.follow_up_date ? data.follow_up_date.slice(0, 10) : '')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la factura')
    } finally {
      setCargando(false)
    }
  }, [invoiceId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const saldo = Number(inv?.balance ?? 0)

  const registrarPago = async (e: React.FormEvent) => {
    e.preventDefault()
    const valor = Number(monto)
    if (!valor || valor <= 0) {
      setError('El monto del abono debe ser mayor que cero')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await api.addPayment(invoiceId, {
        amount: valor,
        method: metodo,
        paid_at: fechaPago,
        reference: referencia || null,
      })
      setMonto('')
      setReferencia('')
      await cargar()
      onChanged()
    } catch (e) {
      // El backend devuelve el saldo real cuando el abono lo excede: se muestra
      // tal cual para que el usuario pueda corregir sin adivinar.
      const apiMessage =
        e instanceof ApiError && e.data && typeof e.data === 'object' && 'message' in e.data
          ? (e.data as { message?: string }).message
          : undefined
      setError(apiMessage || (e instanceof Error ? e.message : 'No se pudo registrar el abono'))
    } finally {
      setGuardando(false)
    }
  }

  const eliminarPago = async (id: string) => {
    if (!window.confirm('¿Eliminar este abono? El saldo de la factura volverá a subir.')) return
    setGuardando(true)
    try {
      await api.deletePayment(id)
      await cargar()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el abono')
    } finally {
      setGuardando(false)
    }
  }

  const guardarSeguimiento = async () => {
    setGuardando(true)
    setError(null)
    try {
      await api.updateInvoiceFollowUp(invoiceId, {
        observations: observaciones || null,
        follow_up_date: fechaSeguimiento || null,
      })
      await cargar()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el seguimiento')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="inv-modal" onClick={e => e.stopPropagation()}>
        <div className="inv-modal-header">
          <h2>{cargando ? 'Cargando…' : `Factura ${inv?.number ?? ''}`}</h2>
          <button className="btn-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="inv-modal-body">
          {error && <div className="inv-alert">{error}</div>}

          {cargando ? (
            <div className="inv-loading">Cargando factura…</div>
          ) : (
            <>
              <div className="inv-grid">
                <div>
                  <div className="inv-card-label">Cliente</div>
                  <div style={{ fontWeight: 600 }}>{inv?.client_name ?? '—'}</div>
                </div>
                <div>
                  <div className="inv-card-label">Total</div>
                  <div className="inv-card-value">{clp(inv?.total_amount)}</div>
                </div>
                <div>
                  <div className="inv-card-label">Abonado</div>
                  <div className="inv-card-value">{clp(inv?.paid_amount)}</div>
                </div>
                <div>
                  <div className="inv-card-label">Saldo</div>
                  <div
                    className="inv-card-value"
                    style={{ color: saldo > 0 ? '#b91c1c' : '#065f46' }}
                  >
                    {clp(saldo)}
                  </div>
                </div>
                <div>
                  <div className="inv-card-label">Vencimiento</div>
                  <div>
                    {fecha(inv?.due_date)}
                    {(inv?.days_overdue ?? 0) > 0 && (
                      <span className="inv-mora">{inv?.days_overdue}d de mora</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="inv-card-label">Estado</div>
                  <span className={`inv-badge ${inv?.payment_state ?? 'al_dia'}`}>
                    {ESTADO_LABEL[(inv?.payment_state ?? 'al_dia') as PaymentState]}
                  </span>
                </div>
              </div>

              {/* ── Registrar abono ── */}
              {canChangeInvoiceStatus && saldo > 0 && (
                <>
                  <div className="inv-section-title">Registrar abono</div>
                  <form onSubmit={registrarPago}>
                    <div className="inv-grid">
                      <div className="inv-field">
                        <label htmlFor="pago-monto">Monto</label>
                        <input
                          id="pago-monto"
                          type="number"
                          min="1"
                          step="1"
                          value={monto}
                          onChange={e => setMonto(e.target.value)}
                          placeholder={String(Math.round(saldo))}
                        />
                      </div>
                      <div className="inv-field">
                        <label htmlFor="pago-fecha">Fecha de pago</label>
                        <input
                          id="pago-fecha"
                          type="date"
                          value={fechaPago}
                          onChange={e => setFechaPago(e.target.value)}
                        />
                      </div>
                      <div className="inv-field">
                        <label htmlFor="pago-metodo">Medio</label>
                        <select
                          id="pago-metodo"
                          value={metodo}
                          onChange={e => setMetodo(e.target.value)}
                        >
                          {METODOS.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="inv-field">
                        <label htmlFor="pago-ref">Referencia</label>
                        <input
                          id="pago-ref"
                          value={referencia}
                          onChange={e => setReferencia(e.target.value)}
                          placeholder="N° transferencia, cheque…"
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button type="submit" className="inv-btn is-primary" disabled={guardando}>
                        {guardando ? 'Guardando…' : 'Registrar abono'}
                      </button>
                    </div>
                  </form>
                </>
              )}

              {/* ── Historial de abonos ── */}
              <div className="inv-section-title">Abonos registrados ({pagos.length})</div>
              <div className="inv-payments-list">
                {pagos.length === 0 ? (
                  <div className="inv-empty">Sin abonos registrados</div>
                ) : (
                  pagos.map(p => (
                    <div className="inv-payment-row" key={p.id}>
                      <div>
                        <strong>{clp(p.amount)}</strong>
                        <div className="inv-payment-meta">
                          {fecha(p.paid_at)} · {p.method}
                          {p.reference ? ` · ${p.reference}` : ''}
                          {p.created_by_name ? ` · ${p.created_by_name}` : ''}
                        </div>
                      </div>
                      {canChangeInvoiceStatus && (
                        <button
                          className="inv-btn"
                          onClick={() => eliminarPago(p.id)}
                          disabled={guardando}
                          title="Eliminar abono"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* ── Seguimiento ── */}
              <div className="inv-section-title">Seguimiento de cobranza</div>
              <div className="inv-grid">
                <div className="inv-field">
                  <label htmlFor="seg-fecha">Próxima gestión</label>
                  <input
                    id="seg-fecha"
                    type="date"
                    value={fechaSeguimiento}
                    onChange={e => setFechaSeguimiento(e.target.value)}
                  />
                </div>
              </div>
              <div className="inv-field" style={{ marginTop: 12 }}>
                <label htmlFor="seg-obs">Observaciones</label>
                <textarea
                  id="seg-obs"
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  placeholder="Contacto, compromisos de pago, incidencias…"
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="inv-btn" onClick={guardarSeguimiento} disabled={guardando}>
                  Guardar seguimiento
                </button>
              </div>

              {inv?.factoring && (
                <>
                  <div className="inv-section-title">Factoring</div>
                  <div className="inv-grid">
                    <div>
                      <div className="inv-card-label">Empresa</div>
                      <div>{inv.factoring.company}</div>
                    </div>
                    <div>
                      <div className="inv-card-label">Anticipo</div>
                      <div>{clp(inv.factoring.advance_amount)}</div>
                    </div>
                    <div>
                      <div className="inv-card-label">Costo</div>
                      <div>{clp(inv.factoring.cost_amount)}</div>
                    </div>
                    <div>
                      <div className="inv-card-label">Estado</div>
                      <div>{inv.factoring.status}</div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="inv-modal-footer">
          <button className="inv-btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de creación de factura ──────────────────────────────────────────────

const DOC_TYPES = [
  ['factura_afecta', 'Factura Afecta'],
  ['factura_exenta', 'Factura Exenta'],
  ['nota_credito', 'Nota de Crédito'],
] as const

const PAYMENT_TERMS = [
  ['contado', 'Contado'],
  ['dias_15', '15 días'],
  ['dias_30', '30 días'],
  ['dias_60', '60 días'],
  ['dias_90', '90 días'],
] as const

interface NuevaFacturaProps {
  quotationId?: string
  onClose: () => void
  onCreated: () => void
}

function NuevaFactura({ quotationId, onClose, onCreated }: NuevaFacturaProps) {
  const [number, setNumber] = useState('')
  const [clientId, setClientId] = useState('')
  const [docType, setDocType] = useState('factura_afecta')
  const [date, setDate] = useState(hoy())
  const [paymentTerm, setPaymentTerm] = useState('dias_30')
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: 0 }])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [quotacionInfo, setQuotacionInfo] = useState<string | null>(null)
  const [cargandoQ, setCargandoQ] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getClients().then(cs => setClients(cs.map(c => ({ id: c.id, name: c.name })))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!quotationId) return
    setCargandoQ(true)
    api.getQuotation(quotationId).then(q => {
      setClientId(q.client_id)
      const label = `${q.correlative}${q.ref ? ` — ${q.ref}` : ''}`
      setQuotacionInfo(label)
      setItems([{
        description: `Cotización ${label}`,
        quantity: 1,
        unit_price: q.total ?? 0,
      }])
    }).catch(() => {
      setQuotacionInfo('(no se pudo cargar)')
    }).finally(() => setCargandoQ(false))
  }, [quotationId])

  const updateItem = (idx: number, field: string, value: string | number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!number.trim()) { setError('El N° de Factura es obligatorio (número SII)'); return }
    if (!clientId) { setError('Selecciona un cliente'); return }
    const validItems = items.filter(it => it.description.trim())
    if (validItems.length === 0) { setError('Agrega al menos un ítem con descripción'); return }

    setGuardando(true)
    setError(null)
    try {
      await api.createInvoice({
        number: number.trim(),
        client_id: clientId,
        quotation_id: quotationId ?? null,
        doc_type: docType,
        date,
        payment_term: paymentTerm,
        items: validItems.map(it => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
        })),
      })
      onCreated()
    } catch (e: any) {
      if (e?.status === 409) {
        setError(`El N° de Factura "${number.trim()}" ya existe. Usa otro número.`)
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo crear la factura')
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="inv-modal" onClick={e => e.stopPropagation()}>
        <div className="inv-modal-header">
          <h2>Nueva Factura</h2>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="inv-modal-body">
            {error && <div className="inv-alert">{error}</div>}
            {cargandoQ && <div className="inv-loading" style={{ padding: '8px 0' }}>Cargando cotización…</div>}

            {quotacionInfo && (
              <div className="inv-quotacion-link">
                Vinculada a cotización: <strong>{quotacionInfo}</strong>
              </div>
            )}

            <div className="inv-section-title">Datos del documento</div>
            <div className="inv-grid">
              <div className="inv-field" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="nf-number">N° Factura (SII) *</label>
                <input
                  id="nf-number"
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  placeholder="Ej: 334467"
                  required
                  autoFocus
                />
              </div>
              <div className="inv-field">
                <label htmlFor="nf-doctype">Tipo documento</label>
                <select id="nf-doctype" value={docType} onChange={e => setDocType(e.target.value)}>
                  {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="inv-field">
                <label htmlFor="nf-date">Fecha emisión</label>
                <input id="nf-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="inv-field">
                <label htmlFor="nf-term">Condición de pago</label>
                <select id="nf-term" value={paymentTerm} onChange={e => setPaymentTerm(e.target.value)}>
                  {PAYMENT_TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="inv-field" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="nf-client">Cliente *</label>
                <select id="nf-client" value={clientId} onChange={e => setClientId(e.target.value)} required>
                  <option value="">— Selecciona cliente —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="inv-section-title">
              Ítems
              <button type="button" className="inv-btn inv-add-item-btn" onClick={addItem}>+ Agregar ítem</button>
            </div>
            {items.map((item, idx) => (
              <div className="inv-item-row" key={idx}>
                <div className="inv-field inv-item-desc">
                  <input
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="Descripción"
                  />
                </div>
                <div className="inv-field inv-item-qty">
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', e.target.value)}
                    placeholder="Cant."
                  />
                </div>
                <div className="inv-field inv-item-price">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                    placeholder="Precio unit."
                  />
                </div>
                {items.length > 1 && (
                  <button type="button" className="inv-btn inv-remove-item-btn" onClick={() => removeItem(idx)} title="Quitar ítem">✕</button>
                )}
              </div>
            ))}
          </div>

          <div className="inv-modal-footer">
            <button type="button" className="inv-btn" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button type="submit" className="inv-btn is-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Crear Factura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function Invoices({
  initialQuotationId,
  onConsumeQuotationId,
}: {
  initialQuotationId?: string
  onConsumeQuotationId?: () => void
}) {
  const [facturas, setFacturas] = useState<Invoice[]>([])
  const [resumen, setResumen] = useState<InvoiceSummary | null>(null)
  const [filtro, setFiltro] = useState<string>('')
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [nuevaFactura, setNuevaFactura] = useState<{ quotationId?: string } | null>(null)

  // Si se llega desde cotizaciones, abrir el modal de creación automáticamente
  useEffect(() => {
    if (initialQuotationId) {
      setNuevaFactura({ quotationId: initialQuotationId })
      onConsumeQuotationId?.()
    }
  }, [initialQuotationId])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [lista, sum] = await Promise.all([
        api.getInvoices(filtro ? { state: filtro } : undefined),
        api.getInvoiceSummary(),
      ])
      setFacturas(lista)
      setResumen(sum)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las facturas')
    } finally {
      setCargando(false)
    }
  }, [filtro])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return facturas
    return facturas.filter(
      f => f.number?.toLowerCase().includes(q) || (f.client_name ?? '').toLowerCase().includes(q)
    )
  }, [facturas, busqueda])

  const tarjeta = (estado: PaymentState) => resumen?.by_state?.[estado] ?? { count: 0, balance: 0 }

  return (
    <div className="inv-root">
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <h1 className="inv-title">Facturación</h1>
          <span className="inv-count">
            {visibles.length} / {facturas.length}
          </span>
        </div>
        <div className="inv-toolbar-right">
          <input
            className="inv-input"
            placeholder="Buscar N° o cliente…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          <select className="inv-select" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="vencida">Vencidas</option>
            <option value="parcial_vencida">Parciales vencidas</option>
            <option value="por_vencer">Por vencer (7 días)</option>
            <option value="parcial">Con abono parcial</option>
            <option value="al_dia">Al día</option>
            <option value="pagada">Pagadas</option>
          </select>
          <button className="inv-btn is-primary" onClick={() => setNuevaFactura({})}>
            + Nueva Factura
          </button>
        </div>
      </div>

      <div className="inv-cards">
        <div className="inv-card is-primary">
          <div className="inv-card-label">Por cobrar</div>
          <div className="inv-card-value">{clp(resumen?.total_outstanding)}</div>
          <div className="inv-card-sub">saldo total pendiente</div>
        </div>
        <div className="inv-card is-danger">
          <div className="inv-card-label">Vencidas</div>
          <div className="inv-card-value">
            {clp(tarjeta('vencida').balance + tarjeta('parcial_vencida').balance)}
          </div>
          <div className="inv-card-sub">
            {tarjeta('vencida').count + tarjeta('parcial_vencida').count} facturas
          </div>
        </div>
        <div className="inv-card is-warning">
          <div className="inv-card-label">Por vencer</div>
          <div className="inv-card-value">{clp(tarjeta('por_vencer').balance)}</div>
          <div className="inv-card-sub">{tarjeta('por_vencer').count} en los próximos 7 días</div>
        </div>
        <div className="inv-card is-success">
          <div className="inv-card-label">Pagadas</div>
          <div className="inv-card-value">{tarjeta('pagada').count}</div>
          <div className="inv-card-sub">facturas cerradas</div>
        </div>
      </div>

      <div className="inv-table-wrap">
        {error && <div className="inv-alert">{error}</div>}

        {cargando ? (
          <div className="inv-loading">Cargando facturas…</div>
        ) : visibles.length === 0 ? (
          <div className="inv-loading">
            {facturas.length === 0
              ? 'Todavía no hay facturas registradas.'
              : 'Ninguna factura coincide con la búsqueda.'}
          </div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>N° Factura</th>
                <th>Cotización</th>
                <th>Cliente</th>
                <th>Emisión</th>
                <th>Vencimiento</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Abonado</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th>Estado</th>
                <th>Seguimiento</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(f => {
                const saldo = Number(f.balance ?? 0)
                return (
                  <tr key={f.id}>
                    <td>
                      <span className="inv-num">{f.number}</span>
                      {f.is_factored && (
                        <span className="inv-tag-factoring">
                          {f.factoring_type === 'confirming' ? 'CONF' : 'FACT'}
                        </span>
                      )}
                    </td>
                    <td>
                      {f.quotation_correlative
                        ? <span className="inv-quotacion-ref">{f.quotation_correlative}</span>
                        : <span className="inv-empty-cell">—</span>
                      }
                    </td>
                    <td>{f.client_name ?? '—'}</td>
                    <td>{fecha(f.date)}</td>
                    <td>
                      {fecha(f.due_date)}
                      {(f.days_overdue ?? 0) > 0 && saldo > 0 && (
                        <span className="inv-mora">+{f.days_overdue}d</span>
                      )}
                    </td>
                    <td className="inv-money">{clp(f.total_amount)}</td>
                    <td className="inv-money">{clp(f.paid_amount)}</td>
                    <td className={`inv-money ${saldo > 0 ? 'is-pending' : 'is-zero'}`}>
                      {clp(saldo)}
                    </td>
                    <td>
                      <span className={`inv-badge ${f.payment_state ?? 'al_dia'}`}>
                        {ESTADO_LABEL[(f.payment_state ?? 'al_dia') as PaymentState]}
                      </span>
                    </td>
                    <td>{fecha(f.follow_up_date)}</td>
                    <td>
                      <div className="inv-actions">
                        <button className="inv-btn is-primary" onClick={() => setDetalle(f.id)}>
                          Gestionar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {detalle && (
        <DetalleFactura
          invoiceId={detalle}
          onClose={() => setDetalle(null)}
          onChanged={() => void cargar()}
        />
      )}

      {nuevaFactura && (
        <NuevaFactura
          quotationId={nuevaFactura.quotationId}
          onClose={() => setNuevaFactura(null)}
          onCreated={() => { setNuevaFactura(null); void cargar() }}
        />
      )}
    </div>
  )
}
