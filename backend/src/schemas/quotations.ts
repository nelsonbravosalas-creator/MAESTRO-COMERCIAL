import { z } from 'zod'
import { uuid, optionalStr, money, isoDateStr } from './common'

const CATEGORY_IDS = ['mo', 'log', 'mat', 'rep', 'ins', 'mec', 'ele'] as const
const STATUSES = [
  'Borrador',
  'Emitida',
  'En revisión',
  'Enviada',
  'Perdida',
  'Adjudicada',
  'Anulada',
  'Cerrada',
] as const
const OPER_STATES = ['Pendiente de ejecución', 'En ejecución', 'Terminada'] as const
const TERM_TYPES = ['scope', 'exclusion', 'commercial'] as const
const KINDS = ['project', 'maintenance'] as const
const FREQUENCIES = [
  'mensual',
  'bimestral',
  'trimestral',
  'cuatrimestral',
  'semestral',
  'anual',
  'especial',
  'unico',
] as const
const MTC_SCHEDULES = ['habil', 'inhabil', 'continuo'] as const

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

// ── Mantención: presentación por subsistemas (mtc_config) ───────────
// Forma del frontend (MtcConfig). Las claves van en el mismo orden que el
// tipo para que JSON.stringify del cuerpo parseado sea estable.
const finiteNonNeg = z.number().finite().min(0)

const mtcCategorySchema = z.object({
  id: z.enum(CATEGORY_IDS),
  label: z.string().max(200),
  margin: z.number().finite().min(0).max(99.99),
  color: z.string().max(20),
  showDetails: z.boolean(),
  showValues: z.boolean(),
  note: z.string().max(1000),
  collapsed: z.boolean(),
})

// desc puede estar vacío: el costeo por defecto trae filas en blanco.
const mtcItemSchema = z.object({
  id: z.string().max(100),
  desc: z.string().max(500),
  unidad: z.string().max(50),
  cant: z.number().finite(),
  unit: z.number().finite(),
  days: z.number().finite().optional(),
  puntoA: z.string().max(300).optional(),
  puntoB: z.string().max(300).optional(),
})

const mtcConsumableRowSchema = z.object({
  id: z.string().max(100),
  desc: z.string().max(300),
  unidad: z.string().max(20),
  per_module: finiteNonNeg,
  modules: finiteNonNeg,
  changes_per_year: finiteNonNeg,
  cost: finiteNonNeg,
})

const mtcSystemSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  frequency: z.enum(FREQUENCIES),
  special_months: z.number().int().min(1).max(12).nullable(),
  schedule: z.enum(MTC_SCHEDULES),
  currency: z.enum(['CLP', 'UF', 'USD']),
  summary_text: z.string().max(4000).nullable(),
  consumables: z.object({
    enabled: z.boolean(),
    margin: z.number().finite().min(0).max(90),
    rows: z.array(mtcConsumableRowSchema).max(100),
  }),
  categories: z.array(mtcCategorySchema).max(10).nullable(),
  items: z
    .record(z.string(), z.array(mtcItemSchema))
    .refine(
      items => Object.values(items).reduce((n, list) => n + list.length, 0) <= 500,
      'Máximo 500 ítems por sistema'
    )
    .nullable(),
})

export const mtcConfigSchema = z
  .object({
    v: z.literal(1),
    summary_mode: z.boolean().default(false),
    show_summary_table: z.boolean().default(false),
    systems: z.array(mtcSystemSchema).min(1).max(12),
  })
  .superRefine((cfg, ctx) => {
    const first = cfg.systems[0]
    // El costeo del Sistema 1 vive en quotation_categories / quotation_line_items.
    if (first && (first.categories !== null || first.items !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['systems', 0],
        message: 'El primer sistema no lleva categories ni items (su costeo vive en la cotización)',
      })
    }
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
  display_currency: z.enum(['CLP', 'UF', 'USD']).default('CLP').nullish(),
  mtc_config: mtcConfigSchema.nullish(),
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

// Copia de cotización (botón Duplicar y Nueva versión comparten esta ruta).
// version_reason solo es obligatorio cuando el correlativo es una versión
// (-V{n}); la validación de esa regla está en la ruta, no aquí.
export const quotationDuplicateSchema = z.object({
  correlative: z.string().trim().min(1).max(50),
  version_reason: z.string().trim().min(1).max(500).nullish(),
})

// Configuración de cuántas facturas puede generar una cotización Adjudicada.
export const quotationBillingSplitSchema = z.object({
  invoice_count_max: z.coerce.number().int().min(1).max(2),
})

// Motivo de pérdida (obligatorio al marcar 'Perdida')
const LOSS_REASONS = [
  'precio',
  'competidor',
  'sin_presupuesto',
  'timing',
  'no_ejecutado',
  'otro',
] as const
export const quotationLossSchema = z.object({
  loss_reason: z.enum(LOSS_REASONS),
  loss_competitor: optionalStr(200),
  loss_notes: optionalStr(2000),
})

// Fecha de próximo seguimiento
export const quotationFollowUpSchema = z.object({
  follow_up_date: isoDateStr.nullish(),
})

// Hito de facturación
export const quotationMilestoneSchema = z.object({
  invoice_number: z.coerce.number().int().min(1).max(2),
  description: z.string().trim().min(1).max(1000),
  pct_of_total: z.coerce.number().min(0).max(100).nullish(),
})

// Actividad en el log
const ACTIVITY_TYPES = ['llamada', 'reunion', 'correo', 'nota_interna', 'otro'] as const
export const quotationActivitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES).default('nota_interna'),
  content: z.string().trim().min(1).max(5000),
})

// Aprobación interna
export const quotationApprovalSchema = z.object({
  approval_notes: optionalStr(2000),
})

// OC (Orden de Compra) u otro medio de aceptación formal del cliente. Todo
// opcional: la OC nunca bloquea el guardado ni el paso a 'Adjudicada', solo
// registra el dato cuando el usuario lo tenga.
export const quotationOcSchema = z.object({
  oc_number: optionalStr(100),
  oc_date: isoDateStr.nullish(),
  oc_conditions: optionalStr(5000),
})

// Upload del documento de OC. El campo data es el contenido base64 del
// archivo; el backend lo decodifica y lo almacena como BYTEA (mismo patrón
// que invoiceDocumentSchema para el PDF SII).
export const quotationOcDocumentSchema = z.object({
  data: z.string().min(1),
  name: z.string().trim().min(1).max(255),
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
})
