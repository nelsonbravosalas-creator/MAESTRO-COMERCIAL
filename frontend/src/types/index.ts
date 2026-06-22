// ============================================================
// MAESTRO COMERCIAL — Types v2.0
// Alineados con schema.sql v2.0
// ============================================================

// ── Enums ─────────────────────────────────────────────────────
export type UserRole        = 'admin' | 'manager' | 'user'
export type CategoryId      = 'mo' | 'log' | 'mat' | 'rep' | 'ins'
export type QuoteStatus     = 'Borrador' | 'Emitida' | 'Enviada' | 'Perdida' | 'Adjudicada' | 'Anulada'
export type OperState       = 'Pendiente de ejecución' | 'En ejecución' | 'Terminada'
export type ProjectStatus   = 'planning' | 'in_progress' | 'completed' | 'paused' | 'cancelled'
export type InvoiceStatus   = 'draft' | 'issued' | 'paid' | 'cancelled'
export type PaymentCond     = 'cash' | 'credit' | 'partial'
export type TermType        = 'scope' | 'exclusion' | 'commercial'
export type AuditAction     = 'INSERT' | 'UPDATE' | 'DELETE'

// ── Auth ──────────────────────────────────────────────────────
export interface User {
  id:            string
  email:         string
  name:          string
  role:          UserRole
  is_active:     boolean
  last_login_at: string | null
  created_at:    string
  updated_at:    string
  deleted_at:    string | null
}

export interface LoginRequest  { email: string; password: string }
export interface LoginResponse { token: string; refresh_token: string; user: User; expires_in: number }

// ── App Config ────────────────────────────────────────────────
export interface AppConfig {
  key:        string
  value:      string
  updated_at: string
  updated_by: string | null
}

// ── Catalog ───────────────────────────────────────────────────
export interface CatalogItem {
  id:          string
  category_id: CategoryId
  description: string
  unit_name:   string
  unit_price:  number
  is_active:   boolean
  sort_order:  number
  created_at:  string
  updated_at:  string
}

export type Catalogs = Record<CategoryId, CatalogItem[]>

// ── Clients ───────────────────────────────────────────────────
export interface Client {
  id:         string
  name:       string
  rut:        string | null
  activity:   string | null
  address:    string | null
  city:       string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by: string | null
}

