import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Renders each PDF page to a JPEG and returns the base64 payloads (without the
// data: prefix). Sending page images — rather than extracted text — lets the
// multimodal model read scanned / image-only PDFs (e.g. Tamil textbook scans)
// that have no selectable text layer.
export async function extractPdfPageImages(file, { scale = 2, quality = 0.85 } = {}) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const images = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const canvasContext = canvas.getContext('2d')

    await page.render({ canvasContext, viewport }).promise

    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    images.push(dataUrl.split(',')[1]) // strip "data:image/jpeg;base64,"

    // Release the canvas memory before rendering the next page.
    canvas.width = 0
    canvas.height = 0
    page.cleanup()
  }
  return images
}
