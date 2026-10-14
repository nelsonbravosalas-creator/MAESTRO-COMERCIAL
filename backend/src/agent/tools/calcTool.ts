import { AgentTool, AgentContext, AgentToolResult } from '../types'
import { buildAutoLineItems } from '../../services/chatbotCalc'

export const calcularItemsAutoTool: AgentTool = {
  name: 'calcular_items_automaticos',
  description:
    'Calcula automáticamente los ítems de colación diaria y bonificación por desplazamiento fuera de Santiago usando las tarifas oficiales de la empresa.',
  parameters: {
    type: 'object',
    properties: {
      dias: {
        type: 'number',
        description: 'Cantidad de días estimados de trabajo.',
      },
      dotacion: {
        type: 'number',
        description: 'Cantidad de técnicos / personas asignadas.',
      },
      comuna: {
        type: 'string',
        description: 'Comuna donde se realizará la faena (para evaluar si está fuera de Santiago).',
      },
    },
    required: ['dias', 'dotacion'],
  },
  kind: 'read',
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const dias = Number(args.dias) || 0
    const dotacion = Number(args.dotacion) || 0
    const comuna = args.comuna ? String(args.comuna).trim() : null

    const lineas = await buildAutoLineItems(ctx.pool, { dias, dotacion, comuna })

    const totalCalculado = lineas.reduce(
      (acc, l) => acc + l.cantidad * l.dias * l.precio_unitario,
      0
    )

    return {
      output: {
        dias,
        dotacion,
        comuna,
        lineas_generadas: lineas,
        total_estimado_clp: totalCalculado,
      },
      summary: `Calculó costos automáticos (${lineas.length} ítems: colación/traslado por $${Math.round(totalCalculado).toLocaleString('es-CL')})`,
    }
  },
}
