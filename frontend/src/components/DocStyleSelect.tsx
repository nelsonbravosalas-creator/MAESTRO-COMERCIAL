import { DOC_STYLE_LABELS } from '../utils/groupedUnitPrice'
import type { DocStyle } from '../types'

export function DocStyleSelect({
  value,
  disabled,
  onChange,
}: {
  value: DocStyle | null | undefined
  disabled?: boolean
  onChange: (style: DocStyle | null) => void
}) {
  return (
    <label className="mtc-currency-toggle doc-style-select">
      Estilo del documento
      <select
        aria-label="Estilo del documento"
        value={value ?? 'default'}
        disabled={disabled}
        onChange={e => onChange(e.target.value === 'default' ? null : (e.target.value as DocStyle))}
      >
        {(Object.keys(DOC_STYLE_LABELS) as DocStyle[]).map(k => (
          <option key={k} value={k}>
            {DOC_STYLE_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  )
}
