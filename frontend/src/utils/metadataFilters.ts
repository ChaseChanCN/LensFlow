export const deviceKeys = ['camera_make', 'camera_model', 'lens_make', 'lens_model'] as const
export const numericKeys = ['iso_min', 'iso_max', 'focal_min', 'focal_max', 'aperture_min', 'aperture_max'] as const
export const metadataKeys = [...deviceKeys, ...numericKeys, 'captured_from', 'captured_to', 'capture_unknown', 'metadata_status'] as const
export interface MetadataFilters {
  camera_make?: string; camera_model?: string; lens_make?: string; lens_model?: string
  iso_min?: number; iso_max?: number; focal_min?: number; focal_max?: number; aperture_min?: number; aperture_max?: number
  captured_from?: string; captured_to?: string; capture_unknown?: true
  metadata_status?: 'pending' | 'indexed' | 'failed' | 'unsupported'
}
export function parseMetadataFilters(search: URLSearchParams): MetadataFilters | undefined {
  const result: MetadataFilters = {}
  for (const key of deviceKeys) {
    const raw = search.get(key)
    if (raw === null) continue
    const value = raw.trim().replace(/\s+/g, ' ').toLowerCase()
    if (!value || raw.length > 160 || value.length > 160 || [...raw].some(c=>c.charCodeAt(0)<32)) throw Error('相机或镜头条件无效')
    result[key] = value
  }
  for (const [name, low, high] of [['iso', 1, 10_000_000], ['focal', .1, 100000], ['aperture', .1, 1024]] as const) {
    for (const side of ['min', 'max'] as const) {
      const key = `${name}_${side}` as typeof numericKeys[number], raw = search.get(key)
      if (raw === null) continue
      if (raw.length > 16 || !/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) < low || Number(raw) > high || (name === 'iso' && !/^\d+$/.test(raw))) throw Error('元数据数值范围无效')
      result[key] = Number(raw)
    }
    if ((result[`${name}_min`] ?? low) > (result[`${name}_max`] ?? high)) throw Error('最小值不能大于最大值')
  }
  for (const key of ['captured_from', 'captured_to'] as const) {
    const value = search.get(key)
    if (value === null) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000' || !Number.isFinite(Date.parse(value)) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw Error('拍摄日期无效，请使用 YYYY-MM-DD')
    result[key] = value
  }
  if ((result.captured_from ?? '0001-01-01') > (result.captured_to ?? '9999-12-31')) throw Error('拍摄日期范围颠倒')
  if (search.has('capture_unknown')) {
    if (search.get('capture_unknown') !== 'true' || result.captured_from || result.captured_to) throw Error('日期未知不能同时指定日期范围')
    result.capture_unknown = true
  }
  const status = search.get('metadata_status')
  if (status !== null) {
    if (!['pending', 'indexed', 'failed', 'unsupported'].includes(status)) throw Error('索引状态无效')
    result.metadata_status = status as MetadataFilters['metadata_status']
  }
  if (Object.keys(result).some(k => k !== 'metadata_status') && result.metadata_status && result.metadata_status !== 'indexed') throw Error('拍摄条件只能查询已建立索引的照片')
  return Object.keys(result).length ? result : undefined
}
export function serializeMetadata(filters?: MetadataFilters) {
  const params = new URLSearchParams()
  for (const key of metadataKeys) if (filters?.[key] !== undefined) params.set(key, String(filters[key]))
  return params
}
