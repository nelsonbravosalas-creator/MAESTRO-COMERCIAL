import React, { useState, useEffect } from 'react'
import '../styles/Projects.css'
import { useProjectsStore, Project, ExecutionCost, ProjectStatus } from '../stores/projects-store'
import { api } from '../api/api'

// ── Helpers ───────────────────────────────────────────────────

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning:    'Planificación',
  in_progress: 'En Ejecución',
  completed:   'Completado',
  paused:      'Pausado',
  cancelled:   'Cancelado',
}

const STATUS_CLASS: Record<ProjectStatus, string> = {
  planning:    'status-planning',
  in_progress: 'status-in-progress',
  completed:   'status-completed',
  paused:      'status-paused',
  cancelled:   'status-cancelled',
}

const fmt = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

const fmtDate = (d: string | null) => (d ? d.slice(0, 10) : '—')

// ── New Project Modal ────────────────────────────────────────

interface NewProjectForm {
  name: string
  client_id: string
  start_date: string
  end_date: string
  budget: string
  status: ProjectStatus
}

interface NewProjectModalProps {
  onClose: () => void
  onCreate: (data: any) => void
}

function NewProjectModal({ onClose, onCreate }: NewProjectModalProps) {
  const [form, setForm] = useState<NewProjectForm>({
    name: '',
    client_id: '',
    start_date: '',
    end_date: '',
    budget: '',
    status: 'planning',
  })
  const [error, setError] = useState('')

  const patch = (k: keyof NewProjectForm, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.client_id.trim()) { setError('El ID de cliente es obligatorio'); return }
    onCreate({
      name:       form.name.trim(),
      client_id:  form.client_id.trim(),
      start_date: form.start_date || null,
      end_date:   form.end_date   || null,
      budget:     Number(form.budget) || 0,
      status:     form.status,
    })
  }

  return (
    <div className="project-modal-overlay" onClick={onClose}>
      <div className="project-modal project-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="project-modal-header">
          <h2>Nuevo Proyecto</h2>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="new-project-form" onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}
          <label>Nombre del proyecto *</label>
          <input className="pj-input" value={form.name} onChange={e => patch('name', e.target.value)} placeholder="Nombre del proyecto" />

          <label>ID de cliente *</label>
          <input className="pj-input" value={form.client_id} onChange={e => patch('client_id', e.target.value)} placeholder="UUID del cliente" />

          <label>Estado</label>
          <select className="pj-input" value={form.status} onChange={e => patch('status', e.target.value as ProjectStatus)}>
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>

          <label>Fecha inicio</label>
          <input type="date" className="pj-input" value={form.start_date} onChange={e => patch('start_date', e.target.value)} />

          <label>Fecha término</label>
          <input type="date" className="pj-input" value={form.end_date} onChange={e => patch('end_date', e.target.value)} />

          <label>Presupuesto (CLP)</label>
          <input type="number" className="pj-input" value={form.budget} onChange={e => patch('budget', e.target.value)} placeholder="0" />

          <div className="new-project-actions">
            <button type="submit" className="btn-primary-sm">Crear proyecto</button>
            <button type="button" className="btn-outline-sm" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Project Detail Modal ──────────────────────────────────────

interface ProjectDetailProps {
  projectId: string
  onClose: () => void
  onDeleted: () => void
  onUpdated: (p: Project) => void
}

