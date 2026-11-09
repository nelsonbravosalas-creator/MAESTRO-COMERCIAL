import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Pool } from 'pg'
import { ToolRegistry } from '../registry'
import { AgentContext } from '../types'
import { buscarCatalogoTool } from '../tools/catalogTool'
import { consultarReglaTool } from '../tools/rulesTool'
import { calcularItemsAutoTool } from '../tools/calcTool'
import { consultarHistorialClienteTool } from '../tools/historyTool'
import { cubicarBorradorTool } from '../tools/cubicadorTools'
import { runAgentLoop } from '../loop'
import { confirmPendingAction } from '../pendingActions'
import { defaultToolRegistry } from '../registry'
import { fakeBd } from '../../cubicador/__tests__/fakeBd'
import { PARAMETROS_BASE } from '../../cubicador/params'
import { resolverPrecios } from '../../cubicador/precios'
import type { ItemListado, ResultadoCubicacion } from '../../cubicador/types'

vi.mock('../../services/chatbotOps', async () => {
  const actual = await vi.importActual<typeof import('../../services/chatbotOps')>(
    '../../services/chatbotOps'
  )
  return { ...actual, addLinesToQuotationOp: vi.fn(), lookupMaterialPrice: vi.fn() }
})
import { addLinesToQuotationOp, lookupMaterialPrice } from '../../services/chatbotOps'

vi.mock('../../services/llm', async () => {
  const actual = await vi.importActual<typeof import('../../services/llm')>('../../services/llm')
  return { ...actual, callLlmWithTools: vi.fn() }
})
import { callLlmWithTools } from '../../services/llm'

