import { useEffect, useState } from 'react'

// La tabla de distancias entre ciudades pesa ~400 kB (matriz generada desde
// Excel): se carga solo cuando una pantalla la necesita, no con Cotizaciones.
type CityDistances = typeof import('../data/cityDistances')

let cargando: Promise<CityDistances> | null = null

export function loadCityDistances(): Promise<CityDistances> {
  if (!cargando) {
    cargando = import('../data/cityDistances').catch(err => {
      // No cachear una promesa rechazada: un chunk 404 (deploy con hash de
      // archivo viejo) debe poder reintentarse en el próximo mount, no
      // quedar envenenado hasta que el usuario recargue toda la página.
      cargando = null
      throw err
    })
  }
  return cargando
}

const MAX_REINTENTOS = 3

export function useCityDistances(enabled = true): CityDistances | null {
  const [mod, setMod] = useState<CityDistances | null>(null)
  useEffect(() => {
    if (!enabled || mod) return
    let vigente = true
    let reintentos = 0
    const intentar = () => {
      loadCityDistances()
        .then(m => {
          if (vigente) setMod(m)
        })
        .catch(() => {
          // Reintento con backoff por si fue un corte de red puntual; si el
          // chunk de verdad ya no existe (deploy), loadCityDistances() ya
          // limpió el caché y un nuevo mount (cambiar de pestaña y volver)
          // lo reintentará igual sin necesitar un reload completo.
          if (!vigente || reintentos >= MAX_REINTENTOS) return
          reintentos += 1
          setTimeout(intentar, 1000 * reintentos)
        })
    }
    intentar()
    return () => {
      vigente = false
    }
  }, [enabled, mod])
  return mod
}
