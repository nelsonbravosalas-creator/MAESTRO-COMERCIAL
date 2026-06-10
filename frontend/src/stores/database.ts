import Dexie, { Table } from 'dexie'
import { User, Client, Quotation, QuotationLineItem, Project, ExecutionCost, Invoice, InvoiceItem, AuditLog, SyncEvent } from '../types'

export class BravoCRMDatabase extends Dexie {
  users!: Table<User>
  clients!: Table<Client>
  quotations!: Table<Quotation>
  quotationItems!: Table<QuotationLineItem>
  projects!: Table<Project>
  executionCosts!: Table<ExecutionCost>
  invoices!: Table<Invoice>
  invoiceItems!: Table<InvoiceItem>
  auditLogs!: Table<AuditLog>
  syncQueue!: Table<SyncEvent>

  constructor() {
    super('bravocrm')
    this.version(1).stores({
      users: 'id, email, sync_status',
      clients: 'id, ruc, sync_status, deleted_at',
      quotations: 'id, client_id, number, status, sync_status, deleted_at',
      quotationItems: 'id, quotation_id',
      projects: 'id, client_id, status, sync_status, deleted_at',
      executionCosts: 'id, project_id, sync_status',
      invoices: 'id, client_id, number, status, sync_status, deleted_at',
      invoiceItems: 'id, invoice_id',
      auditLogs: '++id, entity_type, user_id, created_at',
      syncQueue: 'id, entity_type, synced_at',
    })
  }
}

export const db = new BravoCRMDatabase()

// Helper functions for sync status
export const updateSyncStatus = async (
  table: any,
  id: string,
  status: 'pending' | 'synced' | 'error'
) => {
  await table.update(id, { sync_status: status })
}

export const addToSyncQueue = async (
  entityType: string,
  entityId: string,
  action: string,
  payload: Record<string, any>
) => {
  await (db.syncQueue as any).add({
    id: `${entityType}_${entityId}_${Date.now()}`,
    entity_type: entityType,
    entity_id: entityId,
    action,
    payload,
    created_at: new Date().toISOString(),
  })
}

export const getPendingSyncItems = async () => {
  return await (db.syncQueue as any).filter((item: any) => !item.applied_at).toArray()
}

export const clearSyncQueue = async (ids: string[]) => {
  await db.syncQueue.bulkDelete(ids)
}
