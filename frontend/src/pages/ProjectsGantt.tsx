import { useState, useEffect, useRef } from 'react'
import type { ProjectFull } from '../stores/projects-store'
import { api } from '../api/api'

// ── Types ─────────────────────────────────────────────────────

interface Task {
  id: string
  project_id: string
  name: string
  start_date: string | null
  end_date: string | null
  progress_pct: number
  status: string
  assignee_name: string | null
}

interface RowItem {
  type: 'project' | 'task'
  id: string
  projectId: string
  name: string
  start_date: string | null
  end_date: string | null
  progress_pct: number
  status: string
  isExpanded?: boolean
  hasChildren?: boolean
  assignee?: string | null
}

// ── Constants ─────────────────────────────────────────────────

const DAY_PX = 28
const ROW_H  = 36
const LABEL_W = 280
const TODAY = new Date().toISOString().slice(0, 10)

const STATUS_COLOR: Record<string, string> = {
  planning:    '#334155',
  in_progress: '#0e7490',
  completed:   '#16a34a',
  paused:      '#b45309',
  cancelled:   '#6b7280',
  pending:     '#475569',
  done:        '#16a34a',
  blocked:     '#dc2626',
}

// ── Date helpers ──────────────────────────────────────────────

function parseDate(d: string | null) {
  if (!d) return null
  return new Date(d.slice(0, 10) + 'T00:00:00')
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function formatMonthYear(d: Date) {
  return d.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })
}

// ── New Task Form ─────────────────────────────────────────────

interface NewTaskFormProps {
  projectId: string
  onCreated: (task: Task) => void
  onCancel: () => void
}

function NewTaskForm({ projectId, onCreated, onCancel }: NewTaskFormProps) {
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const task = await api.createTask(projectId, {
        name:       form.name,
        start_date: form.start_date || null,
        end_date:   form.end_date   || null,
      })
      onCreated(task)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="gantt-newtask" onSubmit={handleSubmit} onClick={e => e.stopPropagation()}>
      <input
        className="gantt-newtask-input"
        placeholder="Nombre de la tarea"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        autoFocus
      />
      <input
        className="gantt-newtask-date"
        type="date"
        value={form.start_date}
        onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
      />
      <input
        className="gantt-newtask-date"
        type="date"
        value={form.end_date}
        onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
      />
      <button type="submit" className="gantt-newtask-btn" disabled={saving}>
        {saving ? '…' : '✓'}
      </button>
      <button type="button" className="gantt-newtask-btn gantt-newtask-cancel" onClick={onCancel}>
        ✕
      </button>
    </form>
  )
}

// ── Main Gantt ────────────────────────────────────────────────

interface Props {
  projects: ProjectFull[]
  onSelect: (id: string) => void
}

