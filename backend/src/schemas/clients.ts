import { z } from 'zod'
import { nonEmptyStr, optionalStr } from './common'

export const contactSchema = z.object({
  name: nonEmptyStr(200),
  cargo: optionalStr(200),
  email: z.string().trim().toLowerCase().email().max(255).nullish().or(z.literal('')),
  phone: optionalStr(50),
  is_primary: z.boolean().nullish(),
})

export const clientCreateSchema = z.object({
  name: nonEmptyStr(300),
  rut: optionalStr(20),
  activity: optionalStr(300),
  address: optionalStr(500),
  city: optionalStr(200),
  contacts: z.array(contactSchema).max(20).nullish(),
})

export const clientUpdateSchema = z.object({
  name: nonEmptyStr(300),
  rut: optionalStr(20),
  activity: optionalStr(300),
  address: optionalStr(500),
  city: optionalStr(200),
})

export const contactCreateSchema = contactSchema

export const contactUpdateSchema = contactSchema
