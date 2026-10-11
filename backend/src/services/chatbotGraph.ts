import { Pool, PoolClient } from 'pg'
import { logger } from '../utils/logger'

export type GraphNodeType = 'comuna' | 'material' | 'regla' | 'cliente'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  properties: Record<string, unknown>
  updated_at: string
}

export interface GraphEdge {
  source_id: string
  target_id: string
  relation: string
  weight: number
  metadata: Record<string, unknown>
  updated_at: string
}

// Tipos de nodo que SI pueden llegar a un prompt de LLM externo. No es
// parametro de ninguna funcion exportada -- ningun caller, presente o
// futuro, puede ampliar esta lista ni pasarle 'cliente'. Ver A-21 en
// docs/RIESGOS_ACEPTADOS.md: esta es la frontera estructural de privacidad
// del grafo, no una convencion de "por favor no hacerlo". buildLlmGraphContext()
// es la UNICA funcion de lectura que puede terminar en un prompt; cualquier
// otra funcion de lectura de este archivo es backend-only.
export const LLM_SAFE_NODE_TYPES = ['comuna', 'material', 'regla'] as const

// Misma normalizacion que normalizeText() en api/quotations.ts y
// normalizeComuna() en chatbotRules.ts (sin tildes, minusculas, espacios
// colapsados) -- duplicada aca a proposito (son 6 lineas, no vale la pena
// un import cruzado) para que materiales en texto libre como "tubo de cobre
// 1/2" y "Cobre 1/2 Pulgada" converjan en el mismo nodo en vez de fragmentar
// el grafo en duplicados casi-iguales que nunca se conectan entre si.
export function normalizeMaterialLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const slugify = (value: string): string => normalizeMaterialLabel(value).replace(/\s+/g, '-')

export const materialNodeId = (label: string): string => `material:${slugify(label)}`
export const comunaNodeId = (comuna: string): string => `comuna:${slugify(comuna)}`
export const reglaNodeId = (ruleKey: string): string => `regla:${ruleKey}`
export const clienteNodeId = (clientId: string): string => `cliente:${clientId}`

export interface CatalogMatch {
  catalogItemId: string
  source: 'catalog_items' | 'electrical_catalog_items'
  description: string
}

/**
 * Busca un item real del catalogo para un texto libre de material. Match
 * confiable = igualdad exacta normalizada, o ILIKE con EXACTAMENTE un
 * resultado -- ambiguo (2+ resultados) se deja sin matchear (mejor un nodo
 * libre que un link equivocado al catalogo). Nunca lanza: una falla de
 * catalogo no deberia impedir registrar el nodo de material libre.
 */
