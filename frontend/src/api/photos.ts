import client from './client'

export interface Photo {
  id: number
  order_id: number
  filename: string
  storage_key: string
  mime: string
  size_bytes: number
  width: number | null
  height: number | null
  created_at: string
  updated_at: string
}

export interface PhotoUploadResponse {
  photo: Photo
  analysis_triggered: boolean
}

export interface AnalysisResult {
  id: number
  photo_id: number
  sharpness_score: number | null
  brightness_mean: number | null
  highlight_ratio: number | null
  shadow_ratio: number | null
  suggestion: string
  risk_level: string
  reviewed: boolean
  reviewer_id: number | null
  reviewed_at: string | null
  final_decision: string
  created_at: string
}

export async function uploadPhoto(
  orderId: number,
  file: File,
): Promise<PhotoUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await client.post(`/api/v1/orders/${orderId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return resp.data
}

export async function listPhotos(orderId: number): Promise<Photo[]> {
  const resp = await client.get(`/api/v1/orders/${orderId}/photos`)
  return resp.data
}

export async function deletePhoto(
  orderId: number,
  photoId: number,
): Promise<void> {
  await client.delete(`/api/v1/orders/${orderId}/photos/${photoId}`)
}

export async function getAnalysis(
  photoId: number,
): Promise<AnalysisResult> {
  const resp = await client.get(`/api/v1/photos/${photoId}/analysis`)
  return resp.data
}

export async function reviewAnalysis(
  analysisId: number,
  finalDecision: 'exclude' | 'keep' | 'pending',
  note?: string,
): Promise<AnalysisResult> {
  const resp = await client.patch(`/api/v1/analysis/${analysisId}/review`, {
    final_decision: finalDecision,
    note,
  })
  return resp.data
}
