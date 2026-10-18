import { AgentTool, AgentContext, AgentToolResult } from '../types'
import { inferHvacTemplate } from '../../services/hvacTemplates'
import { cubicarEspecificacionHvacTool } from './specCubicatorTool'

export function sanitizeEmailPii(rawText: string): {
  sanitizedText: string
  redactedCount: number
} {
  let redactedCount = 0
  let text = String(rawText ?? '')

  // 1. Replace email addresses (A-21 PII boundary)
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, () => {
    redactedCount += 1
    return '[EMAIL_REDACTED]'
  })

  // 2. Replace Chilean RUTs
  text = text.replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, () => {
    redactedCount += 1
    return '[RUT_REDACTED]'
  })

  // 3. Replace Chilean phone numbers
  text = text.replace(/\+?56\s?9[\s\d]{7,9}/g, () => {
    redactedCount += 1
    return '[PHONE_REDACTED]'
  })

  return {
    sanitizedText: text,
    redactedCount,
  }
}

export const procesarCorreoCotizacionTool: AgentTool = {
  name: 'procesar_correo_cotizacion',
  description:
    'Procesa el texto de un correo de solicitud de cotización aplicando sanitización estricta de PII (A-21: sin RUT, email ni teléfono), detecta el cliente pagador vs usuario final (enduser) y genera la cubicación técnica HVAC completa.',
  parameters: {
    type: 'object',
    properties: {
      cuerpo_correo: {
        type: 'string',
        description: 'Cuerpo de texto del correo electrónico con la solicitud de cotización.',
      },
      cliente_pagador_hint: {
        type: 'string',
        description: 'Nombre o pista opcional de la empresa mandante / cliente pagador.',
      },
      enduser_hint: {
        type: 'string',
        description: 'Nombre o pista opcional del cliente final o instalación (EndUser).',
      },
      ciudad_faena: {
        type: 'string',
        description: 'Ciudad o comuna donde se ejecutará el servicio.',
      },
      distancia_km: {
        type: 'number',
        description: 'Distancia estimada en kilómetros hasta la faena.',
      },
    },
    required: ['cuerpo_correo'],
  },
  kind: 'read',
  roles: ['admin', 'commercial', 'engineer'],
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const rawEmail = String(args.cuerpo_correo ?? '')
    const { sanitizedText, redactedCount } = sanitizeEmailPii(rawEmail)

    const clienteHint =
      typeof args.cliente_pagador_hint === 'string' ? args.cliente_pagador_hint.trim() : ''
    const enduserHint = typeof args.enduser_hint === 'string' ? args.enduser_hint.trim() : ''
    const ciudadFaena =
      typeof args.ciudad_faena === 'string' ? args.ciudad_faena.trim() : 'Santiago'
    const distanciaKm =
      typeof args.distancia_km === 'number' && Number.isFinite(args.distancia_km)
        ? args.distancia_km
        : 30

    const inferredTemplate = inferHvacTemplate(sanitizedText)

    const cubicationResult = await cubicarEspecificacionHvacTool.execute(
      {
        plantilla_id: inferredTemplate,
        descripcion_requerimiento: sanitizedText,
        distancia_km: distanciaKm,
      },
      ctx
    )

    let clientePagadorDetectado: {
      id: string | null
      name: string
      coincidencias: Array<{ id: string; name: string }>
    } | null = null

    if (clienteHint) {
      const sanitizedHint = sanitizeEmailPii(clienteHint).sanitizedText
      try {
        const clientRes = await ctx.pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM clients WHERE name ILIKE $1 LIMIT 3`,
          [`%${sanitizedHint.replace(/%/g, '')}%`]
        )
        const firstMatch = clientRes.rows[0]
        clientePagadorDetectado = {
          id: firstMatch ? firstMatch.id : null,
          name: firstMatch ? firstMatch.name : sanitizedHint,
          coincidencias: clientRes.rows.map(r => ({ id: r.id, name: r.name })),
        }
      } catch {
        clientePagadorDetectado = {
          id: null,
          name: sanitizedHint,
          coincidencias: [],
        }
      }
    }

    const enduserDetectado = enduserHint ? sanitizeEmailPii(enduserHint).sanitizedText : null
    const textoSanitizadoPreview =
      sanitizedText.length > 280 ? `${sanitizedText.slice(0, 280)}...` : sanitizedText

    return {
      output: {
        pii_protegido: true,
        redacciones_pii: redactedCount,
        texto_sanitizado_preview: textoSanitizadoPreview,
        cliente_pagador_detectado: clientePagadorDetectado,
        enduser_detectado: enduserDetectado,
        ciudad_faena: ciudadFaena,
        cubicacion: cubicationResult.output,
      },
      summary: `Procesó correo con protección PII (${redactedCount} dato(s) redactado(s)) y cubicó plantilla ${inferredTemplate}`,
    }
  },
}
