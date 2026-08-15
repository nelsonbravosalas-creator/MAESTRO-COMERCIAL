import { z } from 'zod'
import { uuid, optionalStr, money, isoDateStr } from './common'

const CATEGORY_IDS = ['mo', 'log', 'mat', 'rep', 'ins'] as const
const STATUSES = ['Borrador', 'Emitida', 'En revisión', 'Enviada', 'Perdida', 'Adjudicada', 'Anulada', 'Cerrada'] as const
const OPER_STATES = ['Pendiente de ejecución', 'En ejecución', 'Terminada'] as const
const TERM_TYPES = ['scope', 'exclusion', 'commercial'] as const
const KINDS = ['project', 'maintenance'] as const
const FREQUENCIES = ['mensual', 'trimestral', 'semestral', 'anual'] as const

const categoryInputSchema = z.object({
  category_id: z.enum(CATEGORY_IDS),
  label: optionalStr(200),
  margin_pct: z.coerce.number().min(0).max(99.99).nullish(),
  color: optionalStr(20),
  note: optionalStr(1000),
  sort_order: z.coerce.number().int().min(0).max(9999).nullish(),
})

const lineItemInputSchema = z.object({
  category_id: z.enum(CATEGORY_IDS),
  catalog_item_id: uuid.nullish(),
  description: z.string().trim().min(1).max(500),
  unit_name: optionalStr(50),
  quantity: z.coerce.number().finite().nonnegative().default(0),
  days: z.coerce.number().int().min(1).max(3650).default(1),
  unit_price: money.default(0),
  sort_order: z.coerce.number().int().min(0).max(9999).nullish(),
})

const termInputSchema = z.object({
  term_type: z.enum(TERM_TYPES),
  content: z.string().trim().min(1).max(5000),
  sort_order: z.coerce.number().int().min(0).max(9999).nullish(),
})

// AC-1.7: máximo 500 líneas por cotización — evita payloads desproporcionados
// (el importador, más permisivo por venir de un archivo externo, tiene su
// propio límite en validateImportPayload).
const quotationBodyBase = {
  contact_id: uuid.nullish(),
  enduser: optionalStr(300),
  ref: optionalStr(200),
  date: isoDateStr.nullish(),
  valid_until: isoDateStr.nullish(),
  status: z.enum(STATUSES).nullish(),
  oper_state: z.enum(OPER_STATES).nullish(),
  uf_value: money.nullish(),
  iva_pct: z.coerce.number().min(0).max(100).nullish(),
  notes: optionalStr(5000),
  categories: z.array(categoryInputSchema).max(10).nullish(),
  line_items: z.array(lineItemInputSchema).max(500).nullish(),
  terms: z.array(termInputSchema).max(200).nullish(),
  // Mantención (kind='maintenance'): contratos de servicio recurrente.
  // Todo nullish porque no aplica a kind='project'.
  kind: z.enum(KINDS).nullish(),
  equipment_count: z.coerce.number().int().min(0).max(9999).nullish(),
  equipment_description: optionalStr(2000),
  frequency: z.enum(FREQUENCIES).nullish(),
  visits_per_year: z.coerce.number().int().min(0).max(365).nullish(),
  contract_start_date: isoDateStr.nullish(),
  show_uf_equivalent: z.boolean().nullish(),
  show_usd_equivalent: z.boolean().nullish(),
  usd_value: money.nullish(),
}

export const quotationCreateSchema = z.object({
  client_id: uuid,
  correlative: z.string().trim().min(1).max(50),
  ...quotationBodyBase,
})

export const quotationUpdateSchema = z.object({
  client_id: uuid,
  correlative: z.string().trim().min(1).max(50),
  version: z.coerce.number().int().positive().nullish(),
  ...quotationBodyBase,
})

export const quotationStatusSchema = z.object({
  status: z.enum(STATUSES),
  oper_state: z.enum(OPER_STATES).nullish(),
})

export const quotationDuplicateSchema = z.object({
  correlative: z.string().trim().min(1).max(50),
})

// Configuración de cuántas facturas puede generar una cotización Adjudicada.
export const quotationBillingSplitSchema = z.object({
  invoice_count_max: z.coerce.number().int().min(1).max(2),
})

// Motivo de pérdida (obligatorio al marcar 'Perdida')
const LOSS_REASONS = ['precio', 'competidor', 'sin_presupuesto', 'timing', 'no_ejecutado', 'otro'] as const
export const quotationLossSchema = z.object({
  loss_reason:     z.enum(LOSS_REASONS),
  loss_competitor: optionalStr(200),
  loss_notes:      optionalStr(2000),
})

// Fecha de próximo seguimiento
export const quotationFollowUpSchema = z.object({
  follow_up_date: isoDateStr.nullish(),
})

// Hito de facturación
export const quotationMilestoneSchema = z.object({
  invoice_number: z.coerce.number().int().min(1).max(2),
  description:    z.string().trim().min(1).max(1000),
  pct_of_total:   z.coerce.number().min(0).max(100).nullish(),
})

// Actividad en el log
const ACTIVITY_TYPES = ['llamada', 'reunion', 'correo', 'nota_interna', 'otro'] as const
export const quotationActivitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES).default('nota_interna'),
  content:       z.string().trim().min(1).max(5000),
})

// Motivo de versión (obligatorio al crear V+)
export const quotationVersionReasonSchema = z.object({
  correlative:    z.string().trim().min(1).max(50),
  version_reason: z.string().trim().min(1).max(500),
})

// Aprobación interna
export const quotationApprovalSchema = z.object({
  approval_notes: optionalStr(2000),
})
