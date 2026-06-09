import React, { useEffect, useState } from 'react'
import '../styles/CostIndicator.css'

interface KPIs {
  total_invoiced: number
  total_costs: number
  margin: number
  margin_percentage: number
  projects_in_progress: number
  pending_quotations: number
}

export const CostIndicator: React.FC = () => {
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchKPIs = async () => {
      try {
        const token = localStorage.getItem('authToken')
        const response = await fetch('/api/dashboard/kpis', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error('Failed to fetch KPIs')
        }

        const data = await response.json()
        setKpis(data.kpis)
      } catch (err: any) {
        setError(err.message)
        console.error('Error fetching KPIs:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchKPIs()
    const interval = setInterval(fetchKPIs, 5 * 60 * 1000) // Refresh every 5 minutes
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="cost-indicator loading">
        <p>Cargando indicadores...</p>
      </div>
    )
  }

  if (error || !kpis) {
    return (
      <div className="cost-indicator error">
        <p>Error: {error || 'No se pudieron cargar los datos'}</p>
      </div>
    )
  }

  const isHealthyMargin = kpis.margin_percentage >= 20

  return (
    <div className="cost-indicator">
      <div className="indicator-container">
        <div className={`indicator-card total-invoiced ${isHealthyMargin ? 'healthy' : 'warning'}`}>
          <div className="indicator-label">Total Facturado</div>
          <div className="indicator-value">S/ {kpis.total_invoiced.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</div>
          <div className="indicator-period">Este mes</div>
        </div>

        <div className="indicator-card total-costs">
          <div className="indicator-label">Costos Totales</div>
          <div className="indicator-value">S/ {kpis.total_costs.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</div>
          <div className="indicator-period">Este mes</div>
        </div>

        <div className={`indicator-card margin ${isHealthyMargin ? 'success' : 'warning'}`}>
          <div className="indicator-label">Margen de Ganancia</div>
          <div className="indicator-value">
            {kpis.margin_percentage.toFixed(1)}%
          </div>
          <div className="indicator-subvalue">
            S/ {kpis.margin.toLocaleString('es-PE', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="indicator-card projects-in-progress">
          <div className="indicator-label">Proyectos en Ejecución</div>
          <div className="indicator-value">{kpis.projects_in_progress}</div>
          <div className="indicator-period">Activos</div>
        </div>

        <div className="indicator-card pending-quotations">
          <div className="indicator-label">Cotizaciones Pendientes</div>
          <div className="indicator-value">{kpis.pending_quotations}</div>
          <div className="indicator-period">Por procesar</div>
        </div>
      </div>

      <div className="health-warning">
        {isHealthyMargin ? (
          <span className="badge success">✓ Margen saludable</span>
        ) : (
          <span className="badge warning">⚠ Revisar margen</span>
        )}
      </div>
    </div>
  )
}

export default CostIndicator
