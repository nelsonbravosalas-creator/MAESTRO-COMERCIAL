import { create } from 'zustand'
import { api } from '../api/api'

// ── Types ─────────────────────────────────────────────────────

export type ProjectStatus = 'planning' | 'in_progress' | 'completed' | 'paused' | 'cancelled'

export interface Project {
  id: string
  quotation_id: string | null
  client_id: string
  client_name: string
  name: string
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  budget: number
  progress_pct: number
  gasto_real: number
  saldo: number
  created_at: string
  updated_at: string
}

export interface ExecutionCost {
  id: string
  project_id: string
  category_id: string | null
  description: string
  quantity: number
  unit_price: number
  created_at: string
}

// ── Store interface ───────────────────────────────────────────

interface ProjectsState {
  projects: Project[]
  loading: boolean
  error: string | null

  // Computed
  criticalCount: number

  // Actions
  loadProjects: () => Promise<void>
  createProject: (data: any) => Promise<Project>
  updateProject: (id: string, data: any) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  addCost: (projectId: string, cost: any) => Promise<ExecutionCost>
  deleteCost: (projectId: string, costId: string) => Promise<void>
}

// ── Store ─────────────────────────────────────────────────────

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  get criticalCount() {
    return get().projects.filter(p => p.saldo < 0).length
  },

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const raw = await api.getProjects()
      const projects: Project[] = raw.map((p: any) => ({
        id:           p.id,
        quotation_id: p.quotation_id ?? null,
        client_id:    p.client_id,
        client_name:  p.client_name ?? '',
        name:         p.name ?? '',
        status:       p.status ?? 'planning',
        start_date:   p.start_date ? String(p.start_date).slice(0, 10) : null,
        end_date:     p.end_date   ? String(p.end_date).slice(0, 10)   : null,
        budget:       Number(p.budget)       || 0,
        progress_pct: Number(p.progress_pct) || 0,
        gasto_real:   Number(p.gasto_real)   || 0,
        saldo:        Number(p.saldo)        ?? 0,
        created_at:   p.created_at,
        updated_at:   p.updated_at,
      }))
      set({ projects, loading: false })
    } catch (err: any) {
      set({ error: err.message ?? 'Error cargando proyectos', loading: false })
    }
  },

  createProject: async (data: any) => {
    const raw = await api.createProject(data)
    const project: Project = {
      id:           raw.id,
      quotation_id: raw.quotation_id ?? null,
      client_id:    raw.client_id,
      client_name:  raw.client_name ?? '',
      name:         raw.name ?? '',
      status:       raw.status ?? 'planning',
      start_date:   raw.start_date ? String(raw.start_date).slice(0, 10) : null,
      end_date:     raw.end_date   ? String(raw.end_date).slice(0, 10)   : null,
      budget:       Number(raw.budget)       || 0,
      progress_pct: Number(raw.progress_pct) || 0,
      gasto_real:   0,
      saldo:        Number(raw.budget)       || 0,
      created_at:   raw.created_at,
      updated_at:   raw.updated_at,
    }
    set(s => ({ projects: [project, ...s.projects] }))
    return project
  },

  updateProject: async (id: string, data: any) => {
    const raw = await api.updateProject(id, data)
    const updated: Project = {
      ...get().projects.find(p => p.id === id)!,
      name:         raw.name ?? '',
      status:       raw.status ?? 'planning',
      start_date:   raw.start_date ? String(raw.start_date).slice(0, 10) : null,
      end_date:     raw.end_date   ? String(raw.end_date).slice(0, 10)   : null,
      budget:       Number(raw.budget)       || 0,
      progress_pct: Number(raw.progress_pct) || 0,
      updated_at:   raw.updated_at,
    }
    set(s => ({ projects: s.projects.map(p => p.id === id ? updated : p) }))
    return updated
  },

  deleteProject: async (id: string) => {
    await api.deleteProject(id)
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
  },

  addCost: async (projectId: string, cost: any) => {
    const raw = await api.addProjectCost(projectId, cost)
    const newCost: ExecutionCost = {
      id:          raw.id,
      project_id:  raw.project_id,
      category_id: raw.category_id ?? null,
      description: raw.description,
      quantity:    Number(raw.quantity),
      unit_price:  Number(raw.unit_price),
      created_at:  raw.created_at,
    }
    // Update gasto_real / saldo in projects list
    set(s => ({
      projects: s.projects.map(p => {
        if (p.id !== projectId) return p
        const gasto_real = p.gasto_real + newCost.quantity * newCost.unit_price
        return { ...p, gasto_real, saldo: p.budget - gasto_real }
      }),
    }))
    return newCost
  },

  deleteCost: async (projectId: string, costId: string) => {
    await api.deleteProjectCost(projectId, costId)
    // Re-fetch project to get accurate gasto_real
    const raw = await api.getProject(projectId)
    set(s => ({
      projects: s.projects.map(p =>
        p.id === projectId
          ? { ...p, gasto_real: Number(raw.gasto_real) || 0, saldo: Number(raw.saldo) ?? 0 }
          : p
      ),
    }))
  },
}))
