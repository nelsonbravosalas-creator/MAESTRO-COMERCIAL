import React, { useState, useEffect } from 'react'
import '../styles/Quotations.css'
import { Quotation, Client } from '../types'

interface QuotationWithClient extends Quotation {
  client_name: string
}

export const Quotations: React.FC = () => {
  const [quotations, setQuotations] = useState<QuotationWithClient[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationWithClient | null>(null)
  const [formData, setFormData] = useState({
    client_id: '',
    items: [{ description: '', quantity: 1, unit_price: 0, cost: 0 }],
  })

  const token = localStorage.getItem('authToken')

  useEffect(() => {
    fetchQuotations()
    fetchClients()
  }, [])

  const fetchQuotations = async () => {
    try {
      setLoading(true)
      const response = await fetch('http://localhost:3000/api/quotations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setQuotations(data)
      }
    } catch (error) {
      console.error('Error fetching quotations:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchClients = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/clients', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        setClients(data)
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unit_price: 0, cost: 0 }],
    })
  }

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    })
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], [field]: value }
    setFormData({ ...formData, items: newItems })
  }

  const calculateTotal = () => {
    const subtotal = formData.items.reduce((sum, item) => {
      return sum + (parseFloat(String(item.quantity)) || 0) * (parseFloat(String(item.unit_price)) || 0)
    }, 0)
    const tax = subtotal * 0.18
    const total = subtotal + tax
    return { subtotal, tax, total }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.client_id) {
      alert('Selecciona un cliente')
      return
    }

    if (formData.items.length === 0 || !formData.items[0].description) {
      alert('Agrega al menos un item')
      return
    }

    try {
      const response = await fetch('http://localhost:3000/api/quotations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        alert('✓ Cotización creada exitosamente')
        setShowForm(false)
        setFormData({
          client_id: '',
          items: [{ description: '', quantity: 1, unit_price: 0, cost: 0 }],
        })
        fetchQuotations()
      } else {
        alert('Error creando cotización')
      }
    } catch (error) {
      console.error('Error creating quotation:', error)
      alert('Error al crear cotización')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; class: string }> = {
      draft: { label: 'Borrador', class: 'badge-draft' },
      sent: { label: 'Enviada', class: 'badge-sent' },
      accepted: { label: 'Aceptada', class: 'badge-accepted' },
      rejected: { label: 'Rechazada', class: 'badge-rejected' },
    }
    const status_info = statusMap[status] || { label: status, class: 'badge-default' }
    return <span className={`badge ${status_info.class}`}>{status_info.label}</span>
  }

  const { subtotal, tax, total } = calculateTotal()

  return (
    <div className="quotations-container">
      <div className="quotations-header">
        <h1>📋 Cotizaciones</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancelar' : '+ Nueva Cotización'}
        </button>
      </div>

      {showForm && (
        <div className="quotation-form-card">
          <h2>Nueva Cotización</h2>
          <form onSubmit={handleSubmit}>
            {/* Cliente */}
            <div className="form-section">
              <label>Cliente *</label>
              <select
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className="form-input"
              >
                <option value="">-- Selecciona un cliente --</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} ({client.ruc || 'S/RUC'})
                  </option>
                ))}
              </select>
            </div>

            {/* Items */}
            <div className="form-section">
              <label>Items de la Cotización *</label>
              <div className="items-table">
                <div className="items-header">
                  <div className="col-description">Descripción</div>
                  <div className="col-qty">Cantidad</div>
                  <div className="col-price">Precio Unit.</div>
                  <div className="col-cost">Costo Unit.</div>
                  <div className="col-action">Acción</div>
                </div>

                {formData.items.map((item, index) => (
                  <div key={index} className="items-row">
                    <input
                      type="text"
                      className="col-description"
                      placeholder="Descripción del item"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      className="col-qty"
                      placeholder="0"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                      min="1"
                    />
                    <input
                      type="number"
                      className="col-price"
                      placeholder="0.00"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                      step="0.01"
                      min="0"
                    />
                    <input
                      type="number"
                      className="col-cost"
                      placeholder="0.00"
                      value={item.cost}
                      onChange={(e) => handleItemChange(index, 'cost', parseFloat(e.target.value) || 0)}
                      step="0.01"
                      min="0"
                    />
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => handleRemoveItem(index)}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="btn-add-item"
                  onClick={handleAddItem}
                >
                  + Agregar Item
                </button>
              </div>
            </div>

            {/* Totales */}
            <div className="totals-section">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>S/ {subtotal.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>IVA (18%):</span>
                <span>S/ {tax.toFixed(2)}</span>
              </div>
              <div className="total-row total">
                <span>Total:</span>
                <span>S/ {total.toFixed(2)}</span>
              </div>
            </div>

            {/* Botones */}
            <div className="form-actions">
              <button type="submit" className="btn-save">
                💾 Guardar Cotización
              </button>
              <button type="button" className="btn-cancel" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Listado */}
      <div className="quotations-list">
        <h2>
          {quotations.length === 0 ? '📭 Sin cotizaciones' : `📊 Total: ${quotations.length} cotizaciones`}
        </h2>

        {loading ? (
          <div className="loading">Cargando...</div>
        ) : quotations.length === 0 ? (
          <div className="empty-state">
            <p>No hay cotizaciones registradas</p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Crear primera cotización
            </button>
          </div>
        ) : (
          <div className="quotations-grid">
            {quotations.map((quotation) => (
              <div
                key={quotation.id}
                className="quotation-card"
                onClick={() => setSelectedQuotation(quotation)}
              >
                <div className="card-header">
                  <div>
                    <h3>{quotation.number}</h3>
                    <p className="client-name">{quotation.client_name}</p>
                  </div>
                  {getStatusBadge(quotation.status)}
                </div>

                <div className="card-items">
                  <p className="items-count">{quotation.items?.length || 0} items</p>
                </div>

                <div className="card-totals">
                  <div className="total-amount">
                    <span>Total:</span>
                    <strong>S/ {quotation.total?.toFixed(2) || '0.00'}</strong>
                  </div>
                </div>

                <div className="card-date">
                  <small>
                    {new Date(quotation.created_at).toLocaleDateString('es-PE', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {selectedQuotation && (
        <div className="modal-overlay" onClick={() => setSelectedQuotation(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedQuotation(null)}>
              ✕
            </button>

            <h2>{selectedQuotation.number}</h2>
            <p className="modal-client">{selectedQuotation.client_name}</p>

            <div className="modal-status">
              {getStatusBadge(selectedQuotation.status)}
            </div>

            <div className="modal-items">
              <h3>Items</h3>
              <table className="items-table-detail">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                    <th>Precio</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedQuotation.items?.map((item, index) => (
                    <tr key={index}>
                      <td>{item.description}</td>
                      <td>{item.quantity}</td>
                      <td>S/ {item.unit_price?.toFixed(2) || '0.00'}</td>
                      <td>S/ {(item.total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-totals">
              <div className="total-line">
                <span>Subtotal:</span>
                <span>S/ {selectedQuotation.subtotal?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="total-line">
                <span>IVA (18%):</span>
                <span>S/ {selectedQuotation.tax?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="total-line total">
                <span>Total:</span>
                <span>S/ {selectedQuotation.total?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            <div className="modal-date">
              <small>
                Creada:{' '}
                {new Date(selectedQuotation.created_at).toLocaleDateString('es-PE', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </small>
            </div>

            <div className="modal-actions">
              <button className="btn-close" onClick={() => setSelectedQuotation(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Quotations
