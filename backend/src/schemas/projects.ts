import { z } from 'zod'
import { uuid, nonEmptyStr, optionalStr, money, isoDateStr } from './common'

const CATEGORY_IDS = ['mo', 'log', 'mat', 'rep', 'ins'] as const
const STATUS = ['planning', 'in_progress', 'completed', 'paused', 'cancelled'] as const
const TASK_STATUS = ['pending', 'in_progress', 'done', 'blocked'] as const

export const projectCreateSchema = z.object({
  quotation_id: uuid.nullish(),
  client_id: uuid,
  name: optionalStr(300),
  status: z.enum(STATUS).nullish(),
  start_date: isoDateStr.nullish(),
  end_date: isoDateStr.nullish(),
  budget: money.nullish(),
  assigned_to: z.array(uuid).max(100).nullish(),
})

export const projectUpdateSchema = z.object({
  name: optionalStr(300),
  status: z.enum(STATUS).nullish(),
  start_date: isoDateStr.nullish(),
  end_date: isoDateStr.nullish(),
  budget: money.nullish(),
  progress_pct: z.coerce.number().int().min(0).max(100).nullish(),
})

export const executionCostSchema = z.object({
  category_id: z.enum(CATEGORY_IDS).nullish(),
  description: nonEmptyStr(500),
  quantity: z.coerce.number().finite().positive().default(1),
  unit_price: money.default(0),
})

export const assignmentSchema = z.object({
  user_id: uuid,
})

export const taskCreateSchema = z.object({
  name: nonEmptyStr(300),
  description: optionalStr(2000),
  assignee_id: uuid.nullish(),
  category_id: z.enum(CATEGORY_IDS).nullish(),
  start_date: isoDateStr.nullish(),
  end_date: isoDateStr.nullish(),
  sort_order: z.coerce.number().int().min(0).max(9999).nullish(),
})

export const taskUpdateSchema = z.object({
  name: optionalStr(300),
  description: optionalStr(2000),
  assignee_id: uuid.nullish(),
  category_id: z.enum(CATEGORY_IDS).nullish(),
  start_date: isoDateStr.nullish(),
  end_date: isoDateStr.nullish(),
  progress_pct: z.coerce.number().int().min(0).max(100).nullish(),
  status: z.enum(TASK_STATUS).nullish(),
  sort_order: z.coerce.number().int().min(0).max(9999).nullish(),
})
