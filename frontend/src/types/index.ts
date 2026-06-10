// ── Base Auth / User ─────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'user'
  is_active: boolean
  last_login?: Date
  created_at: Date
  updated_at: Date
  sync_status: 'pending' | 'synced' | 'error'
}

export interface LoginRequest { email: string; password: string }
export interface LoginResponse { token: string; user: User; expiresIn: number }

// ── Maestro Comercial Core Types ──────────────────────────────────────────────
export type CategoryId = 'mo' | 'log' | 'mat' | 'rep' | 'ins'
export type QuoteStatus = 'Emitida' | 'Enviada' | 'Perdida' | 'Adjudicada' | 'Anulada'
export type OperState  = ' ' | 'Pendiente de ejecución' | 'En ejecución' | 'Terminada'

export interface CatalogItem {
  desc: string
  unidad: string
  price: number
}

export interface Catalogs {
  mo:  CatalogItem[]
  log: CatalogItem[]
  mat: CatalogItem[]
  rep: CatalogItem[]
  ins: CatalogItem[]
}

export interface CostItem {
  id: string
  desc: string
  unidad: string
  cant: number
  unit: number
  days?: number          // solo Mano de Obra
}

export interface CostCategory {
  id: CategoryId
  label: string
  margin: number          // % sobre venta
  color: string           // bg color del header
  showDetails: boolean
  showValues: boolean
  note: string
  collapsed: boolean
}

export interface MasterClient {
  id: string
  name: string
  contact: string
  cargo: string
  email: string
  phone: string
  address: string
  rut: string
  activity: string
  city: string
  created_at: string
  updated_at: string
}

export interface MasterQuotation {
  id: string
  correlative: string          // SYM-041-04-2026
  client_id: string
  client_name: string
  contact: string
  enduser: string              // usuario final
  ref: string                  // referencia de obra
  date: string                 // ISO date string
  status: QuoteStatus
  operState: OperState
  uf: number                   // valor UF en CLP
  iva: number                  // % IVA
  categories: CostCategory[]
  items: Record<CategoryId, CostItem[]>
  scope: string[]
  exclusions: string[]
  commercial: string[]
  total: number                // venta neta total
  created_at: string
  updated_at: string
}

// ── Legacy types (backend API schema) ────────────────────────────────────────
export interface Client {
  id: string; name: string; email: string; phone: string
  address: string; ruc: string
  created_at: Date; updated_at: Date; deleted_at?: Date
  sync_status: 'pending' | 'synced' | 'error'
}

export interface QuotationItem {
  id: string; quotation_id: string; description: string
  quantity: number; unit_price: number; total: number; cost: number
}

export interface Quotation {
  id: string; client_id: string; number: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  items: QuotationItem[]; subtotal: number; tax: number; total: number
  notes: string; created_at: Date; updated_at: Date; expires_at: Date
  deleted_at?: Date; sync_status: 'pending' | 'synced' | 'error'
}

export interface Project {
  id: string; quotation_id: string; client_id: string; name: string
  status: 'planning' | 'in_progress' | 'completed' | 'paused'
  start_date: Date; end_date?: Date; budget: number; spent: number
  progress: number; assigned_to: string[]
  created_at: Date; updated_at: Date; deleted_at?: Date
  sync_status: 'pending' | 'synced' | 'error'
}

export interface ExecutionCost {
  id: string; project_id: string; type: 'material' | 'labor' | 'other'
  description: string; amount: number; cost: number; created_at: Date
  sync_status: 'pending' | 'synced' | 'error'
}

export interface InvoiceItem {
  id: string; invoice_id: string; project_item_id?: string
  description: string; quantity: number; unit_price: number; total: number
}

export interface Invoice {
  id: string; project_id: string; client_id: string; number: string
  date: Date; payment_condition: 'cash' | 'credit'; due_date?: Date
  items: InvoiceItem[]; subtotal: number; tax: number; total: number
  is_factored: boolean; status: 'draft' | 'issued' | 'paid' | 'cancelled'
  created_at: Date; updated_at: Date; deleted_at?: Date
  sync_status: 'pending' | 'synced' | 'error'
}

export interface AuditLog {
  id: string; entity_type: string; entity_id: string
  action: 'create' | 'update' | 'delete'
  old_values: Record<string, any>; new_values: Record<string, any>
  user_id: string; created_at: Date
}

export interface SyncQueueItem {
  id: string; entity_type: string; entity_id: string
  action: 'create' | 'update' | 'delete'
  payload: Record<string, any>; created_at: Date; synced_at?: Date; error?: string
}

export interface ApiResponse<T> { data: T; message: string; timestamp: Date }
export interface ApiError { error: string; message: string; timestamp: Date }
