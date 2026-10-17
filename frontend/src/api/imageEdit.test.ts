import { AxiosError } from 'axios'
import { beforeEach, expect, it, vi } from 'vitest'
import client from './client'
import { exportPhoto, imageErrorMessage, loadPhotoPreview, renderPhotoPreview } from './imageEdit'
import { DEFAULT_EDITS } from '@/utils/imageEdit'
vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

it('requests protected JPEG blobs only through the authenticated client, with cancellation', async () => {
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' }), signal = new AbortController().signal
  vi.mocked(client.get).mockResolvedValue({ data: blob })
  vi.mocked(client.post).mockResolvedValue({ data: blob })
  expect(await loadPhotoPreview(5, signal)).toBe(blob)
  expect(client.get).toHaveBeenCalledWith('/api/v1/photos/5/preview', { responseType: 'blob', params: { max_side: 1024 }, signal })
  expect(await renderPhotoPreview(5, { ...DEFAULT_EDITS }, signal)).toBe(blob)
  expect(client.post).toHaveBeenCalledWith('/api/v1/photos/5/preview', { edit: DEFAULT_EDITS }, { responseType: 'blob', params: { max_side: 1024 }, signal })
  expect(await exportPhoto(5, { ...DEFAULT_EDITS }, signal)).toBe(blob)
  expect(client.post).toHaveBeenCalledWith('/api/v1/photos/5/export', { edit: DEFAULT_EDITS }, { responseType: 'blob', timeout: 120000, signal })
})
it('rejects invalid parameters before sending requests and rejects non-JPEG success', async () => {
  await expect(exportPhoto(5, { ...DEFAULT_EDITS, exposure_ev: Infinity }, new AbortController().signal)).rejects.toThrow()
  expect(client.post).not.toHaveBeenCalled()
  vi.mocked(client.get).mockResolvedValue({ data: new Blob(['html'], { type: 'text/html' }) })
  await expect(loadPhotoPreview(5, new AbortController().signal)).rejects.toThrow('JPEG')
})
it.each([[403, '没有权限'], [404, '不存在'], [413, '超过'], [422, '参数无效'], [429, '服务忙'], [503, '暂不可用']])('explains HTTP %s', async (status, message) => {
  const error = Object.assign(new AxiosError('failed'), { response: { status, data: new Blob(['error']) } })
  expect(await imageErrorMessage(error)).toContain(message)
})
