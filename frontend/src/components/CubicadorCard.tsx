import type { CubicadorCategoria, CubicadorItem, EstadoCubicador } from '../api/api'

// Nombres visibles de cada categoría, en el orden en que se muestran las tablas.
export const CATEGORIAS_CUBICADOR: ReadonlyArray<{ id: CubicadorCategoria; nombre: string }> = [
  { id: 'mat', nombre: 'Provisión de Materiales' },
  { id: 'ins', nombre: 'Insumos Industriales y Gases' },
  { id: 'mec', nombre: 'Materiales Mecánico' },
  { id: 'ele', nombre: 'Materiales Eléctricos' },
  { id: 'mo', nombre: 'Mano de obra' },
  { id: 'rep', nombre: 'Repuestos' },
  { id: 'log', nombre: 'Logística' },
]

// La fuente viene de una búsqueda web: solo se enlaza si es http(s), nunca javascript: u otros.
export function esUrlSegura(url: string | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

export function textoPrecio(item: CubicadorItem): string {
  if (item.estado_precio === 'sin_precio') return 'sin precio'
  if (item.estado_precio === 'pendiente' || item.precio_unitario == null) return 'pendiente'
  return `$${Math.round(item.precio_unitario).toLocaleString('es-CL')}`
}

const formatoNumero = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 })

interface Props {
  estado: EstadoCubicador
  onCubicar: () => void
  busy: boolean
}

function TablaCategoria({ nombre, items }: { nombre: string; items: CubicadorItem[] }) {
  return (
    <section className="cubicador-categoria">
      <h4>{nombre}</h4>
      <div className="cubicador-tabla-scroll">
        <table className="cubicador-tabla">
          <thead>
            <tr>
              <th scope="col">Ítem</th>
              <th scope="col">Cantidad</th>
              <th scope="col">Unidad</th>
              <th scope="col">Precio</th>
              <th scope="col">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>
                  {item.descripcion}
                  <details className="cubicador-formula">
                    <summary>Fórmula</summary>
                    <p>{item.formula}</p>
                  </details>
                </td>
                <td className="cubicador-num">{formatoNumero(item.cantidad)}</td>
                <td>{item.unidad}</td>
                <td className="cubicador-num">{textoPrecio(item)}</td>
                <td>
                  {esUrlSegura(item.fuente_url) ? (
                    <a href={item.fuente_url} target="_blank" rel="noopener noreferrer">
                      {item.tienda || 'Ver fuente'}
                    </a>
                  ) : (
                    <span>{item.tienda || item.fuente || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// Tarjeta del cubicador dentro del chat. El estado del botón viene solo de
// `compuerta.habilitado`: la compuerta la decide el servidor, no esta tarjeta.
export function CubicadorCard({ estado, onCubicar, busy }: Props) {
  const { compuerta, resultado } = estado
  const habilitado = compuerta.habilitado
  const faltan = compuerta.siguientes.length > 0 ? compuerta.siguientes : compuerta.faltantes
  const bloqueado = !habilitado || busy

  return (
    <div className="cubicador-card">
      <p className="cubicador-contador">
        {habilitado
          ? `${estado.datos_completos} de ${estado.datos_totales} datos · ${resultado?.supuestos.length ?? 0} supuestos`
          : `${compuerta.respondidas} de ${compuerta.requeridas} respuestas`}
      </p>

      <button
        type="button"
        className="btn-primary-sm cubicador-boton"
        onClick={() => {
          if (!bloqueado) onCubicar()
        }}
        disabled={bloqueado}
        aria-disabled={bloqueado}
      >
        {busy ? 'Cubicando…' : 'Cubicar'}
      </button>

      {!habilitado && (
        <div className="cubicador-faltan">
          {compuerta.motivo && <p>{compuerta.motivo}</p>}
          {faltan.length > 0 && (
            <>
              <p>Falta responder:</p>
              <ul>
                {faltan.map(f => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {resultado && (
        <div className="cubicador-resultado">
          {CATEGORIAS_CUBICADOR.map(cat => {
            const items = resultado.items.filter(i => i.categoria === cat.id)
            return items.length > 0 ? (
              <TablaCategoria key={cat.id} nombre={cat.nombre} items={items} />
            ) : null
          })}

          {resultado.dotacion && (
            <p className="cubicador-dotacion">
              Dotación: {resultado.dotacion.personas} personas × {resultado.dotacion.dias} días · HH
              calculadas {formatoNumero(resultado.dotacion.hh_calculadas)} · HH cotizadas{' '}
              {formatoNumero(resultado.dotacion.hh_cotizadas)} · holgura{' '}
              {formatoNumero(resultado.dotacion.holgura_hh)} HH
            </p>
          )}

          {resultado.supuestos.length > 0 && (
            <div className="cubicador-supuestos">
              <h4>Supuestos</h4>
              <ul>
                {resultado.supuestos.map(s => (
                  <li
                    key={s.clave}
                    className={s.critico ? 'cubicador-supuesto--critico' : undefined}
                  >
                    {s.critico && <strong>Crítico: </strong>}
                    {s.texto}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultado.advertencias.length > 0 && (
            <div className="cubicador-advertencias">
              <h4>Advertencias</h4>
              <ul>
                {resultado.advertencias.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CubicadorCard
