import React, { useState, useMemo } from 'react'
import '../styles/Clients.css'
import { useMaestro } from '../stores/maestro-store'
import { MasterClient } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const emptyClient = (): MasterClient => ({
  id: '',
  name: '', contact: '', cargo: '',
  email: '', phone: '', address: '',
  rut: '', activity: '', city: '',
  created_at: '', updated_at: '',
})

// ── Client Form Modal ─────────────────────────────────────────────────────────

interface ClientFormProps {
  initial: MasterClient | null
  onSave: (c: MasterClient) => void
  onClose: () => void
}

function ClientForm({ initial, onSave, onClose }: ClientFormProps) {
  const [form, setForm] = useState<MasterClient>(initial ?? emptyClient())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const patch = (field: keyof MasterClient, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'El nombre es obligatorio'
    if (!form.rut.trim()) e.rut = 'El RUT es obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const now = new Date().toISOString().slice(0, 10)
    onSave({
      ...form,
      id: form.id || `cl-${Date.now()}`,
      created_at: form.created_at || now,
      updated_at: now,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="cl-modal" onClick={e => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2>{initial?.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <button className="btn-modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="cl-form" onSubmit={handleSubmit}>
          <div className="cl-form-grid">
            {/* Left column */}
            <div className="cl-form-col">
              <div className="cl-field">
                <label>Razón Social *</label>
                <input
                  className={`cl-input${errors.name ? ' cl-input-error' : ''}`}
                  value={form.name}
                  onChange={e => patch('name', e.target.value)}
                  placeholder="Empresa o persona"
                />
                {errors.name && <span className="cl-error">{errors.name}</span>}
              </div>

              <div className="cl-field">
                <label>RUT *</label>
                <input
                  className={`cl-input${errors.rut ? ' cl-input-error' : ''}`}
                  value={form.rut}
                  onChange={e => patch('rut', e.target.value)}
                  placeholder="12.345.678-9"
                />
                {errors.rut && <span className="cl-error">{errors.rut}</span>}
              </div>

              <div className="cl-field">
                <label>Contacto</label>
                <input className="cl-input" value={form.contact} onChange={e => patch('contact', e.target.value)} placeholder="Nombre del contacto" />
              </div>

              <div className="cl-field">
                <label>Cargo</label>
                <input className="cl-input" value={form.cargo} onChange={e => patch('cargo', e.target.value)} placeholder="Cargo del contacto" />
              </div>

              <div className="cl-field">
                <label>Actividad / Rubro</label>
                <input className="cl-input" value={form.activity} onChange={e => patch('activity', e.target.value)} placeholder="Construcción, Minería, etc." />
              </div>
            </div>

            {/* Right column */}
            <div className="cl-form-col">
              <div className="cl-field">
                <label>Email</label>
                <input type="email" className="cl-input" value={form.email} onChange={e => patch('email', e.target.value)} placeholder="contacto@empresa.cl" />
              </div>

              <div className="cl-field">
                <label>Teléfono</label>
                <input className="cl-input" value={form.phone} onChange={e => patch('phone', e.target.value)} placeholder="+56 2 2345 6789" />
              </div>

              <div className="cl-field">
                <label>Ciudad</label>
                <input className="cl-input" value={form.city} onChange={e => patch('city', e.target.value)} placeholder="Santiago, Antofagasta, etc." />
              </div>

              <div className="cl-field cl-field-full">
                <label>Dirección</label>
                <input className="cl-input" value={form.address} onChange={e => patch('address', e.target.value)} placeholder="Av. Ejemplo 1234, comuna" />
              </div>
            </div>
          </div>

          <div className="cl-form-actions">
            <button type="submit" className="btn-primary-sm">
              {initial?.id ? 'Guardar cambios' : 'Crear cliente'}
            </button>
            <button type="button" className="btn-outline-sm" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Clients Component ────────────────────────────────────────────────────

export const Clients: React.FC = () => {
  const { clients, quotations, upsertClient, deleteClient } = useMaestro()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<MasterClient | null | 'new'>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const quoteCountMap = useMemo(() => {
    const m: Record<string, number> = {}
    quotations.forEach(q => {
      if (q.client_id) m[q.client_id] = (m[q.client_id] || 0) + 1
    })
    return m
  }, [quotations])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return clients
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.rut.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.contact.toLowerCase().includes(q) ||
      c.activity.toLowerCase().includes(q)
    )
  }, [clients, search])

  const handleSave = (c: MasterClient) => {
    upsertClient(c)
    setEditing(null)
  }

  const handleDelete = (id: string) => {
    deleteClient(id)
    setConfirmDel(null)
  }

  const editingClient = editing === 'new' ? null : editing as MasterClient | null

  return (
    <div className="clients-root">
      {/* Toolbar */}
      <div className="cl-toolbar">
        <div className="cl-toolbar-left">
          <h2 className="cl-title">Clientes</h2>
          <span className="cl-count">{filtered.length} / {clients.length}</span>
        </div>
        <div className="cl-toolbar-right">
          <input
            className="cl-search"
            placeholder="Buscar por nombre, RUT, ciudad…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn-primary-sm" onClick={() => setEditing('new')}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="cl-empty">
          {clients.length === 0 ? (
            <>
              <p>No hay clientes registrados.</p>
              <button className="btn-primary-sm" onClick={() => setEditing('new')}>Agregar primer cliente</button>
            </>
          ) : (
            <p>Sin resultados para <strong>"{search}"</strong></p>
          )}
        </div>
      ) : (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th>Razón Social</th>
                <th>RUT</th>
                <th>Contacto</th>
                <th>Cargo</th>
                <th>Teléfono</th>
                <th>Ciudad</th>
                <th>Rubro</th>
                <th className="text-center">Coti.</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const qCount = quoteCountMap[c.id] || 0
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="cl-name">{c.name}</span>
                      {c.email && <div className="cl-email">{c.email}</div>}
                    </td>
                    <td className="cl-rut">{c.rut}</td>
                    <td>{c.contact || '—'}</td>
                    <td className="cl-cargo">{c.cargo || '—'}</td>
                    <td className="cl-phone">{c.phone || '—'}</td>
                    <td>{c.city || '—'}</td>
                    <td className="cl-activity">{c.activity || '—'}</td>
                    <td className="text-center">
                      {qCount > 0 ? (
                        <span className="cl-quote-badge">{qCount}</span>
                      ) : (
                        <span className="cl-quote-zero">—</span>
                      )}
                    </td>
                    <td>
                      <div className="cl-row-actions">
                        <button className="btn-icon" title="Editar" onClick={() => setEditing(c)}>✎</button>
                        <button
                          className="btn-icon btn-danger"
                          title="Eliminar"
                          onClick={() => setConfirmDel(c.id)}
                          disabled={qCount > 0}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Note: clients with quotations can't be deleted */}
      {clients.some(c => (quoteCountMap[c.id] || 0) > 0) && (
        <div className="cl-info-note">
          Los clientes con cotizaciones asociadas no se pueden eliminar directamente.
        </div>
      )}

      {/* Edit/Create modal */}
      {editing !== null && (
        <ClientForm
          initial={editingClient}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal-confirm" onClick={e => e.stopPropagation()}>
            <h3>¿Eliminar cliente?</h3>
            <p>Esta acción no se puede deshacer.</p>
            <div className="modal-confirm-actions">
              <button className="btn-danger-sm" onClick={() => handleDelete(confirmDel)}>Eliminar</button>
              <button className="btn-outline-sm" onClick={() => setConfirmDel(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Clients
