import { AgentTool, AgentContext, AgentToolResult } from '../types'
import { lookupMaterialPrice } from '../../services/chatbotOps'

export const consultarPrecioWebTool: AgentTool = {
  name: 'consultar_precio_web',
  description:
    'Busca en la web el precio de mercado actualizado en Chile para un material de climatización o construcción (Sodimac, Construmart, MercadoLibre, etc.).',
  parameters: {
    type: 'object',
    properties: {
      material: {
        type: 'string',
        description:
          'Nombre del material a cotizar en el mercado (ej. "tubo cobre 1/2 pulgada tira 6m", "gas refrigerante R410a 11.3kg")',
      },
    },
    required: ['material'],
  },
  kind: 'read',
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const material = String(args.material ?? '').trim()
    if (!material) {
      return {
        output: { material: '', precio_medio: 0, advertencia: 'Nombre de material requerido.' },
        summary: 'Consulta de precio sin material',
      }
    }

    const res = await lookupMaterialPrice(
      ctx.pool,
      material,
      {
        instruction: ctx.instruction,
        userId: ctx.userId,
        llmProvider: ctx.model,
      },
      { timeoutMs: 15_000 }
    )

    return {
      output: {
        material: res.material,
        precio_medio: res.precio_medio,
        muestras_encontradas: res.muestras.length,
        advertencia: res.advertencia ?? null,
      },
      summary:
        res.precio_medio > 0
          ? `Consultó precio web de "${material}": ~$${Math.round(res.precio_medio).toLocaleString('es-CL')} CLP`
          : `Consultó precio web de "${material}": sin precio confiable`,
      notas: res.notas,
      priceData: {
        material: res.material,
        precio_medio: res.precio_medio,
        muestras: res.muestras,
        advertencia: res.advertencia,
      },
    }
  },
}
