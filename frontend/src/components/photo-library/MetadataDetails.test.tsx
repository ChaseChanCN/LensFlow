import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { loadPhotoMetadata, type PhotoMetadataSummary } from '@/api/photoMetadata'
import { useAuthStore } from '@/stores/auth'
import { MetadataDetails } from './MetadataDetails'
vi.mock('@/api/photoMetadata', () => ({ loadPhotoMetadata: vi.fn() }))
const data: PhotoMetadataSummary = { photoId: 1, sourceSha256: 'a'.repeat(64), camera: 'Canon sample', lens: null, capturedAt: '2026-10-17T12:30:00', timezoneKnown: false, exposureSeconds: .008, fNumber: 2.8, iso: 400, focalLengthMm: 50, width: 517, height: 606, copyright: null, caption: '<script>text</script>', hasWarnings: false }
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { id: 1, role: 'photographer', name: 'P', email: 'p@test.com', created_at: '' } })
})
it('does not preload and fetches only when the photographer expands details; renders no GPS or serial', async () => {
  vi.mocked(loadPhotoMetadata).mockResolvedValue(data)
  render(<MetadataDetails photoId={1} />)
  expect(loadPhotoMetadata).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '拍摄信息' }))
  expect(await screen.findByText('Canon sample')).toBeInTheDocument()
  expect(screen.getAllByText('未记录').length).toBeGreaterThan(0)
  expect(screen.getByText(/时区未知/)).toBeInTheDocument()
  expect(screen.getByText('<script>text</script>')).toBeInTheDocument()
  expect(document.querySelector('script')).toBeNull()
  expect(screen.queryByText(/30\.25|PRIVATE-SERIAL/)).toBeNull()
})
it('handles loading, error, retry and cancel on collapse', async () => {
  vi.mocked(loadPhotoMetadata).mockRejectedValueOnce(new Error('读取失败')).mockResolvedValueOnce(data)
  render(<MetadataDetails photoId={1} />)
  fireEvent.click(screen.getByRole('button', { name: '拍摄信息' }))
  expect(screen.getByRole('status', { name: '正在读取拍摄信息' })).toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByText('Canon sample')).toBeInTheDocument()
  const signal = vi.mocked(loadPhotoMetadata).mock.calls[1][1]
  fireEvent.click(screen.getByRole('button', { name: '拍摄信息' }))
  expect(signal.aborted).toBe(true)
})
it('ignores late requests, resets expansion on photo navigation and aborts on unmount', async () => {
  let resolve!: (data: PhotoMetadataSummary) => void
  vi.mocked(loadPhotoMetadata).mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValueOnce({ ...data, photoId: 2, camera: 'Latest' })
  const view = render(<MetadataDetails photoId={1} />)
  fireEvent.click(screen.getByRole('button', { name: '拍摄信息' }))
  const oldSignal = vi.mocked(loadPhotoMetadata).mock.calls[0][1]
  view.rerender(<MetadataDetails photoId={2} />)
  expect(oldSignal.aborted).toBe(true)
  expect(loadPhotoMetadata).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '拍摄信息' }))
  expect(await screen.findByText('Latest')).toBeInTheDocument()
  await act(async () => resolve(data))
  expect(screen.queryByText('Canon sample')).toBeNull()
  view.unmount()
  expect(vi.mocked(loadPhotoMetadata).mock.calls[1][1].aborted).toBe(true)
})
it('never fetches for a customer and removes existing data when the role changes', async () => {
  vi.mocked(loadPhotoMetadata).mockResolvedValue(data)
  render(<MetadataDetails photoId={1} />)
  fireEvent.click(screen.getByRole('button', { name: '拍摄信息' }))
  await screen.findByText('Canon sample')
  act(() => useAuthStore.setState({ user: { id: 2, role: 'client', name: 'C', email: 'c@test.com', created_at: '' } }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '拍摄信息' })).toBeNull())
  expect(screen.queryByText('Canon sample')).toBeNull()
  expect(loadPhotoMetadata).toHaveBeenCalledTimes(1)
})
