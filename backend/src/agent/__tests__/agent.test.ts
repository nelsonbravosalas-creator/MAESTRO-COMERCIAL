import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Pool } from 'pg'
import { buscarCatalogoTool } from '../tools/catalogTool'
import { ensenarReglaTool } from '../tools/rulesTool'
import { calcularItemsAutoTool } from '../tools/calcTool'
import { verCotizacionTool } from '../tools/quotationTool'
import { consultarHistorialClienteTool } from '../tools/historyTool'
import { runAgentLoop, MAX_STEPS } from '../loop'
import { AgentContext } from '../types'

vi.mock('../../services/llm', async () => {
  const actual = await vi.importActual<typeof import('../../services/llm')>('../../services/llm')
  return {
    ...actual,
    callLlmWithTools: vi.fn(),
  }
})
import { callLlmWithTools } from '../../services/llm'
const mockedCallLlmWithTools = callLlmWithTools as unknown as ReturnType<typeof vi.fn>

function createMockPool() {
  const runs: Array<{ id: unknown; instruction: unknown; status: unknown }> = []
  const steps: Array<{
    run_id: unknown
    idx: unknown
    tool: unknown
    input?: unknown
    status?: unknown
  }> = []
  const rules: Array<{
    id: string
    rule_key: string
    value: unknown
    unit: string | null
    notes: string | null
    created_at: string
    superseded_at: string | null
  }> = [
    {
      id: 'r1',
      rule_key: 'tarifa_colacion_diaria',
      value: 6000,
      unit: 'CLP/persona/dia',
      notes: null,
      created_at: new Date().toISOString(),
      superseded_at: null,
    },
    {
      id: 'r2',
      rule_key: 'tarifa_bonificacion_desplazamiento_diaria',
      value: 15000,
      unit: 'CLP/persona/dia',
      notes: null,
      created_at: new Date().toISOString(),
      superseded_at: null,
    },
    {
      id: 'r3',
      rule_key: 'comunas_region_metropolitana',
      value: ['santiago', 'providencia', 'las condes'],
      unit: null,
      notes: null,
      created_at: new Date().toISOString(),
      superseded_at: null,
    },
  ]
  const clients = [{ id: 'c1', name: 'Climatemp SpA', rut: '76.123.456-7', deleted_at: null }]
  const quotations = [
    {
      id: 'q1',
      correlative: 'SYM-100-01-2026',
      client_id: 'c1',
      client_name: 'Climatemp SpA',
      status: 'Borrador',
      ref: 'Mantencion',
      date: '2026-01-01',
      line_items: [
        {
          category_id: 'mat',
          description: 'Filtro de aire',
          unit_name: 'Und',
          quantity: 2,
          days: 1,
          unit_price: 12000,
        },
      ],
      deleted_at: null,
    },
  ]
  const catalogItems = [
    {
      id: 'cat1',
      description: 'Tubo de cobre 1/2 pulgada',
      unit_name: 'Tira',
      unit_price: '8500',
      is_active: true,
    },
  ]
  const electricalCatalogItems = [
    {
      id: 'ele1',
      description: 'Cable libre de halogeno 2.5mm',
      unit_name: 'Metro',
      unit_price: '1200',
      is_active: true,
    },
  ]

  const query = vi.fn().mockImplementation(async (sql: string, params: unknown[] = []) => {
    const s = sql.trim()
    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [] }

    if (s.startsWith('INSERT INTO agent_runs')) {
      runs.push({ id: params[0], instruction: params[3], status: 'running' })
      return { rows: [] }
    }
    if (s.startsWith('UPDATE agent_runs')) {
      const run = runs.find(r => r.id === params[6])
      if (run) run.status = params[0]
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO agent_steps')) {
      steps.push({
        run_id: params[0],
        idx: params[2],
        tool: params[3],
        input: JSON.parse(String(params[4] ?? '{}')),
      })
      return { rows: [] }
    }
    if (s.includes('FROM catalog_items') && s.includes('ILIKE')) {
      const needle = String(params[0] ?? '')
        .replace(/%/g, '')
        .toLowerCase()
      return {
        rows: catalogItems.filter(i => i.description.toLowerCase().includes(needle)),
      }
    }
    if (s.includes('FROM electrical_catalog_items') && s.includes('ILIKE')) {
      const needle = String(params[0] ?? '')
        .replace(/%/g, '')
        .toLowerCase()
      return {
        rows: electricalCatalogItems.filter(i => i.description.toLowerCase().includes(needle)),
      }
    }
    if (s.includes('FROM chatbot_rules') && s.includes('rule_key = $1')) {
      const row = rules.find(r => r.rule_key === params[0] && !r.superseded_at)
      return { rows: row ? [row] : [] }
    }
    if (s.includes('FROM chatbot_rules') && s.includes('ORDER BY rule_key')) {
      return { rows: rules.filter(r => !r.superseded_at) }
    }
    if (s.startsWith('UPDATE chatbot_rules')) {
      for (const r of rules)
        if (r.rule_key === params[0]) r.superseded_at = new Date().toISOString()
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO chatbot_rules')) {
      const row = {
        id: `r-${rules.length + 1}`,
        rule_key: String(params[0] ?? ''),
        value: JSON.parse(String(params[1] ?? 'null')) as unknown,
        unit: typeof params[2] === 'string' ? params[2] : null,
        notes: typeof params[3] === 'string' ? params[3] : null,
        created_at: new Date().toISOString(),
        superseded_at: null,
      }
      rules.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('SELECT id, name, rut FROM clients')) {
      const needle = String(params[0] ?? '')
        .replace(/%/g, '')
        .toLowerCase()
      return { rows: clients.filter(c => c.name.toLowerCase().includes(needle)) }
    }
    if (s.includes('COUNT(*)::text AS total') && s.includes('FROM quotations')) {
      return {
        rows: [
          {
            total: '3',
            adjudicadas: '2',
            perdidas: '1',
            enviadas: '0',
            borradores: '0',
          },
        ],
      }
    }
    if (s.includes('SELECT correlative, date::text') && s.includes('FROM quotations')) {
      return {
        rows: [
          {
            correlative: 'SYM-100-01-2026',
            date: '2026-01-01',
            status: 'Adjudicada',
            subject: 'Mantencion',
            kind: 'project',
          },
        ],
      }
    }
    if (s.includes('FROM chatbot_graph_edges') && s.includes("relation = 'cotiza_en'")) {
      return {
        rows: [
          {
            target_id: 'comuna:las-condes',
            metadata: {
              dotacion_counts: { '2': 3 },
              dias_counts: { '1': 3 },
            },
          },
        ],
      }
    }
    if (s.startsWith('SELECT q.*')) {
      const q = quotations.find(item => item.id === params[0])
      return { rows: q ? [q] : [] }
    }
    if (s.startsWith('SELECT * FROM quotation_categories')) return { rows: [] }
    if (s.startsWith('SELECT * FROM quotation_line_items')) {
      const q = quotations.find(item => item.id === params[0])
      return { rows: q?.line_items ?? [] }
    }
    if (s.startsWith('SELECT * FROM quotation_terms')) return { rows: [] }
    if (s.startsWith('SELECT * FROM v_quotation_totals')) {
      return {
        rows: [
          { quotation_id: params[0], costo_neto: 24000, venta_neta: 34285, beneficio_bruto: 10285 },
        ],
      }
    }
    if (s.startsWith('SELECT value FROM app_config')) {
      return { rows: [{ value: '39500' }] }
    }
    if (s.startsWith('INSERT INTO chatbot_actions')) return { rows: [] }
    if (s.startsWith('INSERT INTO chatbot_graph_nodes')) return { rows: [] }
    if (s.startsWith('INSERT INTO chatbot_graph_edges')) return { rows: [] }
    if (s.startsWith('SELECT id, type, label, properties, updated_at FROM chatbot_graph_nodes'))
      return { rows: [] }
    if (s.startsWith('INSERT INTO quotations')) {
      const row = {
        id: 'q-new',
        correlative: String(params[0] ?? ''),
        client_id: String(params[1] ?? ''),
        client_name: '',
        status: 'Borrador',
        ref: '',
        date: '2026-01-01',
        line_items: [],
        deleted_at: null,
        version: 1,
      }
      quotations.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('INSERT INTO quotation_categories')) return { rows: [] }
    if (s.startsWith('INSERT INTO quotation_line_items')) return { rows: [] }
    if (s.startsWith('INSERT INTO quotation_terms')) return { rows: [] }
    if (s.startsWith('SELECT id FROM quotations WHERE correlative')) return { rows: [] }
    if (s.includes('FROM clients') && s.includes('regexp_replace')) return { rows: [clients[0]] }

    return { rows: [] }
  })

  return {
    pool: {
      query,
      connect: async () => ({ query, release: () => {} }),
    } as unknown as Pool,
    state: { runs, steps, rules, clients, quotations },
  }
}

