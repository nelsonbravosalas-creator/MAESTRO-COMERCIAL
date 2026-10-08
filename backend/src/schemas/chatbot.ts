import { z } from 'zod'
import { uuid } from './common'

export const chatbotMessageSchema = z.object({
  instruction: z.string().trim().min(1).max(4000),
  quotation_id: uuid.nullish(),
})

export const chatbotTeachRuleSchema = z.object({
  rule_key: z.enum([
    'tarifa_colacion_diaria',
    'tarifa_bonificacion_desplazamiento_diaria',
    'comunas_region_metropolitana',
  ]),
  value: z.union([z.number().finite().nonnegative(), z.array(z.string().trim().min(1))]),
  unit: z.string().trim().max(50).nullish(),
  notes: z.string().trim().max(1000).nullish(),
})

// Una muestra se valida (y se descarta si no calza) individualmente en vez
// de hacer fallar toda la respuesta del LLM: una sola `fuente_url` con forma
// rara no debería tirar un precio_medio por lo demas bueno. `fuente_url` debe
// ser http(s) explícito — sin esto, una URL `javascript:` alucinada por el
// LLM llegaría intacta al `href` del link en el frontend (ver ChatPanel.tsx).
export const chatbotPriceSampleSchema = z.object({
  precio: z.number().finite().nonnegative(),
  fuente_url: z
    .string()
    .trim()
    .url()
    .refine(url => /^https?:\/\//i.test(url), 'fuente_url debe ser http o https'),
  tienda: z.string().trim().min(1).max(100),
})

export const chatbotPriceResponseSchema = z.object({
  precio_medio: z.number().finite().nonnegative(),
  muestras: z.array(z.unknown()).max(10).default([]),
  advertencia: z.string().trim().max(500).nullish(),
})
