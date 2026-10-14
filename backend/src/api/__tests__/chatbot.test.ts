import { describe, it, expect, beforeAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createChatbotRouter } from '../chatbot'

const JWT_SECRET = 'test-secret-test-secret-test-secret'

vi.mock('../../services/llm', () => ({
  callLlm: vi.fn(),
  callLlmWithTools: vi.fn(),
  parseLlmJson: (raw: string) => JSON.parse(raw),
}))
import { callLlm, callLlmWithTools } from '../../services/llm'
const mockedCallLlm = callLlm as unknown as ReturnType<typeof vi.fn>
const mockedCallLlmWithTools = callLlmWithTools as unknown as ReturnType<typeof vi.fn>

const authHeader = (role = 'admin') => {
  const token = jwt.sign({ id: 'u1', email: 'test@test.com', name: 'Test', role }, JWT_SECRET)
  return `Bearer ${token}`
}

type Rule = {
  id: string
  rule_key: string
  value: unknown
  unit: string | null
  notes: string | null
  created_at: string
  superseded_at: string | null
}
type Client = {
  id: string
  name: string
  rut: string
  activity: null
  address: null
  city: null
  deleted_at: null
}

type GraphNode = { id: string; type: string; label: string; properties: Record<string, unknown> }
type GraphEdge = {
  source_id: string
  target_id: string
  relation: string
  weight: number
  metadata: Record<string, unknown>
}

type State = {
  rules: Rule[]
  actions: any[]
  clients: Client[]
  contacts: any[]
  quotations: any[]
  categories: any[]
  lineItems: any[]
  terms: any[]
  appConfig: Record<string, string>
  graphNodes: GraphNode[]
  graphEdges: GraphEdge[]
}

function cloneState(state: State): State {
  return JSON.parse(JSON.stringify(state))
}

