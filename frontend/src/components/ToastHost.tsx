import { useUiStore, dismissToast } from '../stores/uiStore'
import '../styles/ui.css'

// Un único host montado en App.tsx (fase F8): apila los avisos de showToast()
// en la esquina inferior derecha, igual en cualquier pantalla.
export function ToastHost() {
  const toasts = useUiStore(s => s.toasts)
  if (toasts.length === 0) return null

  return (
    <div className="ui-toast-stack" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`ui-toast ui-toast--${t.kind}`}>
          <span className="ui-toast-msg">{t.message}</span>
          <button
            type="button"
            className="ui-toast-close"
            onClick={() => dismissToast(t.id)}
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastHost
