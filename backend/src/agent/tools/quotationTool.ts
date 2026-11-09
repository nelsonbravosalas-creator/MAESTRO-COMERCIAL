import { AgentTool, AgentContext, AgentToolResult } from '../types'
import {
  createQuotationOp,
  addLinesToQuotationOp,
  resolveClientByName,
  manualItemsWarning,
} from '../../services/chatbotOps'
import { fullQuotation } from '../../api/quotations'
import { ImportLinea } from '../../services/chatbotCalc'
import { scrubPii } from '../../services/chatbotOps'
import { httpError } from '../../utils/httpError'

// Categorías de línea que el modelo puede usar al proponer materiales.
// Debe coincidir con CATEGORY_IDS de api/quotations.ts: cualquier otra
// categoría se descartaría en silencio al guardar (F1).
export const CATEGORIAS_LINEA = ['mat', 'mec', 'ele', 'ins', 'rep', 'mo', 'log'] as const

// Rechaza al proponer una categoría que la cotización no guardaría (F1).
export function validarCategoriasMateriales(args: Record<string, unknown>): void {
  const materiales = Array.isArray(args.materiales)
    ? (args.materiales as Array<Record<string, unknown>>)
    : []
  for (const m of materiales) {
    if (m.categoria === undefined) continue
    if (!(CATEGORIAS_LINEA as readonly string[]).includes(String(m.categoria))) {
      throw httpError(
        `Categoria "${String(m.categoria)}" no existe. Use una de: ${CATEGORIAS_LINEA.join(', ')}.`,
        422
      )
    }
  }
}

const clp = (n: number): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')

// Una línea por material con su neto (cantidad x precio). Es aritmética simple
// sobre lo que dijo el usuario; el cálculo oficial lo hace el backend.
export function describeMateriales(args: Record<string, unknown>): string {
  const materiales = Array.isArray(args.materiales)
    ? (args.materiales as Array<Record<string, unknown>>)
    : []
  const lineas = materiales.map(m => {
    const cantidad = Number(m.cantidad) || 1
    const precio = Number(m.precio_unitario) || 0
    const unidad = String(m.unidad || 'Und')
    const neto = cantidad * precio
    return `- ${String(m.descripcion ?? '').trim()}: ${cantidad} ${unidad} x $${clp(precio)} = $${clp(neto)} neto`
  })
  if (Number(args.dias) > 0) lineas.push('Más colación y bono según reglas vigentes')
  return lineas.join('\n')
}

function describeDetalle(args: Record<string, unknown>): string {
  const partes: string[] = []
  if (Number(args.dias) > 0) partes.push(`${Number(args.dias)} días`)
  if (Number(args.dotacion) > 0) partes.push(`${Number(args.dotacion)} personas`)
  if (args.comuna) partes.push(String(args.comuna).trim())
  return partes.join(', ')
}

export const verCotizacionTool: AgentTool = {
  name: 'ver_cotizacion',
  description:
    'Obtiene los detalles de una cotización abierta o específica (correlativo, cliente, estado, ítems, totales).',
  parameters: {
    type: 'object',
    properties: {
      quotation_id: {
        type: 'string',
        description:
          'ID de la cotización a consultar (si se omite, usa la cotización actualmente abierta en pantalla).',
      },
    },
  },
  kind: 'read',
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const qId = (args.quotation_id as string) || ctx.quotationId
    if (!qId) {
      return {
        output: {
          encontrada: false,
          mensaje: 'No hay ninguna cotización abierta en pantalla ni se especificó un ID.',
        },
        summary: 'Consulta de cotización sin ID',
      }
    }

    const q = await fullQuotation(ctx.pool, qId)
    if (!q) {
      return {
        output: { encontrada: false, quotation_id: qId, mensaje: 'Cotización no encontrada.' },
        summary: `Cotización ${qId} no encontrada`,
      }
    }

    // A-21: Minimización de datos personales — no exponemos RUT, email ni teléfono del cliente al LLM.
    const sanitizedItems = (q.line_items ?? []).map((li: Record<string, unknown>) => ({
      categoria: li.category_id,
      descripcion: scrubPii(String(li.description ?? '')),
      unidad: li.unit_name,
      cantidad: Number(li.quantity),
      dias: Number(li.days),
      precio_unitario: Number(li.unit_price),
    }))

    return {
      output: {
        id: q.id,
        correlativo: q.correlative,
        cliente_nombre: q.client_name ? scrubPii(String(q.client_name)) : q.client_name,
        estado: q.status,
        referencia: q.ref ? scrubPii(String(q.ref)) : q.ref,
        fecha: q.date,
        cantidad_items: sanitizedItems.length,
        items: sanitizedItems,
      },
      summary: `Consultó cotización ${q.correlative} (${sanitizedItems.length} ítems, estado: ${q.status})`,
    }
  },
}

