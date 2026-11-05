import { useState } from 'react'
import { api } from '../../api/api'
import { fmtCLP } from '../../stores/maestro-store'
import { showToast } from '../../stores/uiStore'
import type { CatalogItemUI } from '../../types'
import type {
  PerfilGuardado,
  PerfilInputs,
  RemuneracionParametros,
  RemuneracionResultado,
} from '../../types/remuneraciones'
import { getErrorMessage } from '../../utils/apiError'

// Ventana de cálculo del costo por jornada. Sin `item` calcula el sueldo mínimo
// (IMM) como referencia y no aplica nada a un perfil. Con `item` calcula un perfil
// y, si se aplica, su valor jornada vuelve al precio unitario del ítem.
// El cálculo solo corre al pulsar "Calcular"; cambiar un campo deja el resultado
// marcado como desactualizado hasta volver a calcular.

function inputsIniciales(
  perfil: PerfilGuardado | undefined,
  params: RemuneracionParametros,
  sueldoMinimo: boolean
): PerfilInputs {
  if (perfil) return perfil.inputs
  return {
    sueldoLiquido: sueldoMinimo ? params.imm : 0,
    tipoContrato: 'Indefinido',
    jornadaSemanal: 44,
    seguroElectrico: false,
    colacionMensual: params.colacionDiaria * params.diasColacion,
    movilizacionMensual: params.movilizacionDiaria * params.diasMovilizacion,
    bonoVacacionesAnual: params.bonoVacacionesAnual,
    aguinaldoFiestasPatriasAnual: params.aguinaldoFiestasPatriasAnual,
    aguinaldoNavidadAnual: params.aguinaldoNavidadAnual,
  }
}

interface Props {
  item?: CatalogItemUI
  perfil?: PerfilGuardado
  params: RemuneracionParametros
  canEdit: boolean
  onClose: () => void
  onApplied?: (price: number) => void
}

interface Calculo {
  inputs: PerfilInputs
  resultado: RemuneracionResultado
}

