/**
 * Calcula dónde cortar un documento largo en páginas sin partir bloques.
 *
 * Todas las medidas están en la misma unidad (píxeles de canvas).
 * - Un bloque nunca se parte entre dos páginas, salvo que sea más alto que una página.
 * - Un bloque marcado con keepWithNext (p. ej. un título) no queda al final de una página:
 *   se mueve junto con el bloque que le sigue.
 */

export interface PdfBlock {
  top: number
  bottom: number
  keepWithNext?: boolean
}

export interface PdfPageSlice {
  start: number
  end: number
}

export function computePageCuts(
  blocks: PdfBlock[],
  totalHeight: number,
  pageHeight: number
): PdfPageSlice[] {
  const slices: PdfPageSlice[] = []
  if (totalHeight <= 0 || pageHeight <= 0) return slices

  const sorted = blocks
    .filter(b => b.bottom > b.top)
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom)

  let start = 0
  while (start < totalHeight) {
    const maxEnd = start + pageHeight
    if (maxEnd >= totalHeight) {
      slices.push({ start, end: totalHeight })
      break
    }

    let end = maxEnd

    // Si el corte cae dentro de un bloque, subirlo al inicio de ese bloque.
    let moved = true
    while (moved) {
      moved = false
      for (const b of sorted) {
        if (b.top > start && b.top < end && b.bottom > end) {
          end = b.top
          moved = true
        }
      }
    }

    // Evitar que un título quede huérfano al final de la página.
    let lastFit: PdfBlock | null = null
    for (const b of sorted) {
      if (b.top >= start && b.bottom <= end) lastFit = b
    }
    if (lastFit && lastFit.keepWithNext && lastFit.top > start) {
      end = lastFit.top
    }

    // Bloque más alto que una página: no hay dónde subir, se corta en el límite.
    if (end <= start) end = maxEnd

    slices.push({ start, end })
    start = end
  }

  return slices
}
