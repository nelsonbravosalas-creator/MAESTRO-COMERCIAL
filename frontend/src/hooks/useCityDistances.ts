import { useEffect, useState } from 'react'

// La tabla de distancias entre ciudades pesa ~400 kB (matriz generada desde
// Excel): se carga solo cuando una pantalla la necesita, no con Cotizaciones.
type CityDistances = typeof import('../data/cityDistances')

let cargando: Promise<CityDistances> | null = null
export const loadCityDistances = () => (cargando ??= import('../data/cityDistances'))

export function useCityDistances(enabled = true): CityDistances | null {
  const [mod, setMod] = useState<CityDistances | null>(null)
  useEffect(() => {
    if (!enabled || mod) return
    let vigente = true
    loadCityDistances().then(m => {
      if (vigente) setMod(m)
    })
    return () => {
      vigente = false
    }
  }, [enabled, mod])
  return mod
}
