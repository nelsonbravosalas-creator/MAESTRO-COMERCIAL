import { z } from 'zod'
import { uuid, nonEmptyStr, optionalStr, money, isoDateStr } from './common'

const PAYMENT_COND = ['cash', 'credit', 'partial'] as const
const STATUS = ['draft', 'issued', 'paid', 'cancelled'] as const

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
  payment_cond: z.enum(PAYMENT_COND).nullish(),
  due_date: isoDateStr.nullish(),
  items: z.array(invoiceItemSchema).max(500).nullish(),
})

export const invoiceStatusSchema = z.object({
  status: z.enum(STATUS),
  is_factored: z.boolean().nullish(),
})
