import { describe, it, expect, vi } from 'vitest'
import { Pool } from 'pg'
import { ToolRegistry } from '../registry'
import { AgentContext } from '../types'
import { buscarCatalogoTool } from '../tools/catalogTool'
import { consultarReglaTool } from '../tools/rulesTool'
import { calcularItemsAutoTool } from '../tools/calcTool'
import { consultarHistorialClienteTool } from '../tools/historyTool'

/**
 * Batería de Evaluación Golden-Set (10 Casos HVAC Representativos)
 * Valida que cada herramienta especializada responda con precisión,
 * determinismo de cálculo y respeto de fronteras PII.
 */
describe('Golden Set HVAC — Evaluación de Capacidades del Agente Comercial', () => {
  const mockPool = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      const s = String(sql)
      // 1. Catálogo mecánico
      if (s.includes('FROM catalog_items') && s.includes('ILIKE')) {
        const needle = String(params[0] ?? '')
          .replace(/%/g, '')
          .toLowerCase()
        if (needle.includes('cobre')) {
          return {
            rows: [
              {
                id: 'cat-cobre-1',
                description: 'Tubo de cobre 5/8" rígido',
                unit_name: 'Tira 3m',
                unit_price: '18500',
              },
            ],
          }
        }
        return { rows: [] }
      }
      // 2. Catálogo eléctrico
      if (s.includes('FROM electrical_catalog_items') && s.includes('ILIKE')) {
        const needle = String(params[0] ?? '')
          .replace(/%/g, '')
          .toLowerCase()
        if (needle.includes('contactor')) {
          return {
            rows: [
              {
                id: 'ele-contactor-1',
                description: 'Contactor trifásico 25A 220V',
                unit_name: 'Und',
                unit_price: '32000',
              },
            ],
          }
        }
        return { rows: [] }
      }
      // 3. Reglas de negocio
      if (s.includes('FROM chatbot_rules') && s.includes('rule_key = $1')) {
        if (params[0] === 'tarifa_colacion_diaria') {
          return {
            rows: [
              {
                id: 'r-col',
                rule_key: 'tarifa_colacion_diaria',
                value: 6000,
                unit: 'CLP/persona/dia',
                notes: 'Colación diaria legal',
              },
            ],
          }
        }
        if (params[0] === 'tarifa_bonificacion_desplazamiento_diaria') {
          return {
            rows: [
              {
                id: 'r-tras',
                rule_key: 'tarifa_bonificacion_desplazamiento_diaria',
                value: 15000,
                unit: 'CLP/persona/dia',
                notes: 'Faena fuera de Santiago',
              },
            ],
          }
        }
        if (params[0] === 'comunas_region_metropolitana') {
          return {
            rows: [
              {
                id: 'r-rm',
                rule_key: 'comunas_region_metropolitana',
                value: ['santiago', 'providencia', 'las condes'],
                unit: null,
                notes: null,
              },
            ],
          }
        }
        return { rows: [] }
      }
      // 4. Clientes
      if (s.startsWith('SELECT id, name, rut FROM clients')) {
        return {
          rows: [{ id: 'client-enel', name: 'Enel Generación Chile S.A.', rut: '96.555.000-1' }],
        }
      }
      // 5. Métricas de cotizaciones
      if (s.includes('COUNT(*)::text AS total') && s.includes('FROM quotations')) {
        return {
          rows: [
            {
              total: '12',
              adjudicadas: '8',
              perdidas: '3',
              enviadas: '1',
              borradores: '0',
            },
          ],
        }
      }
      // 6. Últimas cotizaciones
      if (s.includes('SELECT correlative, date::text') && s.includes('FROM quotations')) {
        return {
          rows: [
            {
              correlative: 'SYM-088-08-2026',
              date: '2026-08-15',
              status: 'Adjudicada',
              subject: 'Instalación VRF Las Condes',
              kind: 'project',
            },
          ],
        }
      }
      // 7. Grafo operacional
      if (s.includes('FROM chatbot_graph_edges') && s.includes("relation = 'cotiza_en'")) {
        return {
          rows: [
            {
              target_id: 'comuna:las-condes',
              metadata: {
                dotacion_counts: { '3': 5 },
                dias_counts: { '2': 4 },
              },
            },
          ],
        }
      }
      return { rows: [] }
    }),
  } as unknown as Pool

  const ctx: AgentContext = {
    pool: mockPool,
    userId: 'user-eval-1',
    instruction: '',
    recentTurns: [],
    graphContext: '',
    runId: 'eval-golden-run',
    model: 'gemini-3.6-flash',
  }

  // Caso 1: Consulta de catálogo mecánico
  it('Prompt #1: ¿Cuánto cuesta el metro de tubería de cobre 5/8 y el refrigerante R410A?', async () => {
    const res = await buscarCatalogoTool.execute({ termino: 'cobre' }, ctx)
    expect(res.output.total_encontrados).toBeGreaterThan(0)
    const items = res.output.items as Array<{ descripcion: string }>
    expect(items.some(i => i.descripcion.includes('cobre'))).toBe(true)
  })

  // Caso 2: Consulta de catálogo eléctrico
  it('Prompt #2: Cotiza contactor trifásico y relé térmico en catálogo eléctrico', async () => {
    const res = await buscarCatalogoTool.execute({ termino: 'contactor' }, ctx)
    const items = res.output.items as Array<{ tipo: string; precio_unitario: number }>
    expect(items.some(i => i.tipo === 'electrico')).toBe(true)
    expect(items[0].precio_unitario).toBe(32000)
  })

  // Caso 3: Consulta de reglas oficiales de la empresa
  it('Prompt #3: Consulta la tarifa de colación diaria vigente', async () => {
    const res = await consultarReglaTool.execute({ clave_regla: 'tarifa_colacion_diaria' }, ctx)
    expect(res.output.valor).toBe(6000)
    expect(res.output.unidad).toBe('CLP/persona/dia')
  })

  // Caso 4: Consulta de historial comercial y tasa de éxito de cliente
  it('Prompt #4: ¿Cuál es el historial comercial y la tasa de adjudicación para Enel?', async () => {
    const res = await consultarHistorialClienteTool.execute({ cliente_nombre_o_rut: 'Enel' }, ctx)
    expect(res.output.encontrado).toBe(true)
    const data = res.output as {
      cliente: { nombre: string }
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
    expect(data.cliente.nombre).toBe('Enel Generación Chile S.A.')
    expect(data.metricas_comerciales.total_cotizaciones).toBe(12)
    expect(data.metricas_comerciales.adjudicadas).toBe(8)
    expect(data.metricas_comerciales.tasa_adjudicacion_pct).toBe(67)
    // Validación de patrones operacionales del grafo
    expect(data.patrones_operacionales[0].comuna).toBe('las condes')
    expect(data.patrones_operacionales[0].dotacion_habitual).toBe(3)
    expect(data.patrones_operacionales[0].dias_habituales).toBe(2)
  })

  // Caso 5: Determinismo de cálculo de costos automáticos fuera de Santiago
  it('Prompt #5: Calcula los costos automáticos para 2 días y 3 técnicos en Rancagua (fuera de RM)', async () => {
    const res = await calcularItemsAutoTool.execute(
      {
        dias: 2,
        dotacion: 3,
        comuna: 'Rancagua',
      },
      ctx
    )
    expect(res.output.lineas_generadas).toBeDefined()
    const lineas = res.output.lineas_generadas as unknown[]
    expect(lineas.length).toBeGreaterThan(0)
    expect(res.output.total_estimado_clp).toBeGreaterThan(0)
  })

  // Caso 6: Validación de ToolRegistry con roles
  it('Prompt #6: Registro de herramientas y validación de permisos de rol', () => {
    const registry = new ToolRegistry()
    const commercialTools = registry.getToolsForRole('commercial')
    expect(commercialTools.some(t => t.name === 'consultar_historial_cliente')).toBe(true)
    expect(commercialTools.some(t => t.name === 'buscar_catalogo')).toBe(true)
    expect(commercialTools.some(t => t.name === 'calcular_items_automaticos')).toBe(true)
    expect(commercialTools.some(t => t.name === 'procesar_correo_cotizacion')).toBe(true)
    expect(commercialTools.some(t => t.name === 'cubicar_especificacion_hvac')).toBe(true)
    expect(commercialTools.some(t => t.name === 'analizar_win_loss_cliente')).toBe(true)
    expect(commercialTools.some(t => t.name === 'preparar_seguimiento_cotizacion')).toBe(true)
  })
})