const mAdd = vi.mocked(addLinesToQuotationOp)
const mPrecio = vi.mocked(lookupMaterialPrice)
const mLlm = callLlmWithTools as unknown as ReturnType<typeof vi.fn>

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
      // F9: la cotización abierta existe y es editable.
      if (s.startsWith('SELECT status FROM quotations')) {
        return { rows: [{ status: 'Borrador' }] }
      }
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

  // E4 / PII A-21: el RUT del cliente nunca viaja al modelo
  it('el historial no entrega el RUT al modelo', async () => {
    const res = await consultarHistorialClienteTool.execute({ cliente_nombre_o_rut: 'Enel' }, ctx)
    const serializado = JSON.stringify(res.output)
    expect(serializado).not.toContain('96.555.000-1')
    expect(serializado).not.toContain('"rut"')
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

/**
 * Casos de punta a punta del cubicador: el LLM está simulado (solo decide qué herramienta
 * llamar y con qué datos de la ficha) y todo lo demás es el código real: compuerta,
 * motor de cálculo, propuesta pendiente y confirmación.
 */
describe('Golden Set Cubicador — de la entrevista al ingreso', () => {
  interface AccionGuardada {
    id: string
    run_id: string
    tenant_id: string | null
    user_id: string
    tool: string
    args: Record<string, unknown>
    status: 'pending' | 'confirmed'
  }

  // Pool falso: borradores en memoria (fakeBd) más la tabla de acciones pendientes.
  function armarPool() {
    const bd = fakeBd()
    const acciones = new Map<string, AccionGuardada>()
    const res = (rows: unknown[]) => ({ rows, rowCount: rows.length })
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (!sql.includes('agent_pending_actions')) return bd.pool.query(sql, params)
      if (sql.includes('INSERT INTO agent_pending_actions')) {
        const [runId, tenantId, userId, tool, args] = params as [
          string,
          string | null,
          string,
          string,
          string,
        ]
        const id = `acc-${acciones.size + 1}`
        acciones.set(id, {
          id,
          run_id: runId,
          tenant_id: tenantId,
          user_id: userId,
          tool,
          args: JSON.parse(args) as Record<string, unknown>,
          status: 'pending',
        })
        return res([{ id, expires_at: '2099-01-01T00:00:00.000Z' }])
      }
      if (sql.includes("SET status = 'confirmed'")) {
        const [id, userId] = params as [string, string]
        const a = acciones.get(id)
        if (!a || a.user_id !== userId || a.status !== 'pending') return res([])
        a.status = 'confirmed'
        return res([{ run_id: a.run_id, tenant_id: a.tenant_id, tool: a.tool, args: a.args }])
      }
      if (sql.includes('SELECT status, user_id')) {
        const a = acciones.get(params[0] as string)
        return res(a ? [{ status: a.status, user_id: a.user_id, expired: false }] : [])
      }
      return res([]) // duplicados pendientes, resumen del resultado, etc.
    })
    return { pool: { query } as unknown as AgentContext['pool'], filas: bd.filas, acciones }
  }

  function ctxDe(
    pool: AgentContext['pool'],
    instruction: string,
    quotationId: string | null = null
  ): AgentContext {
    return {
      pool,
      userId: 'u1',
      userRole: 'admin',
      instruction,
      quotationId,
      recentTurns: [],
      graphContext: '',
      runId: 'run-golden',
      model: 'test-model',
    }
  }

  // Un turno del usuario: el modelo simulado llama a las herramientas indicadas y luego responde.
  async function turno(
    ctx: AgentContext,
    llamadas: Array<{ name: string; args: Record<string, unknown> }>,
    respuesta: string
  ) {
    mLlm.mockReset()
    for (const llamada of llamadas) {
      mLlm.mockResolvedValueOnce({
        text: '',
        functionCalls: [llamada],
        modelContent: { role: 'model', parts: [] },
        usage: { tokensIn: 1, tokensOut: 1 },
      })
    }
    mLlm.mockResolvedValueOnce({
      text: respuesta,
      functionCalls: [],
      modelContent: { role: 'model', parts: [] },
      usage: { tokensIn: 1, tokensOut: 1 },
    })
    return runAgentLoop(ctx)
  }

  const porId = (r: ResultadoCubicacion, id: string): ItemListado | undefined =>
    r.items.find(i => i.id === id)
  const porDesc = (r: ResultadoCubicacion, texto: string): ItemListado | undefined =>
    r.items.find(i => i.descripcion.includes(texto))
  // Cilindros que pide el ítem de gas, según los kg por cilindro de los parámetros base.
  const cilindros = (item: ItemListado | undefined, gas: string): number =>
    Math.ceil((item?.cantidad ?? 0) / PARAMETROS_BASE.refrigerantes[gas].kg_cilindro)
  const OP_CTX = { instruction: 'precios', userId: 'u1', llmProvider: 'gemini' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Caso 1: reja 8 × 3 con puerta y chapa eléctrica, de la entrevista al ingreso sin duplicar', async () => {
    const { pool, filas, acciones } = armarPool()

    // Turno 1: la ficha completa abre la compuerta.
    const entrevista = await turno(
      ctxDe(pool, 'Reja de 8 m por 3 m con puerta de 0,9 por 2,2 y chapa eléctrica', 'q-abierta'),
      [
        {
          name: 'entrevistar_obra',
          args: {
            perfil: 'cierre_metalico',
            descripcion: 'Reja con puerta y chapa eléctrica',
            datos: {
              medidas: { largo_m: 8, alto_m: 3, puerta: { ancho_m: 0.9, alto_m: 2.2 } },
              tipo_cierre: 'reja con barrotes',
              anclaje: 'empotrado en hormigón',
              cerradura: 'eléctrica',
              chapa_electrica: true,
              distancia_tablero_m: 25,
              canalizacion: 'enterrada',
              control_acceso: 'botón adentro y citófono afuera',
              comuna: 'Santiago',
            },
          },
        },
      ],
      '¿Cubico?'
    )
    expect(entrevista.cubicador?.compuerta.habilitado).toBe(true)
    expect(entrevista.cubicador?.datos_completos).toBe(5)

    // Turno 2: «procede» cubica con el código del perfil.
    const cubicacion = await turno(
      ctxDe(pool, 'procede', 'q-abierta'),
      [{ name: 'cubicar_borrador', args: {} }],
      'Listo'
    )
    const resultado = cubicacion.cubicador?.resultado as ResultadoCubicacion
    expect(cubicacion.cubicador?.estado).toBe('cubicado')
    const perfil = porId(resultado, 'cierre-perfil')
    expect(perfil).toMatchObject({ categoria: 'mec', cantidad: 9 })
    expect(perfil?.descripcion).toContain('40x40x2')
    expect(perfil?.formula).toContain('5 postes de 3,6 m')
    expect(perfil?.formula).toContain('51,04 m')
    expect(porId(resultado, 'cierre-barrotes')).toMatchObject({ categoria: 'mec', cantidad: 158.4 })
    expect(porId(resultado, 'cierre-hormigon')).toMatchObject({ categoria: 'mat', cantidad: 0.27 })
    expect(porId(resultado, 'acceso-cable')).toMatchObject({ categoria: 'ele', cantidad: 36 })
    expect(porId(resultado, 'acceso-camaras')).toMatchObject({ categoria: 'ele', cantidad: 2 })
    expect(porId(resultado, 'cierre-electrodos')?.categoria).toBe('ins')
    expect(new Set(resultado.items.map(i => i.categoria))).toEqual(
      new Set(['mec', 'mat', 'ins', 'ele', 'mo'])
    )

    // F3: el ingreso exige precios resueltos. Sin fuente en tiendas, cada ítem queda «sin precio».
    mPrecio.mockResolvedValue({ muestras: [] } as unknown as Awaited<
      ReturnType<typeof lookupMaterialPrice>
    >)
    let precios = await resolverPrecios(pool, cubicacion.cubicador!.borrador_id, 'u1', OP_CTX)
    while (precios.precios_pendientes > 0) {
      precios = await resolverPrecios(pool, precios.borrador_id, 'u1', OP_CTX)
    }

    // Turno 3: ingresar propone UNA acción pendiente que lista todos los ítems.
    const propuesta = await turno(
      ctxDe(pool, 'ingresa el listado', 'q-abierta'),
      [{ name: 'ingresar_listado_a_cotizacion', args: {} }],
      'Quedó pendiente de confirmación'
    )
    expect(propuesta.acciones_pendientes).toHaveLength(1)
    expect(acciones.size).toBe(1)
    const accion = propuesta.acciones_pendientes![0]
    expect(accion.tool).toBe('ingresar_listado_a_cotizacion')
    for (const item of resultado.items) expect(accion.summary).toContain(item.descripcion)
    expect(mAdd).not.toHaveBeenCalled()
    expect([...filas.values()][0].estado).toBe('cubicado')

    // Confirmar agrega las líneas a la cotización abierta y marca el borrador ingresado.
    mAdd.mockResolvedValue({
      existing: { correlative: 'COT-1' },
      addedCount: resultado.items.length,
      updated: { id: 'q-abierta' },
    } as unknown as Awaited<ReturnType<typeof addLinesToQuotationOp>>)
    const entradaConfirmar = { id: accion.id, userId: 'u1', userRole: 'admin', model: 'test-model' }
    const confirmada = await confirmPendingAction(pool, defaultToolRegistry, entradaConfirmar)
    expect(confirmada.result.output.ingresado).toBe(true)
    expect(mAdd).toHaveBeenCalledTimes(1)
    expect(mAdd.mock.calls[0][1]).toBe('q-abierta')
    expect(mAdd.mock.calls[0][2].manualLineas).toHaveLength(resultado.items.length)
    const borrador = [...filas.values()][0]
    expect(borrador.estado).toBe('ingresado')
    expect(borrador.quotation_id).toBe('q-abierta')

    // Una segunda confirmación responde 409 y no agrega nada más.
    await expect(
      confirmPendingAction(pool, defaultToolRegistry, entradaConfirmar)
    ).rejects.toMatchObject({ status: 409 })
    expect(mAdd).toHaveBeenCalledTimes(1)
  })

  it('Caso 2: VRF R-410A con fuga: 11,1 kg, nitrógeno 1,35 m³ y 37 HH en 3 días', async () => {
    const { pool } = armarPool()
    await turno(
      ctxDe(pool, 'Fuga en VRF R-410A, placa 8,5 kg'),
      [
        {
          name: 'entrevistar_obra',
          args: {
            perfil: 'hvac',
            descripcion: 'Falla en VRF',
            datos: {
              tipo_trabajo: 'reparacion',
              sistema: 'vrf',
              actividad: 'fuga',
              refrigerante: 'R-410A',
              metodo: 'total',
              carga_placa_kg: 8.5,
              linea_liquido: { diametro: '3/8', largo_m: 40 },
              linea_gas: { diametro: '3/4', largo_m: 40 },
              volumen_equipos_l: 13.5,
              uniones: 2,
              estado_texto: 'fuga en una soldadura',
              comuna: 'Maipú',
            },
          },
        },
      ],
      '¿Cubico?'
    )
    const cubicacion = await turno(
      ctxDe(pool, 'procede'),
      [{ name: 'cubicar_borrador', args: {} }],
      'Listo'
    )
    const r = cubicacion.cubicador?.resultado as ResultadoCubicacion

    const gas = porDesc(r, 'R-410A')
    expect(gas).toMatchObject({ categoria: 'ins', unidad: 'kg', cantidad: 11.1 })
    expect(cilindros(gas, 'R-410A')).toBe(1)
    const nitrogeno = porDesc(r, 'Nitrógeno')
    expect(nitrogeno).toMatchObject({ categoria: 'ins', unidad: 'Rec', cantidad: 1 })
    // Con 2 uniones: (25,04 L × 37,90 barg + 3 × 30 L) × 1,30 = 1350,6 L. Los 1,39 m³ del
    // ejemplo de calcularNitrogeno corresponden a 4 soldaduras (120 L), no a esta ficha.
    expect(nitrogeno?.formula).toContain('= 1350,6 L = 1,35 m³')
    expect(r.dotacion).toMatchObject({ personas: 2, dias: 3, hh_calculadas: 37, hh_cotizadas: 37 })
    expect(r.items.filter(i => i.categoria === 'mo').map(i => i.cantidad)).toEqual([18.5, 18.5])
  })

  it('Caso 3: cámara R-404A sin placa ni estado: compuerta cerrada, luego supuestos y 32 HH', async () => {
    const { pool } = armarPool()

    // La primera consulta trae equipo, refrigerante y líneas, pero no la placa ni el estado.
    const primera = await turno(
      ctxDe(pool, 'Puesta a punto de una cámara de frío R-404A, líneas 3/8 y 7/8 de 20 m'),
      [
        {
          name: 'entrevistar_obra',
          args: {
            perfil: 'hvac',
            descripcion: 'Puesta a punto de cámara de frío',
            datos: {
              tipo_trabajo: 'reparacion',
              sistema: 'camara',
              actividad: 'puesta_a_punto',
              refrigerante: 'R-404A',
              metodo: 'total',
              linea_liquido: { diametro: '3/8', largo_m: 20 },
              linea_gas: { diametro: '7/8', largo_m: 20 },
              uniones: 2,
              jornadas_fijadas: 2,
            },
          },
        },
      ],
      'Me falta la placa y el estado'
    )
    expect(primera.cubicador?.compuerta).toMatchObject({
      habilitado: false,
      respondidas: 1,
      requeridas: 3,
      faltantes: ['refrigerante_lineas', 'estado_sistema'],
    })
    expect(primera.cubicador?.resultado).toBeNull()

    // Pedir cubicar con la compuerta cerrada devuelve bloqueado:true, sin lanzar y sin cubicar.
    const bloqueo = await cubicarBorradorTool.execute({}, ctxDe(pool, 'procede'))
    expect(bloqueo.output.bloqueado).toBe(true)
    expect(bloqueo.output.faltantes).toEqual(['refrigerante_lineas', 'estado_sistema'])

    // «No tengo la placa, supón; funciona sin síntomas»: abre la compuerta con supuestos.
    const segunda = await turno(
      ctxDe(pool, 'no tengo la placa, supón; funciona sin síntomas'),
      [
        {
          name: 'entrevistar_obra',
          args: { no_sabe: ['refrigerante_lineas', 'estado_sistema'] },
        },
      ],
      '¿Cubico?'
    )
    expect(segunda.cubicador?.compuerta.habilitado).toBe(true)

    const cubicacion = await turno(
      ctxDe(pool, 'procede'),
      [{ name: 'cubicar_borrador', args: {} }],
      'Listo'
    )
    const r = cubicacion.cubicador?.resultado as ResultadoCubicacion
    const placa = r.supuestos.find(s => s.clave === 'carga_placa_kg')
    expect(placa?.critico).toBe(true)
    expect(placa?.texto).toContain('4,0 kg')
    const gas = porDesc(r, 'R-404A')
    expect(gas).toMatchObject({ categoria: 'ins', unidad: 'kg', cantidad: 5.4 })
    expect(cilindros(gas, 'R-404A')).toBe(1)
    const nitrogeno = porDesc(r, 'Nitrógeno')
    expect(nitrogeno).toMatchObject({ unidad: 'Rec', cantidad: 1 })
    expect(nitrogeno?.formula).toContain('0,13 m³')
    expect(r.dotacion).toMatchObject({ personas: 2, dias: 2, hh_cotizadas: 32, holgura_hh: 10.5 })
    expect(r.items.filter(i => i.categoria === 'mo').map(i => i.cantidad)).toEqual([16, 16])

    // Sin fuente de precio, el refrigerante queda «sin precio» (nunca se inventa).
    mPrecio.mockResolvedValue({ muestras: [] } as unknown as Awaited<
      ReturnType<typeof lookupMaterialPrice>
    >)
    let estado = await resolverPrecios(pool, cubicacion.cubicador!.borrador_id, 'u1', OP_CTX)
    while (estado.precios_pendientes > 0) {
      estado = await resolverPrecios(pool, estado.borrador_id, 'u1', OP_CTX)
    }
    expect(porDesc(estado.resultado as ResultadoCubicacion, 'R-404A')).toMatchObject({
      estado_precio: 'sin_precio',
      precio_unitario: null,
    })
  })
})
