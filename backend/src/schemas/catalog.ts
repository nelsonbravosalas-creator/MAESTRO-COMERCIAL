import { z } from 'zod'
import { nonEmptyStr, money } from './common'

const CATEGORY_IDS = ['mo', 'log', 'mat', 'rep', 'ins', 'mec'] as const

export const catalogItemSchema = z.object({
  category_id: z.enum(CATEGORY_IDS),
  description: nonEmptyStr(500),
  unit_name: nonEmptyStr(50),
  unit_price: money.default(0),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
})

// "Materiales Eléctricos" vive en su propia tabla (electrical_catalog_items),
// sin category_id — la tabla completa es implícitamente eléctrica.
export const electricalCatalogItemSchema = z.object({
  description: nonEmptyStr(500),
  unit_name: nonEmptyStr(50),
  unit_price: money.default(0),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
})
