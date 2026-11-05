import { useState } from 'react'
import { api } from '../../api/api'
import { fmtCLP } from '../../stores/maestro-store'
import { confirmDialog, showToast } from '../../stores/uiStore'
import type { CatalogItemUI } from '../../types'
import type {
  IuscTramo,
  RecalculoItem,
  RemuneracionParametros,
  RemuneracionTopes,
} from '../../types/remuneraciones'
import { getErrorMessage } from '../../utils/apiError'

// Parámetros de la calculadora de remuneraciones, ordenados como en el libro
// COSTEO INTEGRADO: Leyes_Sociales, Dotacion. Personal y Parámetros generales.
// Las tasas se muestran en % y se guardan como fracción (7 % → 0,07).

type Tipo = 'monto' | 'tasa' | 'entero' | 'numero'

type CampoNumerico = {
  [K in keyof RemuneracionParametros]: RemuneracionParametros[K] extends number ? K : never
}[keyof RemuneracionParametros]

interface Campo {
  key: CampoNumerico
  label: string
  tipo: Tipo
}

interface Seccion {
  titulo: string
  campos: Campo[]
}

const SECCIONES: Seccion[] = [
  {
    titulo: 'Leyes_Sociales · Indicadores',
    campos: [
      { key: 'imm', label: 'Ingreso mínimo mensual (IMM)', tipo: 'monto' },
      { key: 'uf', label: 'Valor UF', tipo: 'monto' },
      { key: 'utm', label: 'Valor UTM', tipo: 'monto' },
    ],
  },
  {
    titulo: 'Leyes_Sociales · Topes imponibles',
    campos: [
      { key: 'topeAfpSaludSisUf', label: 'Tope AFP / salud / SIS (UF)', tipo: 'numero' },
      { key: 'topeAfcUf', label: 'Tope seguro de cesantía AFC (UF)', tipo: 'numero' },
      { key: 'gratificacionTopeImm', label: 'Tope gratificación (× IMM ÷ 12)', tipo: 'numero' },
    ],
  },
  {
    titulo: 'Leyes_Sociales · Descuentos del trabajador',
    campos: [
      { key: 'afpFondo', label: 'AFP fondo', tipo: 'tasa' },
      { key: 'afpComision', label: 'Comisión AFP', tipo: 'tasa' },
      { key: 'salud', label: 'Salud obligatoria', tipo: 'tasa' },
      { key: 'afcTrabajadorIndefinido', label: 'AFC trabajador · indefinido', tipo: 'tasa' },
      { key: 'afcTrabajadorPlazoFijo', label: 'AFC trabajador · plazo fijo', tipo: 'tasa' },
    ],
  },
  {
    titulo: 'Leyes_Sociales · Cargas patronales',
    campos: [
      { key: 'sis', label: 'Seguro de invalidez y sobrevivencia (SIS)', tipo: 'tasa' },
      { key: 'mutualBasica', label: 'Mutual básica (Ley 16.744)', tipo: 'tasa' },
      { key: 'mutualSanna', label: 'Ley SANNA', tipo: 'tasa' },
      { key: 'mutualAdicional', label: 'Mutual adicional (mantención / UMAS)', tipo: 'tasa' },
      { key: 'afcPatronalIndefCic', label: 'AFC empleador · indefinido CIC', tipo: 'tasa' },
      { key: 'afcPatronalIndefFcs', label: 'AFC empleador · indefinido FCS', tipo: 'tasa' },
      { key: 'afcPatronalPlazoFijo', label: 'AFC empleador · plazo fijo', tipo: 'tasa' },
      { key: 'seguroElectrico', label: 'Seguro trabajos eléctricos (faena)', tipo: 'tasa' },
    ],
  },
  {
    titulo: 'Leyes_Sociales · Provisiones',
    campos: [
      { key: 'provisionVacaciones', label: 'Provisión vacaciones', tipo: 'tasa' },
      { key: 'provisionIas', label: 'Provisión indemnización años de servicio', tipo: 'tasa' },
    ],
  },
  {
    titulo: 'Dotacion. Personal',
    campos: [
      { key: 'movilizacionDiaria', label: 'Movilización · valor diario', tipo: 'monto' },
      { key: 'diasMovilizacion', label: 'Movilización · días del mes', tipo: 'entero' },
      { key: 'colacionDiaria', label: 'Colación · valor diario', tipo: 'monto' },
      { key: 'diasColacion', label: 'Colación · días del mes', tipo: 'entero' },
      { key: 'bonoVacacionesAnual', label: 'Bono de vacaciones (anual)', tipo: 'monto' },
      {
        key: 'aguinaldoFiestasPatriasAnual',
        label: 'Aguinaldo Fiestas Patrias (anual)',
        tipo: 'monto',
      },
      { key: 'aguinaldoNavidadAnual', label: 'Aguinaldo Navidad (anual)', tipo: 'monto' },
    ],
  },
  {
    titulo: 'Parámetros generales · jornada y días',
    campos: [
      { key: 'diasBaseMes', label: 'Días base del mes (costo planilla)', tipo: 'entero' },
      {
        key: 'diasTrabajadosMes',
        label: 'Días trabajados del mes (valor por día)',
        tipo: 'entero',
      },
      { key: 'horasFactorHe', label: 'Horas base para hora ordinaria', tipo: 'numero' },
      { key: 'factorHoraExtra', label: 'Factor hora extra', tipo: 'numero' },
    ],
  },
]

