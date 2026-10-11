import { describe, it, expect } from 'vitest'
import type { Pool } from 'pg'
import {
  normalizeMaterialLabel,
  materialNodeId,
  comunaNodeId,
  reglaNodeId,
  clienteNodeId,
  matchCatalogItem,
  upsertNode,
  upsertEdge,
  recordGraphFacts,
  walkGraph,
  buildLlmGraphContext,
  findMentionedGraphEntities,
  applyClientPatterns,
  LLM_SAFE_NODE_TYPES,
  type GraphNode,
  type GraphEdge,
} from '../chatbotGraph'

interface FakeState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  catalogItems: { id: string; description: string; is_active: boolean }[]
  electricalCatalogItems: { id: string; description: string; is_active: boolean }[]
}

function makeFakeGraphPool(seed: Partial<FakeState> = {}) {
  const state: FakeState = {
    nodes: seed.nodes ?? [],
    edges: seed.edges ?? [],
    catalogItems: seed.catalogItems ?? [],
    electricalCatalogItems: seed.electricalCatalogItems ?? [],
  }
  let idSeq = 1

  async function query(sql: string, params: any[] = []) {
    const s = sql.trim()

    if (s.startsWith('SELECT id, description FROM catalog_items WHERE lower(description) = $1')) {
      const rows = state.catalogItems.filter(
        c => c.description.toLowerCase() === params[0] && c.is_active
      )
      return { rows }
    }
    if (
      s.startsWith(
        'SELECT id, description FROM electrical_catalog_items WHERE lower(description) = $1'
      )
    ) {
      const rows = state.electricalCatalogItems.filter(
        c => c.description.toLowerCase() === params[0] && c.is_active
      )
      return { rows }
    }
    if (s.startsWith('SELECT id, description FROM catalog_items WHERE description ILIKE $1')) {
      const needle = String(params[0]).replace(/%/g, '').toLowerCase()
      const rows = state.catalogItems.filter(
        c => c.is_active && c.description.toLowerCase().includes(needle)
      )
      return { rows }
    }

    if (s.startsWith('INSERT INTO chatbot_graph_nodes')) {
      const [id, type, label, propertiesJson] = params
      const properties = JSON.parse(propertiesJson)
      const existing = state.nodes.find(n => n.id === id)
      if (existing) {
        existing.label = label
        existing.properties = { ...existing.properties, ...properties }
        existing.updated_at = new Date().toISOString()
      } else {
        state.nodes.push({ id, type, label, properties, updated_at: new Date().toISOString() })
      }
      return { rows: [] }
    }

    if (s.startsWith('INSERT INTO chatbot_graph_edges')) {
      const [sourceId, targetId, relation, weight, metadataJson] = params
      const metadata = JSON.parse(metadataJson)
      const existing = state.edges.find(
        e => e.source_id === sourceId && e.target_id === targetId && e.relation === relation
      )
      if (existing) {
        existing.weight += weight
        existing.metadata = { ...existing.metadata, ...metadata }
        existing.updated_at = new Date().toISOString()
      } else {
        state.edges.push({
          source_id: sourceId,
          target_id: targetId,
          relation,
          weight,
          metadata,
          updated_at: new Date().toISOString(),
        })
      }
      return { rows: [] }
    }

    if (s.startsWith('SELECT source_id, target_id, relation, weight, metadata, updated_at')) {
      if (s.includes('source_id = ANY($1::text[])')) {
        const ids: string[] = params[0]
        return { rows: state.edges.filter(e => ids.includes(e.source_id)) }
      }
      if (s.includes('source_id = $1')) {
        return { rows: state.edges.filter(e => e.source_id === params[0]) }
      }
    }

    if (s.startsWith('SELECT id, type, label, properties, updated_at FROM chatbot_graph_nodes')) {
      const ids: string[] = params[0]
      return { rows: state.nodes.filter(n => ids.includes(n.id)) }
    }

    if (s.startsWith('SELECT id, label FROM chatbot_graph_nodes WHERE type = ANY')) {
      const types: string[] = params[0]
      return { rows: state.nodes.filter(n => types.includes(n.type)) }
    }

    if (s.startsWith('SELECT id, label FROM chatbot_graph_nodes WHERE id = ANY')) {
      const ids: string[] = params[0]
      return { rows: state.nodes.filter(n => ids.includes(n.id)) }
    }

    throw new Error(`Fake graph DB: query sin manejar: ${s}`)
  }

  return { query, getState: () => state, nextId: (prefix: string) => `${prefix}-${idSeq++}` }
}

