import React, { useState, useMemo, useRef } from 'react'
import '../styles/Catalogo.css'
import { useMaestro, fmtCLP } from '../stores/maestro-store'
import { CategoryId, CatalogItem } from '../types'

// ── Metadata de categorías ────────────────────────────────────────────────────

export const CAT_META: Record<CategoryId, { label: string; color: string; abbr: string }> = {
  mo:  { label: 'Mano de Obra Especializada',     color: '#1e293b', abbr: 'MO'  },
  log: { label: 'Logística y Operación',           color: '#334155', abbr: 'LOG' },
  mat: { label: 'Provisión de Materiales',         color: '#1e3a8a', abbr: 'MAT' },
  rep: { label: 'Suministro Equipos / Repuestos',  color: '#312e81', abbr: 'REP' },
  ins: { label: 'Insumos Industriales y Gases',    color: '#164e63', abbr: 'INS' },
}

const CATS: CategoryId[] = ['mo', 'log', 'mat', 'rep', 'ins']

// ── Helpers ───────────────────────────────────────────────────────────────────

function avgPrice(items: CatalogItem[]) {
  if (!items.length) return 0
  return items.reduce((s, i) => s + i.price, 0) / items.length
}

function minPrice(items: CatalogItem[]) {
  if (!items.length) return 0
  return Math.min(...items.map(i => i.price))
}

function maxPrice(items: CatalogItem[]) {
  if (!items.length) return 0
  return Math.max(...items.map(i => i.price))
}

// ── Fila editable ─────────────────────────────────────────────────────────────

interface ItemRowProps {
  idx: number
  item: CatalogItem
  onPatch: (field: keyof CatalogItem, value: string | number) => void
  onDelete: () => void
}

function ItemRow({ idx, item, onPatch, onDelete }: ItemRowProps) {
  const [localPrice, setLocalPrice] = useState(String(item.price))

  const commitPrice = () => {
    const v = parseFloat(localPrice.replace(/[^\d.]/g, '')) || 0
    setLocalPrice(String(v))
    onPatch('price', v)
  }

  return (
    <tr className="cat-row">
      <td className="cat-col-idx">{idx + 1}</td>
      <td className="cat-col-desc">
        <input
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
          <span className="cat-price-prefix">$</span>
          <input
            className="cat-cell-input cat-cell-price"
            value={localPrice}
            onChange={e => setLocalPrice(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={e => e.key === 'Enter' && commitPrice()}
            aria-label="Precio unitario"
          />
        </div>
      </td>
      <td className="cat-col-fmt">
        <span className="cat-price-fmt">{fmtCLP.format(item.price)}</span>
      </td>
      <td className="cat-col-del">
        <button
          type="button"
          className="cat-btn-del"
          onClick={onDelete}
          title="Eliminar ítem"
        >
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
}

function CatTable({ catId, globalSearch }: CatTableProps) {
  const { catalogs, upsertCatalogItem, addCatalogItem, deleteCatalogItem } = useMaestro()
  const meta = CAT_META[catId]
  const items = catalogs[catId]
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!globalSearch) return items.map((item, i) => ({ item, i }))
    const q = globalSearch.toLowerCase()
    return items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) =>
        item.desc.toLowerCase().includes(q) || item.unidad.toLowerCase().includes(q)
      )
  }, [items, globalSearch])

  const handleAdd = () => {
    addCatalogItem(catId, { desc: '', unidad: 'Und', price: 0 })
  }

  const handlePatch = (idx: number, field: keyof CatalogItem, value: string | number) => {
    upsertCatalogItem(catId, idx, field as string, value)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed: CatalogItem[] = JSON.parse(ev.target?.result as string)
        parsed.forEach(item => addCatalogItem(catId, item))
      } catch {
        alert('Archivo JSON inválido')
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
          <button type="button" className="cat-btn-sm cat-btn-ghost" onClick={handleExport} title="Exportar esta categoría">
            ↓ Exportar
          </button>
          <button type="button" className="cat-btn-sm cat-btn-ghost" onClick={() => fileRef.current?.click()} title="Importar JSON">
            ↑ Importar
          </button>
          <input ref={fileRef} type="file" accept=".json" aria-label="Importar catálogo JSON" style={{ display: 'none' }} onChange={handleImport} />
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
                <th className="cat-col-price">Precio Unitario</th>
                <th className="cat-col-fmt">Formato CLP</th>
                <th className="cat-col-del"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ item, i }) => (
                <ItemRow
                  key={i}
                  idx={i}
                  item={item}
                  onPatch={(field, value) => handlePatch(i, field, value)}
                  onDelete={() => deleteCatalogItem(catId, i)}
                />
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="cat-btn-add-row" onClick={handleAdd}>
          + Agregar ítem a {meta.label}
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export const Catalogo: React.FC = () => {
  const { catalogs } = useMaestro()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<CategoryId | 'all'>('all')

  const totalItems = CATS.reduce((s, c) => s + catalogs[c].length, 0)

  const handleExportAll = () => {
    const blob = new Blob([JSON.stringify(catalogs, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `maestro-catalogo-completo-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  const visibleCats = activeTab === 'all' ? CATS : [activeTab]

  return (
    <div className="catalogo-root">
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
          <button type="button" className="cat-btn-export-all" onClick={handleExportAll} title="Exportar catálogo completo">
            ↓ Exportar todo
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
            style={activeTab === c ? { borderBottomColor: CAT_META[c].color, color: CAT_META[c].color } : {}}
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
          <CatTable key={c} catId={c} globalSearch={search} />
        ))}
      </div>
    </div>
  )
}

export default Catalogo