export const crearCotizacionTool: AgentTool = {
  name: 'crear_cotizacion',
  description:
    'Crea una nueva cotización oficial en el sistema para un cliente existente, calculando mano de obra/viáticos y agregando materiales.',
  parameters: {
    type: 'object',
    properties: {
      cliente_nombre: {
        type: 'string',
        description:
          'Nombre del cliente (debe coincidir con un cliente registrado en la base de datos).',
      },
      dias: {
        type: 'number',
        description: 'Cantidad de días estimados de trabajo.',
      },
      dotacion: {
        type: 'number',
        description: 'Cantidad de personas o técnicos en la faena.',
      },
      comuna: {
        type: 'string',
        description: 'Comuna donde se realiza el servicio.',
      },
      descripcion_trabajo: {
        type: 'string',
        description: 'Breve referencia o descripción del trabajo a cotizar.',
      },
      materiales: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            descripcion: { type: 'string' },
            cantidad: { type: 'number' },
            unidad: { type: 'string' },
            precio_unitario: { type: 'number' },
            categoria: { type: 'string', enum: [...CATEGORIAS_LINEA] },
          },
          required: ['descripcion'],
        },
        description: 'Lista de materiales o insumos identificados para la cotización.',
      },
    },
    required: ['cliente_nombre'],
  },
  kind: 'write',
  describe: args => {
    const cliente = String(args.cliente_nombre ?? 'cliente sin nombre').trim()
    const detalle = describeDetalle(args)
    return [
      `Crear cotización para ${cliente}${detalle ? ` (${detalle})` : ''}`,
      describeMateriales(args),
    ]
      .filter(Boolean)
      .join('\n')
  },
  // Valida el cliente al proponer: sin cliente, ambiguo o sin RUT no se crea propuesta.
  prepare: async (args, ctx) => {
    validarCategoriasMateriales(args)
    await resolveClientByName(ctx.pool, String(args.cliente_nombre ?? '').trim())
    return args
  },
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const clienteNombre = String(args.cliente_nombre ?? '').trim()
    const client = await resolveClientByName(ctx.pool, clienteNombre)

    const rawMaterials = (args.materiales as Array<Record<string, unknown>>) ?? []
    const manualLineas: ImportLinea[] = rawMaterials.map(m => ({
      category_id: String(m.categoria || 'mat'),
      descripcion: String(m.descripcion || '').trim(),
      unidad: String(m.unidad || 'Und'),
      cantidad: Number(m.cantidad) || 1,
      dias: 1,
      precio_unitario: Number(m.precio_unitario) || 0,
    }))

    const dias = args.dias != null ? Number(args.dias) : null
    const dotacion = args.dotacion != null ? Number(args.dotacion) : null
    const comuna = args.comuna ? String(args.comuna).trim() : null
    const descripcionTrabajo = args.descripcion_trabajo
      ? String(args.descripcion_trabajo).trim()
      : null

    const opResult = await createQuotationOp(
      ctx.pool,
      {
        client,
        dias,
        dotacion,
        comuna,
        descripcionTrabajo,
        manualLineas,
        materiales: manualLineas.map(l => l.descripcion),
      },
      {
        instruction: ctx.instruction,
        userId: ctx.userId,
        llmProvider: ctx.model,
      }
    )

    return {
      output: {
        creada: true,
        quotation_id: opResult.result.quotation.id,
        correlativo: opResult.result.quotation.correlative,
        items_totales: opResult.lineas.length,
        advertencia: manualItemsWarning(manualLineas),
        mensaje: opResult.reply,
      },
      summary: `Creó cotización ${opResult.result.quotation.correlative} con ${opResult.lineas.length} ítem(s)`,
      mutatedQuotation: opResult.result.quotation,
      notas: opResult.notas,
    }
  },
}

