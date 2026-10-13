import { describe, it, expect, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// OverviewTab no llama a la API directamente en estos tests (no se guarda
// nada), pero useProjects() es el store real -- se mockea el modulo de api
// que usa por debajo para no arriesgar una llamada de red real.
import { vi } from 'vitest'
vi.mock('../../api/api', () => ({
  api: { updateProject: vi.fn() },
  default: { updateProject: vi.fn() },
}))

import { OverviewTab } from '../Projects'
import type { ProjectFull } from '../../stores/projects-store'

function makeProject(overrides: Partial<ProjectFull> = {}): ProjectFull {
  return {
    id: 'p1',
    quotation_id: null,
    client_id: 'c1',
    client_name: 'Climatemp SPA',
    name: 'Mantencion anual',
    status: 'planning',
    start_date: null,
    end_date: null,
    budget: 100,
    progress_pct: 0,
    gasto_real: 0,
    saldo: 100,
    assignments: [],
    costs: [],
    created_at: 'now',
    updated_at: 'now',
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root

async function render(project: ProjectFull) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(OverviewTab, { project }))
  })
}

async function rerender(project: ProjectFull) {
  await act(async () => {
    root.render(React.createElement(OverviewTab, { project }))
  })
}

function budgetInput(): HTMLInputElement {
  // Avance (%) y Presupuesto (CLP) son los dos <input type="number">, en ese
  // orden en el JSX -- Presupuesto es el segundo.
  return container.querySelectorAll('.overview-grid input[type="number"]')[1] as HTMLInputElement
}

describe('OverviewTab — sincronizacion del formulario con el proyecto', () => {
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('re-sincroniza el formulario cuando llegan valores nuevos del MISMO proyecto (ej. loadProject completando tras montar)', async () => {
    await render(makeProject({ budget: 100 }))
    expect(budgetInput().value).toBe('100')

    // Mismo id, pero ProjectDetail acaba de recibir la version completa de
    // loadProject() con un budget distinto al de la version liviana inicial.
    await rerender(makeProject({ budget: 5000 }))

    expect(budgetInput().value).toBe('5000')
  })

  it('tambien re-sincroniza si cambia a un proyecto distinto', async () => {
    await render(makeProject({ id: 'p1', budget: 100 }))
    await rerender(makeProject({ id: 'p2', budget: 777 }))
    expect(budgetInput().value).toBe('777')
  })
})