describe('Herramientas del agente', () => {
  it('buscar_catalogo encuentra materiales en catalogo mecanico y electrico', async () => {
    const { pool } = createMockPool()
    const ctx: AgentContext = {
      pool,
      userId: 'u1',
      instruction: 'busca cobre',
      recentTurns: [],
      graphContext: '',
      runId: 'run-1',
      model: 'gemini-3.6-flash',
    }

    const res = await buscarCatalogoTool.execute({ termino: 'cobre' }, ctx)
    const out = res.output as { total_encontrados: number; items: Array<{ descripcion: string }> }
    expect(out.total_encontrados).toBe(1)
    expect(out.items[0].descripcion).toContain('Tubo de cobre')
  })

  it('calcular_items_automaticos calcula colacion y bono fuera de santiago', async () => {
    const { pool } = createMockPool()
    const ctx: AgentContext = {
      pool,
      userId: 'u1',
      instruction: 'calcular',
      recentTurns: [],
      graphContext: '',
      runId: 'run-1',
      model: 'gemini-3.6-flash',
    }

    // Rancagua no está en las comunas de la RM
    const res = await calcularItemsAutoTool.execute(
      { dias: 2, dotacion: 3, comuna: 'Rancagua' },
      ctx
    )
    const out = res.output as { lineas_generadas: unknown[]; total_estimado_clp: number }
    expect(out.lineas_generadas).toHaveLength(2)
    // Colación: 3 * 2 * 6000 = 36000
    // Bono: 3 * 2 * 15000 = 90000
    expect(out.total_estimado_clp).toBe(126000)
  })

  it('ver_cotizacion nunca expone RUT ni datos personales del cliente al output (A-21)', async () => {
    const { pool } = createMockPool()
    const ctx: AgentContext = {
      pool,
      userId: 'u1',
      instruction: 'ver cotizacion',
      quotationId: 'q1',
      recentTurns: [],
      graphContext: '',
      runId: 'run-1',
      model: 'gemini-3.6-flash',
    }

    const res = await verCotizacionTool.execute({}, ctx)
    const out = res.output as Record<string, unknown>
    expect(out.correlativo).toBe('SYM-100-01-2026')
    expect(out.rut).toBeUndefined()
    expect(out.email).toBeUndefined()
    expect(out.telefono).toBeUndefined()
  })

  it('ensenar_regla actualiza y supersede la tarifa', async () => {
    const { pool, state } = createMockPool()
    const ctx: AgentContext = {
      pool,
      userId: 'u1',
      instruction: 'colacion 8000',
      recentTurns: [],
      graphContext: '',
      runId: 'run-1',
      model: 'gemini-3.6-flash',
    }

    const res = await ensenarReglaTool.execute(
      { rule_key: 'tarifa_colacion_diaria', value: 8000 },
      ctx
    )
    const out = res.output as { valor: number }
    expect(out.valor).toBe(8000)
    const current = state.rules.filter(
      r => r.rule_key === 'tarifa_colacion_diaria' && !r.superseded_at
    )
    expect(current).toHaveLength(1)
    expect(current[0].value).toBe(8000)
  })
})

