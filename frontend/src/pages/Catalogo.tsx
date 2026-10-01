import React, { useState, useMemo, useRef, useEffect } from 'react'
import '../styles/Catalogo.css'
import { useMaestro, fmtCLP, CatalogSaveError } from '../stores/maestro-store'
import { CategoryId, CatalogItemUI } from '../types'
import { showToast } from '../stores/uiStore'

// ── Metadata de categorías ────────────────────────────────────────────────────

export const CAT_META: Record<CategoryId, { label: string; color: string; abbr: string }> = {
  mo: { label: 'Mano de Obra Especializada', color: '#1e293b', abbr: 'MO' },
  log: { label: 'Logística y Operación', color: '#334155', abbr: 'LOG' },
  mat: { label: 'Provisión de Materiales', color: '#1e3a8a', abbr: 'MAT' },
  rep: { label: 'Suministro Equipos / Repuestos', color: '#312e81', abbr: 'REP' },
  ins: { label: 'Insumos Industriales y Gases', color: '#164e63', abbr: 'INS' },
  mec: { label: 'Materiales Mecánico', color: '#7c2d12', abbr: 'MEC' },
  ele: { label: 'Materiales Eléctricos', color: '#a16207', abbr: 'ELE' },
}

const CATS: CategoryId[] = ['mo', 'log', 'mat', 'rep', 'ins', 'mec', 'ele']

// ── Helpers ───────────────────────────────────────────────────────────────────

function avgPrice(items: CatalogItemUI[]) {
  if (!items.length) return 0
  return items.reduce((s, i) => s + i.price, 0) / items.length
}

function minPrice(items: CatalogItemUI[]) {
  if (!items.length) return 0
  return Math.min(...items.map(i => i.price))
}

function maxPrice(items: CatalogItemUI[]) {
  if (!items.length) return 0
  return Math.max(...items.map(i => i.price))
}

// ── Fila editable ─────────────────────────────────────────────────────────────

interface ItemRowProps {
  idx: number
  item: CatalogItemUI
  hasError: boolean
  onPatch: (field: keyof CatalogItemUI, value: string | number) => void
  onDelete: () => void
}

