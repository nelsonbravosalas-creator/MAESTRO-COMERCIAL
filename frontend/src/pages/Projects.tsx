import { useState, useEffect } from 'react'
import '../styles/Projects.css'
import { useProjects, useActiveProject, ProjectFull } from '../stores/projects-store'
import { useMaestro } from '../stores/maestro-store'
import { CategoryId } from '../types'

// ── Category labels ───────────────────────────────────────────
const CATEGORY_LABELS: Record<CategoryId, string> = {
  mo:  'Mano de Obra',
  log: 'Logística',
  mat: 'Materiales',
  rep: 'Repuestos/Equipos',
  ins: 'Insumos',
}

// ── Status labels/helpers ─────────────────────────────────────
const STATUS_LABELS: Record<ProjectFull['status'], string> = {
  planning:    'Planificación',
  in_progress: 'En Ejecución',
  completed:   'Completado',
  paused:      'Pausado',
  cancelled:   'Cancelado',
}

const STATUS_LIST = Object.keys(STATUS_LABELS) as ProjectFull['status'][]

// ── Currency formatter ────────────────────────────────────────
const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// ── Helpers ───────────────────────────────────────────────────
const isCritical = (p: ProjectFull) => {
  const today = new Date().toISOString().slice(0, 10)
  return (
    p.status !== 'completed' &&
    p.status !== 'cancelled' &&
    ((p.budget > 0 && p.gasto_real > p.budget) || (!!p.end_date && p.end_date < today))
  )
}

// ============================================================
// CREATE PROJECT MODAL
// ============================================================
interface CreateModalProps {
  clients: { id: string; name: string }[]
  onClose: () => void
  onCreate: (data: any) => Promise<any>
}

