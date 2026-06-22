import React, { useEffect, useState, useCallback, useMemo } from 'react'
import '../styles/Dashboard.css'
import { useMaestro, fmtCLP, calcTotals, calcCat } from '../stores/maestro-store'
import api from '../api/api'
import type { CategoryId } from '../types'
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip,
  AreaChart, Area,
  LabelList,
} from 'recharts'

// ── Constants ────────────────────────────────────────────────────

const STATUS_CFG = [
  { key: 'Borrador',    color: '#94a3b8' },
  { key: 'Emitida',     color: '#64748b' },
  { key: 'Enviada',     color: '#2563eb' },
  { key: 'Adjudicada',  color: '#059669' },
  { key: 'Perdida',     color: '#dc2626' },
  { key: 'Anulada',     color: '#374151' },
] as const

const CAT_COLORS: Record<string, string> = {
  mo:  '#2563eb',
  log: '#0891b2',
  mat: '#059669',
  rep: '#7c3aed',
  ins: '#d97706',
}
const CAT_LABELS: Record<string, string> = {
  mo:  'M. de Obra',
  log: 'Logística',
  mat: 'Materiales',
  rep: 'Repuestos',
  ins: 'Insumos',
}

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: '12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
}

// ── Helpers ──────────────────────────────────────────────────────

