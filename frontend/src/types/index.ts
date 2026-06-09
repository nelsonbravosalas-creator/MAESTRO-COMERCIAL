// User types
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

// Client types
export interface Client {
  id: string
  name: string
  email: string
  phone: string
  address: string
  ruc: string
  created_at: Date
  updated_at: Date
  deleted_at?: Date
  sync_status: 'pending' | 'synced' | 'error'
}

// Quotation types
export interface QuotationItem {
  id: string
  quotation_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  cost: number
}

export interface Quotation {
  id: string
  client_id: string
  number: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  items: QuotationItem[]
  subtotal: number
  tax: number
  total: number
  notes: string
  created_at: Date
  updated_at: Date
  expires_at: Date
  deleted_at?: Date
  sync_status: 'pending' | 'synced' | 'error'
}

// Project types
export interface Project {
  id: string
  quotation_id: string
  client_id: string
  name: string
  status: 'planning' | 'in_progress' | 'completed' | 'paused'
  start_date: Date
  end_date?: Date
  budget: number
  spent: number
  progress: number
  assigned_to: string[]
  created_at: Date
  updated_at: Date
  deleted_at?: Date
  sync_status: 'pending' | 'synced' | 'error'
}

// Execution cost types
export interface ExecutionCost {
  id: string
  project_id: string
  type: 'material' | 'labor' | 'other'
  description: string
  amount: number
  cost: number
  created_at: Date
  sync_status: 'pending' | 'synced' | 'error'
}

// Invoice types
export interface InvoiceItem {
  id: string
  invoice_id: string
  project_item_id?: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface Invoice {
  id: string
  project_id: string
  client_id: string
  number: string
  date: Date
  payment_condition: 'cash' | 'credit'
  due_date?: Date
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  is_factored: boolean
  status: 'draft' | 'issued' | 'paid' | 'cancelled'
  created_at: Date
  updated_at: Date
  deleted_at?: Date
  sync_status: 'pending' | 'synced' | 'error'
}

// Audit log types
export interface AuditLog {
  id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  old_values: Record<string, any>
  new_values: Record<string, any>
  user_id: string
  created_at: Date
}

// Sync queue types
export interface SyncQueueItem {
  id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  payload: Record<string, any>
  created_at: Date
  synced_at?: Date
  error?: string
}

// API Response types
export interface ApiResponse<T> {
  data: T
  message: string
  timestamp: Date
}

export interface ApiError {
  error: string
  message: string
  timestamp: Date
}

// Auth types
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
  expiresIn: number
}
