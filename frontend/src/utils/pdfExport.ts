import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export async function downloadPdfFromElement(element: HTMLElement, fileName: string): Promise<void> {
  element.classList.add('pdf-exporting')
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  try {
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
    const imageHeight = (canvas.height * pageWidth) / canvas.width
    const image = canvas.toDataURL('image/png')

    let y = 0
    let remainingHeight = imageHeight
    pdf.addImage(image, 'PNG', 0, y, pageWidth, imageHeight)
    remainingHeight -= pageHeight

    while (remainingHeight > 0) {
      y -= pageHeight
      pdf.addPage()
      pdf.addImage(image, 'PNG', 0, y, pageWidth, imageHeight)
      remainingHeight -= pageHeight
    }

    pdf.save(fileName)
  } finally {
    element.classList.remove('pdf-exporting')
  }
}