describe('normalizeMaterialLabel / node ids', () => {
  it('normaliza tildes, mayusculas y espacios para que materiales equivalentes converjan', () => {
    expect(normalizeMaterialLabel('Tubo de Cobre 1/2"')).toBe(
      normalizeMaterialLabel('tubo de cobre 1/2')
    )
    expect(materialNodeId('Cañería de Cobre')).toBe(materialNodeId('caneria de cobre'))
  })

  it('genera ids estables por tipo', () => {
    expect(comunaNodeId('Ñuñoa')).toMatch(/^comuna:/)
    expect(reglaNodeId('tarifa_colacion_diaria')).toBe('regla:tarifa_colacion_diaria')
    expect(clienteNodeId('abc-123')).toBe('cliente:abc-123')
  })
})

describe('matchCatalogItem', () => {
  it('matchea por igualdad exacta normalizada', async () => {
    const db = makeFakeGraphPool({
      catalogItems: [{ id: 'cat-1', description: 'Tubo cobre 1/2', is_active: true }],
    })
    const match = await matchCatalogItem(db as unknown as Pool, 'tubo cobre 1/2')
    expect(match).toEqual({
      catalogItemId: 'cat-1',
      source: 'catalog_items',
      description: 'Tubo cobre 1/2',
    })
  })

  it('no matchea si hay mas de un resultado ambiguo (mejor nodo libre que un link equivocado)', async () => {
    const db = makeFakeGraphPool({
      catalogItems: [
        { id: 'cat-1', description: 'Tubo cobre 1/2 tipo A', is_active: true },
        { id: 'cat-2', description: 'Tubo cobre 1/2 tipo B', is_active: true },
      ],
    })
    const match = await matchCatalogItem(db as unknown as Pool, 'tubo cobre 1/2')
    expect(match).toBeNull()
  })

  it('devuelve null si no hay ningun match', async () => {
    const db = makeFakeGraphPool()
    const match = await matchCatalogItem(db as unknown as Pool, 'material inexistente')
    expect(match).toBeNull()
  })
})

describe('upsertNode / upsertEdge', () => {
  it('upsertEdge acumula weight en vez de duplicar la arista', async () => {
    const db = makeFakeGraphPool()
    await upsertEdge(db as unknown as Pool, {
      sourceId: 'cliente:1',
      targetId: 'comuna:colina',
      relation: 'cotiza_en',
    })
    await upsertEdge(db as unknown as Pool, {
      sourceId: 'cliente:1',
      targetId: 'comuna:colina',
      relation: 'cotiza_en',
    })
    const state = db.getState()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0].weight).toBe(2)
  })

  it('upsertNode fusiona properties en vez de reemplazarlas', async () => {
    const db = makeFakeGraphPool()
    await upsertNode(db as unknown as Pool, {
      id: 'material:cobre',
      type: 'material',
      label: 'Cobre',
      properties: { a: 1 },
    })
    await upsertNode(db as unknown as Pool, {
      id: 'material:cobre',
      type: 'material',
      label: 'Cobre',
      properties: { b: 2 },
    })
    const node = db.getState().nodes.find(n => n.id === 'material:cobre')
    expect(node?.properties).toEqual({ a: 1, b: 2 })
  })
})