export const modificarCotizacionTool: AgentTool = {
  name: 'modificar_cotizacion',
  description: 'Agrega ítems, días o dotación a una cotización abierta existente.',
  parameters: {
    type: 'object',
    properties: {
      quotation_id: {
        type: 'string',
        description:
          'ID de la cotización a modificar (si se omite, usa la cotización abierta en pantalla).',
      },
      dias: {
        type: 'number',
        description: 'Días de trabajo adicionales o a calcular.',
      },
      dotacion: {
        type: 'number',
        description: 'Dotación de personas para los ítems a agregar.',
      },
      comuna: {
        type: 'string',
        description: 'Comuna de la faena.',
      },
      materiales: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            descripcion: { type: 'string' },
            cantidad: { type: 'number' },
            unidad: { type: 'string' },
            precio_unitario: { type: 'number' },
            categoria: { type: 'string', enum: [...CATEGORIAS_LINEA] },
          },
          required: ['descripcion'],
        },
        description: 'Nuevos ítems o materiales a agregar a la cotización.',
      },
    },
  },
  kind: 'write',
  describe: args => {
    const items = Array.isArray(args.materiales) ? args.materiales.length : 0
    const destino = args.quotation_id ? 'indicada' : 'abierta'
    const detalle = describeDetalle(args)
    return [
      `Agregar ${items} ítem(es) a la cotización ${destino}${detalle ? ` (${detalle})` : ''}`,
      describeMateriales(args),
    ]
      .filter(Boolean)
      .join('\n')
  },
  prepare: async (args, ctx) => {
    validarCategoriasMateriales(args)
    const qId = (args.quotation_id as string) || ctx.quotationId
    if (!qId) {
      throw httpError(
        'No hay una cotización abierta para modificar. Abre una en pantalla o pídeme crear una nueva.',
        422
      )
    }
    const existente = await fullQuotation(ctx.pool, qId)
    if (!existente) throw httpError(`La cotización ${qId} no existe.`, 404)
    return { ...args, quotation_id: qId }
  },
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const qId = (args.quotation_id as string) || ctx.quotationId
    if (!qId) {
      throw httpError(
        'No hay una cotización abierta para modificar. Abre una en pantalla o pídeme crear una nueva.',
        422
      )
    }

    const rawMaterials = (args.materiales as Array<Record<string, unknown>>) ?? []
    const manualLineas: ImportLinea[] = rawMaterials.map(m => ({
      category_id: String(m.categoria || 'mat'),
      descripcion: String(m.descripcion || '').trim(),
      unidad: String(m.unidad || 'Und'),
      cantidad: Number(m.cantidad) || 1,
      dias: 1,
      precio_unitario: Number(m.precio_unitario) || 0,
    }))

    const dias = args.dias != null ? Number(args.dias) : null
    const dotacion = args.dotacion != null ? Number(args.dotacion) : null
    const comuna = args.comuna ? String(args.comuna).trim() : null

    const opResult = await addLinesToQuotationOp(
      ctx.pool,
      qId,
      {
        dias,
        dotacion,
        comuna,
        manualLineas,
        materiales: manualLineas.map(l => l.descripcion),
      },
      {
        instruction: ctx.instruction,
        userId: ctx.userId,
        llmProvider: ctx.model,
        role: ctx.userRole,
      }
    )

    return {
      output: {
        modificada: true,
        quotation_id: qId,
        correlativo: opResult.existing.correlative,
        items_agregados: opResult.addedCount,
        mensaje: opResult.reply,
      },
      summary: `Agregó ${opResult.addedCount} ítem(s) a cotización ${opResult.existing.correlative}`,
      mutatedQuotation: opResult.updated,
    }
  },
}
