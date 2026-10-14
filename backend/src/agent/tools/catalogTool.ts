import { AgentTool, AgentContext, AgentToolResult } from '../types'

export const buscarCatalogoTool: AgentTool = {
  name: 'buscar_catalogo',
  description:
    'Busca materiales o servicios en el catalogo interno de la empresa (mecanico y electrico) para conocer descripciones estandar y precios vigentes.',
  parameters: {
    type: 'object',
    properties: {
      termino: {
        type: 'string',
        description:
          'Termino o material a buscar (ej. "tubo de cobre", "refrigerante", "cable", "soporte")',
      },
    },
    required: ['termino'],
  },
  kind: 'read',
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const termino = String(args.termino ?? '').trim()
    if (!termino) {
      return {
        output: { items: [], total: 0, mensaje: 'Debe ingresar un termino de busqueda.' },
        summary: 'Búsqueda en catálogo vacía',
      }
    }

    const needle = `%${termino.replace(/%/g, '')}%`
    const [mecResult, eleResult] = await Promise.all([
      ctx.pool.query<{ id: string; description: string; unit_name: string; unit_price: string }>(
        `SELECT id, description, unit_name, unit_price FROM catalog_items
          WHERE description ILIKE $1 AND is_active = true
          ORDER BY lower(description) LIMIT 5`,
        [needle]
      ),
      ctx.pool.query<{ id: string; description: string; unit_name: string; unit_price: string }>(
        `SELECT id, description, unit_name, unit_price FROM electrical_catalog_items
          WHERE description ILIKE $1 AND is_active = true
          ORDER BY lower(description) LIMIT 5`,
        [needle]
      ),
    ])

    const items = [
      ...mecResult.rows.map(r => ({
        id: r.id,
        tipo: 'mecanico',
        descripcion: r.description,
        unidad: r.unit_name,
        precio_unitario: Number(r.unit_price),
      })),
      ...eleResult.rows.map(r => ({
        id: r.id,
        tipo: 'electrico',
        descripcion: r.description,
        unidad: r.unit_name,
        precio_unitario: Number(r.unit_price),
      })),
    ].slice(0, 8)

    return {
      output: {
        termino,
        total_encontrados: items.length,
        items,
      },
      summary: `Consultó catálogo para "${termino}" (${items.length} resultado(s))`,
    }
  },
}
