import axios from 'axios'
import client from './client'
import { imageErrorMessage } from './imageEdit'
import { validateEdits, type ImageEdits } from '@/utils/imageEdit'

export interface PhotoEditDraft {
  photo_id: number; exists: boolean; parameters: ImageEdits; revision: number
  source_sha256: string; updated_at: string | null
}
export interface SaveDraftRequest {
  parameters: ImageEdits; expected_revision: number; expected_source_sha256: string
}
function checked(data: PhotoEditDraft, photoId: number): PhotoEditDraft {
  if (!data || data.photo_id !== photoId || typeof data.exists !== 'boolean'
    || !Number.isSafeInteger(data.revision) || data.revision < 0
    || typeof data.source_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(data.source_sha256)
    || (data.updated_at !== null && (typeof data.updated_at !== 'string' || !Number.isFinite(Date.parse(data.updated_at))))) {
    throw new Error('草稿响应无效，未应用远端参数')
  }
  return { ...data, parameters: validateEdits(data.parameters) }
}
export async function getPhotoEditDraft(photoId: number, signal: AbortSignal): Promise<PhotoEditDraft> {
  const response = await client.get(`/api/v1/photos/${photoId}/edit-draft`, { signal })
  return checked(response.data, photoId)
}
export async function putPhotoEditDraft(photoId: number, body: SaveDraftRequest, signal: AbortSignal): Promise<PhotoEditDraft> {
  const response = await client.put(`/api/v1/photos/${photoId}/edit-draft`, {
    ...body, parameters: validateEdits(body.parameters),
  }, { signal })
  return checked(response.data, photoId)
}
export function draftFailure(error: unknown): { kind: 'error' | 'revision-conflict' | 'source-conflict'; message: string } {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 412 && error.response.data?.code === 'SOURCE_CHANGED') {
      return { kind: 'source-conflict', message: '原图已经变化，旧草稿已暂停。请检查源照片；必要时作为新照片重新导入。' }
    }
    if (error.response?.status === 409 && error.response.data?.code === 'DRAFT_REVISION_CONFLICT') {
      return { kind: 'revision-conflict', message: '远端草稿已被其他会话更新，本地修改已保留，自动保存已暂停。' }
    }
  }
  return { kind: 'error', message: imageErrorMessage(error) }
}
