import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useMaestro } from '../stores/maestro-store'
import { CategoryId, CatalogItemUI } from '../types'
import './CatalogAutocomplete.css'

interface Props {
  catId: CategoryId
  value: string
  onChange: (val: string) => void
  onSelect: (item: CatalogItemUI) => void
  placeholder?: string
}

export function CatalogAutocomplete({ catId, value, onChange, onSelect, placeholder }: Props) {
  const { catalogs } = useMaestro()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = React.useMemo(() => {
    if (!value.trim()) return catalogs[catId].slice(0, 10)
    const q = value.toLowerCase()
    return catalogs[catId]
      .filter(i => i.desc.toLowerCase().includes(q) || i.unidad.toLowerCase().includes(q))
      .slice(0, 10)
  }, [catalogs, catId, value])

  // Cierra el dropdown al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback((item: CatalogItemUI) => {
    onSelect(item)
    setOpen(false)
    inputRef.current?.blur()
  }, [onSelect])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown') { setOpen(true); setCursor(0) }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setCursor(c => Math.min(c + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setCursor(c => Math.max(c - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (suggestions[cursor]) handleSelect(suggestions[cursor])
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  const showDropdown = open && suggestions.length > 0
  const totalInCatalog = catalogs[catId].length

  return (
    <div className="cat-ac-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        className="cost-item-input cat-ac-input"
        value={value}
        placeholder={placeholder ?? 'Descripción o buscar en catálogo…'}
        onChange={e => { onChange(e.target.value); setOpen(true); setCursor(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label="Descripción"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
      />

      {showDropdown && (
        <>
          {/* Backdrop para móvil */}
          <div
            className="cat-ac-backdrop"
            onMouseDown={e => { e.preventDefault(); setOpen(false) }}
          />

          <div className="cat-ac-dropdown" role="listbox" aria-label="Opciones del catálogo">
            {/* Header con contador */}
            <div className="cat-ac-header">
              <span className="cat-ac-header-label">
                {value.trim() ? 'Resultados' : 'Catálogo'}
              </span>
              <span className="cat-ac-header-count">
                {suggestions.length}
                {value.trim() ? ` / ${totalInCatalog}` : ''}
              </span>
            </div>

            <div className="cat-ac-list">
              {suggestions.map((item, i) => (
                <div
                  key={i}
                  role="option"
                  aria-selected={i === cursor ? 'true' : 'false'}
                  className={`cat-ac-item ${i === cursor ? 'cat-ac-item-focused' : ''}`}
                  onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className="cat-ac-idx">{i + 1}</span>
                  <span className="cat-ac-desc">{item.desc}</span>
                  <span className="cat-ac-meta">
                    <span className="cat-ac-unit">{item.unidad}</span>
                    <span className="cat-ac-price">
                      {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(item.price)}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            <div className="cat-ac-hint">
              <span><kbd>↑↓</kbd> navegar</span>
              <span><kbd>↵</kbd> seleccionar</span>
              <span><kbd>Esc</kbd> cerrar</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default CatalogAutocomplete
