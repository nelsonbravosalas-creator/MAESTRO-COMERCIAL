import { create } from 'zustand'
import api from '../api/api'
import { CategoryId } from '../types'

interface ExecutionCost {
  id: string
  project_id: string
  category_id: CategoryId | null
  description: string
  quantity: number
  unit_price: number
  created_at: string
  created_by: string | null
}

interface ProjectAssignment {
  project_id: string
  user_id: string
  name: string
  email: string
  assigned_at: string
}

export interface ProjectFull {
  id: string
  quotation_id: string | null
  client_id: string
  client_name: string
  name: string
  status: 'planning' | 'in_progress' | 'completed' | 'paused' | 'cancelled'
  start_date: string | null
  end_date: string | null
  budget: number
  progress_pct: number
  gasto_real: number
  saldo: number
  assignments: ProjectAssignment[]
  costs: ExecutionCost[]
  created_at: string
  updated_at: string
}

interface ProjectsState {
  projects: ProjectFull[]
  activeId: string | null
  loading: boolean
  criticalCount: number

  loadProjects: () => Promise<void>
  loadProject: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  createProject: (data: Partial<ProjectFull>) => Promise<ProjectFull>
  updateProject: (id: string, data: Partial<ProjectFull>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  addCost: (projectId: string, cost: Omit<ExecutionCost, 'id' | 'project_id' | 'created_at' | 'created_by'>) => Promise<void>
  updateCost: (projectId: string, costId: string, cost: Partial<ExecutionCost>) => Promise<void>
  deleteCost: (projectId: string, costId: string) => Promise<void>
  assignUser: (projectId: string, userId: string) => Promise<void>
  removeAssignment: (projectId: string, userId: string) => Promise<void>
}

const computeCritical = (projects: ProjectFull[]) => {
  const today = new Date().toISOString().slice(0, 10)
  return projects.filter(p =>
    p.status !== 'completed' && p.status !== 'cancelled' && (
      (p.budget > 0 && p.gasto_real > p.budget) ||
      (p.end_date && p.end_date < today)
    )
  ).length
}

export const useProjects = create<ProjectsState>()((set, _get) => ({
  projects: [],
  activeId: null,
  loading: false,
  criticalCount: 0,

  loadProjects: async () => {
    set({ loading: true })
    try {
      const raw = await api.getProjects() as ProjectFull[]
      // El endpoint GET /projects no devuelve assignments ni costs; normalizar para evitar undefined
      const projects = raw.map(p => ({
        ...p,
        gasto_real:  Number(p.gasto_real)  || 0,
        saldo:       Number(p.saldo)        ?? 0,
        assignments: p.assignments          ?? [],
        costs:       p.costs               ?? [],
      }))
      set({ projects, criticalCount: computeCritical(projects), loading: false })
    } catch {
      set({ loading: false })
    }
  },

  loadProject: async (id) => {
    try {
      const project = await api.getProject(id) as ProjectFull
      set(s => ({
        projects: s.projects.some(p => p.id === id)
          ? s.projects.map(p => p.id === id ? project : p)
          : [...s.projects, project],
      }))
    } catch {}
  },

  setActive: (id) => set({ activeId: id }),

  createProject: async (data) => {
    const created = await api.createProject(data) as ProjectFull
    // El backend devuelve solo la fila insertada sin estos campos calculados
    created.assignments = []
    created.costs       = []
    created.gasto_real  = 0
    created.saldo       = Number(created.budget) || 0
    set(s => {
      const projects = [...s.projects, created]
      return { projects, criticalCount: computeCritical(projects) }
    })
    return created
  },

  updateProject: async (id, data) => {
    const updated = await api.updateProject(id, data) as ProjectFull
    set(s => {
      const projects = s.projects.map(p => p.id === id ? { ...p, ...updated } : p)
      return { projects, criticalCount: computeCritical(projects) }
    })
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    set(s => {
      const projects = s.projects.filter(p => p.id !== id)
      return { projects, activeId: s.activeId === id ? null : s.activeId, criticalCount: computeCritical(projects) }
    })
  },

  addCost: async (projectId, cost) => {
    const created = await api.addProjectCost(projectId, cost)
    set(s => ({
      projects: s.projects.map(p => {
        if (p.id !== projectId) return p
        const costs = [...(p.costs || []), created]
        const gasto_real = costs.reduce((a, c) => a + c.quantity * c.unit_price, 0)
        return { ...p, costs, gasto_real, saldo: p.budget - gasto_real }
      }),
    }))
  },

  updateCost: async (projectId, costId, cost) => {
    const updated = await api.updateProjectCost(projectId, costId, cost)
    set(s => ({
      projects: s.projects.map(p => {
        if (p.id !== projectId) return p
        const costs = (p.costs || []).map(c => c.id === costId ? updated : c)
        const gasto_real = costs.reduce((a, c) => a + c.quantity * c.unit_price, 0)
        return { ...p, costs, gasto_real, saldo: p.budget - gasto_real }
      }),
    }))
  },

  deleteCost: async (projectId, costId) => {
    await api.deleteProjectCost(projectId, costId)
    set(s => ({
      projects: s.projects.map(p => {
        if (p.id !== projectId) return p
        const costs = (p.costs || []).filter(c => c.id !== costId)
        const gasto_real = costs.reduce((a, c) => a + c.quantity * c.unit_price, 0)
        return { ...p, costs, gasto_real, saldo: p.budget - gasto_real }
      }),
    }))
  },

  assignUser: async (projectId, userId) => {
    const assignment = await api.assignUser(projectId, userId)
    set(s => ({
      projects: s.projects.map(p =>
        p.id !== projectId ? p
          : { ...p, assignments: [...(p.assignments || []).filter(a => a.user_id !== userId), assignment] }
      ),
    }))
  },

  removeAssignment: async (projectId, userId) => {
    await api.removeAssignment(projectId, userId)
    set(s => ({
      projects: s.projects.map(p =>
        p.id !== projectId ? p
          : { ...p, assignments: (p.assignments || []).filter(a => a.user_id !== userId) }
      ),
    }))
  },
}))

export const useActiveProject = () => {
  const { projects, activeId } = useProjects()
  return projects.find(p => p.id === activeId) ?? null
}
