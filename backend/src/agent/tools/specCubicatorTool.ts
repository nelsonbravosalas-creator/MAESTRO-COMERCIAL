import { AgentTool, AgentContext, AgentToolResult } from '../types'
import {
  HVAC_TEMPLATES,
  HvacTemplateId,
  HvacCategoryId,
  MarginProfile,
  STANDARD_COMMERCIAL_TERMS,
  STANDARD_EXCLUSIONS,
  computeHvacLogistics,
  getCategoryMargins,
  inferHvacTemplate,
} from '../../services/hvacTemplates'

interface CatalogRow {
  description: string
  unit_name: string
  unit_price: string | number
  category_id: string | null
}

export interface CubicatedLineItem {
  category_id: HvacCategoryId
  description: string
  unit: string
  quantity: number
  days: number
  unit_price_clp: number
  costo_neto_total: number
  margen_pct: number
  venta_neta_estimada: number
  match_catalogo: 'auto' | 'propuesto'
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isValidTemplateId(value: string): value is HvacTemplateId {
  return Object.prototype.hasOwnProperty.call(HVAC_TEMPLATES, value)
}

function matchCatalogRow(targetDesc: string, catalogRows: CatalogRow[]): CatalogRow | undefined {
  const normTarget = normalizeText(targetDesc)
  if (!normTarget) return undefined

  for (const row of catalogRows) {
    const normRow = normalizeText(row.description)
    if (!normRow) continue
    if (normRow.includes(normTarget) || normTarget.includes(normRow)) {
      return row
    }
  }

  const tokens = normTarget.split(/\s+/).filter(t => t.length >= 4)
  if (tokens.length >= 2) {
    for (const row of catalogRows) {
      const normRow = normalizeText(row.description)
      const matchedCount = tokens.filter(tok => normRow.includes(tok)).length
      if (matchedCount >= 2 && matchedCount >= Math.ceil(tokens.length * 0.6)) {
        return row
      }
    }
  }

  return undefined
}

export const cubicarEspecificacionHvacTool: AgentTool = {
  name: 'cubicar_especificacion_hvac',
  description:
    'Cubica técnicamente un requerimiento HVAC aplicando plantillas de ingeniería (VRF, Flushing Precisión, Instalación, Eléctrico, Mantenimiento), cruzando ítems contra el catálogo activo, calculando logística por tramos de distancia y aplicando márgenes por categoría.',
  parameters: {
    type: 'object',
    properties: {
      plantilla_id: {
        type: 'string',
        description:
          'ID opcional de plantilla (ACT-FUGA-VRF, ACT-REP-PRECISION-FLUSH, ACT-INSTALACION-EQUIPOS, ACT-ELECTRICO, ACT-MANTENIMIENTO-PREVENTIVO). Si se omite, se infiere automáticamente.',
      },
      descripcion_requerimiento: {
        type: 'string',
        description: 'Descripción técnica del trabajo o requerimiento a cubicar.',
      },
      distancia_km: {
        type: 'number',
        description: 'Distancia en kilómetros desde base hasta la faena (por defecto 30 km).',
      },
      dias_ajustados: {
        type: 'number',
        description: 'Días de duración estimados si difieren del estándar de la plantilla.',
      },
      dotacion_ajustada: {
        type: 'number',
        description: 'Cantidad total de técnicos/personas en la cuadrilla si se desea ajustar.',
      },
      perfil_margen: {
        type: 'string',
        enum: ['estandar', 'competitivo'],
        description: 'Perfil de margen comercial por categoría (estandar o competitivo).',
      },
    },
    required: ['descripcion_requerimiento'],
  },
  kind: 'read',
  roles: ['admin', 'commercial', 'engineer'],
  execute: async (args: Record<string, unknown>, ctx: AgentContext): Promise<AgentToolResult> => {
    const rawPlantilla = typeof args.plantilla_id === 'string' ? args.plantilla_id.trim() : ''
    const descripcion = String(args.descripcion_requerimiento ?? '').trim()
    const templateId: HvacTemplateId = isValidTemplateId(rawPlantilla)
      ? rawPlantilla
      : inferHvacTemplate(descripcion)

    const template = HVAC_TEMPLATES[templateId]
    const perfilMargen: MarginProfile =
      args.perfil_margen === 'competitivo' ? 'competitivo' : 'estandar'
    const margenesPct = getCategoryMargins(perfilMargen)

    const days =
      typeof args.dias_ajustados === 'number' &&
      Number.isFinite(args.dias_ajustados) &&
      args.dias_ajustados > 0
        ? Math.max(1, Math.round(args.dias_ajustados))
        : template.baseDays

    const defaultCrewSize =
      template.crew.supervisor +
      template.crew.tecnicoSenior +
      template.crew.tecnico +
      template.crew.ayudante

    const crewSize =
      typeof args.dotacion_ajustada === 'number' &&
      Number.isFinite(args.dotacion_ajustada) &&
      args.dotacion_ajustada > 0
        ? Math.max(1, Math.round(args.dotacion_ajustada))
        : Math.max(1, defaultCrewSize)

    const distanceKm =
      typeof args.distancia_km === 'number' &&
      Number.isFinite(args.distancia_km) &&
      args.distancia_km >= 0
        ? args.distancia_km
        : 30

    let catalogRows: CatalogRow[]
    try {
      const dbRes = await ctx.pool.query<CatalogRow>(
        `SELECT description, unit_name, unit_price, category_id FROM catalog_items WHERE is_active = true`
      )
      catalogRows = dbRes.rows
    } catch {
      catalogRows = []
    }

    const lineas: CubicatedLineItem[] = []

    for (const item of template.items) {
      const matched = matchCatalogRow(item.description, catalogRows)
      const catalogPrice = matched ? Number(matched.unit_price) : NaN
      const hasValidCatalogPrice =
        matched !== undefined && Number.isFinite(catalogPrice) && catalogPrice > 0

      const unitPrice = hasValidCatalogPrice ? catalogPrice : item.suggestedUnitPrice
      const itemDays = item.scaleWithDays ? days : 1
      const costoNetoTotal = Math.round(item.baseQty * itemDays * unitPrice)
      const margenPct = margenesPct[item.category_id]
      const factorMargen = Math.max(0.01, 1 - margenPct / 100)
      const ventaNetaEstimada = Math.round(costoNetoTotal / factorMargen)

      lineas.push({
        category_id: item.category_id,
        description: matched ? matched.description : item.description,
        unit: matched && matched.unit_name ? matched.unit_name : item.unit,
        quantity: item.baseQty,
        days: itemDays,
        unit_price_clp: unitPrice,
        costo_neto_total: costoNetoTotal,
        margen_pct: margenPct,
        venta_neta_estimada: ventaNetaEstimada,
        match_catalogo: hasValidCatalogPrice ? 'auto' : 'propuesto',
      })
    }

    const logisticsItems = computeHvacLogistics({ distanceKm, days, crewSize })
    for (const logItem of logisticsItems) {
      const matched = matchCatalogRow(logItem.description, catalogRows)
      const catalogPrice = matched ? Number(matched.unit_price) : NaN
      const hasValidCatalogPrice =
        matched !== undefined && Number.isFinite(catalogPrice) && catalogPrice > 0

      const unitPrice = hasValidCatalogPrice ? catalogPrice : logItem.suggestedUnitPrice
      const costoNetoTotal = Math.round(logItem.quantity * logItem.days * unitPrice)
      const margenPct = margenesPct.log
      const factorMargen = Math.max(0.01, 1 - margenPct / 100)
      const ventaNetaEstimada = Math.round(costoNetoTotal / factorMargen)

      lineas.push({
        category_id: 'log',
        description: matched ? matched.description : logItem.description,
        unit: matched && matched.unit_name ? matched.unit_name : logItem.unit,
        quantity: logItem.quantity,
        days: logItem.days,
        unit_price_clp: unitPrice,
        costo_neto_total: costoNetoTotal,
        margen_pct: margenPct,
        venta_neta_estimada: ventaNetaEstimada,
        match_catalogo: hasValidCatalogPrice ? 'auto' : 'propuesto',
      })
    }

    const costoNetoClp = lineas.reduce((acc, l) => acc + l.costo_neto_total, 0)
    const ventaNetaClp = lineas.reduce((acc, l) => acc + l.venta_neta_estimada, 0)
    const ivaClp = Math.round(ventaNetaClp * 0.19)
    const totalConIvaClp = ventaNetaClp + ivaClp
    const itemsPropuestosCount = lineas.filter(l => l.match_catalogo === 'propuesto').length

    return {
      output: {
        plantilla_aplicada: templateId,
        titulo_plantilla: template.title,
        perfil_margen: perfilMargen,
        margenes_pct: margenesPct,
        dias: days,
        dotacion: crewSize,
        distancia_km: distanceKm,
        lineas,
        scope_sugerido: template.scopeSteps,
        exclusiones: STANDARD_EXCLUSIONS,
        condiciones_comerciales: STANDARD_COMMERCIAL_TERMS,
        resumen_costos: {
          costo_neto_clp: costoNetoClp,
          venta_neta_clp: ventaNetaClp,
          iva_clp: ivaClp,
          total_con_iva_clp: totalConIvaClp,
          items_propuestos_count: itemsPropuestosCount,
        },
      },
      summary: `Cubicó especificación HVAC con plantilla ${templateId} (${lineas.length} líneas, venta neta $${ventaNetaClp.toLocaleString('es-CL')} CLP)`,
    }
  },
}
