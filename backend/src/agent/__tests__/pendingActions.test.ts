import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Pool } from 'pg'
import { ToolRegistry } from '../registry'
import { AgentTool, AgentToolResult } from '../types'
import {
  cancelPendingAction,
  confirmPendingAction,
  createPendingAction,
  describeWriteAction,
  PENDING_ACTION_TTL_MINUTES,
} from '../pendingActions'
import { runAgentLoop } from '../loop'
import { modificarCotizacionTool } from '../tools/quotationTool'
import { httpError } from '../../utils/httpError'

vi.mock('../../services/llm', async () => {
  const actual = await vi.importActual<typeof import('../../services/llm')>('../../services/llm')
  return { ...actual, callLlmWithTools: vi.fn() }
})
import { callLlmWithTools } from '../../services/llm'

vi.mock('../../api/quotations', async () => {
  const actual =
    await vi.importActual<typeof import('../../api/quotations')>('../../api/quotations')
  return { ...actual, fullQuotation: vi.fn(async (_pool: unknown, id: string) => ({ id })) }
})
const mockedCallLlmWithTools = callLlmWithTools as unknown as ReturnType<typeof vi.fn>

type QueryResult = { rows?: unknown[]; rowCount?: number }
type Handler = (sql: string, params: unknown[]) => QueryResult | undefined

// Pool falso que responde según el fragmento de SQL. Sin respuesta, devuelve vacío.
function fakePool(handler: Handler = () => undefined) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const r = handler(sql, params) ?? {}
    return { rows: r.rows ?? [], rowCount: r.rowCount ?? r.rows?.length ?? 0 }
  })
  return { query } as unknown as Pool & { query: typeof query }
}

const PENDING_ROW = {
  run_id: 'run-1',
  tenant_id: null,
  tool: 'fake_escribir',
  args: { nombre: 'Cliente Uno' },
}

function writeTool(overrides: Partial<AgentTool> = {}) {
  const execute = vi.fn<(args: Record<string, unknown>) => Promise<AgentToolResult>>(async () => ({
    output: { creada: true },
    summary: 'Creó la cotización Q-1',
    mutatedQuotation: { id: 'q1' },
  }))
  const tool: AgentTool = {
    name: 'fake_escribir',
    description: 'Escribe algo de prueba',
    parameters: {},
    kind: 'write',
    describe: args => `Escribir para ${String(args.nombre)}`,
    execute,
    ...overrides,
  }
  return { tool, execute }
}

function registryWith(tool: AgentTool) {
  const registry = new ToolRegistry()
  registry.register(tool)
  return registry
}

describe('describeWriteAction', () => {
  it('usa describe() de la herramienta cuando existe', () => {
    const { tool } = writeTool()
    expect(describeWriteAction(tool, 'fake_escribir', { nombre: 'Ana' })).toBe('Escribir para Ana')
  })

  it('cae a un texto genérico si la herramienta no define describe()', () => {
    const { tool } = writeTool({ describe: undefined })
    expect(describeWriteAction(tool, 'fake_escribir', {})).toBe('Ejecutar fake_escribir')
  })
})

describe('createPendingAction', () => {
  it('inserta la propuesta con vencimiento y devuelve su id', async () => {
    const expires = new Date(Date.now() + PENDING_ACTION_TTL_MINUTES * 60_000)
    const pool = fakePool(sql =>
      sql.includes('INSERT INTO agent_pending_actions')
        ? { rows: [{ id: 'acc-1', expires_at: expires }] }
        : undefined
    )

    const ref = await createPendingAction(pool, {
      runId: 'run-1',
      userId: 'user-1',
      tool: 'fake_escribir',
      args: { nombre: 'Ana' },
      summary: 'Escribir para Ana',
    })

    expect(ref).toEqual({
      id: 'acc-1',
      tool: 'fake_escribir',
      summary: 'Escribir para Ana',
      expires_at: expires.toISOString(),
    })
    const [sql, params] = pool.query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain(`INTERVAL '${PENDING_ACTION_TTL_MINUTES} minutes'`)
    expect(params[4]).toBe(JSON.stringify({ nombre: 'Ana' }))
  })
})

