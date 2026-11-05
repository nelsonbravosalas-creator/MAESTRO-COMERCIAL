import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { VersionReasonModal } from '../VersionReasonModal'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function typeInTextarea(value: string) {
  const el = container.querySelector('textarea') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function clickButton(label: string) {
  const btn = [...container.querySelectorAll('button')].find(b => b.textContent === label)!
  act(() => btn.click())
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('VersionReasonModal', () => {
  it('no confirma sin motivo y muestra error', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    act(() =>
      root.render(
        <VersionReasonModal
          correlative="SYM-028-11-2026"
          nextCorrelative="SYM-028-11-2026-V2"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )
    )

    clickButton('Crear versión')
    await flush()

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Escribe el motivo')
  })

  it('confirma con el motivo recortado y cierra el modal', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    act(() =>
      root.render(
        <VersionReasonModal
          correlative="SYM-028-11-2026"
          nextCorrelative="SYM-028-11-2026-V2"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )
    )

    typeInTextarea('  Ajuste de margen  ')
    clickButton('Crear versión')
    await flush()

    expect(onConfirm).toHaveBeenCalledWith('Ajuste de margen')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('si onConfirm falla muestra el error y no cierra', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Correlativo ya existe'))
    const onClose = vi.fn()
    act(() =>
      root.render(
        <VersionReasonModal
          correlative="SYM-028-11-2026"
          nextCorrelative="SYM-028-11-2026-V2"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )
    )

    typeInTextarea('Ajuste')
    clickButton('Crear versión')
    await flush()

    expect(onClose).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Correlativo ya existe')
  })
})
