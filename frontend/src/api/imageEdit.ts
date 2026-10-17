import axios from 'axios'
import client from './client'
import { validateEdits, type ImageEdits } from '@/utils/imageEdit'

const sourceHashes = new WeakMap<Blob, string>()
const sourceSizes = new WeakMap<Blob, [number,number]>()
export function getPreviewSourceSize(blob: Blob) { return sourceSizes.get(blob) }
export function getPreviewSourceHash(blob: Blob): string | undefined { return sourceHashes.get(blob) }

function jpeg(blob: Blob): Blob {
  if (!(blob instanceof Blob) || blob.type.split(';')[0] !== 'image/jpeg') {
    throw new Error('服务器没有返回有效的 JPEG 照片')
  }
  return blob
}

export async function loadPhotoPreview(photoId: number, signal: AbortSignal): Promise<Blob> {
  const response = await client.get(`/api/v1/photos/${photoId}/preview`, {
    responseType: 'blob', params: { max_side: 1024 }, signal,
  })
  const blob = jpeg(response.data)
  const dimensions=[Number(response.headers?.['x-source-width']),Number(response.headers?.['x-source-height'])]
  if(dimensions.every(n=>Number.isSafeInteger(n)&&n>0)) sourceSizes.set(blob,dimensions as [number,number])
  const hash = response.headers?.['x-source-sha256']
  if (typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)) sourceHashes.set(blob, hash)
  return blob
}

export async function renderPhotoPreview(photoId: number, edit: ImageEdits, signal: AbortSignal): Promise<Blob> {
  const response = await client.post(`/api/v1/photos/${photoId}/preview`, { edit: validateEdits(edit) }, {
    responseType: 'blob', params: { max_side: 1024 }, signal,
  })
  return jpeg(response.data)
}

export async function exportPhoto(photoId: number, edit: ImageEdits, signal: AbortSignal): Promise<Blob> {
  const response = await client.post(`/api/v1/photos/${photoId}/export`, { edit: validateEdits(edit) }, {
    responseType: 'blob', timeout: 120000, signal,
  })
  return jpeg(response.data)
}

export function imageErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : '照片处理失败，请重试'
  const messages: Record<number, string> = {
    401: '登录已失效，请重新登录', 403: '没有权限访问或导出这张照片',
    404: '照片或原始文件不存在', 413: '照片超过服务器允许的文件或像素尺寸',
    415: '照片格式或色彩模式不受支持', 422: '照片或编辑参数无效',
    429: '图像处理服务忙，请稍后重试', 503: '照片存储服务暂不可用，请稍后重试',
  }
  const message = messages[error.response?.status ?? 0]
  if (message) return message
  return error.response ? '照片处理失败，请重试' : '网络连接失败，请检查连接后重试'
}
