import { useRef } from 'react'
import type { ProjectFull } from '../stores/projects-store'

const STATUS_COLS = [
  { key: 'planning',    label: 'Planificación' },
  { key: 'in_progress', label: 'En Ejecución'  },
  { key: 'paused',      label: 'Pausado'        },
  { key: 'completed',   label: 'Completado'     },
  { key: 'cancelled',   label: 'Cancelado'      },
] as const

type ProjectStatus = typeof STATUS_COLS[number]['key']

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

interface Props {
  projects: ProjectFull[]
  onSelect: (id: string) => void
  onStatusChange: (id: string, status: ProjectStatus) => void
}

export default function ProjectsKanban({ projects, onSelect, onStatusChange }: Props) {
  const dragging = useRef<string | null>(null)

  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    dragging.current = projectId
    e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('kb-card--dragging')
  }

  const handleDragEnd = (e: React.DragEvent) => {
    ;(e.currentTarget as HTMLElement).classList.remove('kb-card--dragging')
    dragging.current = null
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('kb-col--over')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    ;(e.currentTarget as HTMLElement).classList.remove('kb-col--over')
  }

  const handleDrop = (e: React.DragEvent, status: ProjectStatus) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).classList.remove('kb-col--over')
    if (dragging.current) {
      const project = projects.find(p => p.id === dragging.current)
      if (project && project.status !== status) {
        onStatusChange(dragging.current, status)
      }
    }
  }

  return (
    <div className="kb-board">
      {STATUS_COLS.map(col => {
        const colProjects = projects.filter(p => p.status === col.key)
        return (
          <div
            key={col.key}
            className={`kb-col kb-col--${col.key}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, col.key)}
          >
            <div className="kb-col-header">
              <span className="kb-col-title">{col.label}</span>
              <span className="kb-col-count">{colProjects.length}</span>
            </div>
            <div className="kb-col-body">
              {colProjects.map(p => {
                const over = p.budget > 0 && p.gasto_real > p.budget
                const pct = p.budget > 0 ? Math.min(100, Math.round(p.gasto_real / p.budget * 100)) : 0
                return (
                  <div
                    key={p.id}
                    className={`kb-card${over ? ' kb-card--critical' : ''}`}
                    draggable
                    onDragStart={e => handleDragStart(e, p.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelect(p.id)}
                  >
                    {over && <div className="kb-card-alert">⚠ Sobrepresupuesto</div>}
                    <div className="kb-card-name">{p.name}</div>
                    <div className="kb-card-client">{p.client_name || '—'}</div>
                    <div className="kb-card-progress">
                      <div className="kb-progress-bar">
                        <div className="kb-progress-fill" style={{ width: `${p.progress_pct}%` }} />
                      </div>
                      <span className="kb-progress-label">{p.progress_pct}%</span>
                    </div>
                    <div className="kb-card-footer">
                      <span className="kb-card-budget">{fmt(p.budget)}</span>
                      <span className={`kb-card-saldo ${over ? 'kb-card-saldo--neg' : ''}`}>
                        {fmt(p.saldo)}
                      </span>
                    </div>
                    {p.end_date && (
                      <div className="kb-card-date">{p.end_date.slice(0, 10)}</div>
                    )}
                    <div className="kb-spend-bar">
                      <div className={`kb-spend-fill ${over ? 'kb-spend-fill--over' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              {colProjects.length === 0 && (
                <div className="kb-col-empty">Sin proyectos</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