function makeFakeDb(seed: Partial<State> = {}) {
  let state: State = {
    rules: seed.rules ?? [],
    actions: seed.actions ?? [],
    clients: seed.clients ?? [],
    contacts: seed.contacts ?? [],
    quotations: seed.quotations ?? [],
    categories: seed.categories ?? [],
    lineItems: seed.lineItems ?? [],
    terms: seed.terms ?? [],
    appConfig: seed.appConfig ?? { uf_value: '39500' },
    graphNodes: seed.graphNodes ?? [],
    graphEdges: seed.graphEdges ?? [],
  }
  let tx: State | null = null
  let idSeq = 1
  const active = () => tx ?? state
  const nextId = (prefix: string) => `${prefix}-${idSeq++}`

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()
    const db = active()

    if (s === 'BEGIN') {
      tx = cloneState(state)
      return { rows: [] }
    }
    if (s === 'COMMIT') {
      if (tx) state = tx
      tx = null
      return { rows: [] }
    }
    if (s === 'ROLLBACK') {
      tx = null
      return { rows: [] }
    }

    // ── auth_throttle (createAuthThrottle en el router) ──────────────
    if (s.startsWith('SELECT attempt_count')) return { rows: [] }
    if (s.startsWith('INSERT INTO auth_throttle')) return { rows: [] }

    // ── chatbot_rules ─────────────────────────────────────────────
    if (s.includes('FROM chatbot_rules') && s.includes('rule_key = $1') && s.includes('LIMIT 1')) {
      const row = db.rules.find(r => r.rule_key === params[0] && !r.superseded_at)
      return { rows: row ? [row] : [] }
    }
    if (s.includes('FROM chatbot_rules') && s.includes('ORDER BY rule_key')) {
      return {
        rows: db.rules
          .filter(r => !r.superseded_at)
          .sort((a, b) => a.rule_key.localeCompare(b.rule_key)),
      }
    }
    if (s.startsWith('UPDATE chatbot_rules')) {
      for (const r of db.rules)
        if (r.rule_key === params[0] && !r.superseded_at) r.superseded_at = new Date().toISOString()
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO chatbot_rules')) {
      const row: Rule = {
        id: nextId('rule'),
        rule_key: params[0],
        value: JSON.parse(params[1]),
        unit: params[2],
        notes: params[3],
        created_at: new Date().toISOString(),
        superseded_at: null,
      }
      db.rules.push(row)
      return { rows: [row] }
    }

    // ── chatbot_actions ───────────────────────────────────────────
    if (s.startsWith('INSERT INTO chatbot_actions')) {
      db.actions.push({
        user_id: params[0],
        instruction: params[1],
        action_type: params[2],
        quotation_id: params[3],
        llm_provider: params[4],
      })
      return { rows: [] }
    }

    // ── agent_runs / agent_steps ─────────────────────────────────────
    if (s.startsWith('INSERT INTO agent_runs')) return { rows: [] }
    if (s.startsWith('UPDATE agent_runs')) return { rows: [] }
    if (s.startsWith('INSERT INTO agent_steps')) return { rows: [] }

    // ── chatbot_graph_nodes / chatbot_graph_edges (chatbotGraph.ts) ──
    if (s.startsWith('INSERT INTO chatbot_graph_nodes')) {
      const [id, type, label, propertiesJson] = params
      const properties = JSON.parse(propertiesJson)
      const existing = db.graphNodes.find(n => n.id === id)
      if (existing) {
        existing.label = label
        existing.properties = { ...existing.properties, ...properties }
      } else {
        db.graphNodes.push({ id, type, label, properties })
      }
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO chatbot_graph_edges')) {
      const [sourceId, targetId, relation, weight, metadataJson] = params
      const metadata = JSON.parse(metadataJson)
      const existing = db.graphEdges.find(
        e => e.source_id === sourceId && e.target_id === targetId && e.relation === relation
      )
      if (existing) {
        existing.weight += weight
        existing.metadata = { ...existing.metadata, ...metadata }
      } else {
        db.graphEdges.push({ source_id: sourceId, target_id: targetId, relation, weight, metadata })
      }
      return { rows: [] }
    }
    if (
      s.startsWith(
        'SELECT id, type, label, properties, updated_at FROM chatbot_graph_nodes WHERE id = $1'
      )
    ) {
      const row = db.graphNodes.find(n => n.id === params[0])
      return { rows: row ? [{ ...row, updated_at: new Date().toISOString() }] : [] }
    }
    if (
      s.startsWith(
        'SELECT id, type, label, properties, updated_at FROM chatbot_graph_nodes WHERE id = ANY'
      )
    ) {
      const ids: string[] = params[0]
      return {
        rows: db.graphNodes
          .filter(n => ids.includes(n.id))
          .map(n => ({ ...n, updated_at: new Date().toISOString() })),
      }
    }
    if (s.startsWith('SELECT id, label FROM chatbot_graph_nodes WHERE type = ANY')) {
      const types: string[] = params[0]
      return { rows: db.graphNodes.filter(n => types.includes(n.type)) }
    }
    if (s.startsWith('SELECT id, label FROM chatbot_graph_nodes WHERE id = ANY')) {
      const ids: string[] = params[0]
      return { rows: db.graphNodes.filter(n => ids.includes(n.id)) }
    }
    if (s.startsWith('SELECT source_id, target_id, relation, weight, metadata, updated_at')) {
      const now = new Date().toISOString()
      if (s.includes('source_id = ANY($1::text[])')) {
        const ids: string[] = params[0]
        return {
          rows: db.graphEdges
            .filter(e => ids.includes(e.source_id))
            .map(e => ({ ...e, updated_at: now })),
        }
      }
      if (s.includes('source_id = $1')) {
        return {
          rows: db.graphEdges
            .filter(e => e.source_id === params[0])
            .map(e => ({ ...e, updated_at: now })),
        }
      }
    }
    if (s.startsWith('SELECT id, description FROM electrical_catalog_items')) return { rows: [] }

    // ── clients (busqueda por nombre) ─────────────────────────────
    if (s.startsWith('SELECT id, name, rut FROM clients')) {
      const needle = String(params[0]).replace(/%/g, '').toLowerCase()
      return {
        rows: db.clients.filter(c => !c.deleted_at && c.name.toLowerCase().includes(needle)),
      }
    }

    // ── app_config ─────────────────────────────────────────────────
    if (s.startsWith('SELECT value FROM app_config')) {
      return { rows: db.appConfig.uf_value ? [{ value: db.appConfig.uf_value }] : [] }
    }

    // ── applyQuotationImport (reutiliza quotations.ts) ──────────────
    if (s.startsWith('SELECT id FROM quotations WHERE correlative')) {
      return {
        rows: db.quotations.filter(q => q.correlative === params[0]).map(q => ({ id: q.id })),
      }
    }
    if (s.startsWith('SELECT correlative FROM quotations WHERE correlative LIKE')) {
      return { rows: [] }
    }
    if (s.includes('FROM clients') && s.includes('regexp_replace')) {
      const normDigits = (v: string) =>
        String(v ?? '')
          .replace(/[^0-9kK]/g, '')
          .toUpperCase()
      return {
        rows: db.clients.filter(c => normDigits(c.rut) === params[0] && !c.deleted_at).slice(0, 1),
      }
    }
    if (s.startsWith('UPDATE clients')) {
      const row = db.clients.find(c => c.id === params[3])
      return { rows: row ? [row] : [] }
    }
    if (s.startsWith('INSERT INTO clients')) {
      const row: Client = {
        id: nextId('client'),
        name: params[0],
        rut: params[1],
        activity: null,
        address: null,
        city: null,
        deleted_at: null,
      }
      db.clients.push(row)
      return { rows: [row] }
    }
    if (
      s.startsWith('SELECT * FROM client_contacts') ||
      s.startsWith('SELECT 1 FROM client_contacts')
    )
      return { rows: [] }
    if (s.startsWith('INSERT INTO quotations')) {
      const row = {
        id: nextId('quote'),
        correlative: params[0],
        client_id: params[1],
        contact_id: params[2],
        enduser: params[3],
        ref: params[4],
        date: '2026-01-01',
        valid_until: params[5],
        status: 'Borrador',
        oper_state: null,
        uf_value: params[6],
        iva_pct: params[7],
        notes: params[8],
        version: 1,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }
      db.quotations.push(row)
      return { rows: [row] }
    }
    if (s.startsWith('INSERT INTO quotation_categories')) {
      db.categories.push({
        id: nextId('qcat'),
        quotation_id: params[0],
        category_id: params[1],
        label: params[2],
        margin_pct: params[3],
        color: params[4],
        note: params[5],
        sort_order: params[6],
      })
      return { rows: [] }
    }
    if (s.startsWith('SELECT id, description') && s.includes('FROM catalog_items'))
      return { rows: [] }
    if (s.startsWith('INSERT INTO quotation_line_items')) {
      db.lineItems.push({
        id: nextId('line'),
        quotation_id: params[0],
        category_id: params[1],
        catalog_item_id: params[2],
        description: params[3],
        unit_name: params[4],
        quantity: params[5],
        days: params[6],
        unit_price: params[7],
        sort_order: params[8],
      })
      return { rows: [] }
    }
    if (s.startsWith('INSERT INTO quotation_terms')) return { rows: [] }
    if (s.startsWith('SELECT q.*')) {
      const q = db.quotations.find(row => row.id === params[0] && !row.deleted_at)
      if (!q) return { rows: [] }
      const client = db.clients.find(c => c.id === q.client_id)
      return { rows: [{ ...q, client_name: client?.name, contact_name: null }] }
    }
    if (s.startsWith('SELECT * FROM quotation_categories'))
      return { rows: db.categories.filter(c => c.quotation_id === params[0]) }
    if (s.startsWith('SELECT * FROM quotation_line_items'))
      return { rows: db.lineItems.filter(i => i.quotation_id === params[0]) }
    if (s.startsWith('SELECT * FROM quotation_terms')) return { rows: [] }
    if (s.startsWith('SELECT * FROM v_quotation_totals')) {
      const rows = db.lineItems.filter(i => i.quotation_id === params[0])
      const costo = rows.reduce(
        (sum, l) => sum + Number(l.quantity) * Number(l.days) * Number(l.unit_price),
        0
      )
      return {
        rows: [
          {
            quotation_id: params[0],
            costo_neto: costo,
            venta_neta: costo / 0.7,
            beneficio_bruto: costo / 0.7 - costo,
          },
        ],
      }
    }

    // ── applyQuotationUpdate (reutiliza quotations.ts) ──────────────
    if (s.startsWith('SELECT status FROM quotations WHERE id')) {
      const q = db.quotations.find(row => row.id === params[0] && !row.deleted_at)
      return { rows: q ? [{ status: q.status }] : [] }
    }
    if (s.startsWith('UPDATE quotations')) {
      const quotationId = params[21]
      const expectedVersion = params[22]
      const q = db.quotations.find(row => row.id === quotationId && !row.deleted_at)
      if (!q || q.version !== expectedVersion) return { rows: [] }
      Object.assign(q, {
        correlative: params[0],
        client_id: params[1],
        contact_id: params[2],
        enduser: params[3],
        ref: params[4],
        date: params[5],
        valid_until: params[6],
        status: params[7],
        oper_state: params[8],
        uf_value: params[9],
        iva_pct: params[10],
        notes: params[11],
        kind: params[12],
        equipment_count: params[13],
        equipment_description: params[14],
        frequency: params[15],
        visits_per_year: params[16],
        contract_start_date: params[17],
        show_uf_equivalent: params[18],
        show_usd_equivalent: params[19],
        usd_value: params[20],
        version: q.version + 1,
        updated_at: '2026-01-02T00:00:00Z',
      })
      return { rows: [q] }
    }
    if (s.startsWith('SELECT version FROM quotations WHERE id')) {
      const q = db.quotations.find(row => row.id === params[0] && !row.deleted_at)
      return { rows: q ? [{ version: q.version }] : [] }
    }
    if (s.startsWith('DELETE FROM quotation_terms')) {
      db.terms = db.terms.filter(t => t.quotation_id !== params[0])
      return { rows: [] }
    }
    if (s.startsWith('DELETE FROM quotation_line_items')) {
      db.lineItems = db.lineItems.filter(i => i.quotation_id !== params[0])
      return { rows: [] }
    }
    if (s.startsWith('DELETE FROM quotation_categories')) {
      db.categories = db.categories.filter(c => c.quotation_id !== params[0])
      return { rows: [] }
    }

    throw new Error(`Fake DB: query sin manejar ${s}`)
  }

  return {
    pool: { query, connect: async () => ({ query, release: () => {} }) } as unknown as Parameters<
      typeof createChatbotRouter
    >[0],
    getState: () => state,
  }
}

