// Contrato de tipos del cubicador. Las tareas siguientes importan de aqui:
// no cambiar las formas sin actualizar a todos los consumidores.
// El LLM nunca calcula cantidades: las calcula el codigo del perfil.

export type PerfilId = 'hvac' | 'cierre_metalico'
export type EstadoPregunta = 'pendiente' | 'respondida' | 'no_sabe'
export type CategoriaLinea = 'mo' | 'log' | 'mat' | 'rep' | 'ins' | 'mec' | 'ele'
export interface Supuesto {
  clave: string
  texto: string
  critico: boolean
}
export interface Ficha {
  descripcion: string
  datos: Record<string, unknown>
  no_sabe: string[]
  supuestos: Supuesto[]
}
export interface ItemListado {
  id: string
  categoria: CategoriaLinea
  descripcion: string
  unidad: string
  cantidad: number
  dias: number
  formula: string
  precio_unitario: number | null
  fuente: 'catalogo' | 'cache' | 'tienda' | null
  tienda?: string
  fuente_url?: string
  estado_precio: 'pendiente' | 'con_precio' | 'sin_precio'
}
export interface ResultadoCubicacion {
  items: ItemListado[]
  supuestos: Supuesto[]
  advertencias: string[]
  dotacion: {
    personas: number
    dias: number
    hh_calculadas: number
    hh_cotizadas: number
    holgura_hh: number
  } | null
}
export interface Borrador {
  id: string
  user_id: string
  tenant_id: string | null
  quotation_id: string | null
  perfil: PerfilId
  estado: 'entrevista' | 'cubicado' | 'ingresado' | 'cancelado'
  ficha: Ficha
  resultado: ResultadoCubicacion | null
  version: number
  expires_at: string
}