export function CalculoPerfilModal({ item, perfil, params, canEdit, onClose, onApplied }: Props) {
  const [inputs, setInputs] = useState<PerfilInputs>(() => inputsIniciales(perfil, params, !item))
  const [calculo, setCalculo] = useState<Calculo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [saving, setSaving] = useState(false)

  const sinGuardar = !!item && (!item.id || item.id.startsWith('tmp-'))
  const vigente = !!calculo && JSON.stringify(calculo.inputs) === JSON.stringify(inputs)
  const r = vigente && calculo ? calculo.resultado : null
  const desactualizado = !!calculo && !vigente

  const set = <K extends keyof PerfilInputs>(key: K, value: PerfilInputs[K]) =>
    setInputs(prev => ({ ...prev, [key]: value }))

  const calcular = async () => {
    setCalculando(true)
    setError(null)
    try {
      const resultado = await api.calcularRemuneracion(inputs)
      setCalculo({ inputs, resultado })
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo calcular el costo'))
    } finally {
      setCalculando(false)
    }
  }

  const numero = (
    key:
      | 'sueldoLiquido'
      | 'colacionMensual'
      | 'movilizacionMensual'
      | 'bonoVacacionesAnual'
      | 'aguinaldoFiestasPatriasAnual'
      | 'aguinaldoNavidadAnual',
    label: string
  ) => (
    <label className="rem-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        className="form-control"
        value={inputs[key]}
        disabled={!canEdit}
        onChange={e => set(key, Number(e.target.value) || 0)}
      />
    </label>
  )

  const aplicar = async () => {
    if (!item?.id || !onApplied) return
    setSaving(true)
    try {
      const guardado = await api.guardarRemuneracionPerfil(item.id, inputs)
      onApplied(guardado.costo_diario)
      showToast(`Precio de ${item.desc || 'perfil'} actualizado`, 'success')
      onClose()
    } catch (e) {
      showToast(getErrorMessage(e, 'No se pudo aplicar el cálculo'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const pesos = (n: number) => fmtCLP.format(Math.round(n))
  // El IUSC entra al costo solo si el parámetro lo indica (por defecto no).
  const iuscEnCosto = params.incluirIuscCosto
  const totalMensual = r ? r.costoLicitacionMensual + (iuscEnCosto ? r.iusc : 0) : 0
  const titulo = item
    ? `Costo por perfil · ${item.desc || 'Sin descripción'}`
    : 'Costo jornada · sueldo mínimo'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal rem-modal"
        role="dialog"
        aria-label={titulo}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-body rem-body">
          <section className="rem-section">
            <h4>Entradas</h4>
            <div className="rem-grid">
              {numero(
                'sueldoLiquido',
                item
                  ? 'Sueldo líquido deseado'
                  : `Sueldo líquido (sueldo mínimo ${fmtCLP.format(params.imm)})`
              )}
              <label className="rem-field">
                <span>Tipo de contrato</span>
                <select
                  className="form-control"
                  value={inputs.tipoContrato}
                  disabled={!canEdit}
                  onChange={e =>
                    set('tipoContrato', e.target.value as PerfilInputs['tipoContrato'])
                  }
                >
                  <option value="Indefinido">Indefinido</option>
                  <option value="Plazo Fijo">Plazo fijo</option>
                </select>
              </label>
              <label className="rem-field">
                <span>Jornada semanal (h)</span>
                <input
                  type="number"
                  min={1}
                  max={45}
                  className="form-control"
                  value={inputs.jornadaSemanal}
                  disabled={!canEdit}
                  onChange={e => set('jornadaSemanal', Number(e.target.value) || 0)}
                />
              </label>
              {numero('colacionMensual', 'Colación mensual (no imponible)')}
              {numero('movilizacionMensual', 'Movilización mensual (no imponible)')}
              {numero('bonoVacacionesAnual', 'Bono de vacaciones (anual)')}
              {numero('aguinaldoFiestasPatriasAnual', 'Aguinaldo Fiestas Patrias (anual)')}
              {numero('aguinaldoNavidadAnual', 'Aguinaldo Navidad (anual)')}
              <label className="rem-check">
                <input
                  type="checkbox"
                  checked={inputs.seguroElectrico}
                  disabled={!canEdit}
                  onChange={e => set('seguroElectrico', e.target.checked)}
                />
                <span>Seguro de trabajos eléctricos (3,48 %)</span>
              </label>
            </div>
            <div className="rem-actions">
              <button
                type="button"
                className="btn-primary-sm"
                onClick={calcular}
                disabled={!canEdit || calculando || inputs.sueldoLiquido <= 0}
              >
                {calculando ? 'Calculando…' : 'Calcular'}
              </button>
              {desactualizado && (
                <span className="rem-hint">Cambiaste los datos: vuelve a calcular.</span>
              )}
            </div>
          </section>

          {error && <p className="rem-error">{error}</p>}

          {r && (
            <>
              <section className="rem-section">
                <h4>Haberes y descuentos</h4>
                <dl className="rem-dl">
                  <dt>Sueldo base</dt>
                  <dd>{pesos(r.base)}</dd>
                  <dt>Gratificación Art. 50</dt>
                  <dd>{pesos(r.gratificacion)}</dd>
                  <dt>Imponible</dt>
                  <dd>{pesos(r.imponible)}</dd>
                  <dt>Haberes totales</dt>
                  <dd>{pesos(r.haberes)}</dd>
                  <dt>AFP (fondo + comisión)</dt>
                  <dd>−{pesos(r.afp)}</dd>
                  <dt>Salud</dt>
                  <dd>−{pesos(r.salud)}</dd>
                  <dt>AFC trabajador</dt>
                  <dd>−{pesos(r.afcTrabajador)}</dd>
                  <dt>
                    {iuscEnCosto
                      ? 'Impuesto único (se suma al costo)'
                      : 'Impuesto único (referencia, fuera del costo)'}
                  </dt>
                  <dd>−{pesos(r.iusc)}</dd>
                  <dt>Líquido resultante</dt>
                  <dd>{pesos(r.liquido)}</dd>
                </dl>
              </section>

              <section className="rem-section">
                <h4>Costo empresa mensual</h4>
                <dl className="rem-dl">
                  <dt>Haberes (imponible + no imponibles)</dt>
                  <dd>{pesos(r.haberes)}</dd>
                  <dt>Cargas patronales (SIS, mutual, AFC, eléctrico)</dt>
                  <dd>{pesos(r.seguros)}</dd>
                  <dt>Provisiones (vacaciones + IAS)</dt>
                  <dd>{pesos(r.provisionVacaciones + r.provisionIas)}</dd>
                  {iuscEnCosto && (
                    <>
                      <dt>Impuesto único (incluido en el costo)</dt>
                      <dd>{pesos(r.iusc)}</dd>
                    </>
                  )}
                  <dt>Total mensual</dt>
                  <dd>{pesos(totalMensual)}</dd>
                </dl>
                <div className="rem-highlight">
                  <span>
                    {item
                      ? `Valor jornada (total mensual ÷ ${params.diasTrabajadosMes} días) → precio unitario`
                      : `Valor jornada (total mensual ÷ ${params.diasTrabajadosMes} días)`}
                  </span>
                  <strong>{pesos(r.valorJornada)}</strong>
                </div>
                <dl className="rem-dl">
                  <dt>Referencia planilla (÷ 30)</dt>
                  <dd>{pesos(r.costoLicitacionDiarioPlanilla)}</dd>
                  <dt>Factor costo / líquido</dt>
                  <dd>{r.factorK.toFixed(2).replace('.', ',')}</dd>
                </dl>
              </section>

              {r.alertas.length > 0 && (
                <ul className="rem-alertas">
                  {r.alertas.map(a => (
                    <li key={a}>⚠ {a}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-sm" onClick={onClose}>
            {item ? 'Cancelar' : 'Cerrar'}
          </button>
          {item && onApplied && (
            <button
              type="button"
              className="btn-primary-sm"
              onClick={aplicar}
              disabled={!canEdit || !r || saving || sinGuardar}
              title={sinGuardar ? 'Guarda el catálogo primero' : undefined}
            >
              {sinGuardar
                ? 'Guarda el catálogo primero'
                : saving
                  ? 'Aplicando…'
                  : 'Aplicar al precio unitario'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CalculoPerfilModal
