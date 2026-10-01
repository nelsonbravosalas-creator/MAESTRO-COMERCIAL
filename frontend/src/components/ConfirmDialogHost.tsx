import { useEffect, useRef } from 'react'
import { useUiStore, resolveConfirm } from '../stores/uiStore'

// Un único host montado en App.tsx (fase F8): reemplaza a confirm() nativo.
// Reusa .modal-overlay/.modal-confirm (styles/shared.css, ya usados por los
// modales propios de cada pantalla) para verse igual que el resto de la app.
export function ConfirmDialogHost() {
  const req = useUiStore(s => s.confirmRequest)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!req) return
    confirmBtnRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        resolveConfirm(false)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        resolveConfirm(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [req])

  if (!req) return null

  return (
    <div className="modal-overlay" onClick={() => resolveConfirm(false)}>
      <div
        className="modal-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={req.message}
        onClick={e => e.stopPropagation()}
      >
        <p className="ui-confirm-msg">{req.message}</p>
        <div className="modal-confirm-actions">
          <button type="button" className="btn-outline-sm" onClick={() => resolveConfirm(false)}>
            {req.cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={req.danger ? 'btn-danger-sm' : 'btn-primary-sm'}
            onClick={() => resolveConfirm(true)}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialogHost
