import Tesseract, { createWorker } from 'tesseract.js'

export async function preprocessImage(file: File, cropRightColumn = false): Promise<string> {
  const img = await fileToImage(file)
  const { width, height } = limitSize(img, 1800)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  canvas.width = width
  canvas.height = height
  ctx.drawImage(img, 0, 0, width, height)

  if (cropRightColumn) {
    const x = Math.floor(width * 0.55)
    const w = width - x
    const tmp = document.createElement('canvas')
    tmp.width = w; tmp.height = height
    tmp.getContext('2d')!.drawImage(canvas, x, 0, w, height, 0, 0, w, height)
    canvas.width = w; canvas.height = height
    ctx.clearRect(0, 0, w, height)
    ctx.drawImage(tmp, 0, 0)
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imgData.data
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    const v = gray > 180 ? 255 : 0
    data[i] = data[i + 1] = data[i + 2] = v
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/png')
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

function limitSize(img: HTMLImageElement, max: number) {
  const r = Math.max(img.width, img.height) / max
  return r <= 1
    ? { width: img.width, height: img.height }
    : { width: Math.round(img.width / r), height: Math.round(img.height / r) }
}

export async function createFastWorker(onProgress?: (p: number, stage?: string) => void) {
  const worker = await createWorker('eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
    langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/lang',
    logger: (m) => {
      if (m.status && typeof m.progress === 'number') {
        onProgress?.(m.progress, m.status)
      }
    },
  })
  return worker
}

export const numericConfig = {
  tessedit_char_whitelist: '0123456789,，.．',
  classify_bln_numeric_mode: '1',
  preserve_interword_spaces: '0',
  tessedit_pageseg_mode: '6',
}
