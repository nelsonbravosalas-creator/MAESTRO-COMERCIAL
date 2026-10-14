import { Pool } from 'pg'
import { ChatbotProactiveNote } from '../services/chatbotOps'

export interface AgentContext {
  pool: Pool
  userId: string | null
  userRole?: string
  instruction: string
  quotationId?: string | null
  recentTurns: Array<{ role: 'user' | 'bot'; text: string }>
  graphContext: string
  runId: string
  tenantId?: string | null
  model: string
}

export interface AgentToolResult {
  output: Record<string, unknown>
  summary: string
  mutatedQuotation?: unknown
  mutatedRule?: unknown
  notas?: ChatbotProactiveNote[]
  priceData?: {
    material: string
    precio_medio: number
    muestras: Array<{ precio: number; fuente_url: string; tienda: string }>
    advertencia?: string | null
  }
}

export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  kind: 'read' | 'write'
  roles?: string[]
  execute: (args: Record<string, unknown>, ctx: AgentContext) => Promise<AgentToolResult>
}

export interface AgentStepRecord {
  idx: number
  tool: string
  input: Record<string, unknown>
  outputSummary: Record<string, unknown>
  durationMs: number
  error?: string
}

export interface AgentRunResult {
  runId: string
  reply: string
  status: 'done' | 'budget_exhausted' | 'error' | 'needs_input'
  steps: Array<{ tool: string; summary: string; durationMs: number }>
  notas?: ChatbotProactiveNote[]
  quotation?: unknown
  rule?: unknown
  material?: string
  precio_medio?: number
  muestras?: unknown[]
  advertencia?: string | null
  reporte_importacion?: unknown
}
