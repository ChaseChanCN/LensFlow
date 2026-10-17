import { canvasGeometry } from './canvasGeometry'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { editPixels, fitPhoto, type ImageEdits } from '@/utils/imageEdit'
import { geometryOf, normalizeEdits } from '@/utils/imageEdit'
import { transformedSize, pixelCropBox } from '@/utils/imageGeometry'
import { CropOverlay } from './CropOverlay'
import type { CropSession } from './GeometryPanel'
import type { PhotoResource } from './imageResource'

function baselinePixels(base: PhotoResource, maxSide: number): ImageData {
  const scale = Math.min(1, maxSide / Math.max(base.width, base.height))
  const scratch = document.createElement('canvas')
  scratch.width = Math.max(1, Math.round(base.width * scale))
  scratch.height = Math.max(1, Math.round(base.height * scale))
  const context = scratch.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前浏览器无法使用 Canvas 2D')
  context.drawImage(base.image, 0, 0, scratch.width, scratch.height)
  const result = context.getImageData(0, 0, scratch.width, scratch.height)
  scratch.width = scratch.height = 0
  return result
}

export function PhotoViewport({ base, edit, authoritative, crop, onCropChange, onCropCancel }: {
  base: PhotoResource; edit: ImageEdits; authoritative?: PhotoResource
  crop?: CropSession | null; onCropChange?: (crop: CropSession) => void; onCropCancel?: () => void
}) {
  const cropping=!!crop
  const displayEdit=useMemo(()=>cropping ? {...normalizeEdits(edit),geometry:{...geometryOf(edit),crop:null}} : edit,[edit,cropping])
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const cache = useRef<{ base: PhotoResource; full: ImageData; fast: ImageData } | null>(null)
  const [bounds, setBounds] = useState({ width: 640, height: 480 })
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = stage.current
    if (!element) return
    const measure = () => setBounds({ width: Math.max(1, element.clientWidth - 24), height: Math.max(1, element.clientHeight - 24) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let frame = 0
    const draw = (refined: boolean) => {
      try {
        const element = canvas.current, context = element?.getContext('2d')
        if (!element || !context) throw new Error('当前浏览器无法使用 Canvas 2D')
        if (authoritative && !cropping) {
          element.width = authoritative.width; element.height = authoritative.height
          context.drawImage(authoritative.image, 0, 0)
          element.dataset.previewSource = 'server'
        } else {
          if (cache.current?.base !== base) cache.current = {
            base, full: baselinePixels(base, 1024), fast: baselinePixels(base, 512),
          }
          const pixels = refined ? cache.current.full : cache.current.fast
          const transformed=canvasGeometry(pixels,geometryOf(displayEdit),base.sourceWidth??base.width,base.sourceHeight??base.height)
          element.width = transformed.width; element.height = transformed.height
          context.putImageData(new ImageData(editPixels(transformed.data, displayEdit), transformed.width, transformed.height), 0, 0)
          element.dataset.previewSource = refined ? 'local-refined' : 'local-live'
        }
        setError('')
      } catch (caught) { setError(caught instanceof Error ? caught.message : '照片渲染失败') }
    }
    frame = requestAnimationFrame(() => draw(false))
    const timer = window.setTimeout(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => draw(true))
    }, 160)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer) }
  }, [base, displayEdit, authoritative, cropping])
  useEffect(() => () => { cache.current = null }, [])
  const g=geometryOf(displayEdit)
  const [transformedWidth,transformedHeight]=transformedSize(base.sourceWidth??base.width,base.sourceHeight??base.height,g.rotation_quadrants)
  const [l,t,r,b]=pixelCropBox(transformedWidth,transformedHeight,g.crop)
  const fitted = fitPhoto(r-l, b-t, bounds.width, bounds.height, zoom)
  return <section aria-label="照片视口" className="photo-editor-viewport">
    <div className="photo-editor-zoom">
      <label htmlFor="photo-zoom">缩放（相对适应）</label>
      <input id="photo-zoom" type="range" min="0.5" max="4" step="0.25" value={zoom}
        onChange={event => setZoom(Number(event.target.value))} />
      <output htmlFor="photo-zoom">{Math.round(zoom * 100)}%</output>
      <Button variant="plain" size="sm" onClick={() => setZoom(1)}>适应视口</Button>
    </div>
    <div ref={stage} className="photo-editor-stage" data-photo-viewport>
      <div className="photo-editor-stage-inner">
        <div className="photo-editor-image" style={fitted}>
          <canvas ref={canvas} role="img" aria-label="当前照片预览" style={fitted} />
          {crop && onCropChange && onCropCancel && <CropOverlay crop={crop.rect} ratio={crop.ratio} width={transformedWidth} height={transformedHeight} onChange={rect=>onCropChange({...crop,rect})} onCancel={onCropCancel}/>}
        </div>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>
}
