import { create } from 'zustand'

// Reemplaza alert()/confirm() nativos (fase F8 del plan de diseño): ambos
// bloquean el hilo del navegador, no se pueden estilizar ni recorrer con
// teclado de forma consistente entre navegadores, y no respetan el tema.
//
// showToast/confirmDialog son funciones planas (no hooks): además de los
// componentes, las llaman funciones sueltas como reportSaveError() en
// Quotations.tsx, compartida por Quotations y Maintenance, que no tiene
// acceso a estado de ningún componente.

export interface UiToast {
  id: number
  message: string
  kind: 'success' | 'error'
}

export interface UiConfirmRequest {
  id: number
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (value: boolean) => void
}

interface UiState {
  toasts: UiToast[]
  confirmRequest: UiConfirmRequest | null
}

export const useUiStore = create<UiState>()(() => ({
  toasts: [],
  confirmRequest: null,
}))

let nextToastId = 0

/** Muestra un aviso no bloqueante. Reemplaza a `alert()`/`window.alert()`. */
export function showToast(message: string, kind: UiToast['kind'] = 'success', durationMs = 6000) {
  const id = ++nextToastId
  useUiStore.setState(s => ({ toasts: [...s.toasts, { id, message, kind }] }))
  setTimeout(() => dismissToast(id), durationMs)
  return id
}

export function dismissToast(id: number) {
  useUiStore.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}

let nextConfirmId = 0

/**
 * Pide confirmación con un diálogo propio. Reemplaza a `confirm()`/
 * `window.confirm()`: en vez de devolver un booleano sincrónico, devuelve una
 * Promise (el diálogo no bloquea el hilo, así que hay que esperarla con
 * `await`). Solo puede haber un diálogo a la vez — uno nuevo reemplaza al
 * anterior, que se resuelve como cancelado.
 */
export function confirmDialog(
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }
): Promise<boolean> {
  return new Promise(resolve => {
    const previous = useUiStore.getState().confirmRequest
    previous?.resolve(false)
    const id = ++nextConfirmId
    useUiStore.setState({
      confirmRequest: {
        id,
        message,
        confirmLabel: options?.confirmLabel ?? 'Confirmar',
        cancelLabel: options?.cancelLabel ?? 'Cancelar',
        danger: options?.danger ?? false,
        resolve,
      },
    })
  })
}

export function resolveConfirm(answer: boolean) {
  const req = useUiStore.getState().confirmRequest
  if (!req) return
  useUiStore.setState({ confirmRequest: null })
  req.resolve(answer)
}
