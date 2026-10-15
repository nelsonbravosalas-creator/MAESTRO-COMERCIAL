import { AgentTool, AgentContext, AgentToolResult } from '../types'
import { findClientByName } from '../../services/chatbotOps'
import { clienteNodeId } from '../../services/chatbotGraph'

function modeFromCounts(counts?: Record<string, number>): number | null {
  if (!counts || typeof counts !== 'object') return null
  let bestKey: string | null = null
  let bestCount = 0
  for (const [key, count] of Object.entries(counts)) {
    if (typeof count === 'number' && count > bestCount) {
      bestCount = count
      bestKey = key
    }
  }
  return bestKey !== null ? Number(bestKey) : null
}

export const consultarHistorialClienteTool: AgentTool = {
  name: 'consultar_historial_cliente',
  description:
    'Consulta el historial comercial y operacional de un cliente: total de cotizaciones, tasa de adjudicacion, estados recientes y patrones aprendidos de dotacion/dias de faena.',
  parameters: {
    type: 'object',
    properties: {
      cliente_nombre_o_rut: {
        type: 'string',
        description:
          'Nombre de fantasia, razon social o RUT del cliente a consultar (ej. "Enel", "Mall Plaza", "Echeverria")',
      },
    },
    required: ['cliente_nombre_o_rut'],
  },
  kind: 'read',
  roles: ['admin', 'commercial', 'engineer'],
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const rawSearch = String(args.cliente_nombre_o_rut ?? '').trim()
    if (!rawSearch) {
      return {
        output: { error: 'Debe ingresar un nombre o RUT de cliente.' },
        summary: 'Búsqueda de historial de cliente vacía',
      }
    }

    // 1. Buscar cliente por nombre o RUT
    const clients = await findClientByName(ctx.pool, rawSearch)
    if (clients.length === 0) {
      return {
        output: {
          encontrado: false,
          mensaje: `No se encontró ningún cliente que coincida con "${rawSearch}".`,
        },
        summary: `Cliente "${rawSearch}" no encontrado`,
      }
    }

    const client = clients[0]

    // 2. Consultar métricas de cotizaciones agrupadas por estado
    const quotesRes = await ctx.pool.query<{
      total: string
      adjudicadas: string
      perdidas: string
      enviadas: string
      borradores: string
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'Adjudicada')::text AS adjudicadas,
         COUNT(*) FILTER (WHERE status = 'Perdida')::text AS perdidas,
         COUNT(*) FILTER (WHERE status = 'Enviada')::text AS enviadas,
         COUNT(*) FILTER (WHERE status = 'Borrador')::text AS borradores
       FROM quotations
       WHERE client_id = $1 AND deleted_at IS NULL`,
      [client.id]
    )

    const quoteRow = quotesRes.rows[0]
    const totalQuotes = Number(quoteRow?.total ?? 0)
    const adjudicadas = Number(quoteRow?.adjudicadas ?? 0)
    const perdidas = Number(quoteRow?.perdidas ?? 0)
    const enviadas = Number(quoteRow?.enviadas ?? 0)
    const winRate = totalQuotes > 0 ? Math.round((adjudicadas / totalQuotes) * 100) : 0

    // 3. Últimas cotizaciones (resumen seguro sin PII de contactos privados)
    const recentQuotes = await ctx.pool.query<{
      correlative: string
      date: string
      status: string
      subject: string
      kind: string
    }>(
      `SELECT correlative, date::text, status, COALESCE(ref, '') AS subject, kind
       FROM quotations
       WHERE client_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`,
      [client.id]
    )

    // 4. Patrones de dotación/días habituales aprendidos en el grafo
    const clienteNode = clienteNodeId(client.id)
    const edgesRes = await ctx.pool.query<{
      target_id: string
      metadata: Record<string, unknown>
    }>(
      `SELECT target_id, metadata
       FROM chatbot_graph_edges
       WHERE source_id = $1 AND relation = 'cotiza_en'`,
      [clienteNode]
    )

    const patronesPorComuna: Array<{
      comuna: string
      dotacion_habitual: number | null
      dias_habituales: number | null
    }> = []

    for (const edge of edgesRes.rows) {
      const comuna = edge.target_id.replace(/^comuna:/, '').replace(/-/g, ' ')
      const meta = edge.metadata || {}
      const dotCounts = meta.dotacion_counts as Record<string, number> | undefined
      const diasCounts = meta.dias_counts as Record<string, number> | undefined
      patronesPorComuna.push({
        comuna,
        dotacion_habitual:
          modeFromCounts(dotCounts) ?? (typeof meta.dotacion === 'number' ? meta.dotacion : null),
        dias_habituales:
          modeFromCounts(diasCounts) ?? (typeof meta.dias === 'number' ? meta.dias : null),
      })
    }

    const payload = {
      encontrado: true,
      cliente: {
        id: client.id,
        nombre: client.name,
        rut: client.rut,
      },
      metricas_comerciales: {
        total_cotizaciones: totalQuotes,
        adjudicadas,
        perdidas,
        enviadas,
        tasa_adjudicacion_pct: winRate,
      },
      ultimas_cotizaciones: recentQuotes.rows.map(q => ({
        correlativo: q.correlative,
        fecha: q.date,
        estado: q.status,
        asunto: q.subject,
        tipo: q.kind,
      })),
      patrones_operacionales: patronesPorComuna,
    }

    return {
      output: payload,
      summary: `Historial de ${client.name}: ${totalQuotes} cotizaciones (${winRate}% tasa éxito, ${adjudicadas} adjudicadas)`,
    }
  },
}
