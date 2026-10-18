import { AgentTool, AgentContext, AgentToolResult } from '../types'

interface ClientNameRow {
  id: string
  name: string
}

interface WinLossCountRow {
  adjudicadas: string
  perdidas: string
  enviadas: string
}

interface LostQuotationRow {
  correlative: string
  loss_reason: string | null
  loss_competitor: string | null
  total: string | number | null
}

interface FollowUpQuotationRow {
  id: string
  correlative: string
  ref: string | null
  status: string
  valid_until: string | null
  total: string | number | null
  client_name: string | null
}

export const analizarWinLossClienteTool: AgentTool = {
  name: 'analizar_win_loss_cliente',
  description:
    'Analiza las causas de cotizaciones ganadas y perdidas de un cliente, detecta competidores frecuentes y recomienda el perfil de margen comercial (competitivo vs estandar) respetando la frontera PII (A-21).',
  parameters: {
    type: 'object',
    properties: {
      cliente_nombre: {
        type: 'string',
        description: 'Nombre o razon social del cliente a analizar',
      },
    },
    required: ['cliente_nombre'],
  },
  kind: 'read',
  roles: ['admin', 'commercial', 'engineer'],
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const rawName = String(args.cliente_nombre ?? '').trim()
    if (!rawName) {
      return {
        output: { error: 'Debe proporcionar cliente_nombre.' },
        summary: 'Nombre de cliente vacío en análisis win/loss',
      }
    }

    // A-21: Solo consultamos id y name (nunca RUT, email ni teléfono)
    const clientRes = await ctx.pool.query<ClientNameRow>(
      `SELECT id, name
       FROM clients
       WHERE name ILIKE $1 AND deleted_at IS NULL
       ORDER BY name ASC
       LIMIT 1`,
      [`%${rawName}%`]
    )

    if (clientRes.rows.length === 0) {
      return {
        output: {
          encontrado: false,
          mensaje: `No se encontró cliente con nombre similar a "${rawName}".`,
        },
        summary: `Cliente "${rawName}" no encontrado para win/loss`,
      }
    }

    const client = clientRes.rows[0]

    const countsRes = await ctx.pool.query<WinLossCountRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Adjudicada')::text AS adjudicadas,
         COUNT(*) FILTER (WHERE status = 'Perdida')::text AS perdidas,
         COUNT(*) FILTER (WHERE status = 'Enviada')::text AS enviadas
       FROM quotations
       WHERE client_id = $1 AND deleted_at IS NULL`,
      [client.id]
    )

    const countsRow = countsRes.rows[0]
    const adjudicadas = Number(countsRow?.adjudicadas ?? 0)
    const perdidas = Number(countsRow?.perdidas ?? 0)
    const enviadas = Number(countsRow?.enviadas ?? 0)
    const cerradas = adjudicadas + perdidas
    const tasaConversionPct = cerradas > 0 ? Math.round((adjudicadas / cerradas) * 100) : 0

    const lostRes = await ctx.pool.query<LostQuotationRow>(
      `SELECT correlative, loss_reason, loss_competitor, total
       FROM quotations
       WHERE client_id = $1 AND status = 'Perdida' AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 10`,
      [client.id]
    )

    const causasPerdida: Array<{
      correlativo: string
      motivo: string
      competidor: string | null
      monto_total: number
    }> = []
    const competidoresSet = new Set<string>()
    let perdidasPorPrecioOCompetidor = 0

    for (const row of lostRes.rows) {
      const motivo = (row.loss_reason ?? 'No especificado').trim()
      const competidor = row.loss_competitor ? row.loss_competitor.trim() : null
      if (competidor) {
        competidoresSet.add(competidor)
      }
      const lowerMotivo = motivo.toLowerCase()
      if (
        lowerMotivo.includes('precio') ||
        lowerMotivo.includes('presupuesto') ||
        lowerMotivo.includes('costo') ||
        lowerMotivo.includes('tarifa') ||
        competidor !== null
      ) {
        perdidasPorPrecioOCompetidor += 1
      }
      causasPerdida.push({
        correlativo: row.correlative,
        motivo,
        competidor,
        monto_total: Number(row.total ?? 0),
      })
    }

    const usarCompetitivo =
      perdidasPorPrecioOCompetidor > 0 || (cerradas >= 2 && tasaConversionPct < 50)
    const perfilMargenRecomendado: 'competitivo' | 'estandar' = usarCompetitivo
      ? 'competitivo'
      : 'estandar'

    const competidoresDetectados = Array.from(competidoresSet)
    const recomendacionEstrategica = usarCompetitivo
      ? `Se detectan pérdidas asociadas a precio/competencia (${competidoresDetectados.join(', ') || 'sin especificar'}). Se recomienda aplicar perfil de margen 'competitivo' (mo 28%, mat 20%, log 25%) y destacar plazos de respuesta técnica.`
      : `Tasa de conversión saludable (${tasaConversionPct}%). Se recomienda mantener perfil de margen 'estandar' (mo 35%, resto 30%) enfatizando garantía y cumplimiento normativo HVAC.`

    return {
      output: {
        encontrado: true,
        cliente_nombre: client.name,
        resumen: {
          adjudicadas,
          perdidas,
          enviadas,
          tasa_conversion_pct: tasaConversionPct,
        },
        causas_perdida: causasPerdida,
        competidores_detectados: competidoresDetectados,
        perfil_margen_recomendado: perfilMargenRecomendado,
        recomendacion_estrategica: recomendacionEstrategica,
      },
      summary: `Win/Loss ${client.name}: ${tasaConversionPct}% conversión, margen recomendado: ${perfilMargenRecomendado}`,
    }
  },
}

export const prepararSeguimientoCotizacionTool: AgentTool = {
  name: 'preparar_seguimiento_cotizacion',
  description:
    'Prepara un borrador de mensaje comercial de seguimiento (Human-in-the-Loop) para una cotización sin exponer correos ni RUTs personales (A-21).',
  parameters: {
    type: 'object',
    properties: {
      quotation_id: {
        type: 'string',
        description: 'ID de la cotización a dar seguimiento (opcional si ya está en contexto)',
      },
      tono: {
        type: 'string',
        enum: ['cordial', 'urgente', 'tecnico'],
        description: 'Tono del borrador de seguimiento comercial',
      },
    },
  },
  kind: 'read',
  roles: ['admin', 'commercial', 'engineer'],
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const qId = (args.quotation_id as string | undefined) || ctx.quotationId
    if (!qId) {
      return {
        output: {
          encontrado: false,
          error: 'No se especificó quotation_id ni existe una cotización activa en el contexto.',
        },
        summary: 'Seguimiento omitido: falta ID de cotización',
      }
    }

    const rawTono = String(args.tono ?? 'cordial').toLowerCase()
    const tono: 'cordial' | 'urgente' | 'tecnico' =
      rawTono === 'urgente' || rawTono === 'tecnico' ? rawTono : 'cordial'

    const qRes = await ctx.pool.query<FollowUpQuotationRow>(
      `SELECT q.id, q.correlative, q.ref, q.status, q.valid_until, q.total, c.name as client_name
       FROM quotations q
       LEFT JOIN clients c ON c.id = q.client_id
       WHERE q.id = $1 AND q.deleted_at IS NULL`,
      [qId]
    )

    if (qRes.rows.length === 0) {
      return {
        output: {
          encontrado: false,
          mensaje: `No se encontró la cotización solicitada (${qId}).`,
        },
        summary: `Cotización ${qId} no encontrada para seguimiento`,
      }
    }

    const q = qRes.rows[0]
    const clienteNombre = q.client_name ?? 'Cliente'
    const refText = q.ref ? ` (${q.ref})` : ''
    const totalClp = Number(q.total ?? 0).toLocaleString('es-CL')
    const vigencia = q.valid_until ? String(q.valid_until).slice(0, 10) : 'próxima a vencer'

    const asunto = `Seguimiento Propuesta Técnica-Comercial ${q.correlative}${refText} — ${clienteNombre}`

    let apertura = `Estimado equipo de ${clienteNombre}, junto con saludar cordialmente,`
    let cierre =
      'Quedamos atentos a sus comentarios para coordinar los próximos pasos o resolver cualquier consulta.'

    if (tono === 'urgente') {
      apertura = `Estimado equipo de ${clienteNombre}, les escribimos para dar prioridad a la revisión de nuestra propuesta,`
      cierre = `Considerando la vigencia (${vigencia}) y la disponibilidad de cuadrillas técnicas, agradeceremos su confirmación a la brevedad.`
    } else if (tono === 'tecnico') {
      apertura = `Estimado equipo técnico de ${clienteNombre}, en relación con el alcance de climatización y electromecánica cotizado,`
      cierre =
        'Quedamos disponibles para revisar en detalle las especificaciones de materiales, dotación asignada y programación de faena.'
    }

    const mensajeTexto = `${apertura} consultamos por el estado de evaluación de la cotización ${q.correlative}${refText} por un total neto de $${totalClp} CLP (vigencia: ${vigencia}). ${cierre}`

    const puntosClave = [
      `Cotización: ${q.correlative}${refText}`,
      `Cliente: ${clienteNombre}`,
      `Estado actual: ${q.status}`,
      `Monto neto referencial: $${totalClp} CLP`,
      `Vigencia: ${vigencia}`,
    ]

    return {
      output: {
        encontrado: true,
        quotation_id: q.id,
        correlativo: q.correlative,
        cliente_nombre: clienteNombre,
        tono,
        borrador: {
          asunto,
          mensaje_texto: mensajeTexto,
          puntos_clave: puntosClave,
        },
        requiere_aprobacion_humana: true,
      },
      summary: `Borrador de seguimiento (${tono}) preparado para ${q.correlative} (${clienteNombre})`,
    }
  },
}