const round = (n: number, decimales: number) => Number(n.toFixed(decimales))

interface Props {
  params: RemuneracionParametros
  canEdit: boolean
  catalogItems: CatalogItemUI[]
  onClose: () => void
  onSaved: (params: RemuneracionParametros, topes: RemuneracionTopes) => void
  onRecalculated: (actualizados: RecalculoItem[]) => void
}

export function ParametrosRemuneracionesModal({
  params,
  canEdit,
  catalogItems,
  onClose,
  onSaved,
  onRecalculated,
}: Props) {
  const [draft, setDraft] = useState<RemuneracionParametros>(params)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recalculo, setRecalculo] = useState<RecalculoItem[] | null>(null)

  const nombreItem = (id: string) => catalogItems.find(i => i.id === id)?.desc || 'Perfil'

  const setNumero = (key: CampoNumerico, valor: number) =>
    setDraft(prev => ({ ...prev, [key]: valor }) as RemuneracionParametros)

  const valorMostrado = (campo: Campo): number => {
    const v = draft[campo.key] as number
    return campo.tipo === 'tasa' ? round(v * 100, 4) : v
  }

  const cambiarCampo = (campo: Campo, texto: string) => {
    const n = Number(texto)
    if (Number.isNaN(n)) return
    setNumero(campo.key, campo.tipo === 'tasa' ? round(n / 100, 6) : n)
  }

  const cambiarTramo = (idx: number, cambio: Partial<IuscTramo>) =>
    setDraft(prev => ({
      ...prev,
      iuscTramos: prev.iuscTramos.map((t, i) => (i === idx ? { ...t, ...cambio } : t)),
    }))

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      const guardado = await api.putRemuneracionesParametros(draft)
      onSaved(guardado.params, guardado.topes)
      showToast('Parámetros guardados', 'success')

      const recalcular = await confirmDialog(
        'Parámetros guardados. ¿Recalcular los perfiles de Mano de Obra con estos valores?',
        { confirmLabel: 'Recalcular perfiles' }
      )
      if (recalcular) {
        const res = await api.recalcularRemuneraciones()
        setRecalculo(res.actualizados)
        onRecalculated(res.actualizados)
        showToast(`${res.actualizados.length} perfil(es) recalculado(s)`, 'success')
      }
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudieron guardar los parámetros'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal rem-modal rem-modal--wide"
        role="dialog"
        aria-label="Parámetros de remuneraciones"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Parámetros de remuneraciones</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-body rem-body">
          {!canEdit && (
            <p className="rem-hint">
              Solo lectura: cambiar los parámetros legales requiere rol admin.
            </p>
          )}

          {SECCIONES.map(seccion => (
            <section key={seccion.titulo} className="rem-section">
              <h4>{seccion.titulo}</h4>
              <div className="rem-grid">
                {seccion.campos.map(campo => (
                  <label key={campo.key} className="rem-field">
                    <span>
                      {campo.label}
                      {campo.key === 'topeAfpSaludSisUf' &&
                        ` · ≈ ${fmtCLP.format(Math.round(draft.topeAfpSaludSisUf * draft.uf))}`}
                      {campo.key === 'topeAfcUf' &&
                        ` · ≈ ${fmtCLP.format(Math.round(draft.topeAfcUf * draft.uf))}`}
                      {campo.key === 'gratificacionTopeImm' &&
                        ` · ≈ ${fmtCLP.format(Math.round((draft.gratificacionTopeImm * draft.imm) / 12))}`}
                      {campo.tipo === 'tasa' && ' (%)'}
                    </span>
                    <input
                      type="number"
                      className="form-control"
                      step={campo.tipo === 'tasa' ? 0.01 : campo.tipo === 'monto' ? 1 : 0.01}
                      value={valorMostrado(campo)}
                      disabled={!canEdit}
                      onChange={e => cambiarCampo(campo, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}

          <section className="rem-section">
            <h4>Impuesto único 2ª categoría · tramos en UTM</h4>
            <table className="rem-tramos">
              <thead>
                <tr>
                  <th>Hasta (UTM)</th>
                  <th>Tasa (%)</th>
                  <th>Rebaja (UTM)</th>
                </tr>
              </thead>
              <tbody>
                {draft.iuscTramos.map((t, i) => (
                  <tr key={i}>
                    <td>
                      {t.hasta === null ? (
                        'Sin tope'
                      ) : (
                        <input
                          type="number"
                          className="form-control"
                          step={0.01}
                          value={t.hasta}
                          disabled={!canEdit}
                          onChange={e => cambiarTramo(i, { hasta: Number(e.target.value) })}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control"
                        step={0.01}
                        value={round(t.tasa * 100, 4)}
                        disabled={!canEdit}
                        onChange={e =>
                          cambiarTramo(i, { tasa: round(Number(e.target.value) / 100, 6) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control"
                        step={0.01}
                        value={t.rebajaUtm}
                        disabled={!canEdit}
                        onChange={e => cambiarTramo(i, { rebajaUtm: Number(e.target.value) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label className="rem-check">
              <input
                type="checkbox"
                checked={draft.incluirIuscCosto}
                disabled={!canEdit}
                onChange={e => setDraft(prev => ({ ...prev, incluirIuscCosto: e.target.checked }))}
              />
              <span>
                Incluir el impuesto único como costo de la empresa (apagado por defecto: lo retiene
                el trabajador). Difiere del Excel COSTEO INTEGRADO y del motor de referencia del
                plugin, que lo incluyen (valor 1). Avisar a finanzas si se cambia.
              </span>
            </label>
          </section>

          {error && <p className="rem-error">{error}</p>}

          {recalculo && (
            <section className="rem-section">
              <h4>Precios recalculados</h4>
              <table className="rem-tramos">
                <thead>
                  <tr>
                    <th>Perfil</th>
                    <th>Antes</th>
                    <th>Después</th>
                  </tr>
                </thead>
                <tbody>
                  {recalculo.map(r => (
                    <tr key={r.catalogItemId}>
                      <td>{nombreItem(r.catalogItemId)}</td>
                      <td>{fmtCLP.format(r.precioAnterior)}</td>
                      <td>{fmtCLP.format(r.precioNuevo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-sm" onClick={onClose}>
            Cerrar
          </button>
          <button
            type="button"
            className="btn-primary-sm"
            onClick={guardar}
            disabled={!canEdit || saving}
          >
            {saving ? 'Guardando…' : 'Guardar parámetros'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ParametrosRemuneracionesModal
