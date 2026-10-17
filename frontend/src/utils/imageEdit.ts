/** Algorithm contract v1: backend/app/services/image_editor.py. */
import { identityGeometry, validateGeometry, type Geometry } from './imageGeometry'
interface ColorEdits { exposure_ev: number; contrast: number; saturation: number }
export interface ImageEditsV1 extends ColorEdits { schema_version: 1 }
export interface ImageEditsV2 extends ColorEdits { schema_version: 2; geometry: Geometry }
export type ImageEdits = ImageEditsV1 | ImageEditsV2
export const geometryOf = (edit: ImageEdits): Geometry => edit.schema_version===2 ? edit.geometry : identityGeometry()
export function normalizeEdits(edit: ImageEdits): ImageEditsV2 {
  const valid=validateEdits(edit)
  return {schema_version:2,exposure_ev:valid.exposure_ev,contrast:valid.contrast,saturation:valid.saturation,geometry:geometryOf(valid)}
}

export const DEFAULT_EDITS: Readonly<ImageEdits> = Object.freeze({
  schema_version: 1, exposure_ev: 0, contrast: 0, saturation: 0,
})

export const EDIT_LIMITS = {
  exposure_ev: { min: -2, max: 2, step: 0.1, label: '曝光', unit: 'EV' },
  contrast: { min: -100, max: 100, step: 1, label: '对比度', unit: '' },
  saturation: { min: -100, max: 100, step: 1, label: '饱和度', unit: '' },
} as const
export type EditControl = keyof typeof EDIT_LIMITS

export function validateEdits(value: ImageEdits): ImageEdits {
  if (!value || typeof value !== 'object' || ![1,2].includes(value.schema_version) || Object.keys(value).some(key =>
    !['schema_version', ...(value.schema_version===2 ? ['geometry'] : []), ...Object.keys(EDIT_LIMITS)].includes(key))) {
    throw new Error('不支持的编辑参数版本或字段')
  }
  for (const key of Object.keys(EDIT_LIMITS) as EditControl[]) {
    const number = value[key], limit = EDIT_LIMITS[key]
    if (typeof number !== 'number' || !Number.isFinite(number) || number < limit.min || number > limit.max) {
      throw new Error(`${limit.label}超出允许范围`)
    }
  }
  return value.schema_version===2 ? { ...value, geometry:validateGeometry(value.geometry) } : { ...value }
}

export function editsKey(edit: ImageEdits): string {
  const g=geometryOf(edit)
  return JSON.stringify([edit.schema_version, edit.exposure_ev, edit.contrast, edit.saturation,g.rotation_quadrants,g.flip_horizontal,g.flip_vertical,g.crop ? [g.crop.x,g.crop.y,g.crop.width,g.crop.height] : null])
}

export function isZeroEdit(edit: ImageEdits): boolean {
  const g=geometryOf(edit)
  return edit.exposure_ev === 0 && edit.contrast === 0 && edit.saturation === 0 && !g.rotation_quadrants && !g.flip_horizontal && !g.flip_vertical && !g.crop
}

const linearLookup = Float64Array.from({ length: 256 }, (_, value) => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

// NumPy rint rounds ties to even. JS Math.round has different tie behavior.
function rint(value: number): number {
  const low = Math.floor(value), fraction = value - low
  return fraction === 0.5 ? low + low % 2 : Math.round(value)
}

function encode(linear: number): number {
  const c = Math.max(0, Math.min(1, linear))
  return rint(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055))
}

/** Always reads an immutable baseline; never accumulates edits or changes input. */
export function editPixels(source: Uint8ClampedArray, edits: ImageEdits): Uint8ClampedArray<ArrayBuffer> {
  validateEdits(edits)
  const result = new Uint8ClampedArray(source)
  if (edits.exposure_ev === 0 && edits.contrast === 0 && edits.saturation === 0) return result
  const exposure = 2 ** edits.exposure_ev
  const contrast = 2 ** (edits.contrast / 100)
  const saturation = 1 + edits.saturation / 100
  for (let i = 0; i < source.length; i += 4) {
    const r = (linearLookup[source[i]] * exposure - 0.18) * contrast + 0.18
    const g = (linearLookup[source[i + 1]] * exposure - 0.18) * contrast + 0.18
    const b = (linearLookup[source[i + 2]] * exposure - 0.18) * contrast + 0.18
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    result[i] = encode(y + (r - y) * saturation)
    result[i + 1] = encode(y + (g - y) * saturation)
    result[i + 2] = encode(y + (b - y) * saturation)
  }
  return result
}

export function fitPhoto(width: number, height: number, viewportWidth: number, viewportHeight: number, zoom = 1) {
  const scale = Math.min(viewportWidth / width, viewportHeight / height) * zoom
  return { width: width * scale, height: height * scale }
}
