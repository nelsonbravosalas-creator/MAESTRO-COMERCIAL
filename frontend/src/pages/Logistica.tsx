import { useState } from 'react'
import '../styles/Logistica.css'
import { useCityDistances } from '../hooks/useCityDistances'

function DistanciasCiudades() {
  const [destino, setDestino] = useState('')
  const [origen, setOrigen] = useState('')
  // La tabla de distancias (~400 kB) se carga solo al abrir esta pantalla,
  // no junto con Cotizaciones (ver hooks/useCityDistances.ts, fase F7).
  const mod = useCityDistances()
  const CITIES = mod?.CITIES ?? []

  const distancia = mod && destino && origen ? mod.getDistance(origen, destino) : null

  const swap = () => {
    setOrigen(destino)
    setDestino(origen)
  }

  return (
    <div className="log-widget">
      {/* Header strip */}
      <div className="log-widget-header">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
        <span>Traslados a regiones</span>
        <span className="log-widget-cities">{mod ? `${CITIES.length} ciudades` : 'Cargando…'}</span>
      </div>

      {/* Ledger table */}
      <div className="log-ledger">
        {/* Row 1 — Ciudad destino */}
        <div className="log-row">
          <span className="log-row-label">Ciudad destino</span>
          <div className="log-row-select-wrap">
            <select
              className="log-row-select"
              value={destino}
              onChange={e => setDestino(e.target.value)}
              aria-label="Ciudad destino"
              disabled={!mod}
            >
              <option value="">{mod ? '— seleccionar —' : 'Cargando ciudades…'}</option>
              {CITIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="log-row-result log-row-result--empty">
            {destino && origen && (
              <button
                type="button"
                className="log-swap"
                onClick={swap}
                title="Invertir ciudades"
                aria-label="Invertir ciudades"
              >
                ⇅
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="log-divider" />

        {/* Row 2 — Ciudad origen */}
        <div className="log-row">
          <span className="log-row-label">Ciudad de origen</span>
          <div className="log-row-select-wrap">
            <select
              className="log-row-select"
              value={origen}
              onChange={e => setOrigen(e.target.value)}
              aria-label="Ciudad de origen"
              disabled={!mod}
            >
              <option value="">{mod ? '— seleccionar —' : 'Cargando ciudades…'}</option>
              {CITIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="log-row-result">
            {distancia !== null ? (
              <span className="log-km" key={`${origen}-${destino}`}>
                {distancia.toLocaleString('es-CL')}
                <em> km</em>
              </span>
            ) : destino && origen ? (
              <span className="log-km-none">sin dato</span>
            ) : (
              <span className="log-km-placeholder">— km</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Logistica() {
  return (
    <div className="logistica-root">
      <div className="log-page-header">
        <h1 className="log-page-title">Logística</h1>
        <span className="log-page-sub">Herramientas de apoyo a cotización</span>
      </div>
      <div className="log-page-body">
        <DistanciasCiudades />
      </div>
    </div>
  )
}
