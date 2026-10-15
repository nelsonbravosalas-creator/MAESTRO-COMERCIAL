import { ApiError } from '../api/api'

/**
 * Extrae de forma segura y tipada el mensaje de error legible para el usuario,
 * respetando instancias de ApiError devueltas por el cliente HTTP del backend.
 */
export function getErrorMessage(
  error: unknown,
  fallback = 'Ha ocurrido un error inesperado'
): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }
  return fallback
}
