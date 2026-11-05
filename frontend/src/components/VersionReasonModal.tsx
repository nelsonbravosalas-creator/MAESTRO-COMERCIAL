import React, { useState } from 'react'

// Modal que pide el motivo obligatorio de una nueva versión (V+). Lo usan
// Cotizaciones y Mantenciones: el backend rechaza -V{n} sin version_reason.
export function VersionReasonModal({
  correlative,
  nextCorrelative,
  onConfirm,
  onClose,
}: {
  correlative: string
  nextCorrelative: string
  onConfirm: (versionReason: string) => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('Escribe el motivo de la nueva versión')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await onConfirm(trimmed)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la versión')
      setGuardando(false)
    }
  }

  const lbl: React.CSSProperties = {
    display: 'block',
    fontSize: '0.82rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 4,
  }
  const inp: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-confirm" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px' }}>Nueva versión</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {correlative} → {nextCorrelative}. ¿Por qué se crea esta versión?
        </p>
        {error && (
          <div className="inv-alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Motivo de la versión *</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={{ ...inp, minHeight: 70, resize: 'vertical' }}
            placeholder="Ej.: ajuste de margen tras revisión con el cliente"
            maxLength={500}
            disabled={guardando}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="inv-btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="inv-btn" onClick={handleConfirm} disabled={guardando}>
            {guardando ? 'Creando…' : 'Crear versión'}
          </button>
        </div>
      </div>
    </div>
  )
}