function fmtM(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`
  return `$${Math.round(v)}`
}

function lastNMonths(n: number) {
  const result: { key: string; label: string }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
    result.push({ key, label })
  }
  return result
}

// ── KPIs from API ────────────────────────────────────────────────

interface KPIs {
  clientes_activos:      number
  cotizaciones_abiertas: number
  proyectos_en_curso:    number
  total_facturado:       number
  total_gasto_obra:      number
  margen_bruto_pct:      number
  pipeline_cotizaciones: number
}

// ── Main Component ───────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const { quotations, clients, apiReady, forceSyncAll } = useMaestro()
  const [kpis, setKpis]       = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchKPIs = useCallback(() =>
    api.getKPIs()
      .then((data: any) => setKpis(data.kpis ?? data))
      .catch(() => {}), [])

  useEffect(() => { fetchKPIs().finally(() => setLoading(false)) }, [fetchKPIs])

  const handleForceSync = useCallback(async () => {
    const result = await forceSyncAll()
    fetchKPIs()
    return result
  }, [forceSyncAll, fetchKPIs])

  // ── Derived data ─────────────────────────────────────────────

  const activeQuotes = useMemo(
    () => quotations.filter(q => q.status !== 'Anulada'),
    [quotations],
  )

  const pipeline = useMemo(
    () => quotations
      .filter(q => ['Emitida', 'Enviada'].includes(q.status))
      .reduce((s, q) => s + (q.total ?? 0), 0),
    [quotations],
  )

  const totalAdjudicado = useMemo(
    () => quotations
      .filter(q => q.status === 'Adjudicada')
      .reduce((s, q) => s + (q.total ?? 0), 0),
    [quotations],
  )

  const adjCount  = useMemo(() => quotations.filter(q => q.status === 'Adjudicada').length, [quotations])
  const perdCount = useMemo(() => quotations.filter(q => q.status === 'Perdida').length, [quotations])
  const tasaExito = (adjCount + perdCount) > 0
    ? Math.round((adjCount / (adjCount + perdCount)) * 100)
    : 0

  const avgMargin = useMemo(() => {
    const relevant = activeQuotes.filter(q => (q.total ?? 0) > 0)
    if (relevant.length === 0) return null
    let venta = 0, costo = 0
    relevant.forEach(q => { const t = calcTotals(q); venta += t.venta; costo += t.costo })
    return venta > 0 ? ((venta - costo) / venta) * 100 : null
  }, [activeQuotes])

  const ticketPromedio = useMemo(() => {
    const relevant = activeQuotes.filter(q => (q.total ?? 0) > 0)
    return relevant.length > 0
      ? relevant.reduce((s, q) => s + (q.total ?? 0), 0) / relevant.length
      : 0
  }, [activeQuotes])

  // Monthly trend (last 6 months)
  const monthlyData = useMemo(() => {
    const months = lastNMonths(6)
    const map: Record<string, { month: string; pipeline: number; adjudicado: number }> = {}
    months.forEach(m => { map[m.key] = { month: m.label, pipeline: 0, adjudicado: 0 } })
    quotations.forEach(q => {
      if (!q.date) return
      const key = q.date.slice(0, 7)
      if (!map[key]) return
      const total = q.total ?? 0
      if (['Emitida', 'Enviada'].includes(q.status)) map[key].pipeline    += total
      else if (q.status === 'Adjudicada')             map[key].adjudicado += total
    })
    return Object.values(map)
  }, [quotations])

  // Status pie (by amount; fallback to count)
  const statusPie = useMemo(() => {
    const rows = STATUS_CFG.map(s => ({
      name:  s.key,
      color: s.color,
      value: quotations.filter(q => q.status === s.key).reduce((a, q) => a + (q.total ?? 0), 0),
      count: quotations.filter(q => q.status === s.key).length,
    }))
    const hasAmounts = rows.some(r => r.value > 0)
    return rows
      .map(r => ({ ...r, pieValue: hasAmounts ? r.value : r.count }))
      .filter(r => r.count > 0)
  }, [quotations])

  // Top 5 clients by amount
  const topClients = useMemo(() => {
    const byClient: Record<string, number> = {}
    activeQuotes.forEach(q => {
      const name = q.client_name || 'Sin cliente'
      byClient[name] = (byClient[name] ?? 0) + (q.total ?? 0)
    })
    return Object.entries(byClient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({
        name:  name.length > 22 ? name.slice(0, 22) + '…' : name,
        value,
      }))
  }, [activeQuotes])

  // Category distribution
  const catData = useMemo(() => {
    const cats: Record<string, number> = { mo: 0, log: 0, mat: 0, rep: 0, ins: 0 }
    activeQuotes.forEach(q => {
      if (!q.items || !q.categories?.length) return
      ;(['mo', 'log', 'mat', 'rep', 'ins'] as CategoryId[]).forEach(cat => {
        cats[cat] += calcCat(cat, q.categories, q.items).venta
      })
    })
    return Object.entries(cats)
      .map(([cat, value]) => ({ name: CAT_LABELS[cat], value, color: CAT_COLORS[cat] }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [activeQuotes])

  // Recent 8 quotes (newest first)
  const recentQuotes = useMemo(
    () => [...quotations].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 8),
    [quotations],
  )

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="dashboard-container">

      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">
            {apiReady ? 'Conectado al servidor — datos en tiempo real' : 'Modo offline — datos locales'}
            <span className={`badge ${apiReady ? 'dev' : 'offline'}`} style={{ marginLeft: 8 }}>
              {apiReady ? 'Online' : 'Offline'}
            </span>
          </p>
        </div>
        <SyncButton onSync={handleForceSync} />
      </div>

      {/* KPI Grid (6 cards) */}
      <div className="kpi-grid kpi-grid--6">
        <KpiCard
          label="Pipeline Ventas"
          value={fmtCLP.format(kpis?.pipeline_cotizaciones ?? pipeline)}
          sub={`${(activeQuotes.filter(q => ['Emitida', 'Enviada'].includes(q.status)).length)} cotizaciones abiertas`}
          loading={loading}
          accent="#2563eb"
        />
        <KpiCard
          label="Total Adjudicado"
          value={fmtCLP.format(totalAdjudicado)}
          sub={`${adjCount} contrato${adjCount !== 1 ? 's' : ''} ganado${adjCount !== 1 ? 's' : ''}`}
          loading={false}
          accent="#059669"
        />
        <KpiCard
          label="Tasa de Éxito"
          value={`${tasaExito}%`}
          sub={`${adjCount} adj. / ${perdCount} perd.`}
          loading={false}
          accent={tasaExito >= 60 ? '#059669' : tasaExito >= 40 ? '#f59e0b' : '#dc2626'}
        />
        <KpiCard
          label="Margen Promedio"
          value={avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'}
          sub="sobre venta neta"
          loading={false}
          accent="#7c3aed"
        />
        <KpiCard
          label="Ticket Promedio"
          value={ticketPromedio > 0 ? fmtM(ticketPromedio) : '—'}
          sub="por cotización activa"
          loading={false}
          accent="#0891b2"
        />
        <KpiCard
          label="Clientes Activos"
          value={String(kpis?.clientes_activos ?? clients.length)}
          sub={`${quotations.length} cotizaciones en total`}
          loading={false}
          accent="#d97706"
        />
      </div>

      {/* Row 1: Tendencia mensual + Distribución estado */}
      <div className="dash-row dash-row--6-4">

        <div className="dashboard-card chart-card">
          <h3 className="chart-title">Tendencia de Pipeline — Últimos 6 Meses</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <defs>
                <linearGradient id="gPipeline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gAdj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#059669" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={60} />
              <ChartTooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [fmtCLP.format(Number(v)), name]}
              />
              <Area type="monotone" dataKey="pipeline"    name="En Cartera"  stroke="#2563eb" fill="url(#gPipeline)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="adjudicado"  name="Adjudicado"  stroke="#059669" fill="url(#gAdj)"      strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="chart-legend-row">
            <span className="chart-legend-dot" style={{ background: '#2563eb' }} />
            <span className="chart-legend-label">En Cartera</span>
            <span className="chart-legend-dot" style={{ background: '#059669', marginLeft: 16 }} />
            <span className="chart-legend-label">Adjudicado</span>
          </div>
        </div>

        <div className="dashboard-card chart-card">
          <h3 className="chart-title">Estado del Pipeline</h3>
          {statusPie.length > 0 ? (
            <>
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={statusPie}
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={78}
                      paddingAngle={2}
                      dataKey="pieValue"
                      strokeWidth={0}
                    >
                      {statusPie.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <ChartTooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(_v: any, _name: any, props: any) => {
                        const p = props.payload
                        return [
                          p.value > 0 ? `${fmtCLP.format(p.value)} · ${p.count} cot.` : `${p.count} cotización(es)`,
                          p.name,
                        ]
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center-label">
                  <span className="donut-total">{quotations.length}</span>
                  <span className="donut-sub">cotizaciones</span>
                </div>
              </div>
              <div className="pie-legend">
                {statusPie.map(s => (
                  <div key={s.name} className="pie-legend-item">
                    <span className="pie-dot" style={{ background: s.color }} />
                    <span className="pie-name">{s.name}</span>
                    <span className="pie-count">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="chart-empty">Sin cotizaciones registradas</div>
          )}
        </div>

      </div>

      {/* Row 2: Top clientes + Por categoría */}
      <div className="dash-row dash-row--5-5">

        <div className="dashboard-card chart-card">
          <h3 className="chart-title">Top Clientes por Monto Cotizado</h3>
          {topClients.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={topClients} layout="vertical" margin={{ top: 4, right: 80, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtM} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <ChartTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [fmtCLP.format(Number(v)), 'Total cotizado']} />
                <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="value" position="right" formatter={(v: any) => fmtM(Number(v))} style={{ fill: '#94a3b8', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">Sin clientes con cotizaciones activas</div>
          )}
        </div>

        <div className="dashboard-card chart-card">
          <h3 className="chart-title">Distribución por Categoría de Trabajo</h3>
          {catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={catData} margin={{ top: 4, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={55} />
                <ChartTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [fmtCLP.format(Number(v)), 'Venta neta']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {catData.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">
              Agrega ítems a las cotizaciones para ver la distribución por categoría
            </div>
          )}
        </div>

      </div>

      {/* Recent quotes table */}
      <div className="dashboard-card chart-card">
        <h3 className="chart-title">Cotizaciones Recientes</h3>
        <div className="recent-table-wrap">
          <table className="recent-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Cliente</th>
                <th>Referencia de Obra</th>
                <th>Fecha</th>
                <th>Est. Comercial</th>
                <th>Est. Operativo</th>
                <th style={{ textAlign: 'right' }}>Total Neto</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.length === 0 ? (
                <tr><td colSpan={7} className="empty-row">Sin cotizaciones registradas</td></tr>
              ) : recentQuotes.map(q => {
                const statusColor = STATUS_CFG.find(s => s.key === q.status)?.color ?? '#64748b'
                return (
                  <tr key={q.id}>
                    <td className="cell-mono">{q.correlative}</td>
                    <td className="cell-name">{q.client_name || '—'}</td>
                    <td className="cell-ref">{q.ref || '—'}</td>
                    <td className="cell-date">
                      {q.date ? new Date(q.date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{ background: statusColor + '20', color: statusColor, borderColor: statusColor + '50' }}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="cell-oper">{q.operState || '—'}</td>
                    <td className="cell-amount">{fmtCLP.format(q.total ?? 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {quotations.length > 8 && (
          <p className="table-footer-note">Mostrando las 8 cotizaciones más recientes de {quotations.length} en total.</p>
        )}
      </div>

    </div>
  )
}

// ── Sync Button ──────────────────────────────────────────────────

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
      type="button"
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

// ── KPI Card ─────────────────────────────────────────────────────

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