describe('runAgentLoop (Bucle de ejecucion del agente)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ejecuta herramientas de forma secuencial y audita agent_runs y agent_steps', async () => {
    const { pool, state } = createMockPool()
    const ctx: AgentContext = {
      pool,
      userId: 'u1',
      instruction: 'busca cobre y luego dime que encontraste',
      recentTurns: [],
      graphContext: '',
      runId: 'run-test-1',
      model: 'gemini-3.6-flash',
    }

    // Turno 1: el LLM llama a buscar_catalogo
    mockedCallLlmWithTools.mockResolvedValueOnce({
      modelContent: {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'buscar_catalogo',
              args: { termino: 'cobre' },
            },
          },
        ],
      },
      functionCalls: [{ name: 'buscar_catalogo', args: { termino: 'cobre' } }],
      text: '',
      usage: { tokensIn: 20, tokensOut: 10 },
    })

    // Turno 2: el LLM concluye con texto
    mockedCallLlmWithTools.mockResolvedValueOnce({
      modelContent: {
        role: 'model',
        parts: [{ text: 'Encontre tubo de cobre 1/2 en el catalogo a $8.500.' }],
      },
      functionCalls: [],
      text: 'Encontre tubo de cobre 1/2 en el catalogo a $8.500.',
      usage: { tokensIn: 35, tokensOut: 15 },
    })

    const result = await runAgentLoop(ctx)

    expect(result.status).toBe('done')
    expect(result.reply).toContain('Encontre tubo de cobre')
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].tool).toBe('buscar_catalogo')

    // Verifica que se registraron los pasos en agent_runs y agent_steps
    expect(state.runs).toHaveLength(1)
    expect(state.runs[0].status).toBe('done')
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0].tool).toBe('buscar_catalogo')
  })

  it('limita el bucle al alcanzar MAX_STEPS sin caer en loop infinito', async () => {
    const { pool, state } = createMockPool()
    const ctx: AgentContext = {
      pool,
      userId: 'u1',
      instruction: 'repite busqueda',
      recentTurns: [],
      graphContext: '',
      runId: 'run-test-budget',
      model: 'gemini-3.6-flash',
    }

    // El modelo siempre devuelve una llamada a herramienta
    mockedCallLlmWithTools.mockResolvedValue({
      modelContent: {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'consultar_regla',
              args: { clave_regla: 'todas' },
            },
          },
        ],
      },
      functionCalls: [{ name: 'consultar_regla', args: { clave_regla: 'todas' } }],
      text: '',
      usage: { tokensIn: 10, tokensOut: 5 },
    })

    const result = await runAgentLoop(ctx)

    expect(result.status).toBe('budget_exhausted')
    expect(result.steps.length).toBe(MAX_STEPS)
    expect(state.runs[0].status).toBe('budget_exhausted')
  })

  describe('consultarHistorialClienteTool', () => {
    it('obtiene metricas de cotizaciones, win rate y patrones de dotacion sin exponer PII', async () => {
      const { pool } = createMockPool()
      const ctx: AgentContext = {
        pool,
        userId: 'u1',
        instruction: 'consultar historial',
        recentTurns: [],
        graphContext: '',
        runId: 'run-test-history',
        model: 'gemini-3.6-flash',
      }

      const res = await consultarHistorialClienteTool.execute(
        { cliente_nombre_o_rut: 'Climatemp' },
        ctx
      )

      expect(res.output.encontrado).toBe(true)
      const data = res.output as {
        cliente: { nombre: string; email?: string; phone?: string; address?: string }
        metricas_comerciales: {
          total_cotizaciones: number
          adjudicadas: number
          tasa_adjudicacion_pct: number
        }
        patrones_operacionales: Array<{
          comuna: string
          dotacion_habitual: number
          dias_habituales: number
        }>
      }
      expect(data.cliente.nombre).toBe('Climatemp SpA')
      expect(data.metricas_comerciales.total_cotizaciones).toBe(3)
      expect(data.metricas_comerciales.adjudicadas).toBe(2)
      expect(data.metricas_comerciales.tasa_adjudicacion_pct).toBe(67)
      expect(data.patrones_operacionales).toHaveLength(1)
      expect(data.patrones_operacionales[0].comuna).toBe('las condes')
      expect(data.patrones_operacionales[0].dotacion_habitual).toBe(2)
      expect(data.patrones_operacionales[0].dias_habituales).toBe(1)

      // Verificacion estricta de PII (Directriz A-21)
      expect(data.cliente.email).toBeUndefined()
      expect(data.cliente.phone).toBeUndefined()
      expect(data.cliente.address).toBeUndefined()
      expect(res.summary).toContain('Historial de Climatemp SpA')
    })

    it('retorna encontrado=false cuando el cliente no existe', async () => {
      const { pool } = createMockPool()
      const ctx: AgentContext = {
        pool,
        userId: 'u1',
        instruction: 'consultar historial',
        recentTurns: [],
        graphContext: '',
        runId: 'run-test-history-404',
        model: 'gemini-3.6-flash',
      }

      const res = await consultarHistorialClienteTool.execute(
        { cliente_nombre_o_rut: 'Cliente Inexistente XYZ' },
        ctx
      )

      expect(res.output.encontrado).toBe(false)
      expect(res.summary).toContain('no encontrado')
    })
  })
})