describe('recordGraphFacts', () => {
  it('ensenar_regla crea un nodo regla', async () => {
    const db = makeFakeGraphPool()
    await recordGraphFacts(db as unknown as Pool, {
      intent: 'ensenar_regla',
      reglaKey: 'tarifa_colacion_diaria',
      reglaValor: 7000,
    })
    const node = db.getState().nodes.find(n => n.id === 'regla:tarifa_colacion_diaria')
    expect(node?.type).toBe('regla')
    expect(node?.properties.value).toBe(7000)
  })

  it('crear_cotizacion crea nodos de cliente/comuna/material y las aristas entre ellos', async () => {
    const db = makeFakeGraphPool()
    await recordGraphFacts(db as unknown as Pool, {
      intent: 'crear_cotizacion',
      clientId: 'cli-1',
      clientName: 'Climatemp SPA',
      comuna: 'Colina',
      materiales: ['Tubo de cobre'],
      dotacion: 4,
      dias: 3,
      quotationId: 'q-1',
    })
    const state = db.getState()
    expect(state.nodes.find(n => n.id === 'cliente:cli-1')?.type).toBe('cliente')
    expect(state.nodes.find(n => n.id === 'comuna:colina')).toBeTruthy()
    expect(state.nodes.find(n => n.id === materialNodeId('Tubo de cobre'))).toBeTruthy()
    const comunaEdge = state.edges.find(e => e.relation === 'cotiza_en')
    expect(comunaEdge?.metadata).toMatchObject({ dotacion: 4, dias: 3, quotationId: 'q-1' })
    expect(state.edges.some(e => e.relation === 'pide_material')).toBe(true)
  })

  it('nunca lanza, incluso si la escritura falla', async () => {
    const throwingPool = {
      query: async () => {
        throw new Error('boom')
      },
    }
    await expect(
      recordGraphFacts(throwingPool as unknown as Pool, {
        intent: 'ensenar_regla',
        reglaKey: 'x',
        reglaValor: 1,
      })
    ).resolves.toBeUndefined()
  })
})

describe('buildLlmGraphContext — frontera de privacidad', () => {
  it('NUNCA incluye un nodo tipo cliente, aunque este dentro del radio del BFS', async () => {
    const db = makeFakeGraphPool({
      nodes: [
        {
          id: 'cliente:1',
          type: 'cliente',
          label: 'Climatemp SPA',
          properties: {},
          updated_at: 'now',
        },
        { id: 'comuna:colina', type: 'comuna', label: 'Colina', properties: {}, updated_at: 'now' },
        {
          id: 'material:cobre',
          type: 'material',
          label: 'Cobre',
          properties: {},
          updated_at: 'now',
        },
      ],
      edges: [
        {
          source_id: 'cliente:1',
          target_id: 'comuna:colina',
          relation: 'cotiza_en',
          weight: 3,
          metadata: {},
          updated_at: 'now',
        },
        {
          source_id: 'cliente:1',
          target_id: 'material:cobre',
          relation: 'pide_material',
          weight: 2,
          metadata: {},
          updated_at: 'now',
        },
      ],
    })

    const context = await buildLlmGraphContext(db as unknown as Pool, ['cliente:1'])

    expect(context).not.toContain('cliente:1')
    expect(context).not.toContain('Climatemp SPA')
    // El resto del contexto (si lo hay) solo puede venir de tipos seguros.
    for (const type of LLM_SAFE_NODE_TYPES) {
      expect(['comuna', 'material', 'regla']).toContain(type)
    }
  })

  it('devuelve string vacio si no hay semillas', async () => {
    const db = makeFakeGraphPool()
    expect(await buildLlmGraphContext(db as unknown as Pool, [])).toBe('')
  })

  it('incluye hechos de tipos seguros (comuna/material/regla) cuando corresponde', async () => {
    const db = makeFakeGraphPool({
      nodes: [
        { id: 'comuna:colina', type: 'comuna', label: 'Colina', properties: {}, updated_at: 'now' },
        {
          id: 'regla:tarifa_colacion_diaria',
          type: 'regla',
          label: 'tarifa_colacion_diaria',
          properties: {},
          updated_at: 'now',
        },
      ],
      edges: [
        {
          source_id: 'comuna:colina',
          target_id: 'regla:tarifa_colacion_diaria',
          relation: 'aplica',
          weight: 1,
          metadata: {},
          updated_at: 'now',
        },
      ],
    })
    const context = await buildLlmGraphContext(db as unknown as Pool, ['comuna:colina'])
    expect(context).toContain('comuna:colina')
    expect(context).toContain('regla:tarifa_colacion_diaria')
  })
})

