import { useEffect, useRef, useState } from 'react'
import { exportPhoto, imageErrorMessage } from '@/api/imageEdit'
import { Button } from '@/components/ui'
import { saveBlob } from '@/utils/download'
import type { ImageEdits } from '@/utils/imageEdit'

export function ExportPhotoButton({ photoId, edit }: { photoId: number; edit: ImageEdits }) {
  const request = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  useEffect(() => () => { request.current?.abort() }, [photoId])
  const download = async () => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setError(''); setMessage('正在从原图生成全尺寸 JPEG…')
    try {
      const blob = await exportPhoto(photoId, { ...edit }, controller.signal)
      if (!controller.signal.aborted) {
        saveBlob(blob, `photo-${photoId}-edited.jpg`)
        setMessage('JPEG 已生成，已提交浏览器下载。')
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        const detail = await imageErrorMessage(caught)
        if (!controller.signal.aborted) { setError(detail); setMessage('') }
      }
    } finally {
      if (!controller.signal.aborted) { setBusy(false); request.current = null }
    }
  }
  return <div className="photo-editor-export">
    <Button type="button" loading={busy} onClick={() => { void download() }}>导出全尺寸 JPEG</Button>
    <p role="status" aria-live="polite">{message}</p>
    {error && <p role="alert">{error}</p>}
  </div>
}