function ProjectDetail({ projectId, onClose, onDeleted, onUpdated }: ProjectDetailProps) {
  const { updateProject, deleteProject, addCost, deleteCost } = useProjectsStore()
  const [detail, setDetail] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'resumen' | 'costos' | 'equipo'>('resumen')
  const [loadingDetail, setLoadingDetail] = useState(true)

  // Resumen edit state
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('planning')
  const [editProgress, setEditProgress] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editBudget, setEditBudget] = useState('')
  const [saving, setSaving] = useState(false)

  // Cost form state
  const [costForm, setCostForm] = useState({ description: '', quantity: '1', unit_price: '' })
  const [addingCost, setAddingCost] = useState(false)

  useEffect(() => {
    setLoadingDetail(true)
    api.getProject(projectId)
      .then((d: any) => {
        setDetail(d)
        setEditName(d.name ?? '')
        setEditStatus(d.status ?? 'planning')
        setEditProgress(String(d.progress_pct ?? 0))
        setEditStartDate(d.start_date ? String(d.start_date).slice(0, 10) : '')
        setEditEndDate(d.end_date ? String(d.end_date).slice(0, 10) : '')
        setEditBudget(String(d.budget ?? 0))
      })
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }, [projectId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateProject(projectId, {
        name:         editName,
        status:       editStatus,
        progress_pct: Number(editProgress),
        start_date:   editStartDate || null,
        end_date:     editEndDate   || null,
        budget:       Number(editBudget),
      })
      setDetail((d: any) => ({ ...d, ...updated }))
      onUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return
    await deleteProject(projectId)
    onDeleted()
  }

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!costForm.description.trim()) return
    setAddingCost(true)
    try {
      const newCost = await addCost(projectId, {
        description: costForm.description.trim(),
        quantity:    Number(costForm.quantity) || 1,
        unit_price:  Number(costForm.unit_price) || 0,
      })
      setDetail((d: any) => ({
        ...d,
        costs: [newCost, ...(d.costs ?? [])],
        gasto_real: (Number(d.gasto_real) || 0) + newCost.quantity * newCost.unit_price,
        saldo:      (Number(d.budget) || 0) - ((Number(d.gasto_real) || 0) + newCost.quantity * newCost.unit_price),
      }))
      setCostForm({ description: '', quantity: '1', unit_price: '' })
    } finally {
      setAddingCost(false)
    }
  }

  const handleDeleteCost = async (costId: string, costAmount: number) => {
    if (!window.confirm('¿Eliminar este costo?')) return
    await deleteCost(projectId, costId)
    setDetail((d: any) => ({
      ...d,
      costs: (d.costs ?? []).filter((c: any) => c.id !== costId),
      gasto_real: Math.max(0, (Number(d.gasto_real) || 0) - costAmount),
      saldo:      (Number(d.budget) || 0) - Math.max(0, (Number(d.gasto_real) || 0) - costAmount),
    }))
  }

  if (loadingDetail) {
    return (
      <div className="project-modal-overlay" onClick={onClose}>
        <div className="project-modal" onClick={e => e.stopPropagation()}>
          <div className="project-modal-header">
            <h2>Cargando...</h2>
            <button className="btn-modal-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-loading">Cargando detalle del proyecto…</div>
        </div>
      </div>
    )
  }

  if (!detail) return null

  const gasto    = Number(detail.gasto_real) || 0
  const budget   = Number(detail.budget) || 0
  const saldo    = budget - gasto
  const progress = Number(detail.progress_pct) || 0

  return (
    <div className="project-modal-overlay" onClick={onClose}>
      <div className="project-modal" onClick={e => e.stopPropagation()}>
        <div className="project-modal-header">
          <div>
            <h2>{detail.name}</h2>
            <span className="header-client">{detail.client_name}</span>
          </div>
          <div className="modal-header-actions">
            <button className="btn-danger-sm" onClick={handleDelete}>Eliminar Proyecto</button>
            <button className="btn-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {(['resumen', 'costos', 'equipo'] as const).map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'resumen' ? 'Resumen' : tab === 'costos' ? 'Costos' : 'Equipo'}
            </button>
          ))}
        </div>

        {/* Resumen */}
        {activeTab === 'resumen' && (
          <div className="tab-content">
            <div className="resumen-form">
              <div className="resumen-row">
                <div className="resumen-field">
                  <label>Nombre</label>
                  <input className="pj-input" value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="resumen-field">
                  <label>Estado</label>
                  <select className="pj-input" value={editStatus} onChange={e => setEditStatus(e.target.value as ProjectStatus)}>
                    {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map(s => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="resumen-row">
                <div className="resumen-field">
                  <label>Fecha inicio</label>
                  <input type="date" className="pj-input" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                </div>
                <div className="resumen-field">
                  <label>Fecha término</label>
                  <input type="date" className="pj-input" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                </div>
              </div>

              <div className="resumen-row">
                <div className="resumen-field">
                  <label>Presupuesto (CLP)</label>
                  <input type="number" className="pj-input" value={editBudget} onChange={e => setEditBudget(e.target.value)} />
                </div>
                <div className="resumen-field">
                  <label>Avance % ({editProgress}%)</label>
                  <input type="range" min="0" max="100" value={editProgress} onChange={e => setEditProgress(e.target.value)} className="progress-range" />
                </div>
              </div>

              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-label">{progress}% completado</p>

              <button className="btn-primary-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>

            {/* Budget summary */}
            <div className="budget-cards">
              <div className="budget-card">
                <span className="budget-label">Presupuesto</span>
                <span className="budget-value">{fmt(budget)}</span>
              </div>
              <div className="budget-card">
                <span className="budget-label">Gasto Real</span>
                <span className="budget-value budget-spent">{fmt(gasto)}</span>
              </div>
              <div className={`budget-card ${saldo < 0 ? 'budget-card-danger' : ''}`}>
                <span className="budget-label">Saldo</span>
                <span className={`budget-value ${saldo < 0 ? 'budget-negative' : 'budget-positive'}`}>{fmt(saldo)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Costos */}
        {activeTab === 'costos' && (
          <div className="tab-content">
            <form className="add-cost-form" onSubmit={handleAddCost}>
              <h3>Agregar Costo</h3>
              <div className="cost-form-row">
                <input
                  className="pj-input cost-input-desc"
                  placeholder="Descripción *"
                  value={costForm.description}
                  onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))}
                />
                <input
                  type="number"
                  className="pj-input cost-input-num"
                  placeholder="Cantidad"
                  value={costForm.quantity}
                  onChange={e => setCostForm(f => ({ ...f, quantity: e.target.value }))}
                />
                <input
                  type="number"
                  className="pj-input cost-input-num"
                  placeholder="Precio unit."
                  value={costForm.unit_price}
                  onChange={e => setCostForm(f => ({ ...f, unit_price: e.target.value }))}
                />
                <span className="cost-total-preview">
                  {fmt((Number(costForm.quantity) || 0) * (Number(costForm.unit_price) || 0))}
                </span>
                <button type="submit" className="btn-primary-sm" disabled={addingCost}>
                  {addingCost ? '…' : '+ Agregar'}
                </button>
              </div>
            </form>

            <div className="costs-table-wrap">
              <table className="costs-table">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">P. Unitario</th>
                    <th className="text-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.costs ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="costs-empty">Sin costos registrados</td></tr>
                  ) : (
                    (detail.costs as ExecutionCost[]).map(c => (
                      <tr key={c.id}>
                        <td>{c.description}</td>
                        <td className="text-right">{c.quantity}</td>
                        <td className="text-right">{fmt(c.unit_price)}</td>
                        <td className="text-right">{fmt(c.quantity * c.unit_price)}</td>
                        <td>
                          <button
                            className="btn-icon btn-danger"
                            onClick={() => handleDeleteCost(c.id, c.quantity * c.unit_price)}
                            title="Eliminar"
                          >✕</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {(detail.costs ?? []).length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="costs-total-label">Total gastos</td>
                      <td className="text-right costs-total-value">{fmt(gasto)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Equipo */}
        {activeTab === 'equipo' && (
          <div className="tab-content">
            <div className="team-list">
              {(detail.assignments ?? []).length === 0 ? (
                <p className="team-empty">No hay miembros asignados a este proyecto.</p>
              ) : (
                (detail.assignments as any[]).map((a: any) => (
                  <div key={a.user_id} className="team-member">
                    <div className="team-avatar">{(a.name ?? '?')[0].toUpperCase()}</div>
                    <div className="team-info">
                      <span className="team-name">{a.name ?? 'Usuario'}</span>
                      <span className="team-email">{a.email ?? ''}</span>
                    </div>
                    <span className="team-since">Asignado: {fmtDate(a.assigned_at)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────

interface ProjectCardProps {
  project: Project
  onClick: () => void
}

function ProjectCard({ project, onClick }: ProjectCardProps) {
  const progress = Math.min(100, Math.max(0, project.progress_pct))
  return (
    <div className="project-card" onClick={onClick}>
      <div className="project-card-header">
        <span className={`status-badge ${STATUS_CLASS[project.status]}`}>
          {STATUS_LABEL[project.status]}
        </span>
        <span className="project-client">{project.client_name}</span>
      </div>

      <h3 className="project-name">{project.name}</h3>

      <div className="progress-bar" title={`${progress}%`}>
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="progress-pct">{progress}%</span>

      <div className="project-card-budget">
        <div className="budget-row">
          <span className="budget-row-label">Presupuesto</span>
          <span className="budget-row-value">{fmt(project.budget)}</span>
        </div>
        <div className="budget-row">
          <span className="budget-row-label">Gasto real</span>
          <span className="budget-row-value budget-spent">{fmt(project.gasto_real)}</span>
        </div>
        <div className="budget-row">
          <span className="budget-row-label">Saldo</span>
          <span className={`budget-row-value ${project.saldo < 0 ? 'budget-negative' : 'budget-positive'}`}>
            {fmt(project.saldo)}
          </span>
        </div>
      </div>

      <div className="project-card-dates">
        <span>{fmtDate(project.start_date)}</span>
        <span>→</span>
        <span>{fmtDate(project.end_date)}</span>
      </div>
    </div>
  )
}

// ── Projects Page ─────────────────────────────────────────────

export const Projects: React.FC = () => {
  const { projects, loading, error, loadProjects, createProject, updateProject } = useProjectsStore()
  const [showNew, setShowNew] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  const handleCreate = async (data: any) => {
    await createProject(data)
    setShowNew(false)
  }

  const handleUpdated = (p: Project) => {
    updateProject(p.id, p)
  }

  return (
    <div className="projects-page">
      <div className="projects-header">
        <div className="projects-header-left">
          <h2 className="projects-title">Proyectos</h2>
          <span className="projects-count">{projects.length} proyecto{projects.length !== 1 ? 's' : ''}</span>
        </div>
        <button className="btn-primary-sm" onClick={() => setShowNew(true)}>
          + Nuevo Proyecto
        </button>
      </div>

      {error && <div className="projects-error">{error}</div>}

      {loading ? (
        <div className="projects-loading">Cargando proyectos…</div>
      ) : projects.length === 0 ? (
        <div className="projects-empty">
          <p>No hay proyectos registrados.</p>
          <button className="btn-primary-sm" onClick={() => setShowNew(true)}>Crear primer proyecto</button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} onClick={() => setSelectedId(p.id)} />
          ))}
        </div>
      )}

      {showNew && (
        <NewProjectModal onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}

      {selectedId && (
        <ProjectDetail
          projectId={selectedId}
          onClose={() => setSelectedId(null)}
          onDeleted={() => setSelectedId(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}

export default Projects
