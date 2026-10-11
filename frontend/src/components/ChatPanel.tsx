import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useChatStore, sendChatMessage, toggleChat, clearChat } from '../stores/chatStore'
import { useActiveQuotation } from '../stores/maestro-store'
import '../styles/ChatPanel.css'

// Segunda barrera (la primera es backend/src/schemas/chatbot.ts, que ya
// filtra las muestras antes de responder): fuente_url viene de una búsqueda
// web real hecha por el LLM, texto libre de dos saltos de confianza atrás —
// si por lo que sea llega algo que no sea http(s) (ej. "javascript:..."),
// se muestra como texto plano en vez de como link clickeable.
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

// Panel de chat del asistente de cotizaciones. Se carga lazy desde App.tsx
// (como las páginas) y solo se monta cuando isOpen es true — el botón
// lanzador que lo abre vive eager en App.tsx/shared.css para no pagar el
// costo del panel completo hasta que alguien lo usa (ver
// check-bundle-budget.mjs).
//
// No es un modal bloqueante (sin overlay oscuro, sin aria-modal): el usuario
// suele querer seguir viendo la cotización abierta mientras conversa con el
// asistente, no que la tape.
export function ChatPanel() {
  const isOpen = useChatStore(s => s.isOpen)
  const isSending = useChatStore(s => s.isSending)
  const messages = useChatStore(s => s.messages)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeQuotation = useActiveQuotation()
  // Un borrador local (creado con newDraft(), nunca guardado) usa un id
  // 'q-<timestamp>' que no existe en la base — mandarlo como quotation_id
  // haría que el backend busque una fila que nunca va a encontrar.
  const activeQuotationId =
    activeQuotation && !activeQuotation.id.startsWith('q-') ? activeQuotation.id : null

  useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        toggleChat(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, isSending])

  if (!isOpen) return null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const text = draft
    setDraft('')
    void sendChatMessage(text, activeQuotationId)
  }

  return (
    <aside className="chat-panel" role="dialog" aria-label="Asistente de cotizaciones">
      <div className="chat-panel-header">
        <div>
          <h2>Asistente de cotizaciones</h2>
          {activeQuotationId && (
            <p className="chat-panel-context">Sobre: {activeQuotation?.correlative}</p>
          )}
        </div>
        <div className="chat-panel-header-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={clearChat}
            disabled={messages.length === 0}
            aria-label="Limpiar conversación"
            title="Limpiar conversación"
          >
            🗑
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={() => toggleChat(false)}
            aria-label="Cerrar asistente"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="chat-panel-messages" role="log" aria-live="polite" ref={listRef}>
        {messages.length === 0 && (
          <p className="chat-panel-hint">
            Pídeme crear una cotización (“5 días, 8 técnicos en Rancagua para Climatemp”), enséñame
            una tarifa (“la colación es $7000 por día por persona”) o pregúntame el precio de un
            material.
          </p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
            {m.text}
            {m.data?.muestras && m.data.muestras.length > 0 && (
              <ul className="chat-msg-sources">
                {m.data.muestras.map((s, i) => (
                  <li key={i}>
                    {isSafeUrl(s.fuente_url) ? (
                      <a href={s.fuente_url} target="_blank" rel="noopener noreferrer">
                        {s.tienda || s.fuente_url}
                      </a>
                    ) : (
                      <span>{s.tienda || 'Fuente'}</span>
                    )}
                    {' — $'}
                    {Math.round(s.precio).toLocaleString('es-CL')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {isSending && <div className="chat-msg chat-msg--bot chat-msg--thinking">Pensando…</div>}
      </div>

      <form className="chat-panel-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Escribe una instrucción…"
          disabled={isSending}
          aria-label="Instrucción para el asistente"
        />
        <button type="submit" className="btn-primary-sm" disabled={isSending || !draft.trim()}>
          Enviar
        </button>
      </form>
    </aside>
  )
}

export default ChatPanel