describe('walkGraph', () => {
  it('respeta el tope de aristas por nodo de origen para evitar que un supernodo agote el presupuesto', async () => {
    const edges: GraphEdge[] = Array.from({ length: 20 }, (_, i) => ({
      source_id: 'comuna:santiago',
      target_id: `cliente:${i}`,
      relation: 'cotiza_en',
      weight: 1,
      metadata: {},
      updated_at: 'now',
    }))
    const db = makeFakeGraphPool({ edges })
    const { edges: result, truncated } = await walkGraph(
      db as unknown as Pool,
      ['comuna:santiago'],
      { maxHops: 1 }
    )
    expect(result.length).toBeLessThanOrEqual(8)
    expect(truncated).toBe(true)
  })
})

describe('findMentionedGraphEntities', () => {
  it('encuentra nodos seguros mencionados en el texto, sin usar LLM', async () => {
    const db = makeFakeGraphPool({
      nodes: [
        { id: 'comuna:colina', type: 'comuna', label: 'Colina', properties: {}, updated_at: 'now' },
        {
          id: 'cliente:1',
          type: 'cliente',
          label: 'Climatemp SPA',
          properties: {},
          updated_at: 'now',
        },
      ],
    })
    const ids = await findMentionedGraphEntities(
      db as unknown as Pool,
      'cotiza 3 dias en Colina para Climatemp'
    )
    expect(ids).toContain('comuna:colina')
    // El nombre del cliente puede coincidir en texto libre, pero el tipo
    // 'cliente' nunca deberia salir de aca porque la query ya filtra por
    // LLM_SAFE_NODE_TYPES -- no deberia aparecer aunque el texto lo mencione.
    expect(ids).not.toContain('cliente:1')
  })

  it('devuelve vacio si no hay texto', async () => {
    const db = makeFakeGraphPool()
    expect(await findMentionedGraphEntities(db as unknown as Pool, '')).toEqual([])
  })
})

describe('applyClientPatterns', () => {
  it('devuelve null si el cliente no tiene historial en el grafo', async () => {
    const db = makeFakeGraphPool()
    expect(await applyClientPatterns(db as unknown as Pool, 'cli-sin-historial')).toBeNull()
  })

  it('devuelve la comuna y materiales habituales del cliente', async () => {
    const db = makeFakeGraphPool({
      nodes: [
        { id: 'comuna:colina', type: 'comuna', label: 'Colina', properties: {}, updated_at: 'now' },
        {
          id: 'material:cobre',
          type: 'material',
          label: 'Cobre',
          properties: {},
          updated_at: 'now',
        },
      ],
      edges: [
        {
          source_id: 'cliente:cli-1',
          target_id: 'comuna:colina',
          relation: 'cotiza_en',
          weight: 5,
          metadata: { dotacion: 4, dias: 3 },
          updated_at: 'now',
        },
        {
          source_id: 'cliente:cli-1',
          target_id: 'material:cobre',
          relation: 'pide_material',
          weight: 3,
          metadata: {},
          updated_at: 'now',
        },
      ],
    })
    const pattern = await applyClientPatterns(db as unknown as Pool, 'cli-1')
    expect(pattern).toMatchObject({
      comunaHabitual: 'Colina',
      materialesFrecuentes: ['Cobre'],
      dotacionHabitual: 4,
      diasHabitual: 3,
    })
  })
})
