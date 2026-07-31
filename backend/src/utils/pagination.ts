// A-11: paginación keyset por (created_at, id) DESC — estable incluso si se
// insertan filas nuevas mientras alguien recorre las páginas (a diferencia de
// OFFSET, que puede saltarse u omitir filas bajo escritura concurrente).

export interface CursorPage {
  data: any[]
  next_cursor: string | null
  has_more: boolean
}

interface CursorValue {
  created_at: string
  id: string
}

export function decodeCursor(cursor: string | undefined): CursorValue | null {
  if (!cursor) return null
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'))
    if (typeof decoded?.created_at !== 'string' || typeof decoded?.id !== 'string') return null
    return decoded
  } catch {
    return null
  }
}

export function encodeCursor(row: { created_at: string | Date; id: string }): string {
  const value: CursorValue = { created_at: new Date(row.created_at).toISOString(), id: row.id }
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url')
}

// Arma la página: pide `limit + 1` filas (ya lo hizo el caller) y esta función
// decide si hay más y arma el cursor de la última fila retenida.
export function buildPage(rows: any[], limit: number): CursorPage {
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const last = data[data.length - 1]
  return {
    data,
    next_cursor: hasMore && last ? encodeCursor(last) : null,
    has_more: hasMore,
  }
}
