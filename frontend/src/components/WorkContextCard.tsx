import { useEffect, useRef, useState } from 'react'
import { api } from '../api/api'
import { useMaestro, useActiveQuotation } from '../stores/maestro-store'
import { getErrorMessage } from '../utils/apiError'
import type { WorkContext, WorkMagnitud, WorkRecursos, WorkTipo } from '../types'

const MAX_MAGNITUDES = 20
const MAX_NOTA = 500

const TIPOS: { value: WorkTipo; label: string }[] = [
  { value: 'correctivo', label: 'Correctivo' },
  { value: 'preventivo', label: 'Preventivo' },
  { value: 'instalacion', label: 'Instalación' },
  { value: 'mantencion_contrato', label: 'Mantención de contrato' },
  { value: 'otro', label: 'Otro' },
]

const emptyWorkContext = (): WorkContext => ({
  v: 1,
  tipo: 'correctivo',
  alcance: '',
  magnitudes: [],
  dias: { plazo: null, tipo_plazo: 'corridos', terreno: null },
})

const cloneRecursos = (r: WorkRecursos): WorkRecursos => ({
  dotacion: r.dotacion.map(x => ({ ...x })),
  horas: r.horas,
  materiales: r.materiales.map(x => ({ ...x })),
  subcontratos: r.subcontratos.map(x => ({ ...x })),
})

const numOrNull = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

type Notice = { kind: 'warning' | 'success'; text: string } | null