export interface ClientContact {
  id:         string
  client_id:  string
  name:       string
  cargo:      string | null
  email:      string | null
  phone:      string | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

// Cliente con sus contactos (para UI)
export interface ClientWithContacts extends Client {
  contacts: ClientContact[]
}

// ── Quotation ─────────────────────────────────────────────────
export interface Quotation {
  id:          string
  correlative: string
  client_id:   string
  contact_id:  string | null
  enduser:     string | null
  ref:         string | null
  date:        string
  valid_until: string | null
  status:      QuoteStatus
  oper_state:  OperState | null
  uf_value:    number
  iva_pct:     number
  notes:       string | null
  version:     number
  created_at:  string
  updated_at:  string
  deleted_at:  string | null
  created_by:  string | null
}

export interface QuotationCategory {
  id:           string
  quotation_id: string
  category_id:  CategoryId
  label:        string
  margin_pct:   number
  color:        string | null
  note:         string | null
  sort_order:   number
}

export interface QuotationLineItem {
  id:               string
  quotation_id:     string
  category_id:      CategoryId
  catalog_item_id:  string | null
  description:      string
  unit_name:        string
  quantity:         number
  days:             number
  unit_price:       number
  sort_order:       number
  created_at:       string
  updated_at:       string
}

export interface QuotationTerm {
  id:           string
  quotation_id: string
  term_type:    TermType
  content:      string
  sort_order:   number
}

// Cotización completa (para UI / store local)
export interface QuotationFull extends Quotation {
  client_name:  string
  contact_name: string | null
  categories:   QuotationCategory[]
  line_items:   QuotationLineItem[]
  terms:        QuotationTerm[]
}

// Totales calculados (desde v_quotation_totals o calculados en cliente)
export interface QuotationTotals {
  quotation_id:  string
  costo_neto:    number
  venta_neta:    number
  beneficio_bruto: number
  iva_monto:     number
  total_con_iva: number
}

// ── Projects ──────────────────────────────────────────────────
export interface Project {
  id:           string
  quotation_id: string | null
  client_id:    string
  name:         string
  status:       ProjectStatus
  start_date:   string | null
  end_date:     string | null
  budget:       number
  progress_pct: number
  created_at:   string
  updated_at:   string
  deleted_at:   string | null
  created_by:   string | null
}

export interface ProjectAssignment {
  project_id:  string
  user_id:     string
  assigned_at: string
  assigned_by: string | null
}

export interface ExecutionCost {
  id:          string
  project_id:  string
  category_id: CategoryId | null
  description: string
  quantity:    number
  unit_price:  number
  created_at:  string
  updated_at:  string
  created_by:  string | null
}

// Vista gasto real vs presupuesto
export interface ProjectSpending {
  project_id:   string
  name:         string
  budget:       number
  progress_pct: number
  gasto_real:   number
  saldo:        number
}

// ── Invoices ──────────────────────────────────────────────────
export interface Invoice {
  id:           string
  project_id:   string | null
  client_id:    string
  number:       string
  date:         string
  payment_cond: PaymentCond
  due_date:     string | null
  net_amount:   number
  tax_amount:   number
  total_amount: number
  is_factored:  boolean
  status:       InvoiceStatus
  created_at:   string
  updated_at:   string
  deleted_at:   string | null
  created_by:   string | null
}

export interface InvoiceItem {
  id:                       string
  invoice_id:               string
  quotation_line_item_id:   string | null
  description:              string
  quantity:                 number
  unit_price:               number
  sort_order:               number
  created_at:               string
}

// ── Audit / Sync ──────────────────────────────────────────────
export interface AuditLog {
  id:          number
  entity_type: string
  entity_id:   string
  action:      AuditAction
  old_data:    Record<string, unknown> | null
  new_data:    Record<string, unknown> | null
  user_id:     string | null
  ip_address:  string | null
  created_at:  string
}

export interface SyncEvent {
  id:          number
  client_uid:  string
  entity_type: string
  entity_id:   string
  action:      AuditAction
  payload:     Record<string, unknown>
  server_seq:  number | null
  applied_at:  string | null
  conflict:    boolean
  created_at:  string
}

// ── API helpers ───────────────────────────────────────────────
export interface ApiResponse<T> {
  data:      T
  message:   string
  timestamp: string
}

export interface ApiError {
  error:     string
  message:   string
  timestamp: string
}

export interface PaginatedResponse<T> {
  data:       T[]
  total:      number
  page:       number
  page_size:  number
}

// ============================================================
// TIPOS UI (store interno + componentes)
// Denormalizados para facilitar rendering sin JOIN en cliente
// ============================================================

// Ítem de catálogo tal como lo usa el store y los componentes
export interface CatalogItemUI {
  id?:     string       // UUID del backend (undefined en ítems nuevos aún no sincronizados)
  desc:    string
  unidad:  string
  price:   number
}

export type CatalogsUI = Record<CategoryId, CatalogItemUI[]>

// Cliente aplanado (Client + ContactoPrimario) para UI
export interface MasterClient {
  id:         string
  name:       string
  rut:        string
  activity:   string
  address:    string
  city:       string
  // Contacto principal denormalizado
  contact:    string
  cargo:      string
  email:      string
  phone:      string
  created_at: string
  updated_at: string
}

// Categoría de costo dentro de una cotización
export interface CostCategory {
  id:          CategoryId
  label:       string
  margin:      number        // % sobre venta
  color:       string
  showDetails: boolean
  showValues:  boolean
  note:        string
  collapsed:   boolean
}

// Línea de costo dentro de una categoría
export interface CostItem {
  id:     string
  desc:   string
  unidad: string
  cant:   number
  unit:   number
  days?:  number    // solo Mano de Obra
  puntoA?: string   // Cálculo de Distancias
  puntoB?: string   // Cálculo de Distancias
}

// Cotización completa tal como la maneja el store
export interface MasterQuotation {
  id:          string
  correlative: string
  client_id:   string
  client_name: string
  contact_id:  string | null
  contact:     string
  enduser:     string
  ref:         string
  date:        string
  status:      QuoteStatus
  operState:   OperState
  uf:          number
  iva:         number
  categories:  CostCategory[]
  items:       Record<CategoryId, CostItem[]>
  scope:       string[]
  exclusions:  string[]
  commercial:  string[]
  total:       number
  created_at:  string
  updated_at:  string
}
