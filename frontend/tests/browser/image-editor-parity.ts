import { loadPhotoPreview, renderPhotoPreview, exportPhoto } from '../../src/api/imageEdit'
import { DEFAULT_EDITS, editPixels } from '../../src/utils/imageEdit'

async function decode(blob: Blob) {
  const image = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(image, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    canvas.width = canvas.height = 0
    return pixels
  } finally { image.close() }
}
function metrics(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let absolute = 0, squares = 0, maximum = 0, count = 0
  for (let i = 0; i < a.length; i++) if (i % 4 !== 3) {
    const delta = Math.abs(a[i] - b[i]); absolute += delta; squares += delta * delta
    maximum = Math.max(maximum, delta); count++
  }
  return { mae: absolute / count, rmse: Math.sqrt(squares / count), max: maximum }
}
document.querySelector<HTMLButtonElement>('#run')!.onclick = async () => {
  const output = document.querySelector('#result')!
  output.textContent = '正在读取真实 JPEG…'
  try {
    const signal = new AbortController().signal
    const base = await decode(await loadPhotoPreview(1, signal))
    const cases = []
    for (const adjustments of [{}, { exposure_ev: 1 }, { contrast: 50 }, { saturation: -100 }, { exposure_ev: 0.7, contrast: 25, saturation: -30 }]) {
      const edit = { ...DEFAULT_EDITS, ...adjustments }
      const local = editPixels(base.data, edit)
      const server = await decode(await renderPhotoPreview(1, edit, signal))
      if (base.width !== server.width || base.height !== server.height) throw new Error('Preview size mismatch')
      const difference = metrics(local, server.data)
      cases.push({ edit, ...difference, passed: difference.mae <= 3 && difference.rmse <= 8 })
    }
    const fullSize = await decode(await exportPhoto(2, { ...DEFAULT_EDITS, exposure_ev: 0.5 }, signal))
    output.textContent = JSON.stringify({ baseline: { width: base.width, height: base.height },
      tolerance: { mae: 3, rmse: 8, units: 'RGB uint8; JPEG + browser decode included' },
      cases, export: { width: fullSize.width, height: fullSize.height, passed: fullSize.width === 1551 && fullSize.height === 1818 },
      passed: cases.every(item => item.passed) && fullSize.width === 1551 && fullSize.height === 1818 }, null, 2)
  } catch (error) { output.textContent = JSON.stringify({ error: String(error), passed: false }) }
}
