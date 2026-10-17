import client from './client'

/** Viewer allowlist: GPS, serial numbers, raw packets and private provenance never enter UI state. */
export interface PhotoMetadataSummary {
  photoId: number
  sourceSha256: string
  camera: string | null
  lens: string | null
  capturedAt: string | null
  timezoneKnown: boolean
  exposureSeconds: number | null
  fNumber: number | null
  iso: number | null
  focalLengthMm: number | null
  width: number
  height: number
  copyright: string | null
  caption: string | null
  hasWarnings: boolean
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('拍摄信息响应无效')
  return value as Record<string, unknown>
}
function text(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > 4096) throw new Error('拍摄信息文本无效')
  return value
}
function number(value: unknown, min: number, max: number, integer = false): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new Error('拍摄信息数值无效')
  return value
}
export function metadataSummary(value: unknown, photoId: number): PhotoMetadataSummary {
  const v = object(value), camera = object(v.camera), capture = object(v.capture), image = object(v.image), description = object(v.description)
  if (v.metadata_version !== 1 || v.photo_id !== photoId || typeof v.source_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(v.source_sha256)
    || typeof capture.timezone_known !== 'boolean' || !Array.isArray(v.warnings) || v.warnings.some(w => typeof w !== 'string')) throw new Error('拍摄信息身份或版本无效')
  const make = text(camera.make), model = text(camera.model)
  const width = number(image.width, 1, 12000, true), height = number(image.height, 1, 12000, true)
  if (width === null || height === null) throw new Error('拍摄信息尺寸无效')
  return {
    photoId, sourceSha256: v.source_sha256,
    camera: model && make && model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(' ') || null,
    lens: text(camera.lens_model), capturedAt: text(capture.date_time_original), timezoneKnown: capture.timezone_known,
    exposureSeconds: number(capture.exposure_seconds, 1e-7, 86400), fNumber: number(capture.f_number, .1, 1024),
    iso: number(capture.iso, 1, 10_000_000, true), focalLengthMm: number(capture.focal_length_mm, .1, 100000),
    width, height, copyright: text(description.copyright), caption: text(description.caption), hasWarnings: v.warnings.length > 0,
  }
}
export async function loadPhotoMetadata(photoId: number, signal: AbortSignal): Promise<PhotoMetadataSummary> {
  const { data } = await client.get(`/api/v1/photos/${photoId}/metadata`, { signal })
  return metadataSummary(data, photoId)
}
