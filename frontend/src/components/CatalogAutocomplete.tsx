import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
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

interface DropPos {
  top: number
  left: number
  width: number
  maxHeight: number
  openAbove: boolean
}

const fmtCLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

const DIST_ITEM: CatalogItemUI = {
  desc:   'Cálculo de Distancias',
  unidad: 'km',
  price:  990,
}

export function CatalogAutocomplete({ catId, value, onChange, onSelect, placeholder }: Props) {
  const { catalogs } = useMaestro()
  const [open, setOpen]       = useState(false)
  const [cursor, setCursor]   = useState(0)
  const [dropPos, setDropPos] = useState<DropPos | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const suggestions = React.useMemo(() => {
    const base = catId === 'log'
      ? catalogs[catId].filter(i => i.desc !== 'Cálculo de Distancias')
      : catalogs[catId]

    if (!value.trim()) {
      const list = catId === 'log' ? [DIST_ITEM, ...base] : base
      return list.slice(0, 10)
    }
    const q = value.toLowerCase()
    const filtered = base.filter(i => i.desc.toLowerCase().includes(q) || i.unidad.toLowerCase().includes(q))
    if (catId === 'log' && 'cálculo de distancias'.includes(q)) {
      return [DIST_ITEM, ...filtered].slice(0, 10)
    }
    return filtered.slice(0, 10)
  }, [catalogs, catId, value])

  const totalInCatalog = catId === 'log' ? catalogs[catId].length + 1 : catalogs[catId].length
  const showDropdown   = open && suggestions.length > 0

  /* ── Calcular posición adaptativa (flip hacia arriba si no hay espacio) ── */
  const updateDropPos = useCallback(() => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom - 8
    const spaceAbove = r.top - 8

    if (spaceBelow >= spaceAbove || spaceBelow >= 200) {
      setDropPos({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        maxHeight: Math.max(Math.min(spaceBelow - 4, 420), 150),
        openAbove: false,
      })
    } else {
      setDropPos({
        top: r.top - 4,
        left: r.left,
        width: r.width,
        maxHeight: Math.max(Math.min(spaceAbove - 4, 420), 150),
        openAbove: true,
      })
    }
  }, [])

  useLayoutEffect(() => {
    if (!showDropdown) { setDropPos(null); return }
    updateDropPos()
    window.addEventListener('resize', updateDropPos, { passive: true })
    window.addEventListener('scroll', updateDropPos, { passive: true, capture: true })
    return () => {
      window.removeEventListener('resize', updateDropPos)
      window.removeEventListener('scroll', updateDropPos, true)
    }
  }, [showDropdown, updateDropPos])

  /* ── Scroll al ítem enfocado al navegar con teclado ── */
  useEffect(() => {
    if (!listRef.current) return
    const focused = listRef.current.querySelector<HTMLElement>('.cat-ac-item-focused')
    if (focused) focused.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  /* ── Cerrar al clic fuera ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        const portal = document.getElementById('cat-ac-portal-root')
        if (portal && portal.contains(target)) return
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

  /* ── Portal root (singleton en el body) ── */
  const getPortalRoot = () => {
    let el = document.getElementById('cat-ac-portal-root')
    if (!el) {
      el = document.createElement('div')
      el.id = 'cat-ac-portal-root'
      document.body.appendChild(el)
    }
    return el
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640

  const dropStyle = (!isMobile && dropPos)
    ? ({
        '--drop-top':        dropPos.openAbove ? 'auto'                                  : `${dropPos.top}px`,
        '--drop-bottom':     dropPos.openAbove ? `${window.innerHeight - dropPos.top}px` : 'auto',
        '--drop-left':       `${dropPos.left}px`,
        '--drop-width':      `${dropPos.width}px`,
        '--drop-max-height': `${dropPos.maxHeight}px`,
      } as React.CSSProperties)
    : undefined

  const dropdownEl = showDropdown
    ? ReactDOM.createPortal(
        <>
          <div
            className="cat-ac-backdrop"
            onMouseDown={e => { e.preventDefault(); setOpen(false) }}
          />

          <div
            className={`cat-ac-dropdown${isMobile ? ' cat-ac-dropdown--mobile' : ''}${dropPos?.openAbove ? ' cat-ac-dropdown--above' : ''}`}
            role="listbox"
            aria-label="Opciones del catálogo"
            style={dropStyle}
          >
            <div className="cat-ac-header">
              <span className="cat-ac-header-label">
                {value.trim() ? 'Resultados' : 'Catálogo'}
              </span>
              <span className="cat-ac-header-count">
                {suggestions.length}{value.trim() ? ` / ${totalInCatalog}` : ''}
              </span>
            </div>

            <div className="cat-ac-list" ref={listRef}>
              {suggestions.map((item, i) => (
                <div
                  key={i}
                  role="option"
                  aria-selected={i === cursor ? 'true' : 'false'}
                  className={`cat-ac-item${i === cursor ? ' cat-ac-item-focused' : ''}`}
                  onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
                  onMouseEnter={() => setCursor(i)}
                >
                  <span className="cat-ac-idx">{i + 1}</span>
                  <span className="cat-ac-desc">{item.desc}</span>
                  <span className="cat-ac-meta">
                    <span className="cat-ac-unit">{item.unidad}</span>
                    <span className="cat-ac-price">{fmtCLP.format(item.price)}</span>
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
        </>,
        getPortalRoot()
      )
    : null

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
        aria-expanded={showDropdown ? 'true' : 'false'}
      />
      {dropdownEl}
    </div>
  )
}

export default CatalogAutocomplete
