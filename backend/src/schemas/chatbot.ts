import { z } from 'zod'
import { uuid } from './common'

// Turnos recientes de ESTA conversacion (los manda el frontend desde su
// propio historial en memoria, chatStore.ts -- no hay tabla de sesiones
// nueva en el backend). Se usan solo para resolver referencias ambiguas
// ("mejor dejalo en 3 dias"), nunca como fuente de hechos de negocio -- esos
// viven en el grafo de conocimiento (chatbotGraph.ts), no en el historial de
// texto. max(8) y texto corto porque un `reply` de bot ya es un resumen
// corto armado por el backend, no el payload estructurado completo.
//
// Se recorta en vez de rechazar (.max() fallaba la request entera cuando un
// reply pasaba de 500 chars, p.ej. manualItemsWarning() con varios items --
// eso bloqueaba el chat permanentemente, porque ese mismo reply largo vuelve
// como recent_turns en el siguiente turno sin que el usuario pueda evitarlo).
export const chatbotRecentTurnSchema = z.object({
  role: z.enum(['user', 'bot']),
  text: z
    .string()
    .trim()
    .min(1)
    .transform(s => s.slice(0, 500)),
})

export const chatbotMessageSchema = z.object({
  instruction: z.string().trim().min(1).max(4000),
  quotation_id: uuid.nullish(),
  recent_turns: z.array(chatbotRecentTurnSchema).max(8).optional().default([]),
  agent_mode: z.boolean().optional(),
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