export function WorkContextCard() {
  const { patchActive, saveActive, unsaved } = useMaestro()
  const q = useActiveQuotation()
  const stored = q?.work_context
  const wc: WorkContext = stored ?? emptyWorkContext()

  const [analyzing, setAnalyzing] = useState(false)
  const [learning, setLearning] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [learnNotice, setLearnNotice] = useState<Notice>(null)
  const [recursos, setRecursos] = useState<WorkRecursos | null>(null)
  const [nota, setNota] = useState(stored?.nota ?? '')

  // No se usa key={q.id}: guardar un borrador local (q-*) cambia el id a mitad
  // del análisis y un remonte perdería spinner, aviso y los recursos editables.
  // Los recursos editables se derivan de la proyección guardada; el estado de
  // aviso/nota solo se reinicia al cambiar de cotización estando inactivo.
  const busyRef = useRef(false)
  useEffect(() => {
    busyRef.current = analyzing || learning
  }, [analyzing, learning])
  const proyGenerada = stored?.proyeccion?.generada_en
  const activeQuotationId = q?.id
  useEffect(() => {
    const st = useMaestro.getState()
    const cur = st.quotations.find(x => x.id === st.activeId)?.work_context
    setRecursos(
      cur?.proyeccion ? cloneRecursos(cur.recursos_finales ?? cur.proyeccion.recursos) : null
    )
  }, [proyGenerada, activeQuotationId])
  const prevIdRef = useRef(activeQuotationId)
  useEffect(() => {
    if (prevIdRef.current === activeQuotationId) return
    prevIdRef.current = activeQuotationId
    if (busyRef.current) return
    const cur = useMaestro.getState().quotations.find(x => x.id === activeQuotationId)
    setNotice(null)
    setLearnNotice(null)
    setNota(cur?.work_context?.nota ?? '')
  }, [activeQuotationId])

  if (!q) return null
  const busy = analyzing || learning

  // Editar un campo conserva proyeccion y recursos_finales intactos (spread).
  const update = (fields: Partial<WorkContext>) =>
    patchActive({ work_context: { ...wc, ...fields } })

  const setMagnitud = (i: number, fields: Partial<WorkMagnitud>) =>
    update({ magnitudes: wc.magnitudes.map((m, idx) => (idx === i ? { ...m, ...fields } : m)) })

  const saveIfNeeded = async () => {
    const st = useMaestro.getState()
    if (st.unsaved || st.activeId?.startsWith('q-')) await saveActive()
  }

  const handleAnalyze = async () => {
    setNotice(null)
    setAnalyzing(true)
    try {
      try {
        await saveIfNeeded()
      } catch (err) {
        setNotice({
          kind: 'warning',
          text: `No se pudo guardar la cotización, por eso no se analizó: ${getErrorMessage(err)}`,
        })
        return
      }
      const st = useMaestro.getState()
      const current = st.quotations.find(x => x.id === st.activeId)
      const base = current?.work_context ?? wc
      const { proyeccion: _old, recursos_finales: _fin, nota: _n, ...input } = base
      void _old
      void _fin
      void _n
      try {
        const res = await api.analyzeWorkContext(st.activeId as string, input as WorkContext)
        patchActive({ work_context: { ...base, proyeccion: res.proyeccion } })
        setRecursos(cloneRecursos(res.proyeccion.recursos))
        try {
          await saveActive()
        } catch (err) {
          setNotice({
            kind: 'warning',
            text: `El análisis se generó, pero no se pudo guardar la proyección: ${getErrorMessage(err)}`,
          })
        }
      } catch (err) {
        setNotice({
          kind: 'warning',
          text: `La cotización se guardó igualmente, pero no se pudo analizar el contexto: ${getErrorMessage(err)}`,
        })
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const handleLearn = async () => {
    if (!recursos) return
    setLearnNotice(null)
    setLearning(true)
    try {
      await saveIfNeeded()
      const st = useMaestro.getState()
      await api.learnWorkContext(st.activeId as string, recursos, nota.trim() || undefined)
      setLearnNotice({ kind: 'success', text: 'Ejemplo guardado. Se usará en próximos análisis.' })
    } catch (err) {
      setLearnNotice({
        kind: 'warning',
        text: `No se pudo guardar el ejemplo: ${getErrorMessage(err)}`,
      })
    } finally {
      setLearning(false)
    }
  }

  const proy = wc.proyeccion
  const setRec = (fn: (r: WorkRecursos) => WorkRecursos) => setRecursos(r => (r ? fn(r) : r))

  return (
    <div className="base-card work-context-card" data-testid="work-context-card">
      <div className="base-card-title">Contexto del trabajo</div>

      <div className="base-row">
        <label htmlFor="wc-tipo">Tipo de trabajo</label>
        <select
          id="wc-tipo"
          className="base-input"
          value={wc.tipo}
          onChange={e => update({ tipo: e.target.value as WorkTipo })}
        >
          {TIPOS.map(t => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {wc.tipo === 'otro' && (
        <div className="base-row">
          <label htmlFor="wc-tipo-otro">Especificar</label>
          <input
            id="wc-tipo-otro"
            className="base-input"
            maxLength={120}
            value={wc.tipo_otro ?? ''}
            onChange={e => update({ tipo_otro: e.target.value })}
            placeholder="Tipo de trabajo"
          />
        </div>
      )}

      <div className="base-row wc-block">
        <label htmlFor="wc-alcance">Alcance</label>
        <div className="wc-field">
          <textarea
            id="wc-alcance"
            className="base-input"
            rows={4}
            maxLength={4000}
            value={wc.alcance}
            onChange={e => update({ alcance: e.target.value })}
            placeholder="Qué se hace y qué NO se hace"
          />
          <span className="base-hint">Describe qué se hace y qué NO se hace.</span>
          <span className="wc-pii-notice" role="note">
            No escribas RUT, correos, teléfonos ni nombres de contacto: este texto se envía a un
            servicio externo.
          </span>
        </div>
      </div>

      <div className="base-row wc-block">
        <label>Magnitudes</label>
        <div className="wc-field">
          {wc.magnitudes.map((m, i) => (
            <div className="wc-mag-row" key={i}>
              <input
                className="base-input"
                aria-label={`Magnitud ${i + 1} clave`}
                placeholder="Clave (ej. equipos)"
                maxLength={80}
                value={m.clave}
                onChange={e => setMagnitud(i, { clave: e.target.value })}
              />
              <input
                className="base-input"
                type="number"
                aria-label={`Magnitud ${i + 1} valor`}
                placeholder="Valor"
                value={Number.isFinite(m.valor) ? m.valor : ''}
                onChange={e => setMagnitud(i, { valor: Number(e.target.value) })}
              />
              <input
                className="base-input"
                aria-label={`Magnitud ${i + 1} unidad`}
                placeholder="Unidad"
                maxLength={30}
                value={m.unidad}
                onChange={e => setMagnitud(i, { unidad: e.target.value })}
              />
              <button
                type="button"
                className="wc-btn"
                aria-label={`Quitar magnitud ${i + 1}`}
                onClick={() => update({ magnitudes: wc.magnitudes.filter((_, idx) => idx !== i) })}
              >
                Quitar
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="wc-btn"
              disabled={wc.magnitudes.length >= MAX_MAGNITUDES}
              onClick={() =>
                update({ magnitudes: [...wc.magnitudes, { clave: '', valor: 0, unidad: '' }] })
              }
            >
              + Agregar magnitud
            </button>
            {wc.magnitudes.length >= MAX_MAGNITUDES && (
              <span className="base-hint"> Máximo {MAX_MAGNITUDES}.</span>
            )}
          </div>
        </div>
      </div>

      <div className="base-row">
        <label htmlFor="wc-plazo">Plazo (días)</label>
        <input
          id="wc-plazo"
          className="base-input wc-num"
          type="number"
          min={0}
          max={3650}
          value={wc.dias.plazo ?? ''}
          onChange={e => update({ dias: { ...wc.dias, plazo: numOrNull(e.target.value) } })}
        />
        <select
          className="base-input wc-num"
          aria-label="Tipo de plazo"
          value={wc.dias.tipo_plazo}
          onChange={e =>
            update({
              dias: { ...wc.dias, tipo_plazo: e.target.value as 'corridos' | 'habiles' },
            })
          }
        >
          <option value="corridos">Corridos</option>
          <option value="habiles">Hábiles</option>
        </select>
      </div>
      <div className="base-row">
        <label htmlFor="wc-terreno">Días en terreno</label>
        <input
          id="wc-terreno"
          className="base-input wc-num"
          type="number"
          min={0}
          max={3650}
          value={wc.dias.terreno ?? ''}
          onChange={e => update({ dias: { ...wc.dias, terreno: numOrNull(e.target.value) } })}
        />
      </div>

      <div className="base-row wc-block">
        <label htmlFor="wc-supuestos">Supuestos y restricciones</label>
        <textarea
          id="wc-supuestos"
          className="base-input"
          rows={2}
          maxLength={2000}
          value={wc.supuestos ?? ''}
          onChange={e => update({ supuestos: e.target.value })}
          placeholder="Opcional"
        />
      </div>

      <div className="wc-actions">
        <button type="button" className="btn-save-quote" onClick={handleAnalyze} disabled={busy}>
          {analyzing ? 'Analizando…' : 'Analizar contexto'}
        </button>
        {unsaved && <span className="base-hint">Se guardará la cotización antes de analizar.</span>}
      </div>

      {notice && (
        <div className={`wc-notice wc-notice-${notice.kind}`} role="alert">
          {notice.text}
        </div>
      )}

      {proy && (
        <div className="wc-proyeccion" data-testid="work-context-proyeccion">
          <div className="base-card-title">Proyección de recursos</div>
          <p className="wc-just">{proy.justificacion}</p>
          <ul className="wc-list">
            <li>
              <strong>Dotación:</strong>{' '}
              {proy.recursos.dotacion.length
                ? proy.recursos.dotacion.map(d => `${d.cantidad} ${d.rol}`).join(', ')
                : '—'}
            </li>
            <li>
              <strong>Horas:</strong> {proy.recursos.horas}
            </li>
            <li>
              <strong>Materiales:</strong>{' '}
              {proy.recursos.materiales.length
                ? proy.recursos.materiales
                    .map(m => `${m.cantidad} ${m.unidad} ${m.desc}`)
                    .join('; ')
                : '—'}
            </li>
            <li>
              <strong>Subcontratos:</strong>{' '}
              {proy.recursos.subcontratos.length
                ? proy.recursos.subcontratos
                    .map(s =>
                      s.monto_estimado != null ? `${s.desc} (${s.monto_estimado})` : s.desc
                    )
                    .join('; ')
                : '—'}
            </li>
          </ul>

          {recursos && (
            <div className="wc-final" data-testid="work-context-final">
              <div className="base-card-title">Recursos finales (editables)</div>
              {recursos.dotacion.map((d, i) => (
                <div className="wc-mag-row" key={`d${i}`}>
                  <input
                    className="base-input"
                    aria-label={`Rol ${i + 1}`}
                    value={d.rol}
                    onChange={e =>
                      setRec(r => ({
                        ...r,
                        dotacion: r.dotacion.map((x, j) =>
                          j === i ? { ...x, rol: e.target.value } : x
                        ),
                      }))
                    }
                  />
                  <input
                    className="base-input"
                    type="number"
                    min={0}
                    aria-label={`Cantidad rol ${i + 1}`}
                    value={d.cantidad}
                    onChange={e =>
                      setRec(r => ({
                        ...r,
                        dotacion: r.dotacion.map((x, j) =>
                          j === i ? { ...x, cantidad: Number(e.target.value) } : x
                        ),
                      }))
                    }
                  />
                </div>
              ))}
              <div className="base-row">
                <label htmlFor="wc-horas">Horas</label>
                <input
                  id="wc-horas"
                  className="base-input wc-num"
                  type="number"
                  min={0}
                  value={recursos.horas}
                  onChange={e => setRec(r => ({ ...r, horas: Number(e.target.value) }))}
                />
              </div>
              {recursos.materiales.map((m, i) => (
                <div className="wc-mag-row" key={`m${i}`}>
                  <input
                    className="base-input"
                    aria-label={`Material ${i + 1}`}
                    value={m.desc}
                    onChange={e =>
                      setRec(r => ({
                        ...r,
                        materiales: r.materiales.map((x, j) =>
                          j === i ? { ...x, desc: e.target.value } : x
                        ),
                      }))
                    }
                  />
                  <input
                    className="base-input"
                    type="number"
                    min={0}
                    aria-label={`Cantidad material ${i + 1}`}
                    value={m.cantidad}
                    onChange={e =>
                      setRec(r => ({
                        ...r,
                        materiales: r.materiales.map((x, j) =>
                          j === i ? { ...x, cantidad: Number(e.target.value) } : x
                        ),
                      }))
                    }
                  />
                  <input
                    className="base-input"
                    aria-label={`Unidad material ${i + 1}`}
                    value={m.unidad}
                    onChange={e =>
                      setRec(r => ({
                        ...r,
                        materiales: r.materiales.map((x, j) =>
                          j === i ? { ...x, unidad: e.target.value } : x
                        ),
                      }))
                    }
                  />
                </div>
              ))}
              {recursos.subcontratos.map((s, i) => (
                <div className="wc-mag-row" key={`s${i}`}>
                  <input
                    className="base-input"
                    aria-label={`Subcontrato ${i + 1}`}
                    value={s.desc}
                    onChange={e =>
                      setRec(r => ({
                        ...r,
                        subcontratos: r.subcontratos.map((x, j) =>
                          j === i ? { ...x, desc: e.target.value } : x
                        ),
                      }))
                    }
                  />
                  <input
                    className="base-input"
                    type="number"
                    min={0}
                    aria-label={`Monto subcontrato ${i + 1}`}
                    value={s.monto_estimado ?? ''}
                    onChange={e =>
                      setRec(r => ({
                        ...r,
                        subcontratos: r.subcontratos.map((x, j) => {
                          if (j !== i) return x
                          const monto = numOrNull(e.target.value)
                          const { monto_estimado: _m, ...rest } = x
                          void _m
                          return monto == null ? rest : { ...rest, monto_estimado: monto }
                        }),
                      }))
                    }
                  />
                </div>
              ))}
              <div className="base-row wc-block">
                <label htmlFor="wc-nota">Nota</label>
                <textarea
                  id="wc-nota"
                  className="base-input"
                  rows={2}
                  maxLength={MAX_NOTA}
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  placeholder="Qué se ajustó y por qué (máx. 500)"
                />
              </div>
              <div className="wc-actions">
                <button type="button" className="wc-btn" onClick={handleLearn} disabled={busy}>
                  {learning ? 'Guardando…' : 'Guardar como ejemplo'}
                </button>
              </div>
              {learnNotice && (
                <div
                  className={`wc-notice wc-notice-${learnNotice.kind}`}
                  role={learnNotice.kind === 'warning' ? 'alert' : 'status'}
                >
                  {learnNotice.text}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
