import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { exportPhoto, imageErrorMessage } from '@/api/imageEdit'
import { saveBlob } from '@/utils/download'
import { DEFAULT_EDITS } from '@/utils/imageEdit'
import { ExportPhotoButton } from './ExportPhotoButton'
import { EditPanel } from './EditPanel'
vi.mock('@/api/imageEdit', () => ({ exportPhoto: vi.fn(), imageErrorMessage: vi.fn(async () => '图像处理服务忙，请稍后重试') }))
vi.mock('@/utils/download', () => ({ saveBlob: vi.fn() }))
vi.mock('@/components/ui', () => ({ Button: ({ loading, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => <button {...props} disabled={loading}>{children}</button> }))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())
it('downloads the backend full-size JPEG blob using the clicked parameter snapshot', async () => {
  const blob = new Blob(['real backend export'], { type: 'image/jpeg' })
  let finish!: (blob: Blob) => void
  vi.mocked(exportPhoto).mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<ExportPhotoButton photoId={2} edit={{ ...DEFAULT_EDITS, contrast: 45 }} />)
  fireEvent.click(screen.getByRole('button', { name: '导出全尺寸 JPEG' }))
  expect(screen.getByRole('button')).toBeDisabled()
  view.rerender(<ExportPhotoButton photoId={2} edit={{ ...DEFAULT_EDITS, contrast: 90 }} />)
  await act(async () => finish(blob))
  expect(saveBlob).toHaveBeenCalledExactlyOnceWith(blob, 'photo-2-edited.jpg')
  expect(vi.mocked(exportPhoto).mock.calls[0][1].contrast).toBe(45)
  expect(screen.getByRole('button')).toBeEnabled()
})
it('restores export controls on failure and shows a clear retryable error', async () => {
  vi.mocked(exportPhoto).mockRejectedValue(new Error('429'))
  render(<ExportPhotoButton photoId={2} edit={{ ...DEFAULT_EDITS }} />)
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('服务忙'))
  expect(screen.getByRole('button')).toBeEnabled()
  expect(imageErrorMessage).toHaveBeenCalled()
  expect(saveBlob).not.toHaveBeenCalled()
})
it('aborts export and ignores completion after leaving the photo', async () => {
  let finish!: (blob: Blob) => void
  vi.mocked(exportPhoto).mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<ExportPhotoButton photoId={2} edit={{ ...DEFAULT_EDITS }} />)
  fireEvent.click(screen.getByRole('button'))
  const signal = vi.mocked(exportPhoto).mock.calls[0][2]
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => finish(new Blob(['late'])))
  expect(saveBlob).not.toHaveBeenCalled()
})
it('only offers three supported sliders with exact version 1 ranges and reset', () => {
  const update = vi.fn()
  render(<EditPanel edit={{ ...DEFAULT_EDITS, exposure_ev: 1 }} onChange={update} />)
  expect(screen.getAllByRole('slider')).toHaveLength(3)
  expect(screen.getByLabelText('曝光')).toHaveAttribute('min', '-2')
  expect(screen.getByLabelText('曝光')).toHaveAttribute('max', '2')
  fireEvent.change(screen.getByLabelText('饱和度'), { target: { value: '-60' } })
  expect(update).toHaveBeenLastCalledWith({ ...DEFAULT_EDITS, exposure_ev: 1, saturation: -60 })
  fireEvent.click(screen.getByRole('button', { name: '重置全部调整' }))
  expect(update).toHaveBeenLastCalledWith(DEFAULT_EDITS)
})
it('exports the complete current v2 geometry instead of a prior color-only state', async () => {
  const edit={...DEFAULT_EDITS,schema_version:2 as const,exposure_ev:0.7,geometry:{rotation_quadrants:1,flip_horizontal:true,flip_vertical:false,crop:{x:0.1,y:0.2,width:0.7,height:0.6}}}
  vi.mocked(exportPhoto).mockResolvedValue(new Blob(['jpeg'],{type:'image/jpeg'}))
  render(<ExportPhotoButton photoId={1} edit={edit}/>)
  fireEvent.click(screen.getByRole('button'))
  await waitFor(()=>expect(saveBlob).toHaveBeenCalled())
  expect(vi.mocked(exportPhoto).mock.calls[0][1]).toEqual(edit)
})
