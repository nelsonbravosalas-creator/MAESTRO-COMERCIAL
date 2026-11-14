import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { computePageCuts, type PdfBlock } from './pdfPageCuts'

// Márgenes de cada página del PDF (mm). Se aplican igual en todas las páginas.
const MARGIN_TOP_MM = 20
const MARGIN_BOTTOM_MM = 18

// Elementos que no deben partirse entre dos páginas.
const UNBREAKABLE_SELECTOR = 'tr, .doc-list-item, .doc-footer, .doc-letterhead, [data-pdf-keep]'
// Títulos que no deben quedar al final de una página.
const KEEP_WITH_NEXT_SELECTOR =
  '.doc-section-title, .doc-group-title, h1, h2, h3, [data-pdf-keep-next]'

function collectBlocks(element: HTMLElement, originTop: number, ratio: number): PdfBlock[] {
  const blocks: PdfBlock[] = []
  const add = (selector: string, keepWithNext: boolean) => {
    element.querySelectorAll<HTMLElement>(selector).forEach(node => {
      const r = node.getBoundingClientRect()
      // Elementos ocultos durante la exportación no ocupan espacio.
      if (r.height === 0) return
      blocks.push({
        top: (r.top - originTop) * ratio,
        bottom: (r.bottom - originTop) * ratio,
        keepWithNext,
      })
    })
  }
  add(UNBREAKABLE_SELECTOR, false)
  add(KEEP_WITH_NEXT_SELECTOR, true)
  return blocks
}

export async function downloadPdfFromElement(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  element.classList.add('pdf-exporting')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  try {
    await document.fonts.ready
    const elementRect = element.getBoundingClientRect()
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    // Píxeles de canvas por píxel CSS del elemento, y por milímetro de página.
    const ratio = canvas.width / (elementRect.width || 1)
    const pxPerMm = canvas.width / pageWidth
    const contentHeightPx = (pageHeight - MARGIN_TOP_MM - MARGIN_BOTTOM_MM) * pxPerMm

    const blocks = collectBlocks(element, elementRect.top, ratio)
    const slices = computePageCuts(blocks, canvas.height, contentHeightPx)

    slices.forEach((slice, index) => {
      if (index > 0) pdf.addPage()
      const sliceHeight = slice.end - slice.start

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = Math.ceil(sliceHeight)
      const ctx = pageCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        ctx.drawImage(
          canvas,
          0,
          slice.start,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        )
      }

      pdf.addImage(
        pageCanvas.toDataURL('image/png'),
        'PNG',
        0,
        MARGIN_TOP_MM,
        pageWidth,
        sliceHeight / pxPerMm
      )
    })

    pdf.save(fileName)
  } finally {
    element.classList.remove('pdf-exporting')
  }
}