function ItemRow({ idx, item, hasError, onPatch, onDelete }: ItemRowProps) {
  // Una sola columna de precio: se ve con formato ($120.000) y al editar
  // muestra el número. El valor local existe solo mientras se edita, así nunca
  // queda desfasado del ítem.
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const descRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    if (!hasError) return
    rowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    descRef.current?.focus()
  }, [hasError])

  const commitPrice = () => {
    if (editingPrice === null) return
    // Formato chileno: el punto separa miles ("120.000") y la coma, decimales.
    const limpio = editingPrice
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, '')
    const v = parseFloat(limpio) || 0
    setEditingPrice(null)
    onPatch('price', v)
  }

  return (
    <tr ref={rowRef} className={`cat-row${hasError ? ' cat-row--error' : ''}`}>
      <td className="cat-col-idx">{idx + 1}</td>
      <td className="cat-col-desc">
        <input
          ref={descRef}
          className="cat-cell-input cat-cell-desc"
          value={item.desc}
          onChange={e => onPatch('desc', e.target.value)}
          placeholder="Descripción del ítem..."
          aria-label="Descripción"
        />
      </td>
      <td className="cat-col-unit">
        <input
          className="cat-cell-input cat-cell-unit"
          value={item.unidad}
          onChange={e => onPatch('unidad', e.target.value)}
          aria-label="Unidad"
        />
      </td>
      <td className="cat-col-price">
        <div className="cat-price-wrap">
          <input
            className="cat-cell-input cat-cell-price"
            inputMode="numeric"
            value={editingPrice ?? fmtCLP.format(item.price)}
            onFocus={e => {
              setEditingPrice(String(item.price))
              requestAnimationFrame(() => e.target.select())
            }}
            onChange={e => setEditingPrice(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Precio unitario"
          />
        </div>
      </td>
      <td className="cat-col-del">
        <button type="button" className="cat-btn-del" onClick={onDelete} title="Eliminar ítem">
          ✕
        </button>
      </td>
    </tr>
  )
}

// ── Tabla de categoría ────────────────────────────────────────────────────────

interface CatTableProps {
  catId: CategoryId
  globalSearch: string
  errorIdx: number | null
  onRowEdited: (idx: number) => void
}

function CatTable({ catId, globalSearch, errorIdx, onRowEdited }: CatTableProps) {
  const { catalogs, upsertCatalogItem, addCatalogItem, deleteCatalogItem } = useMaestro()
  const meta = CAT_META[catId]
  const items = catalogs[catId]
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!globalSearch) return items.map((item, i) => ({ item, i }))
    const q = globalSearch.toLowerCase()
    return items
      .map((item, i) => ({ item, i }))
      .filter(
        ({ item }) => item.desc.toLowerCase().includes(q) || item.unidad.toLowerCase().includes(q)
      )
  }, [items, globalSearch])

  const handleAdd = () => {
    addCatalogItem(catId, { desc: '', unidad: 'Und', price: 0 })
  }

  const handlePatch = (idx: number, field: keyof CatalogItemUI, value: string | number) => {
    upsertCatalogItem(catId, idx, field as string, value)
    onRowEdited(idx)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed: CatalogItemUI[] = JSON.parse(ev.target?.result as string)
        parsed.forEach(item => addCatalogItem(catId, item))
      } catch {
        showToast('Archivo JSON inválido', 'error')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `catalogo-${catId}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const avg = avgPrice(items)
  const min = minPrice(items)
  const max = maxPrice(items)

  return (
    <div className="cat-section">
      {/* Cabecera de categoría */}
      <div className="cat-section-header" style={{ background: meta.color }}>
        <div className="cat-section-header-left">
          <span className="cat-abbr">{meta.abbr}</span>
          <div>
            <div className="cat-section-title">{meta.label}</div>
            <div className="cat-section-stats">
              {items.length} ítems
              {items.length > 0 && (
                <>
                  &nbsp;·&nbsp; Mín: {fmtCLP.format(min)}
                  &nbsp;·&nbsp; Prom: {fmtCLP.format(avg)}
                  &nbsp;·&nbsp; Máx: {fmtCLP.format(max)}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="cat-section-header-right">
          <button
            type="button"
            className="cat-btn-sm cat-btn-ghost"
            onClick={handleExport}
            title="Exportar esta categoría"
          >
            ↓ Exportar
          </button>
          <button
            type="button"
            className="cat-btn-sm cat-btn-ghost"
            onClick={() => fileRef.current?.click()}
            title="Importar JSON"
          >
            ↑ Importar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            aria-label="Importar catálogo JSON"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button type="button" className="cat-btn-sm cat-btn-add" onClick={handleAdd}>
            + Agregar
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="cat-table-wrap">
        {filtered.length === 0 ? (
          <div className="cat-empty">
            {globalSearch
              ? `Sin resultados para "${globalSearch}" en ${meta.label}`
              : 'Sin ítems — agrega el primero arriba'}
          </div>
        ) : (
          <table className="cat-table">
            <thead>
              <tr>
                <th className="cat-col-idx">#</th>
                <th className="cat-col-desc">Descripción</th>
                <th className="cat-col-unit">Unidad</th>
                <th className="cat-col-price">Precio unitario</th>
                <th className="cat-col-del">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ item, i }) => (
                <ItemRow
                  key={i}
                  idx={i}
                  item={item}
                  hasError={errorIdx === i}
                  onPatch={(field, value) => handlePatch(i, field, value)}
                  onDelete={() => deleteCatalogItem(catId, i)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export const Catalogo: React.FC = () => {
  const { catalogs, catalogDirty, saveCatalogs } = useMaestro()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<CategoryId | 'all'>('all')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<'success' | 'error' | null>(null)
  const [toastMsg, setToastMsg] = useState('')
  // Fila que no se pudo guardar: se marca, se enfoca y se limpia al editarla.
  const [errorRow, setErrorRow] = useState<{ catId: CategoryId; idx: number } | null>(null)

  const totalItems = CATS.reduce((s, c) => s + catalogs[c].length, 0)

  const handleExportAll = () => {
    const blob = new Blob([JSON.stringify(catalogs, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `maestro-catalogo-completo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const handleSave = async () => {
    setSaving(true)
    setToast(null)
    setErrorRow(null)
    try {
      await saveCatalogs()
      setToast('success')
    } catch (err) {
      setToastMsg(err instanceof Error ? err.message : '')
      setToast('error')
      if (err instanceof CatalogSaveError) {
        if (activeTab !== 'all' && activeTab !== err.catId) setActiveTab(err.catId)
        if (search) setSearch('')
        setErrorRow({ catId: err.catId, idx: err.idx })
      }
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 6000)
    }
  }

  const visibleCats = activeTab === 'all' ? CATS : [activeTab]

  return (
    <div className="catalogo-root">
      {/* Toast */}
      {toast && (
        <div className={`cat-toast cat-toast-${toast}`}>
          {toast === 'success'
            ? '✓ Sincronización exitosa — Maestro de Precios actualizado'
            : `✕ ${toastMsg || 'Error al sincronizar. Verifique la conexión e intente nuevamente.'}`}
        </div>
      )}

      {/* Toolbar global */}
      <div className="catalogo-toolbar">
        <div className="catalogo-toolbar-left">
          <h2 className="catalogo-title">Maestro de Precios</h2>
          <span className="catalogo-total-badge">{totalItems} ítems totales</span>
        </div>
        <div className="catalogo-toolbar-right">
          <input
            className="catalogo-search"
            placeholder="Buscar en todo el catálogo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Búsqueda global"
          />
          <button
            type="button"
            className="cat-btn-export-all"
            onClick={handleExportAll}
            title="Exportar catálogo completo"
          >
            ↓ Exportar todo
          </button>
          <button
            type="button"
            className={`cat-btn-save ${catalogDirty ? 'cat-btn-save-dirty' : ''}`}
            onClick={handleSave}
            disabled={saving || !catalogDirty}
            title="Guardar y sincronizar cambios"
          >
            {saving ? (
              <>
                <span className="cat-save-spinner" /> Guardando…
              </>
            ) : (
              <>💾 Guardar{catalogDirty ? ' *' : ''}</>
            )}
          </button>
        </div>
      </div>

      {/* Pestañas de categoría */}
      <div className="catalogo-tabs">
        <button
          type="button"
          className={`catalogo-tab ${activeTab === 'all' ? 'catalogo-tab-active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          Todas
          <span className="tab-count">{totalItems}</span>
        </button>
        {CATS.map(c => (
          <button
            key={c}
            type="button"
            className={`catalogo-tab ${activeTab === c ? 'catalogo-tab-active' : ''}`}
            style={activeTab === c ? { borderBottomColor: CAT_META[c].color } : {}}
            onClick={() => setActiveTab(c)}
          >
            {CAT_META[c].abbr}
            <span className="tab-count">{catalogs[c].length}</span>
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="catalogo-body">
        {visibleCats.map(c => (
          <CatTable
            key={c}
            catId={c}
            globalSearch={search}
            errorIdx={errorRow?.catId === c ? errorRow.idx : null}
            onRowEdited={idx =>
              setErrorRow(prev => (prev?.catId === c && prev.idx === idx ? null : prev))
            }
          />
        ))}
      </div>
    </div>
  )
}

export default Catalogo