const buildApp = (db: ReturnType<typeof makeFakeDb>) => {
  const app = express()
  app.use(express.json())
  app.use('/api/chatbot', createChatbotRouter(db.pool))
  return app
}

describe('POST /api/chatbot', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('ensenar_regla actualiza la tarifa y supersede la anterior', async () => {
    const db = makeFakeDb({
      rules: [
        {
          id: 'r1',
          rule_key: 'tarifa_colacion_diaria',
          value: 6000,
          unit: 'CLP/persona/dia',
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
      ],
    })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'ensenar_regla',
        regla_key: 'tarifa_colacion_diaria',
        regla_valor: 7000,
        cliente_nombre: null,
        dias: null,
        dotacion: null,
        comuna: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'la colacion diaria es $7000 por persona' })

    expect(res.status).toBe(200)
    expect(res.body.rule.value).toBe(7000)
    const current = db
      .getState()
      .rules.filter(r => r.rule_key === 'tarifa_colacion_diaria' && !r.superseded_at)
    expect(current).toHaveLength(1)
    expect(current[0].value).toBe(7000)
    const old = db.getState().rules.find(r => r.id === 'r1')
    expect(old?.superseded_at).not.toBeNull()
  })

  it('crea una cotizacion con colacion + bonificacion por desplazamiento fuera de Santiago', async () => {
    const db = makeFakeDb({
      clients: [
        {
          id: 'cli-1',
          name: 'CLIMATEMP SPA',
          rut: '77.381.030-3',
          activity: null,
          address: null,
          city: null,
          deleted_at: null,
        },
      ],
      rules: [
        {
          id: 'r1',
          rule_key: 'tarifa_colacion_diaria',
          value: 6000,
          unit: 'CLP/persona/dia',
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
        {
          id: 'r2',
          rule_key: 'tarifa_bonificacion_desplazamiento_diaria',
          value: 15000,
          unit: 'CLP/persona/dia',
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
        {
          id: 'r3',
          rule_key: 'comunas_region_metropolitana',
          value: ['Santiago', 'Providencia'],
          unit: null,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
      ],
    })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'crear_cotizacion',
        cliente_nombre: 'Climatemp',
        dias: 5,
        dotacion: 8,
        comuna: 'Rancagua',
        descripcion_trabajo: 'Mantencion HVAC',
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: '5 dias, 8 tecnicos en Rancagua para Climatemp' })

    expect(res.status).toBe(201)
    expect(res.body.quotation.client_name).toBe('CLIMATEMP SPA')
    const lines = db.getState().lineItems
    expect(lines).toHaveLength(2)
    const colacion = lines.find(l => l.description.includes('Colacion'))
    const bono = lines.find(l => l.description.includes('Bonificacion'))
    expect(colacion.quantity).toBe(8)
    expect(colacion.days).toBe(5)
    expect(colacion.unit_price).toBe(6000)
    expect(bono.unit_price).toBe(15000)

    // El grafo de conocimiento (chatbotGraph.ts) se pobla de verdad, no solo
    // "no explota" -- cliente/comuna quedan como nodos y conectados.
    const state = db.getState()
    expect(state.graphNodes.find(n => n.id === 'cliente:cli-1')?.type).toBe('cliente')
    expect(state.graphNodes.find(n => n.id === 'comuna:rancagua')).toBeTruthy()
    expect(
      state.graphEdges.some(e => e.source_id === 'cliente:cli-1' && e.relation === 'cotiza_en')
    ).toBe(true)
  })

  it('items_mencionados a mano quedan sin precio y el reply avisa explicitamente', async () => {
    const db = makeFakeDb({
      clients: [
        {
          id: 'cli-1',
          name: 'CLIMATEMP SPA',
          rut: '77.381.030-3',
          activity: null,
          address: null,
          city: null,
          deleted_at: null,
        },
      ],
      rules: [],
    })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'crear_cotizacion',
        cliente_nombre: 'Climatemp',
        dias: null,
        dotacion: null,
        comuna: null,
        descripcion_trabajo: 'Reparacion puntual',
        items_mencionados: ['10 codos de cobre 1/2"'],
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'cotizacion para Climatemp con 10 codos de cobre 1/2 pulgada' })

    expect(res.status).toBe(201)
    // Sin esta advertencia explicita, el material sale con precio 0 sin que
    // el vendedor lo note hasta revisar la cotizacion linea por linea.
    expect(res.body.reply).toContain('sin precio')
    expect(res.body.reply).toContain('10 codos de cobre')
    const lines = db.getState().lineItems
    expect(lines).toHaveLength(1)
    expect(lines[0].category_id).toBe('mat')
    expect(lines[0].quantity).toBe(1)
    expect(lines[0].unit_price).toBe(0)
  })

  it('no agrega bonificacion si la comuna esta en la lista de Santiago', async () => {
    const db = makeFakeDb({
      clients: [
        {
          id: 'cli-1',
          name: 'CLIMATEMP SPA',
          rut: '77.381.030-3',
          activity: null,
          address: null,
          city: null,
          deleted_at: null,
        },
      ],
      rules: [
        {
          id: 'r1',
          rule_key: 'tarifa_colacion_diaria',
          value: 6000,
          unit: 'CLP/persona/dia',
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
        {
          id: 'r3',
          rule_key: 'comunas_region_metropolitana',
          value: ['Santiago', 'Providencia'],
          unit: null,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
      ],
    })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'crear_cotizacion',
        cliente_nombre: 'Climatemp',
        dias: 3,
        dotacion: 4,
        comuna: 'Providencia',
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: '3 dias, 4 tecnicos en Providencia para Climatemp' })

    expect(res.status).toBe(201)
    expect(db.getState().lineItems).toHaveLength(1)
    expect(db.getState().lineItems[0].description).toContain('Colacion')
  })

  it('rechaza regla con tipo invalido en vez de guardar basura en JSONB', async () => {
    // El LLM "alucina" el tipo: comunas_region_metropolitana espera un
    // array, aca llega un string.
    const db = makeFakeDb({ rules: [] })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'ensenar_regla',
        regla_key: 'comunas_region_metropolitana',
        regla_valor: 'Centro, Providencia',
        cliente_nombre: null,
        dias: null,
        dotacion: null,
        comuna: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'las comunas de Santiago son Centro y Providencia' })

    expect(res.status).toBe(422)
    expect(db.getState().rules).toHaveLength(0)
  })

  it('responde 422 (no 500 generico de /import) si el cliente no tiene RUT registrado', async () => {
    const db = makeFakeDb({
      clients: [
        {
          id: 'cli-1',
          name: 'PROSPECTO SIN RUT',
          rut: '',
          activity: null,
          address: null,
          city: null,
          deleted_at: null,
        },
      ],
      rules: [
        {
          id: 'r1',
          rule_key: 'tarifa_colacion_diaria',
          value: 6000,
          unit: null,
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
      ],
    })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'crear_cotizacion',
        cliente_nombre: 'Prospecto',
        dias: 2,
        dotacion: 3,
        comuna: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'cotizacion para Prospecto, 2 dias, 3 personas' })

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('Cliente sin RUT')
    expect(db.getState().quotations).toHaveLength(0)
  })

  it('responde 404 si no encuentra al cliente', async () => {
    const db = makeFakeDb({ rules: [] })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'crear_cotizacion',
        cliente_nombre: 'Empresa Inexistente',
        dias: 2,
        dotacion: 3,
        comuna: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'cotizacion para Empresa Inexistente' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Cliente no encontrado')
  })

  it('consultar_precio devuelve la media y las muestras del LLM con busqueda web', async () => {
    const db = makeFakeDb()
    mockedCallLlm
      .mockResolvedValueOnce(
        JSON.stringify({
          intent: 'consultar_precio',
          material_consultado: 'tubo de cobre 1/2 pulgada',
          cliente_nombre: null,
          dias: null,
          dotacion: null,
          comuna: null,
          descripcion_trabajo: null,
          items_mencionados: null,
          regla_key: null,
          regla_valor: null,
          respuesta_conversacional: null,
        })
      )
      // Paso 1 (busqueda con grounding): texto libre, no JSON.
      .mockResolvedValueOnce('Sodimac $5000, Construmart $6000 para tubo de cobre 1/2 pulgada.')
      // Paso 2 (extraccion): reformatea el texto de arriba a JSON.
      .mockResolvedValueOnce(
        JSON.stringify({
          precio_medio: 5500,
          muestras: [
            { precio: 5000, fuente_url: 'https://sodimac.cl/x', tienda: 'Sodimac' },
            { precio: 6000, fuente_url: 'https://construmart.cl/x', tienda: 'Construmart' },
          ],
          advertencia: null,
        })
      )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'cuanto cuesta un tubo de cobre 1/2 pulgada' })

    expect(res.status).toBe(200)
    expect(res.body.precio_medio).toBe(5500)
    expect(res.body.muestras).toHaveLength(2)
  })

  it('responde 503 si GEMINI_API_KEY no esta configurada', async () => {
    const db = makeFakeDb()
    mockedCallLlm.mockImplementationOnce(() => {
      const err = new Error('GEMINI_API_KEY no configurada') as Error & { status: number }
      err.status = 503
      return Promise.reject(err)
    })

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'hola' })

    expect(res.status).toBe(503)
  })

  it('modificar_cotizacion agrega items a una cotizacion abierta sin borrar los existentes', async () => {
    const db = makeFakeDb({
      clients: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name: 'CLIMATEMP SPA',
          rut: '77.381.030-3',
          activity: null,
          address: null,
          city: null,
          deleted_at: null,
        },
      ],
      quotations: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          correlative: 'SYM-001-01-2026',
          client_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          contact_id: null,
          // date como objeto Date real (no string) a proposito: asi devuelve
          // pg una columna DATE, y es justo el caso que isoDateStr rechazaria
          // sin el toDateStr() de chatbot.ts.
          enduser: null,
          ref: 'Original',
          date: new Date('2026-01-01T00:00:00Z'),
          valid_until: null,
          status: 'Borrador',
          oper_state: null,
          uf_value: 39500,
          iva_pct: 19,
          notes: null,
          kind: 'project',
          equipment_count: null,
          equipment_description: null,
          frequency: null,
          visits_per_year: null,
          contract_start_date: null,
          show_uf_equivalent: false,
          show_usd_equivalent: false,
          usd_value: null,
          version: 1,
          deleted_at: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      lineItems: [
        {
          id: 'line-orig',
          quotation_id: '123e4567-e89b-12d3-a456-426614174000',
          category_id: 'mat',
          catalog_item_id: null,
          description: 'Item original',
          unit_name: 'Und',
          quantity: 1,
          days: 1,
          unit_price: 10000,
          sort_order: 0,
        },
      ],
      rules: [
        {
          id: 'r1',
          rule_key: 'tarifa_colacion_diaria',
          value: 6000,
          unit: 'CLP/persona/dia',
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
      ],
    })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'modificar_cotizacion',
        dias: 3,
        dotacion: 4,
        comuna: null,
        cliente_nombre: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({
        instruction: 'agrega colacion para 4 personas x 3 dias',
        quotation_id: '123e4567-e89b-12d3-a456-426614174000',
      })

    expect(res.status).toBe(200)
    const lines = db
      .getState()
      .lineItems.filter(l => l.quotation_id === '123e4567-e89b-12d3-a456-426614174000')
    expect(lines).toHaveLength(2)
    expect(lines.some(l => l.description === 'Item original')).toBe(true)
    expect(lines.some(l => l.description.includes('Colacion'))).toBe(true)
    const quotation = db
      .getState()
      .quotations.find(q => q.id === '123e4567-e89b-12d3-a456-426614174000')
    expect(quotation.version).toBe(2)
  })

  it('modificar_cotizacion responde 404 si la cotizacion no existe', async () => {
    const db = makeFakeDb()
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'modificar_cotizacion',
        dias: 3,
        dotacion: 4,
        comuna: null,
        cliente_nombre: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({
        instruction: 'agrega colacion',
        quotation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      })

    expect(res.status).toBe(404)
  })

  it('modificar_cotizacion sin quotation_id responde con mensaje conversacional, no error', async () => {
    const db = makeFakeDb()
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'modificar_cotizacion',
        dias: 3,
        dotacion: 4,
        comuna: null,
        cliente_nombre: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'agrega colacion' })

    expect(res.status).toBe(200)
    expect(res.body.reply).toContain('No tengo una cotizacion abierta')
  })

  it('el prompt de intencion incluye la persona y, si hay turnos recientes, el bloque de historial', async () => {
    const db = makeFakeDb()
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'conversar',
        respuesta_conversacional: 'Hola',
        cliente_nombre: null,
        dias: null,
        dotacion: null,
        comuna: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
      })
    )

    await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({
        instruction: 'mejor dejalo en 3 dias',
        recent_turns: [
          { role: 'user', text: 'cotiza 5 dias en Rancagua' },
          { role: 'bot', text: 'Cotizacion SYM-001 creada' },
        ],
      })

    const lastCall = mockedCallLlm.mock.calls[mockedCallLlm.mock.calls.length - 1]
    const promptSent = lastCall[0][0].content as string
    expect(promptSent).toContain('ingeniero en climatizacion')
    expect(promptSent).toContain('## Historial reciente')
    expect(promptSent).toContain('cotiza 5 dias en Rancagua')
  })

  it('un turno reciente de mas de 500 chars se recorta en vez de rechazar la request (antes bloqueaba el chat permanentemente)', async () => {
    const db = makeFakeDb()
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'conversar',
        respuesta_conversacional: 'Hola',
        cliente_nombre: null,
        dias: null,
        dotacion: null,
        comuna: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
      })
    )

    const replyLargo = 'Cotizacion SYM-001 creada.' + ' x'.repeat(300)
    expect(replyLargo.length).toBeGreaterThan(500)

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({
        instruction: 'gracias',
        recent_turns: [{ role: 'bot', text: replyLargo }],
      })

    expect(res.status).toBe(200)
  })

  it('A-21: el nombre real del cliente (resuelto desde la base) nunca llega al prompt via recent_turns, usando el reply REAL de crear_cotizacion (no uno sintetico)', async () => {
    const db = makeFakeDb({
      clients: [
        {
          id: 'cli-1',
          name: 'CLIMATEMP SPA',
          rut: '77.381.030-3',
          activity: null,
          address: null,
          city: null,
          deleted_at: null,
        },
      ],
    })

    // Turno 1: crea la cotizacion de verdad y toma el `reply` REAL que
    // produce el backend -- no uno escrito a mano para el test, que es
    // justo lo que dejo pasar este bug la primera vez (los tests de
    // historial/persona usaban replies sinteticos sin nombre).
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'crear_cotizacion',
        cliente_nombre: 'Climatemp',
        dias: 5,
        dotacion: 8,
        comuna: null,
        descripcion_trabajo: 'Mantencion',
        items_mencionados: ['tubo de cobre'],
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )
    const firstRes = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'cotiza para Climatemp' })
    expect(firstRes.status).toBe(201)
    const realReply = firstRes.body.reply as string
    // El propio nombre del cliente NO debe estar en el reply (ese es el fix:
    // vive solo en `.data.quotation.client_name`, nunca en `.text`).
    expect(realReply).not.toContain('CLIMATEMP')

    // Turno 2: el frontend manda ese reply real como recent_turns (chatStore.ts
    // manda solo `.text`, y `.text` de un mensaje de bot ES el `reply`).
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'conversar',
        respuesta_conversacional: 'ok',
        cliente_nombre: null,
        dias: null,
        dotacion: null,
        comuna: null,
        descripcion_trabajo: null,
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
      })
    )
    await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({
        instruction: 'gracias',
        recent_turns: [
          { role: 'user', text: 'cotiza para Climatemp' },
          { role: 'bot', text: realReply },
        ],
      })

    const lastCall = mockedCallLlm.mock.calls[mockedCallLlm.mock.calls.length - 1]
    const promptSent = lastCall[0][0].content as string
    expect(promptSent).not.toContain('CLIMATEMP')
    expect(promptSent).not.toContain('77.381.030-3')
  })

  it('crear_cotizacion usa el patron habitual del cliente si faltan dias/dotacion, y avisa en la respuesta', async () => {
    const db = makeFakeDb({
      clients: [
        {
          id: 'cli-1',
          name: 'CLIMATEMP SPA',
          rut: '77.381.030-3',
          activity: null,
          address: null,
          city: null,
          deleted_at: null,
        },
      ],
      rules: [
        {
          id: 'r1',
          rule_key: 'tarifa_colacion_diaria',
          value: 6000,
          unit: 'CLP/persona/dia',
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          superseded_at: null,
        },
      ],
      graphEdges: [
        {
          source_id: 'cliente:cli-1',
          target_id: 'comuna:colina',
          relation: 'cotiza_en',
          weight: 5,
          metadata: { dotacion: 4, dias: 3 },
        },
      ],
      graphNodes: [{ id: 'comuna:colina', type: 'comuna', label: 'Colina', properties: {} }],
    })
    mockedCallLlm.mockResolvedValueOnce(
      JSON.stringify({
        intent: 'crear_cotizacion',
        cliente_nombre: 'Climatemp',
        dias: null,
        dotacion: null,
        comuna: null,
        descripcion_trabajo: 'Mantencion',
        items_mencionados: null,
        regla_key: null,
        regla_valor: null,
        material_consultado: null,
        respuesta_conversacional: null,
      })
    )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'cotiza para Climatemp' })

    expect(res.status).toBe(201)
    expect(res.body.notas?.[0]).toMatchObject({ kind: 'patron_cliente' })
    expect(res.body.notas[0].text).toContain('CLIMATEMP SPA')
  })

  it('consultar_precio avisa si el precio en el grafo tiene mas de 25 dias', async () => {
    const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const db = makeFakeDb({
      graphNodes: [
        {
          id: 'material:tubo-de-cobre',
          type: 'material',
          label: 'Tubo de cobre',
          properties: { last_price: 5000, last_price_at: oldDate },
        },
      ],
    })
    mockedCallLlm
      .mockResolvedValueOnce(
        JSON.stringify({
          intent: 'consultar_precio',
          material_consultado: 'Tubo de cobre',
          cliente_nombre: null,
          dias: null,
          dotacion: null,
          comuna: null,
          descripcion_trabajo: null,
          items_mencionados: null,
          regla_key: null,
          regla_valor: null,
          respuesta_conversacional: null,
        })
      )
      .mockResolvedValueOnce('Tubo de cobre: $5500 en promedio.')
      .mockResolvedValueOnce(
        JSON.stringify({ precio_medio: 5500, muestras: [], advertencia: null })
      )

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'cuanto cuesta el tubo de cobre' })

    expect(res.status).toBe(200)
    expect(res.body.notas?.[0]).toMatchObject({ kind: 'precio_desactualizado' })
  })

  it('procesa la instruccion mediante el bucle agentico cuando agent_mode es true', async () => {
    const db = makeFakeDb()
    mockedCallLlmWithTools.mockResolvedValueOnce({
      modelContent: {
        role: 'model',
        parts: [{ text: 'Hola! Soy tu agente comercial. En que te ayudo hoy?' }],
      },
      functionCalls: [],
      text: 'Hola! Soy tu agente comercial. En que te ayudo hoy?',
      usage: { tokensIn: 10, tokensOut: 12 },
    })

    const res = await request(buildApp(db))
      .post('/api/chatbot')
      .set('Authorization', authHeader())
      .send({ instruction: 'hola agente', agent_mode: true })

    expect(res.status).toBe(200)
    expect(res.body.reply).toContain('Soy tu agente comercial')
    expect(Array.isArray(res.body.pasos)).toBe(true)
  })
})