describe('confirmPendingAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ejecuta la herramienta una sola vez con los argumentos guardados', async () => {
    const { tool, execute } = writeTool()
    const pool = fakePool(sql =>
      sql.includes("SET status = 'confirmed'") ? { rows: [PENDING_ROW] } : undefined
    )

    const res = await confirmPendingAction(pool, registryWith(tool), {
      id: 'acc-1',
      userId: 'user-1',
      userRole: 'commercial',
      model: 'm',
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0]).toEqual({ nombre: 'Cliente Uno' })
    expect(res.reply).toBe('Creó la cotización Q-1')
    expect(res.result.mutatedQuotation).toEqual({ id: 'q1' })
  })

  it('responde 404 si la acción no existe o es de otro usuario', async () => {
    const { tool, execute } = writeTool()
    const pool = fakePool(() => undefined)

    await expect(
      confirmPendingAction(pool, registryWith(tool), { id: 'x', userId: 'user-1', model: 'm' })
    ).rejects.toMatchObject({ status: 404 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('responde 404 cuando el dueño de la fila es otro usuario', async () => {
    const { tool, execute } = writeTool()
    const pool = fakePool(sql =>
      sql.startsWith('SELECT status')
        ? { rows: [{ status: 'pending', user_id: 'otro', expired: false }] }
        : undefined
    )

    await expect(
      confirmPendingAction(pool, registryWith(tool), { id: 'x', userId: 'user-1', model: 'm' })
    ).rejects.toMatchObject({ status: 404 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('responde 410 y marca como expirada una acción vencida', async () => {
    const { tool, execute } = writeTool()
    const pool = fakePool(sql => {
      if (sql.startsWith('SELECT status'))
        return { rows: [{ status: 'pending', user_id: 'user-1', expired: true }] }
      return undefined
    })

    await expect(
      confirmPendingAction(pool, registryWith(tool), { id: 'x', userId: 'user-1', model: 'm' })
    ).rejects.toMatchObject({ status: 410 })
    expect(execute).not.toHaveBeenCalled()
    const expiredWrite = pool.query.mock.calls.some(c => String(c[0]).includes("'expired'"))
    expect(expiredWrite).toBe(true)
  })

  it('responde 409 si la acción ya fue resuelta', async () => {
    const { tool, execute } = writeTool()
    const pool = fakePool(sql =>
      sql.startsWith('SELECT status')
        ? { rows: [{ status: 'confirmed', user_id: 'user-1', expired: false }] }
        : undefined
    )

    await expect(
      confirmPendingAction(pool, registryWith(tool), { id: 'x', userId: 'user-1', model: 'm' })
    ).rejects.toMatchObject({ status: 409 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rechaza con 403 si la herramienta no está disponible para el rol', async () => {
    const { tool, execute } = writeTool({ roles: ['admin'] })
    const pool = fakePool(sql =>
      sql.includes("SET status = 'confirmed'") ? { rows: [PENDING_ROW] } : undefined
    )

    await expect(
      confirmPendingAction(pool, registryWith(tool), {
        id: 'acc-1',
        userId: 'user-1',
        userRole: 'commercial',
        model: 'm',
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('marca como fallida la acción si la herramienta lanza error', async () => {
    const { tool, execute } = writeTool()
    execute.mockRejectedValueOnce(new Error('cliente no existe'))
    const pool = fakePool(sql =>
      sql.includes("SET status = 'confirmed'") ? { rows: [PENDING_ROW] } : undefined
    )

    await expect(
      confirmPendingAction(pool, registryWith(tool), {
        id: 'acc-1',
        userId: 'user-1',
        userRole: 'commercial',
        model: 'm',
      })
    ).rejects.toMatchObject({ status: 500 })
    const failed = pool.query.mock.calls.some(
      c => Array.isArray(c[1]) && c[1].includes('failed') && c[1].includes('cliente no existe')
    )
    expect(failed).toBe(true)
  })
})

describe('cancelPendingAction', () => {
  it('cancela una acción pendiente del usuario', async () => {
    const pool = fakePool(sql =>
      sql.includes("SET status = 'cancelled'") ? { rows: [{ id: 'acc-1' }] } : undefined
    )
    await expect(
      cancelPendingAction(pool, { id: 'acc-1', userId: 'user-1' })
    ).resolves.toBeUndefined()
  })

  it('responde 404 si no hay acción pendiente que cancelar', async () => {
    const pool = fakePool(() => undefined)
    await expect(cancelPendingAction(pool, { id: 'x', userId: 'user-1' })).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('runAgentLoop con control de escrituras', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no ejecuta una escritura: la propone y termina en needs_input', async () => {
    const { tool, execute } = writeTool()
    const registry = registryWith(tool)
    const pool = fakePool(sql =>
      sql.includes('INSERT INTO agent_pending_actions')
        ? {
            rows: [
              {
                id: 'acc-1',
                expires_at: new Date(Date.now() + 15 * 60_000),
              },
            ],
          }
        : undefined
    )

    mockedCallLlmWithTools
      .mockResolvedValueOnce({
        modelContent: { role: 'model', parts: [] },
        functionCalls: [{ name: 'fake_escribir', args: { nombre: 'Cliente Uno' } }],
        text: '',
        usage: { tokensIn: 1, tokensOut: 1 },
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model', parts: [] },
        functionCalls: [],
        text: 'Quedó pendiente de tu confirmación.',
        usage: { tokensIn: 1, tokensOut: 1 },
      })

    const res = await runAgentLoop(
      {
        pool,
        userId: 'user-1',
        userRole: 'commercial',
        instruction: 'crea la cotización',
        recentTurns: [],
        graphContext: '',
        runId: 'run-1',
        model: 'm',
      },
      registry
    )

    expect(execute).not.toHaveBeenCalled()
    expect(res.status).toBe('needs_input')
    expect(res.acciones_pendientes).toHaveLength(1)
    expect(res.acciones_pendientes?.[0]).toMatchObject({
      id: 'acc-1',
      tool: 'fake_escribir',
      summary: 'Escribir para Cliente Uno',
    })
    expect(res.reply).toBe('Quedó pendiente de tu confirmación.')
  })

  it('rechaza una herramienta pedida fuera de su rol sin ejecutarla', async () => {
    const { tool, execute } = writeTool({ roles: ['admin'] })
    const registry = registryWith(tool)
    const pool = fakePool(() => undefined)

    mockedCallLlmWithTools
      .mockResolvedValueOnce({
        modelContent: { role: 'model', parts: [] },
        functionCalls: [{ name: 'fake_escribir', args: { nombre: 'X' } }],
        text: '',
        usage: { tokensIn: 1, tokensOut: 1 },
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model', parts: [] },
        functionCalls: [],
        text: 'No puedo hacer eso.',
        usage: { tokensIn: 1, tokensOut: 1 },
      })

    const res = await runAgentLoop(
      {
        pool,
        userId: 'user-1',
        userRole: 'commercial',
        instruction: 'x',
        recentTurns: [],
        graphContext: '',
        runId: 'run-1',
        model: 'm',
      },
      registry
    )

    expect(execute).not.toHaveBeenCalled()
    expect(res.status).toBe('done')
    expect(res.acciones_pendientes).toBeUndefined()
  })
})

describe('hook prepare y cotización abierta (E1)', () => {
  beforeEach(() => vi.clearAllMocks())

  const baseCtx = {
    userId: 'user-1',
    userRole: 'commercial',
    instruction: 'agrega un ítem',
    recentTurns: [],
    graphContext: '',
    runId: 'run-1',
    model: 'm',
  }

  function llmCalls(name: string, args: Record<string, unknown>) {
    mockedCallLlmWithTools
      .mockResolvedValueOnce({
        modelContent: { role: 'model', parts: [] },
        functionCalls: [{ name, args }],
        text: '',
        usage: { tokensIn: 1, tokensOut: 1 },
      })
      .mockResolvedValueOnce({
        modelContent: { role: 'model', parts: [] },
        functionCalls: [],
        text: 'listo',
        usage: { tokensIn: 1, tokensOut: 1 },
      })
  }

  const insertPool = () =>
    fakePool(sql =>
      sql.includes('INSERT INTO agent_pending_actions')
        ? { rows: [{ id: 'acc-1', expires_at: new Date(Date.now() + 15 * 60_000) }] }
        : undefined
    )

  it('propuesta de modificar_cotizacion guarda quotation_id de la cotización abierta', async () => {
    const pool = insertPool()
    llmCalls('modificar_cotizacion', { materiales: [{ descripcion: 'Cañería' }] })

    await runAgentLoop(
      { ...baseCtx, pool, quotationId: 'q1' },
      registryWith(modificarCotizacionTool)
    )

    const insert = pool.query.mock.calls.find(c =>
      String(c[0]).includes('INSERT INTO agent_pending_actions')
    ) as unknown as [string, unknown[]]
    expect(JSON.parse(String(insert[1][4]))).toMatchObject({ quotation_id: 'q1' })
  })

  it('modificar_cotizacion sin cotización abierta no crea propuesta', async () => {
    const pool = insertPool()
    llmCalls('modificar_cotizacion', { materiales: [{ descripcion: 'Cañería' }] })

    await runAgentLoop({ ...baseCtx, pool }, registryWith(modificarCotizacionTool))

    const inserted = pool.query.mock.calls.some(c =>
      String(c[0]).includes('INSERT INTO agent_pending_actions')
    )
    expect(inserted).toBe(false)
    const turn2 = mockedCallLlmWithTools.mock.calls[1][0] as Array<{
      parts: Array<{ functionResponse?: { response: Record<string, unknown> } }>
    }>
    const response = turn2[turn2.length - 1].parts[0].functionResponse?.response
    expect(response?.error).toBeTruthy()
  })

  it('error de prepare viaja con opciones', async () => {
    const opciones = [{ id: '1', name: 'A' }]
    const { tool } = writeTool({
      prepare: async () => {
        throw httpError('hay varias', 409, { opciones })
      },
    })
    const pool = insertPool()
    llmCalls('fake_escribir', { nombre: 'X' })

    await runAgentLoop({ ...baseCtx, pool }, registryWith(tool))

    const turn2 = mockedCallLlmWithTools.mock.calls[1][0] as Array<{
      parts: Array<{ functionResponse?: { response: Record<string, unknown> } }>
    }>
    const response = turn2[turn2.length - 1].parts[0].functionResponse?.response
    expect(response?.opciones).toEqual(opciones)
  })

  it('el prompt incluye la cotización abierta', async () => {
    const pool = insertPool()
    mockedCallLlmWithTools.mockResolvedValueOnce({
      modelContent: { role: 'model', parts: [] },
      functionCalls: [],
      text: 'ok',
      usage: { tokensIn: 1, tokensOut: 1 },
    })

    await runAgentLoop({ ...baseCtx, pool, quotationId: 'q1' }, registryWith(writeTool().tool))

    const opts = mockedCallLlmWithTools.mock.calls[0][1] as { systemInstruction: string }
    expect(opts.systemInstruction).toContain('q1')
  })
})
