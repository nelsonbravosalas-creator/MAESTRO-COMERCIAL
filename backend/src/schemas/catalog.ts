import { z } from 'zod'
import { nonEmptyStr, money } from './common'

const CATEGORY_IDS = ['mo', 'log', 'mat', 'rep', 'ins'] as const

export const catalogItemSchema = z.object({
  category_id: z.enum(CATEGORY_IDS),
  description: nonEmptyStr(500),
  unit_name: nonEmptyStr(50),
  unit_price: money.default(0),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
})
