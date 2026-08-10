import { z } from 'zod'
import { uuid, nonEmptyStr, optionalStr, money, isoDateStr } from './common'

const PAYMENT_TERM = ['contado', 'dias_15', 'dias_30', 'dias_60', 'dias_90'] as const
const PAYMENT_METHOD = ['transferencia', 'cheque', 'efectivo', 'tarjeta', 'otro'] as const
const DOC_TYPE = ['factura_afecta', 'factura_exenta', 'nota_credito'] as const
const FINANCING_TYPE = ['factoring', 'confirming'] as const
const FINANCING_STATUS = ['cedida', 'anticipada', 'liquidada', 'rechazada'] as const
const STATUS = ['draft', 'issued', 'paid', 'cancelled'] as const

// Días que suma cada condición de pago sobre la fecha de emisión. Permite
// calcular due_date en vez de pedirla a mano — que era el punto de reemplazar
// el enum viejo (cash/credit/partial) por condiciones reales.
export const TERM_DAYS: Record<(typeof PAYMENT_TERM)[number], number> = {
  contado: 0,
  dias_15: 15,
  dias_30: 30,
  dias_60: 60,
  dias_90: 90,
}

export const invoiceItemSchema = z.object({
  quotation_line_item_id: uuid.nullish(),
  description: nonEmptyStr(500),
  quantity: z.coerce.number().finite().positive().default(1),
  unit_price: money.default(0),
  sort_order: z.coerce.number().int().min(0).max(9999).nullish(),
})

export const invoiceCreateSchema = z.object({
  project_id: uuid.nullish(),
  client_id: uuid,
  number: optionalStr(50),
  date: isoDateStr.nullish(),
  payment_term: z.enum(PAYMENT_TERM).nullish(),
  due_date: isoDateStr.nullish(),
  doc_type: z.enum(DOC_TYPE).nullish(),
  credits_invoice_id: uuid.nullish(),
  observations: optionalStr(2000),
  follow_up_date: isoDateStr.nullish(),
  items: z.array(invoiceItemSchema).max(500).nullish(),
})

export const invoiceStatusSchema = z.object({
  status: z.enum(STATUS),
  is_factored: z.boolean().nullish(),
})

// Seguimiento de cobranza: lo que el usuario edita a diario sin tocar el
// documento tributario en sí.
export const invoiceFollowUpSchema = z.object({
  observations: optionalStr(2000),
  follow_up_date: isoDateStr.nullish(),
  due_date: isoDateStr.nullish(),
  payment_term: z.enum(PAYMENT_TERM).nullish(),
})

export const paymentCreateSchema = z.object({
  paid_at: isoDateStr.nullish(),
  // positive(), no nonnegative(): un abono de $0 no es un abono.
  amount: z.coerce.number().finite().positive().max(1_000_000_000_000),
  method: z.enum(PAYMENT_METHOD).nullish(),
  reference: optionalStr(120),
  observations: optionalStr(1000),
})

export const factoringUpsertSchema = z.object({
  type: z.enum(FINANCING_TYPE).nullish(),
  company: nonEmptyStr(150),
  ceded_at: isoDateStr.nullish(),
  advance_amount: money.default(0),
  rate_pct: z.coerce.number().finite().nonnegative().max(100).nullish(),
  cost_amount: money.default(0),
  expected_settle_at: isoDateStr.nullish(),
  settled_at: isoDateStr.nullish(),
  status: z.enum(FINANCING_STATUS).nullish(),
  observations: optionalStr(1000),
})

// Filtros del listado. `state` corresponde a payment_state de v_invoice_balance.
export const invoiceListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(500),
  state: z
    .enum(['al_dia', 'por_vencer', 'vencida', 'parcial', 'parcial_vencida', 'pagada', 'anulada'])
    .nullish(),
  client_id: uuid.nullish(),
})
