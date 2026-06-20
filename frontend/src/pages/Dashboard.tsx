import React, { useEffect, useState, useCallback } from 'react'
import '../styles/Dashboard.css'
import { useMaestro, fmtCLP } from '../stores/maestro-store'
import api from '../api/api'

interface KPIs {
  clientes_activos:      number
  cotizaciones_abiertas: number
  proyectos_en_curso:    number
  total_facturado:       number
  total_gasto_obra:      number
  margen_bruto_pct:      number
  pipeline_cotizaciones: number
}

export const Dashboard: React.FC = () => {
  const { quotations, clients, apiReady, forceSyncAll } = useMaestro()
  const [kpis, setKpis]       = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchKPIs = useCallback(() =>
    api.getKPIs()
      .then((data: any) => setKpis(data.kpis ?? data))
      .catch(() => {}), [])

  useEffect(() => {
    fetchKPIs().finally(() => setLoading(false))
  }, [fetchKPIs])

  const handleForceSync = useCallback(async () => {
    const result = await forceSyncAll()
    fetchKPIs()
    return result
  }, [forceSyncAll, fetchKPIs])

  // Totales calculados localmente desde el store
  const byStatus = quotations.reduce<Record<string, number>>((acc, q) => {
    acc[q.status] = (acc[q.status] ?? 0) + 1
    return acc
  }, {})

  const pipelineLocal = quotations
    .filter(q => ['Emitida', 'Enviada'].includes(q.status))
    .reduce((s, q) => s + (q.total ?? 0), 0)

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">
            {apiReady
              ? 'Conectado al servidor — datos en tiempo real'
              : 'Modo offline — datos locales'}
            <span className={`badge ${apiReady ? 'dev' : 'offline'}`} style={{ marginLeft: 8 }}>
              {apiReady ? 'Online' : 'Offline'}
            </span>
          </p>
        </div>
        <SyncButton onSync={handleForceSync} />
      </div>

      {/* ── KPI Cards principales ── */}
      <div className="kpi-grid">
        <KpiCard
          label="Pipeline de Ventas"
          value={fmtCLP.format(kpis?.pipeline_cotizaciones ?? pipelineLocal)}
          sub="cotizaciones abiertas"
          loading={loading}
          accent="#2563eb"
        />
        <KpiCard
          label="Total Facturado"
          value={fmtCLP.format(kpis?.total_facturado ?? 0)}
          sub="acumulado del período"
          loading={loading}
          accent="#059669"
        />
        <KpiCard
          label="Margen Bruto"
          value={kpis ? `${kpis.margen_bruto_pct.toFixed(1)}%` : '—'}
          sub="sobre facturación"
          loading={loading}
          accent="#7c3aed"
        />
        <KpiCard
          label="Clientes"
          value={String(kpis?.clientes_activos ?? clients.length)}
          sub="activos registrados"
          loading={false}
          accent="#0891b2"
        />
      </div>

      {/* ── Cotizaciones por estado ── */}
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>Cotizaciones por Estado</h3>
          <ul className="status-list">
            {[
              { key: 'Emitida',    color: '#64748b' },
              { key: 'Enviada',    color: '#2563eb' },
              { key: 'Adjudicada', color: '#059669' },
              { key: 'Perdida',    color: '#dc2626' },
              { key: 'Anulada',    color: '#6b7280' },
            ].map(({ key, color }) => (
              <li key={key} className="status-item">
                <span className="status-dot" style={{ background: color }} />
                <span className="status-label">{key}</span>
                <span className="status-count">{byStatus[key] ?? 0}</span>
              </li>
            ))}
          </ul>
          <p className="card-total">Total: {quotations.length} cotizaciones</p>
        </div>

        <div className="dashboard-card">
          <h3>Resumen Operacional</h3>
          <ul className="status-list">
            <li className="status-item">
              <span className="status-dot" style={{ background: '#2563eb' }} />
              <span className="status-label">Cotizaciones abiertas</span>
              <span className="status-count">{kpis?.cotizaciones_abiertas ?? (byStatus['Emitida'] ?? 0) + (byStatus['Enviada'] ?? 0)}</span>
            </li>
            <li className="status-item">
              <span className="status-dot" style={{ background: '#059669' }} />
              <span className="status-label">Proyectos en curso</span>
              <span className="status-count">{kpis?.proyectos_en_curso ?? 0}</span>
            </li>
            <li className="status-item">
              <span className="status-dot" style={{ background: '#0891b2' }} />
              <span className="status-label">Clientes activos</span>
              <span className="status-count">{kpis?.clientes_activos ?? clients.length}</span>
            </li>
            <li className="status-item">
              <span className="status-dot" style={{ background: '#7c3aed' }} />
              <span className="status-label">Gasto en obra</span>
              <span className="status-count">{fmtCLP.format(kpis?.total_gasto_obra ?? 0)}</span>
            </li>
          </ul>
        </div>

        <div className="dashboard-card">
          <h3>Acciones Rápidas</h3>
          <ul>
            <li>Crear nueva cotización desde Cotizaciones</li>
            <li>Revisar pipeline de ventas</li>
            <li>Actualizar precios en Maestro de Precios</li>
            <li>Registrar nuevos clientes</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Sub-componente Sync Button ────────────────────────────────

type SyncPhase = 'idle' | 'syncing' | 'done' | 'error'
interface SyncResult { pushed: number; pulled: number; errors: number }

function SyncButton({ onSync }: { onSync: () => Promise<SyncResult> }) {
  const [phase, setPhase]   = useState<SyncPhase>('idle')
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleClick = async () => {
    if (phase === 'syncing') return
    setPhase('syncing')
    setResult(null)
    try {
      const r = await onSync()
      setResult(r)
      setPhase(r.errors > 0 ? 'error' : 'done')
    } catch {
      setPhase('error')
    }
    setTimeout(() => setPhase('idle'), 4500)
  }

  const label = (() => {
    if (phase === 'syncing') return 'Sincronizando…'
    if (phase === 'done' && result) {
      const total = result.pushed + result.pulled
      return total === 0 ? 'Todo al día' : `${total} ${total === 1 ? 'elemento' : 'elementos'} actualizados`
    }
    if (phase === 'error') return result?.errors ? `${result.errors} error${result.errors > 1 ? 'es' : ''}` : 'Error de conexión'
    return 'Forzar Sincronización'
  })()

  return (
    <button
      className={`sync-btn sync-btn--${phase}`}
      onClick={handleClick}
      disabled={phase === 'syncing'}
      title="Sube cotizaciones locales al servidor y descarga las que falten"
    >
      <span className="sync-btn__icon">
        {phase === 'idle'    && <IconSync />}
        {phase === 'syncing' && <IconSpinner />}
        {phase === 'done'    && <IconCheck />}
        {phase === 'error'   && <IconWarn />}
      </span>
      <span className="sync-btn__label">{label}</span>
      {phase === 'done' && result && (result.pushed > 0 || result.pulled > 0) && (
        <span className="sync-btn__counts">
          {result.pushed > 0 && <span>↑{result.pushed}</span>}
          {result.pulled > 0 && <span>↓{result.pulled}</span>}
        </span>
      )}
    </button>
  )
}

function IconSync() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"/>
      <path d="M3.51 15a9 9 0 0 0 14.85 3.36L23 14"/>
    </svg>
  )
}

function IconSpinner() {
  return (
    <svg className="spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2a10 10 0 1 0 10 10"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function IconWarn() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}

// ── Sub-componente KPI Card ────────────────────────────────────

interface KpiCardProps {
  label:   string
  value:   string
  sub:     string
  loading: boolean
  accent:  string
}

function KpiCard({ label, value, sub, loading, accent }: KpiCardProps) {
  return (
    <div className="kpi-card" style={{ borderTopColor: accent }}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value" style={{ color: accent }}>
        {loading ? <span className="kpi-skeleton" /> : value}
      </p>
      <p className="kpi-sub">{sub}</p>
    </div>
  )
}

export default Dashboard
