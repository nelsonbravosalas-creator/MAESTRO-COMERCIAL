import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  useChatStore,
  sendChatMessage,
  toggleChat,
  clearChat,
  toggleAgentMode,
  loadCommercialBriefing,
} from '../stores/chatStore'
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
  const agentMode = useChatStore(s => s.agentMode)
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
          <div className="chat-panel-title-row">
            <h2>Asistente</h2>
            <button
              type="button"
              className={`chat-agent-toggle ${agentMode ? 'is-active' : ''}`}
              onClick={() => toggleAgentMode()}
              title={
                agentMode
                  ? 'Modo Agente activo: razonamiento autónomo multi-paso con acceso a catálogos e historial'
                  : 'Modo Clásico activo: clic para activar el Agente ReAct'
              }
              aria-label="Alternar modo agente"
            >
              {agentMode ? '⚡ Agente' : '💬 Clásico'}
            </button>
          </div>
          {activeQuotationId && (
            <p className="chat-panel-context">Sobre: {activeQuotation?.correlative}</p>
          )}
        </div>
        <div className="chat-panel-header-actions">
          <button
            type="button"
            className="btn-icon"
            onClick={loadCommercialBriefing}
            disabled={isSending}
            aria-label="Cargar resumen comercial matutino"
            title="☀️ Briefing comercial del día"
          >
            ☀️
          </button>
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
          <div className="chat-panel-empty-state">
            <p className="chat-panel-hint">
              {agentMode
                ? '⚡ Modo Agente activo: puedo razonar en múltiples pasos, consultar el catálogo técnico, revisar el historial de compras del cliente y estructurar cotizaciones.'
                : 'Pídeme crear una cotización (“5 días, 8 técnicos en Rancagua para Climatemp”), enséñame una tarifa (“la colación es $7000 por día por persona”) o pregúntame el precio de un material.'}
            </p>
            <button
              type="button"
              className="chat-briefing-btn"
              onClick={loadCommercialBriefing}
              disabled={isSending}
            >
              ☀️ Ver briefing comercial del día
            </button>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
            {m.text}
            {/* El nombre del cliente se muestra desde datos estructurados
                (m.data), nunca desde m.text -- m.text es lo unico que se
                reenvia al LLM como recent_turns (ver chatStore.ts), y un
                nombre resuelto desde la base ahi violaria A-21. */}
            {m.data?.quotation?.client_name && (
              <p className="chat-msg-meta">Cliente: {m.data.quotation.client_name}</p>
            )}
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
            {m.data?.pasos && m.data.pasos.length > 0 && (
              <details className="chat-msg-steps">
                <summary>⚡ Pasos del agente ({m.data.pasos.length})</summary>
                <ul>
                  {m.data.pasos.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </details>
            )}
            {m.data?.notas && m.data.notas.length > 0 && (
              <ul className="chat-msg-notes">
                {m.data.notas.map((n, i) => (
                  <li key={i}>💡 {n.text}</li>
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