export async function matchCatalogItem(
  pool: Pool | PoolClient,
  materialText: string
): Promise<CatalogMatch | null> {
  const normalized = normalizeMaterialLabel(materialText)
  if (!normalized) return null
  try {
    const exact = await pool.query<{ id: string; description: string }>(
      `SELECT id, description FROM catalog_items WHERE lower(description) = $1 AND is_active = true LIMIT 2`,
      [normalized]
    )
    if (exact.rows.length === 1) {
      return {
        catalogItemId: exact.rows[0].id,
        source: 'catalog_items',
        description: exact.rows[0].description,
      }
    }

    const exactElectrical = await pool.query<{ id: string; description: string }>(
      `SELECT id, description FROM electrical_catalog_items WHERE lower(description) = $1 AND is_active = true LIMIT 2`,
      [normalized]
    )
    if (exactElectrical.rows.length === 1) {
      return {
        catalogItemId: exactElectrical.rows[0].id,
        source: 'electrical_catalog_items',
        description: exactElectrical.rows[0].description,
      }
    }

    const fuzzy = await pool.query<{ id: string; description: string }>(
      `SELECT id, description FROM catalog_items WHERE description ILIKE $1 AND is_active = true LIMIT 2`,
      [`%${materialText.trim()}%`]
    )
    if (fuzzy.rows.length === 1) {
      return {
        catalogItemId: fuzzy.rows[0].id,
        source: 'catalog_items',
        description: fuzzy.rows[0].description,
      }
    }
  } catch (error) {
    logger.error('chatbotGraph: fallo buscando en el catalogo', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
  return null
}

// ── Escritura (upsert idempotente) ───────────────────────────

export async function upsertNode(
  pool: Pool | PoolClient,
  node: { id: string; type: GraphNodeType; label: string; properties?: Record<string, unknown> }
): Promise<void> {
  await pool.query(
    `INSERT INTO chatbot_graph_nodes (id, type, label, properties)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       label = EXCLUDED.label,
       properties = chatbot_graph_nodes.properties || EXCLUDED.properties,
       updated_at = NOW()`,
    [node.id, node.type, node.label, JSON.stringify(node.properties ?? {})]
  )
}

export async function upsertEdge(
  pool: Pool | PoolClient,
  edge: {
    sourceId: string
    targetId: string
    relation: string
    weightDelta?: number
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO chatbot_graph_edges (source_id, target_id, relation, weight, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (source_id, target_id, relation) DO UPDATE SET
       weight = chatbot_graph_edges.weight + EXCLUDED.weight,
       metadata = chatbot_graph_edges.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      edge.sourceId,
      edge.targetId,
      edge.relation,
      edge.weightDelta ?? 1,
      JSON.stringify(edge.metadata ?? {}),
    ]
  )
}

export interface GraphFactsInput {
  intent: 'ensenar_regla' | 'consultar_precio' | 'crear_cotizacion' | 'modificar_cotizacion'
  clientId?: string | null
  clientName?: string | null
  comuna?: string | null
  materiales?: string[]
  reglaKey?: string | null
  reglaValor?: unknown
  precioMedio?: number | null
  quotationId?: string | null
  dotacion?: number | null
  dias?: number | null
}

/**
 * Punto de entrada unico que chatbot.ts llama tras cada accion exitosa.
 * NUNCA lanza -- mismo espiritu que logAction() en chatbot.ts: una falla al
 * escribir el grafo no debe poder tumbar la creacion de una cotizacion real.
 */
export async function recordGraphFacts(pool: Pool, facts: GraphFactsInput): Promise<void> {
  try {
    if (facts.intent === 'ensenar_regla' && facts.reglaKey) {
      await upsertNode(pool, {
        id: reglaNodeId(facts.reglaKey),
        type: 'regla',
        label: facts.reglaKey,
        properties: { value: facts.reglaValor },
      })
      return
    }

    if (facts.intent === 'consultar_precio' && facts.materiales?.[0]) {
      const material = facts.materiales[0]
      const match = await matchCatalogItem(pool, material)
      await upsertNode(pool, {
        id: materialNodeId(material),
        type: 'material',
        label: material,
        properties: {
          last_price: facts.precioMedio ?? null,
          last_price_at: new Date().toISOString(),
          catalog_item_id: match?.catalogItemId ?? null,
        },
      })
      return
    }

    if (facts.intent === 'crear_cotizacion' || facts.intent === 'modificar_cotizacion') {
      const clienteId = facts.clientId ? clienteNodeId(facts.clientId) : null
      if (clienteId) {
        await upsertNode(pool, {
          id: clienteId,
          type: 'cliente',
          label: facts.clientName ?? facts.clientId ?? 'cliente',
          properties: {},
        })
      }

      if (facts.comuna) {
        const comunaId = comunaNodeId(facts.comuna)
        await upsertNode(pool, {
          id: comunaId,
          type: 'comuna',
          label: facts.comuna,
          properties: {},
        })
        if (clienteId) {
          await upsertEdge(pool, {
            sourceId: clienteId,
            targetId: comunaId,
            relation: 'cotiza_en',
            metadata: {
              quotationId: facts.quotationId ?? null,
              dotacion: facts.dotacion ?? null,
              dias: facts.dias ?? null,
            },
          })
        }
      }

      for (const material of facts.materiales ?? []) {
        const materialId = materialNodeId(material)
        await upsertNode(pool, {
          id: materialId,
          type: 'material',
          label: material,
          properties: {},
        })
        if (clienteId) {
          await upsertEdge(pool, {
            sourceId: clienteId,
            targetId: materialId,
            relation: 'pide_material',
          })
        }
      }
    }
  } catch (error) {
    logger.error('Chatbot: no se pudo registrar hechos en el grafo de conocimiento', {
      error: error instanceof Error ? error.message : String(error),
      intent: facts.intent,
    })
  }
}

/** Lectura puntual de un nodo por id -- ej. para comparar el precio previo de un material antes de sobrescribirlo. */
export async function getGraphNode(pool: Pool | PoolClient, id: string): Promise<GraphNode | null> {
  const result = await pool.query<GraphNode>(
    `SELECT id, type, label, properties, updated_at FROM chatbot_graph_nodes WHERE id = $1`,
    [id]
  )
  return result.rows[0] ?? null
}

// ── Lectura: recorrido acotado (BFS en TypeScript, sin LLM) ──

export interface GraphContext {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
}

const DEFAULT_MAX_NODES = 20
const DEFAULT_MAX_EDGES = 25
// Tope de aristas por nodo de origen en cada salto: sin esto, un nodo muy
// conectado (ej. "comuna:santiago" con cientos de cotizaciones) agotaria
// solo el presupuesto de un hop y dejaria a los demas nodos semilla sin
// recorrer. La particion real por relacion/peso en SQL (LATERAL join) seria
// mas eficiente a gran escala, pero mucho mas dificil de probar contra el
// fake-db por string-match de SQL que usan todos los tests del backend --
// se deja como mejora futura si el grafo crece lo bastante para que importe.
const DEFAULT_MAX_EDGES_PER_SOURCE = 8

/**
 * BFS en TypeScript puro (sin LLM) de 1-2 saltos desde seedIds, acotado por
 * nodos/aristas totales. No filtra por tipo -- ese filtro (frontera PII) es
 * responsabilidad exclusiva de buildLlmGraphContext(), no de esta funcion de
 * recorrido generico.
 */
export async function walkGraph(
  pool: Pool | PoolClient,
  seedIds: string[],
  opts: { maxHops?: 1 | 2; maxNodes?: number; maxEdges?: number } = {}
): Promise<GraphContext> {
  const maxHops = opts.maxHops ?? 2
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES
  const maxEdges = opts.maxEdges ?? DEFAULT_MAX_EDGES

  const visited = new Set<string>(seedIds.filter(Boolean))
  const collectedEdges: GraphEdge[] = []
  let frontier = [...visited]
  let truncated = false

  for (
    let hop = 0;
    hop < maxHops && frontier.length > 0 && collectedEdges.length < maxEdges;
    hop++
  ) {
    const result = await pool.query<GraphEdge>(
      `SELECT source_id, target_id, relation, weight, metadata, updated_at
         FROM chatbot_graph_edges
        WHERE source_id = ANY($1::text[])
        ORDER BY source_id, weight DESC, updated_at DESC`,
      [frontier]
    )

    const perSourceCount = new Map<string, number>()
    const nextFrontier = new Set<string>()
    for (const edge of result.rows) {
      if (collectedEdges.length >= maxEdges) {
        truncated = true
        break
      }
      const count = perSourceCount.get(edge.source_id) ?? 0
      if (count >= DEFAULT_MAX_EDGES_PER_SOURCE) {
        truncated = true
        continue
      }
      perSourceCount.set(edge.source_id, count + 1)
      collectedEdges.push(edge)
      if (!visited.has(edge.target_id)) nextFrontier.add(edge.target_id)
    }

    frontier = [...nextFrontier]
    for (const id of frontier) {
      if (visited.size >= maxNodes) {
        truncated = true
        break
      }
      visited.add(id)
    }
  }

  const nodeIds = [...visited].slice(0, maxNodes)
  const nodesResult = nodeIds.length
    ? await pool.query<GraphNode>(
        `SELECT id, type, label, properties, updated_at FROM chatbot_graph_nodes WHERE id = ANY($1::text[])`,
        [nodeIds]
      )
    : { rows: [] as GraphNode[] }

  return { nodes: nodesResult.rows, edges: collectedEdges, truncated }
}

/**
 * Unica funcion de lectura del grafo que puede terminar en un prompt de LLM
 * externo. Filtra SIEMPRE a LLM_SAFE_NODE_TYPES -- no acepta un parametro
 * que permita ampliar esa lista. Devuelve texto compacto listo para
 * interpolar, nunca un objeto de datos (para que no quede una ruta donde
 * alguien reenvie el objeto completo sin pasar por este filtro).
 */
export async function buildLlmGraphContext(
  pool: Pool | PoolClient,
  seedIds: string[]
): Promise<string> {
  if (seedIds.length === 0) return ''
  const { nodes, edges } = await walkGraph(pool, seedIds)

  const safeTypes: readonly string[] = LLM_SAFE_NODE_TYPES
  const safeNodes = nodes.filter(n => safeTypes.includes(n.type))
  if (safeNodes.length === 0) return ''
  const safeIds = new Set(safeNodes.map(n => n.id))
  const safeEdges = edges.filter(e => safeIds.has(e.source_id) && safeIds.has(e.target_id))

  const lines = safeEdges.length
    ? safeEdges.map(e => `(${e.source_id})-[${e.relation}]->(${e.target_id})`)
    : safeNodes.map(n => `(${n.id}: ${n.label})`)
  return lines.join('\n')
}

/**
 * Pre-extraccion determinista (sin LLM): busca, por substring normalizado,
 * que labels de nodos YA conocidos (acotados a LLM_SAFE_NODE_TYPES) aparecen
 * en el texto del turno actual + turnos recientes. El resultado son las
 * semillas para walkGraph/buildLlmGraphContext de ESTE turno, antes de saber
 * que extrajo el parser de intencion (que corre despues, con este contexto
 * ya inyectado en su propio prompt). Compara en memoria contra todos los
 * nodos seguros -- razonable para el catalogo/reglas/comunas de una sola
 * empresa (decenas a cientos de nodos); si el catalogo de materiales crece
 * mucho mas alla de eso, esto necesitaria busqueda de texto completo en vez
 * de un filter() lineal.
 */
export async function findMentionedGraphEntities(
  pool: Pool | PoolClient,
  text: string
): Promise<string[]> {
  const normalized = normalizeMaterialLabel(text)
  if (!normalized) return []

  const result = await pool.query<{ id: string; label: string }>(
    `SELECT id, label FROM chatbot_graph_nodes WHERE type = ANY($1::text[])`,
    [LLM_SAFE_NODE_TYPES]
  )
  return result.rows
    .filter(n => normalized.includes(normalizeMaterialLabel(n.label)))
    .map(n => n.id)
}

export interface ClientPattern {
  comunaHabitual?: string
  materialesFrecuentes?: string[]
  dotacionHabitual?: number
  diasHabitual?: number
}

/**
 * Lectura BACKEND-ONLY. Nunca construye ni devuelve texto de prompt -- firma
 * y proposito completamente distintos a buildLlmGraphContext() para que no
 * sea intercambiable por error. Lee las aristas salientes de cliente:<id>
 * (comuna/material mas frecuentes) y las devuelve como datos estructurados
 * para que crear_cotizacion/modificar_cotizacion los aplique directo, igual
 * que isComunaEnSantiago() ya se aplica hoy sin que el LLM lo vea.
 */
export async function applyClientPatterns(
  pool: Pool | PoolClient,
  clientId: string
): Promise<ClientPattern | null> {
  const sourceId = clienteNodeId(clientId)
  const result = await pool.query<GraphEdge>(
    `SELECT source_id, target_id, relation, weight, metadata, updated_at
       FROM chatbot_graph_edges
      WHERE source_id = $1
      ORDER BY weight DESC, updated_at DESC
      LIMIT 20`,
    [sourceId]
  )
  if (result.rows.length === 0) return null

  const pattern: ClientPattern = {}

  const comunaEdge = result.rows.find(
    e => e.relation === 'cotiza_en' && e.target_id.startsWith('comuna:')
  )
  const materialIds = result.rows
    .filter(e => e.relation === 'pide_material' && e.target_id.startsWith('material:'))
    .map(e => e.target_id)
  const labelTargets = [...(comunaEdge ? [comunaEdge.target_id] : []), ...materialIds]

  if (labelTargets.length > 0) {
    const nodes = await pool.query<{ id: string; label: string }>(
      `SELECT id, label FROM chatbot_graph_nodes WHERE id = ANY($1::text[])`,
      [labelTargets]
    )
    const labelById = new Map(nodes.rows.map(n => [n.id, n.label]))
    if (comunaEdge) pattern.comunaHabitual = labelById.get(comunaEdge.target_id)
    if (materialIds.length > 0) {
      pattern.materialesFrecuentes = materialIds
        .map(id => labelById.get(id))
        .filter((l): l is string => !!l)
    }
  }

  const dotacionEdge = result.rows.find(e => typeof e.metadata?.dotacion === 'number')
  if (dotacionEdge) pattern.dotacionHabitual = dotacionEdge.metadata.dotacion as number
  const diasEdge = result.rows.find(e => typeof e.metadata?.dias === 'number')
  if (diasEdge) pattern.diasHabitual = diasEdge.metadata.dias as number

  return Object.keys(pattern).length > 0 ? pattern : null
}
