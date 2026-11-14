import { z } from 'zod'

export const configKeyParamSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'key debe ser snake_case'),
})

export const configValueSchema = z.object({
  value: z.string().trim().min(1).max(1000),
})

// Logo de la empresa: imagen PNG o JPEG en base64 (sin SVG, para no inyectar scripts).
export const COMPANY_LOGO_KEY = 'company_logo'

export const companyLogoBodySchema = z.object({
  dataUrl: z
    .string()
    .max(200_000)
    .regex(
      /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/,
      'Logo debe ser PNG o JPEG en base64'
    ),
})