export default function ProjectsGantt({ projects, onSelect }: Props) {
  const [taskMap, setTaskMap] = useState<Record<string, Task[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [addingTask, setAddingTask] = useState<string | null>(null)
  const [viewStart, setViewStart] = useState<Date>(() => {
    const d = new Date()
    d.setDate(1)
    return d
  })
  const [viewMonths, setViewMonths] = useState(4)
  const svgRef = useRef<SVGSVGElement>(null)

  // Load tasks for visible projects
  useEffect(() => {
    projects.forEach(p => {
      if (!taskMap[p.id]) {
        api.getTasks(p.id).then(tasks => {
          setTaskMap(prev => ({ ...prev, [p.id]: tasks }))
        }).catch(() => {
          setTaskMap(prev => ({ ...prev, [p.id]: [] }))
        })
      }
    })
  }, [projects])

  const viewEnd = addDays(viewStart, viewMonths * 30)
  const totalDays = diffDays(viewStart, viewEnd)
  const svgW = totalDays * DAY_PX

  const toggleExpand = (projectId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(projectId) ? next.delete(projectId) : next.add(projectId)
      return next
    })
  }

  // Build flat row list
  const rows: RowItem[] = []
  for (const p of projects) {
    const tasks = taskMap[p.id] ?? []
    const isExp = expanded.has(p.id)
    rows.push({
      type: 'project',
      id: p.id,
      projectId: p.id,
      name: p.name,
      start_date: p.start_date,
      end_date: p.end_date,
      progress_pct: p.progress_pct,
      status: p.status,
      isExpanded: isExp,
      hasChildren: tasks.length > 0,
    })
    if (isExp) {
      for (const t of tasks) {
        rows.push({
          type: 'task',
          id: t.id,
          projectId: p.id,
          name: t.name,
          start_date: t.start_date,
          end_date: t.end_date,
          progress_pct: t.progress_pct,
          status: t.status,
          assignee: t.assignee_name,
        })
      }
    }
  }

  const svgH = rows.length * ROW_H

  // Month header marks
  const months: { x: number; label: string }[] = []
  let cur = new Date(viewStart)
  cur.setDate(1)
  while (cur < viewEnd) {
    const x = diffDays(viewStart, cur) * DAY_PX
    if (x >= 0) months.push({ x, label: formatMonthYear(cur) })
    cur.setMonth(cur.getMonth() + 1)
  }

  // Today line
  const todayX = diffDays(viewStart, parseDate(TODAY) ?? new Date()) * DAY_PX

  // Bar calculation
  const barFor = (row: RowItem): { x: number; w: number } | null => {
    const s = parseDate(row.start_date)
    const e = parseDate(row.end_date)
    if (!s || !e) return null
    const x = Math.max(0, diffDays(viewStart, s)) * DAY_PX
    const x2 = Math.min(totalDays, diffDays(viewStart, e) + 1) * DAY_PX
    const w = x2 - x
    if (w <= 0) return null
    return { x, w }
  }

  const handleTaskCreated = (projectId: string, task: Task) => {
    setTaskMap(prev => ({ ...prev, [projectId]: [...(prev[projectId] ?? []), task] }))
    setExpanded(prev => new Set([...prev, projectId]))
    setAddingTask(null)
  }

  const navigate = (dir: -1 | 1) => {
    setViewStart(d => {
      const next = new Date(d)
      next.setMonth(next.getMonth() + dir * 2)
      return next
    })
  }

  return (
    <div className="gantt-root">
      {/* Toolbar */}
      <div className="gantt-toolbar">
        <button className="gantt-nav-btn" onClick={() => navigate(-1)}>‹ Anterior</button>
        <span className="gantt-range">
          {viewStart.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
          {' — '}
          {viewEnd.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' })}
        </span>
        <button className="gantt-nav-btn" onClick={() => navigate(1)}>Siguiente ›</button>
        <select
          className="gantt-months-sel"
          value={viewMonths}
          onChange={e => setViewMonths(Number(e.target.value))}
        >
          <option value={2}>2 meses</option>
          <option value={4}>4 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
        <button
          className="gantt-nav-btn"
          onClick={() => { const d = new Date(); d.setDate(1); setViewStart(d) }}
        >
          Hoy
        </button>
      </div>

      <div className="gantt-layout">
        {/* Left label panel */}
        <div className="gantt-labels" style={{ width: LABEL_W }}>
          <div className="gantt-label-header">Proyecto / Tarea</div>
          {rows.map((row, i) => (
            <div
              key={row.id}
              className={`gantt-label-row${row.type === 'task' ? ' gantt-label-row--task' : ''}`}
              style={{ top: i * ROW_H }}
              onClick={() => row.type === 'project' ? onSelect(row.id) : undefined}
            >
              {row.type === 'project' && (
                <button
                  className="gantt-expand-btn"
                  onClick={e => { e.stopPropagation(); toggleExpand(row.id) }}
                >
                  {row.isExpanded ? '▾' : '▸'}
                </button>
              )}
              {row.type === 'task' && <span className="gantt-task-indent">└</span>}
              <span className="gantt-label-name" title={row.name}>{row.name}</span>
              {row.type === 'project' && (
                <button
                  className="gantt-add-task-btn"
                  title="Agregar tarea"
                  onClick={e => { e.stopPropagation(); setAddingTask(row.id); setExpanded(p => new Set([...p, row.id])) }}
                >
                  +
                </button>
              )}
              {row.assignee && (
                <span className="gantt-assignee" title={row.assignee}>
                  {row.assignee.split(' ')[0]}
                </span>
              )}
            </div>
          ))}
          {/* New task form below the expanded project */}
          {addingTask && (
            <div
              className="gantt-label-row gantt-label-row--newtask"
              style={{ top: (() => {
                const idx = rows.findLastIndex(r => r.projectId === addingTask)
                return (idx + 1) * ROW_H
              })() }}
            >
              <NewTaskForm
                projectId={addingTask}
                onCreated={task => handleTaskCreated(addingTask, task)}
                onCancel={() => setAddingTask(null)}
              />
            </div>
          )}
        </div>

        {/* Right SVG chart */}
        <div className="gantt-chart-wrap">
          <svg
            ref={svgRef}
            className="gantt-svg"
            width={svgW}
            height={svgH + ROW_H}
          >
            {/* Background stripes */}
            {rows.map((row, i) => (
              <rect
                key={`bg-${row.id}`}
                x={0} y={i * ROW_H + ROW_H}
                width={svgW} height={ROW_H}
                fill={i % 2 === 0 ? '#0f172a' : '#1e293b'}
              />
            ))}

            {/* Month grid lines + header */}
            <rect x={0} y={0} width={svgW} height={ROW_H} fill="#0f172a" />
            {months.map(m => (
              <g key={m.x}>
                <line x1={m.x} y1={0} x2={m.x} y2={svgH + ROW_H} stroke="#334155" strokeWidth={1} />
                <text x={m.x + 6} y={20} fill="#94a3b8" fontSize={11} fontFamily="Outfit, sans-serif">
                  {m.label}
                </text>
              </g>
            ))}

            {/* Today line */}
            {todayX >= 0 && todayX <= svgW && (
              <g>
                <line x1={todayX} y1={0} x2={todayX} y2={svgH + ROW_H} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={todayX + 4} y={14} fill="#f59e0b" fontSize={9} fontFamily="Outfit, sans-serif">hoy</text>
              </g>
            )}

            {/* Bars */}
            {rows.map((row, i) => {
              const bar = barFor(row)
              if (!bar) return null
              const y = i * ROW_H + ROW_H
              const barH = row.type === 'project' ? ROW_H - 10 : ROW_H - 14
              const barY = y + (row.type === 'project' ? 5 : 7)
              const color = STATUS_COLOR[row.status] ?? '#475569'
              const progressW = Math.round(bar.w * row.progress_pct / 100)

              return (
                <g key={`bar-${row.id}`} style={{ cursor: 'pointer' }} onClick={() => row.type === 'project' && onSelect(row.id)}>
                  {/* Background bar */}
                  <rect
                    x={bar.x} y={barY}
                    width={bar.w} height={barH}
                    rx={3} fill={color}
                    opacity={0.35}
                  />
                  {/* Progress fill */}
                  <rect
                    x={bar.x} y={barY}
                    width={progressW} height={barH}
                    rx={3} fill={color}
                    opacity={0.9}
                  />
                  {/* Label inside bar */}
                  {bar.w > 50 && (
                    <text
                      x={bar.x + 6} y={barY + barH / 2 + 4}
                      fill="#f8fafc" fontSize={10}
                      fontFamily="Outfit, sans-serif"
                      clipPath={`inset(0 ${bar.w}px 0 0)`}
                    >
                      {row.progress_pct > 0 ? `${row.progress_pct}%` : row.name.slice(0, 20)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}
