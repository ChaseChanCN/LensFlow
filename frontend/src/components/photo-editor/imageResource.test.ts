import { afterEach, expect, it, vi } from 'vitest'
import { decodePhoto } from './imageResource'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('releases decoded ImageBitmap explicitly', async () => {
  const bitmap = { width: 517, height: 606, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
  const resource = await decodePhoto(new Blob(['jpeg']))
  expect(resource.width / resource.height).toBe(517 / 606)
  resource.dispose()
  expect(bitmap.close).toHaveBeenCalledOnce()
})
it.each([false, true])('revokes fallback Blob URL on decode completion/failure (%s)', async failure => {
  vi.stubGlobal('createImageBitmap', undefined)
  const create = vi.fn(() => 'blob:owned-photo'), revoke = vi.fn()
  const ExistingURL = URL
  vi.stubGlobal('URL', class extends ExistingURL { static createObjectURL = create; static revokeObjectURL = revoke })
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 517; naturalHeight = 606
    set src(value: string) { if (value) queueMicrotask(() => failure ? this.onerror?.() : this.onload?.()) }
  }
  vi.stubGlobal('Image', FakeImage)
  if (failure) await expect(decodePhoto(new Blob())).rejects.toThrow('解码')
  else { const result = await decodePhoto(new Blob()); expect(result.width).toBe(517); result.dispose() }
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:owned-photo')
})
