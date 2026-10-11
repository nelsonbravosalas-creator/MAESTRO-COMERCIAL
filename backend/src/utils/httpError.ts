/**
 * Error enriquecido con status HTTP y payload JSON opcional. Reemplaza el
 * patron repetido `new Error(msg) as any; err.status = ...` por un tipo
 * concreto, sin cambiar el comportamiento (sigue siendo una instancia de
 * Error con props extra, solo que ahora tipadas).
 */
export interface HttpError extends Error {
  status?: number
  payload?: Record<string, unknown>
  cause?: unknown
}

export function httpError(
  message: string,
  status: number,
  payload?: Record<string, unknown>
): HttpError {
  const err = new Error(message) as HttpError
  err.status = status
  if (payload) err.payload = payload
  return err
}

export function asHttpError(error: unknown): HttpError {
  return error as HttpError
}
