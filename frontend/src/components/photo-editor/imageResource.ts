export interface PhotoResource {
  image: CanvasImageSource
  width: number
  height: number
  sourceSha256?: string
  sourceWidth?: number
  sourceHeight?: number
  dispose: () => void
}

export async function decodePhoto(blob: Blob): Promise<PhotoResource> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    return { image: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() }
  }
  // Fallback keeps the URL only until decode completes, including decode failures.
  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('无法解码 JPEG 照片，请重试'))
      image.src = url
    })
    return { image, width: image.naturalWidth, height: image.naturalHeight,
      dispose: () => { image.src = '' } }
  } finally {
    image.onload = image.onerror = null
    URL.revokeObjectURL(url)
  }
}