function CreateModal({ clients, onClose, onCreate }: CreateModalProps) {
  const [form, setForm] = useState({
    name: '',
    client_id: '',
    start_date: '',
    end_date: '',
    budget: '',
    status: 'planning' as ProjectFull['status'],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    if (!form.client_id)   { setError('El cliente es requerido'); return }
    setSaving(true)
    setError('')
    try {
      await onCreate({
        name:       form.name.trim(),
        client_id:  form.client_id,
        start_date: form.start_date || null,
        end_date:   form.end_date   || null,
        budget:     Number(form.budget) || 0,
        status:     form.status,
      })
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Error al crear proyecto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <h3>Nuevo Proyecto</h3>
          <button type="button" className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>}
          <div className="form-group">
            <label className="form-label">Nombre del Proyecto *</label>
            <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Instalación HVAC Planta Norte" />
          </div>
          <div className="form-group">
            <label className="form-label">Cliente *</label>
            <select className="form-select" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
              <option value="">— Seleccionar cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="overview-grid">
            <div className="form-group">
              <label className="form-label">Fecha Inicio</label>
              <input type="date" className="form-control" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Término</label>
              <input type="date" className="form-control" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Presupuesto (CLP)</label>
              <input type="number" className="form-control" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="0" min="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-select" value={form.status} onChange={e => set('status', e.target.value as ProjectFull['status'])}>
                {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando…' : 'Crear Proyecto'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// OVERVIEW TAB
// ============================================================
interface OverviewTabProps {
  project: ProjectFull
}

function OverviewTab({ project }: OverviewTabProps) {
  const { updateProject } = useProjects()
  const [form, setForm] = useState({
    name:         project.name,
    status:       project.status,
    start_date:   project.start_date ?? '',
    end_date:     project.end_date   ?? '',
    budget:       String(project.budget),
    progress_pct: String(project.progress_pct),
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  // Sync when project changes
  useEffect(() => {
    setForm({
      name:         project.name,
      status:       project.status,
      start_date:   project.start_date ?? '',
      end_date:     project.end_date   ?? '',
      budget:       String(project.budget),
      progress_pct: String(project.progress_pct),
    })
  }, [project.id])

  const patch = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProject(project.id, {
        name:         form.name,
        status:       form.status as ProjectFull['status'],
        start_date:   form.start_date || null,
        end_date:     form.end_date   || null,
        budget:       Number(form.budget) || 0,
        progress_pct: Math.max(0, Math.min(100, Number(form.progress_pct) || 0)),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  const critical = isCritical(project)
  const pct      = Number(form.progress_pct) || 0

  return (
    <div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Presupuesto</div>
          <div className="metric-value">{fmtCLP(project.budget)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Gasto Real</div>
          <div className={`metric-value ${project.gasto_real > project.budget && project.budget > 0 ? 'danger' : ''}`}>
            {fmtCLP(project.gasto_real)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Saldo</div>
          <div className={`metric-value ${project.saldo < 0 ? 'danger' : 'success'}`}>
            {fmtCLP(project.saldo)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avance</div>
          <div className="metric-value">{project.progress_pct}%</div>
        </div>
      </div>

      {critical && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#ef4444', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="critical-dot" />
          Proyecto crítico: {project.budget > 0 && project.gasto_real > project.budget ? 'presupuesto excedido' : ''}{project.budget > 0 && project.gasto_real > project.budget && !!project.end_date && project.end_date < new Date().toISOString().slice(0,10) ? ' · ' : ''}{!!project.end_date && project.end_date < new Date().toISOString().slice(0,10) ? 'fecha de término vencida' : ''}
        </div>
      )}

      <div className="overview-grid">
        <div className="form-group full-width">
          <label className="form-label">Nombre del Proyecto</label>
          <input className="form-control" value={form.name} onChange={e => patch('name', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Estado</label>
          <select className="form-select" value={form.status} onChange={e => patch('status', e.target.value)}>
            {STATUS_LIST.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Avance (%)</label>
          <input type="number" className="form-control" value={form.progress_pct} onChange={e => patch('progress_pct', e.target.value)} min="0" max="100" />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha Inicio</label>
          <input type="date" className="form-control" value={form.start_date} onChange={e => patch('start_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha Término</label>
          <input type="date" className="form-control" value={form.end_date} onChange={e => patch('end_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Presupuesto (CLP)</label>
          <input type="number" className="form-control" value={form.budget} onChange={e => patch('budget', e.target.value)} min="0" />
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <div className="progress-bar-wrap" style={{ height: 8 }}>
          <div
            className={`progress-bar-fill ${project.status === 'completed' ? 'completed' : project.gasto_real > project.budget && project.budget > 0 ? 'over-budget' : ''}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem' }}>{pct}% completado</div>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// COSTOS TAB
// ============================================================
interface CostosTabProps {
  project: ProjectFull
}

interface CostForm {
  description: string
  quantity: string
  unit_price: string
  category_id: CategoryId | ''
}

const emptyCostForm = (): CostForm => ({ description: '', quantity: '1', unit_price: '0', category_id: '' })

function CostosTab({ project }: CostosTabProps) {
  const { addCost, updateCost, deleteCost } = useProjects()
  const costs = project.costs ?? []

  const [newCost, setNewCost]       = useState<CostForm>(emptyCostForm())
  const [editId, setEditId]         = useState<string | null>(null)
  const [editForm, setEditForm]     = useState<CostForm>(emptyCostForm())
  const [addingCost, setAddingCost] = useState(false)
  const [saving, setSaving]         = useState(false)

  const patchNew  = (k: keyof CostForm, v: string) => setNewCost(f => ({ ...f, [k]: v }))
  const patchEdit = (k: keyof CostForm, v: string) => setEditForm(f => ({ ...f, [k]: v }))

  const handleAdd = async () => {
    if (!newCost.description.trim()) return
    setSaving(true)
    try {
      await addCost(project.id, {
        description: newCost.description.trim(),
        quantity:    Number(newCost.quantity) || 1,
        unit_price:  Number(newCost.unit_price) || 0,
        category_id: (newCost.category_id as CategoryId) || null,
      })
      setNewCost(emptyCostForm())
      setAddingCost(false)
    } catch {}
    setSaving(false)
  }

  const startEdit = (costId: string) => {
    const c = costs.find(x => x.id === costId)
    if (!c) return
    setEditId(costId)
    setEditForm({
      description: c.description,
      quantity:    String(c.quantity),
      unit_price:  String(c.unit_price),
      category_id: c.category_id ?? '',
    })
  }

  const handleUpdate = async () => {
    if (!editId) return
    setSaving(true)
    try {
      await updateCost(project.id, editId, {
        description: editForm.description.trim(),
        quantity:    Number(editForm.quantity) || 1,
        unit_price:  Number(editForm.unit_price) || 0,
        category_id: (editForm.category_id as CategoryId) || null,
      })
      setEditId(null)
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (costId: string) => {
    if (!window.confirm('¿Eliminar este costo?')) return
    await deleteCost(project.id, costId)
  }

  const total = costs.reduce((a, c) => a + c.quantity * c.unit_price, 0)

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Costos de Ejecución ({costs.length})</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAddingCost(v => !v)}>
          {addingCost ? 'Cancelar' : '+ Agregar Costo'}
        </button>
      </div>

      {addingCost && (
        <div className="add-cost-bar" style={{ marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 2, minWidth: 160 }}>
            <label className="form-label">Descripción *</label>
            <input className="form-control" value={newCost.description} onChange={e => patchNew('description', e.target.value)} placeholder="Descripción del costo" />
          </div>
          <div className="form-group" style={{ width: 80 }}>
            <label className="form-label">Cant.</label>
            <input type="number" className="form-control" value={newCost.quantity} onChange={e => patchNew('quantity', e.target.value)} min="0" />
          </div>
          <div className="form-group" style={{ width: 120 }}>
            <label className="form-label">Precio Unit.</label>
            <input type="number" className="form-control" value={newCost.unit_price} onChange={e => patchNew('unit_price', e.target.value)} min="0" />
          </div>
          <div className="form-group" style={{ width: 140 }}>
            <label className="form-label">Categoría</label>
            <select className="form-select" value={newCost.category_id} onChange={e => patchNew('category_id', e.target.value)}>
              <option value="">— Sin categoría —</option>
              {(Object.keys(CATEGORY_LABELS) as CategoryId[]).map(k => (
                <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label className="form-label">&nbsp;</label>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !newCost.description.trim()}>
              {saving ? '…' : 'Agregar'}
            </button>
          </div>
        </div>
      )}

      <div className="costs-table-wrap">
        <table className="costs-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Categoría</th>
              <th className="number-cell">Cant.</th>
              <th className="number-cell">P. Unitario</th>
              <th className="number-cell">Total</th>
              <th className="actions-cell"></th>
            </tr>
          </thead>
          <tbody>
            {costs.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#475569', padding: '2rem' }}>
                  Sin costos registrados
                </td>
              </tr>
            )}
            {costs.map(c => {
              const isEditing = editId === c.id
              return (
                <tr key={c.id} className={isEditing ? 'editing' : ''}>
                  <td>
                    {isEditing
                      ? <input className="inline-input" value={editForm.description} onChange={e => patchEdit('description', e.target.value)} style={{ minWidth: 160 }} />
                      : c.description}
                  </td>
                  <td>
                    {isEditing
                      ? (
                        <select className="inline-select" value={editForm.category_id} onChange={e => patchEdit('category_id', e.target.value)}>
                          <option value="">—</option>
                          {(Object.keys(CATEGORY_LABELS) as CategoryId[]).map(k => (
                            <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
                          ))}
                        </select>
                      )
                      : (c.category_id ? CATEGORY_LABELS[c.category_id] : <span className="text-muted">—</span>)}
                  </td>
                  <td className="number-cell">
                    {isEditing
                      ? <input type="number" className="inline-input" value={editForm.quantity} onChange={e => patchEdit('quantity', e.target.value)} style={{ width: 70 }} />
                      : c.quantity.toLocaleString('es-CL')}
                  </td>
                  <td className="number-cell">
                    {isEditing
                      ? <input type="number" className="inline-input" value={editForm.unit_price} onChange={e => patchEdit('unit_price', e.target.value)} style={{ width: 100 }} />
                      : fmtCLP(c.unit_price)}
                  </td>
                  <td className="number-cell">{fmtCLP(c.quantity * c.unit_price)}</td>
                  <td className="actions-cell">
                    {isEditing ? (
                      <>
                        <button type="button" className="btn-icon" onClick={handleUpdate} disabled={saving} title="Guardar">✓</button>
                        {' '}
                        <button type="button" className="btn-icon" onClick={() => setEditId(null)} title="Cancelar">✕</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn-icon" onClick={() => startEdit(c.id)} title="Editar">✎</button>
                        {' '}
                        <button type="button" className="btn-icon danger" onClick={() => handleDelete(c.id)} title="Eliminar">🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {costs.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', color: '#94a3b8', fontSize: '0.875rem' }}>Total Costos</td>
                <td className="number-cell">{fmtCLP(total)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', color: '#94a3b8', fontSize: '0.875rem' }}>Presupuesto</td>
                <td className="number-cell">{fmtCLP(project.budget)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', color: '#94a3b8', fontSize: '0.875rem' }}>Saldo</td>
                <td className={`number-cell ${project.saldo < 0 ? 'text-danger' : 'text-success'}`}>{fmtCLP(project.saldo)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ============================================================
// EQUIPO TAB
// ============================================================
interface EquipoTabProps {
  project: ProjectFull
}

function EquipoTab({ project }: EquipoTabProps) {
  const { assignUser, removeAssignment } = useProjects()
  const [userId, setUserId] = useState('')
  const [adding, setAdding] = useState(false)
  const [error,  setError]  = useState('')
  const assignments = project.assignments ?? []

  const handleAdd = async () => {
    if (!userId.trim()) return
    setAdding(true)
    setError('')
    try {
      await assignUser(project.id, userId.trim())
      setUserId('')
    } catch (err: any) {
      setError(err.message ?? 'Error al asignar usuario')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (uid: string) => {
    if (!window.confirm('¿Remover este usuario del proyecto?')) return
    await removeAssignment(project.id, uid)
  }

  return (
    <div>
      <div className="section-header">
        <span className="section-title">Equipo ({assignments.length})</span>
      </div>

      {assignments.length === 0 && (
        <p className="team-empty">Sin miembros asignados a este proyecto.</p>
      )}

      <div className="team-list">
        {assignments.map(a => (
          <div key={a.user_id} className="team-member-row">
            <div className="team-member-avatar">
              {(a.name ?? a.email ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="team-member-info">
              <div className="team-member-name">{a.name || '—'}</div>
              <div className="team-member-email">{a.email || a.user_id}</div>
            </div>
            <button type="button" className="btn-icon danger btn-sm" onClick={() => handleRemove(a.user_id)} title="Remover">✕</button>
          </div>
        ))}
      </div>

      <div className="section-title" style={{ marginBottom: '0.5rem' }}>Agregar Miembro (por User ID)</div>
      {error && <div style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{error}</div>}
      <div className="team-add-row">
        <input
          className="form-control"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          placeholder="UUID del usuario"
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding || !userId.trim()}>
          {adding ? '…' : 'Agregar'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// PROJECT DETAIL
// ============================================================
interface ProjectDetailProps {
  project: ProjectFull
  onDelete: (id: string) => void
}

function ProjectDetail({ project, onDelete }: ProjectDetailProps) {
  const [tab, setTab] = useState<'overview' | 'costos' | 'equipo'>('overview')
  const { loadProject } = useProjects()

  // Load full project data (with costs + assignments) on mount / id change
  useEffect(() => {
    if (project.id) loadProject(project.id)
  }, [project.id])

  return (
    <div className="project-detail-panel">
      <div className="project-detail-header">
        <div className="project-detail-title">
          {isCritical(project) && <span className="critical-dot" title="Proyecto crítico" />}
          <div>
            <h2>{project.name}</h2>
            <div className="client-sub">{project.client_name}</div>
          </div>
          <span className={`status-badge ${project.status}`}>{STATUS_LABELS[project.status]}</span>
        </div>
        <div className="project-detail-actions">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => { if (window.confirm('¿Eliminar este proyecto?')) onDelete(project.id) }}
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="tab-bar">
        <button type="button" className={`tab-btn ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Resumen</button>
        <button type="button" className={`tab-btn ${tab === 'costos'   ? 'active' : ''}`} onClick={() => setTab('costos')}>Costos ({(project.costs ?? []).length})</button>
        <button type="button" className={`tab-btn ${tab === 'equipo'   ? 'active' : ''}`} onClick={() => setTab('equipo')}>Equipo ({(project.assignments ?? []).length})</button>
      </div>

      <div className="tab-content">
        {tab === 'overview' && <OverviewTab project={project} />}
        {tab === 'costos'   && <CostosTab   project={project} />}
        {tab === 'equipo'   && <EquipoTab   project={project} />}
      </div>
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function Projects() {
  const { projects, activeId, loading, criticalCount, loadProjects, setActive, createProject, deleteProject } = useProjects()
  const activeProject = useActiveProject()
  const clients = useMaestro(s => s.clients)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { loadProjects() }, [])

  const handleDelete = async (id: string) => {
    await deleteProject(id)
  }

  return (
    <div className="projects-layout">
      {/* ── Left Panel ── */}
      <div className="project-list-panel">
        <div className="project-list-header">
          <div>
            <h2>Proyectos</h2>
            {criticalCount > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>{criticalCount} crítico{criticalCount > 1 ? 's' : ''}</span>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            + Nuevo
          </button>
        </div>

        <div className="project-list-body">
          {loading && <div className="project-list-empty">Cargando…</div>}
          {!loading && projects.length === 0 && (
            <div className="project-list-empty">Sin proyectos. Crea el primero.</div>
          )}
          {projects.map(p => {
            const pctGasto = p.budget > 0 ? Math.min(100, (p.gasto_real / p.budget) * 100) : 0
            const critical = isCritical(p)
            return (
              <div
                key={p.id}
                className={`project-card ${activeId === p.id ? 'active' : ''}`}
                onClick={() => setActive(p.id)}
              >
                <div className="project-card-header">
                  <span className="project-card-name">{p.name}</span>
                  {critical && <span className="critical-dot" title="Proyecto crítico" />}
                </div>
                <div className="project-card-client">{p.client_name}</div>
                <div className="project-card-meta">
                  <span className={`status-badge ${p.status}`}>{STATUS_LABELS[p.status]}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{p.progress_pct}%</span>
                </div>
                <div className="progress-bar-wrap">
                  <div
                    className={`progress-bar-fill ${p.status === 'completed' ? 'completed' : critical ? 'over-budget' : ''}`}
                    style={{ width: `${Math.min(100, p.progress_pct)}%` }}
                  />
                </div>
                <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span>Gasto: {fmtCLP(p.gasto_real)}</span>
                  <span>Saldo: <span className={p.saldo < 0 ? 'text-danger' : ''}>{fmtCLP(p.saldo)}</span></span>
                </div>
                {p.budget > 0 && (
                  <div className="progress-bar-wrap" style={{ marginTop: '0.25rem' }}>
                    <div
                      className={`progress-bar-fill ${p.gasto_real > p.budget ? 'over-budget' : ''}`}
                      style={{ width: `${pctGasto}%`, background: p.gasto_real > p.budget ? '#ef4444' : '#10b981' }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right Panel ── */}
      {activeProject
        ? <ProjectDetail key={activeProject.id} project={activeProject} onDelete={handleDelete} />
        : (
          <div className="project-detail-panel project-detail-empty">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <p>Selecciona un proyecto para ver el detalle</p>
          </div>
        )
      }

      {/* ── Create Modal ── */}
      {showCreate && (
        <CreateModal
          clients={clients.map(c => ({ id: c.id, name: c.name }))}
          onClose={() => setShowCreate(false)}
          onCreate={createProject}
        />
      )}
    </div>
  )
}
