import { beforeEach, expect, it, vi } from 'vitest'
import client from './client'
import { loadPhotoMetadata, metadataSummary } from './photoMetadata'
vi.mock('./client', () => ({ default: { get: vi.fn() } }))
export const metadataDto = () => ({
  metadata_version: 1, photo_id: 1, source_sha256: 'a'.repeat(64),
  camera: { make: 'Canon', model: 'Canon sample', lens_model: null, serial_number: 'SECRET' },
  capture: { date_time_original: null, timezone_known: false, exposure_seconds: .008, f_number: 2.8, iso: 400, focal_length_mm: 50 },
  image: { width: 517, height: 606 }, description: { copyright: null, caption: '真实照片' },
  gps: { latitude: 30, longitude: 120 }, warnings: [],
})
beforeEach(() => vi.clearAllMocks())
it('uses authenticated Axios, a cancel signal and identity-checked allowlisted summary', async () => {
  vi.mocked(client.get).mockResolvedValue({ data: metadataDto() })
  const signal = new AbortController().signal, data = await loadPhotoMetadata(1, signal)
  expect(client.get).toHaveBeenCalledWith('/api/v1/photos/1/metadata', { signal })
  expect(data.camera).toBe('Canon sample')
  expect(JSON.stringify(data)).not.toMatch(/SECRET|latitude|longitude|serial_number|gps/)
})
it('rejects bad identities, versions, hashes and numeric values', () => {
  for (const patch of [{ photo_id: 2 }, { metadata_version: 2 }, { source_sha256: '' }, { image: { width: 0, height: 1 } }, { capture: { ...metadataDto().capture, iso: Infinity } }]) {
    expect(() => metadataSummary({ ...metadataDto(), ...patch }, 1)).toThrow()
  }
})
it('preserves honest missing fields without inventing values', () => {
  const dto = metadataDto()
  expect(metadataSummary({ ...dto, camera: { make: null, model: null, lens_model: null } }, 1)).toMatchObject({ camera: null, lens: null, capturedAt: null, timezoneKnown: false })
})
