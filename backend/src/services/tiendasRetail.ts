// Tiendas retail permitidas para precios y los dominios que las identifican.
// Una muestra se acredita por el dominio de su URL, no por la etiqueta que escribe el modelo.

// validar dominios reales
export const TIENDAS_RETAIL_HOSTS: Record<string, string[]> = {
  Sodimac: ['sodimac.cl'],
  Easy: ['easy.cl'],
  Imperial: ['imperial.cl'],
  'Punto Maestro': ['puntomaestro.cl'],
}

export const TIENDAS_RETAIL = Object.keys(TIENDAS_RETAIL_HOSTS)

export interface TiendaResuelta {
  /** Nombre canónico (por host; si no, por etiqueta; si no, la etiqueta tal cual). */
  tienda: string
  /** true solo si el host de la URL pertenece a una tienda retail conocida. */
  porHost: boolean
}

function hostDe(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Tienda canónica de un host, o null si no es de ninguna tienda conocida. */
export function tiendaPorHost(url: string): string | null {
  const host = hostDe(url)
  if (!host) return null
  for (const [tienda, hosts] of Object.entries(TIENDAS_RETAIL_HOSTS)) {
    if (hosts.some(h => host === h || host.endsWith(`.${h}`))) return tienda
  }
  return null
}

/** Resuelve la tienda de una muestra: primero por host y luego por etiqueta. */
export function resolverTienda(etiqueta: string, url: string): TiendaResuelta {
  const porHost = tiendaPorHost(url)
  if (porHost) return { tienda: porHost, porHost: true }
  const e = etiqueta.trim().toLowerCase()
  const porEtiqueta = TIENDAS_RETAIL.find(t => e.includes(t.toLowerCase()))
  return { tienda: porEtiqueta ?? etiqueta.trim(), porHost: false }
}
