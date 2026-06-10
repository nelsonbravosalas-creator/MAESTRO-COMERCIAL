import React, { useEffect, useState } from 'react'
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
  const { quotations, clients, apiReady } = useMaestro()
  const [kpis, setKpis]       = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getKPIs()
      .then((data: any) => setKpis(data.kpis ?? data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
